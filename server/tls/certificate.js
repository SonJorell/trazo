import fs from 'node:fs/promises';
import path from 'node:path';
import selfsigned from 'selfsigned';

const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000; // renovar si vence en menos de 30 días

/**
 * Certificado HTTPS local autofirmado para la red de casa/oficina.
 * Los celulares necesitan HTTPS para usar la cámara; como el certificado no lo firma una
 * autoridad, el navegador muestra una advertencia la primera vez («Avanzado → Continuar»).
 *
 * Se guarda en `<dataDir>/tls/` y se regenera si cambian las IP de la red o está por vencer.
 * @returns {Promise<{ key: string, cert: string, fingerprint: string, created: boolean }>}
 */
export async function ensureCertificate(dataDir, ips, logger) {
  const dir = path.join(dataDir, 'tls');
  const files = { key: path.join(dir, 'key.pem'), cert: path.join(dir, 'cert.pem'), meta: path.join(dir, 'meta.json') };
  const wanted = [...new Set(['127.0.0.1', ...ips])].sort();

  try {
    const meta = JSON.parse(await fs.readFile(files.meta, 'utf8'));
    const sameIps = JSON.stringify(meta.ips) === JSON.stringify(wanted);
    const fresh = Date.parse(meta.notAfter) - Date.now() > RENEW_BEFORE_MS;
    if (sameIps && fresh) {
      const [key, cert] = await Promise.all([fs.readFile(files.key, 'utf8'), fs.readFile(files.cert, 'utf8')]);
      return { key, cert, fingerprint: meta.fingerprint, created: false };
    }
  } catch {
    /* no existe o está dañado: se genera */
  }

  const notBefore = new Date(Date.now() - 60_000);
  const notAfter = new Date(notBefore);
  notAfter.setFullYear(notAfter.getFullYear() + 2);
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'Trazo (red local)' }], {
    keyType: 'ec',
    curve: 'P-256',
    algorithm: 'sha256',
    notBeforeDate: notBefore,
    notAfterDate: notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, ...wanted.map((ip) => ({ type: 7, ip }))],
      },
    ],
  });

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(files.key, pems.private, { mode: 0o600 });
  await fs.writeFile(files.cert, pems.cert);
  await fs.writeFile(
    files.meta,
    JSON.stringify({ ips: wanted, notAfter: notAfter.toISOString(), fingerprint: pems.fingerprint }),
  );
  logger?.info(`Certificado HTTPS local generado para: localhost, ${wanted.join(', ')}`);
  return { key: pems.private, cert: pems.cert, fingerprint: pems.fingerprint, created: true };
}

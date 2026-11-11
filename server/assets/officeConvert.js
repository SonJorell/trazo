import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 120_000;

/** Qué programa de Office abre cada extensión. */
export function officeKind(ext) {
  if (['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(ext)) return 'ppt';
  if (['xls', 'xlsx', 'ods'].includes(ext)) return 'excel';
  return 'word';
}

function run(cmd, args, { env, timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true });
    let err = '';
    child.stderr?.on('data', (d) => (err += d).length > 4000 && (err = err.slice(-4000)));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('La conversión tardó demasiado'));
    }, timeout);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `salió con código ${code}`));
    });
  });
}

async function exists(file) {
  return fs.stat(file).then((s) => s.size > 0, () => false);
}

/** Microsoft Office instalado (Windows): automatiza PowerPoint/Word/Excel por COM. */
async function viaMicrosoftOffice(input, output, kind) {
  await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'office2pdf.ps1')],
    { env: { TRAZO_IN: input, TRAZO_OUT: output, TRAZO_KIND: kind } },
  );
}

function sofficeCandidates() {
  const list = [process.env.SOFFICE_PATH, 'soffice', 'libreoffice'];
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      list.push(path.join(base, 'LibreOffice', 'program', 'soffice.exe'));
    }
  }
  if (process.platform === 'darwin') list.push('/Applications/LibreOffice.app/Contents/MacOS/soffice');
  return list.filter(Boolean);
}

/** LibreOffice (gratuito, cualquier sistema). */
async function viaLibreOffice(input, output) {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trazo-conv-'));
  const profile = `file://${path.join(outDir, 'perfil').replace(/\\/g, '/')}`;
  try {
    let lastErr = null;
    for (const cmd of sofficeCandidates()) {
      try {
        await run(cmd, [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', outDir, input]);
        const produced = path.join(outDir, `${path.parse(input).name}.pdf`);
        if (!(await exists(produced))) throw new Error('LibreOffice no generó el PDF');
        await fs.copyFile(produced, output);
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr ?? new Error('LibreOffice no está instalado');
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
}

let queue = Promise.resolve();

/**
 * Convierte un archivo de Office a PDF. Usa Microsoft Office si está (Windows) y si no LibreOffice.
 * Las conversiones van de una en una (Office no tolera bien las simultáneas).
 * @returns {Promise<string>} el programa que lo convirtió
 */
export function convertToPdf(input, output, ext, logger) {
  const task = queue.then(async () => {
    const kind = officeKind(ext);
    const errors = [];
    if (process.platform === 'win32' && process.env.TRAZO_NO_MSOFFICE !== '1') {
      try {
        await viaMicrosoftOffice(input, output, kind);
        if (await exists(output)) return 'Microsoft Office';
      } catch (err) {
        errors.push(`Office: ${err.message}`);
      }
    }
    try {
      await viaLibreOffice(input, output);
      return 'LibreOffice';
    } catch (err) {
      errors.push(`LibreOffice: ${err.message}`);
    }
    logger?.warn(`No se pudo convertir ${path.basename(input)} a PDF → ${errors.join(' | ')}`);
    throw Object.assign(
      new Error('No se pudo convertir a PDF: instala Microsoft Office o LibreOffice (gratis) en el PC anfitrión, o exporta el archivo como PDF.'),
      { status: 422 },
    );
  });
  queue = task.catch(() => {});
  return task;
}

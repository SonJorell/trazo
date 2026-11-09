import os from 'node:os';

/**
 * Direcciones IPv4 de la red local de este equipo (excluye loopback e interfaces virtuales comunes).
 * Se ordenan poniendo primero las típicas de redes domésticas (192.168.x.x).
 */
export function getLanAddresses() {
  const virtual = /(vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker|br-|veth|Loopback|Tailscale|ZeroTier)/i;
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (virtual.test(name)) continue;
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  return [...new Set(out)].sort((a, b) => rank(a) - rank(b));
}

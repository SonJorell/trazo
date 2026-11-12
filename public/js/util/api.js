/** Cliente de la API HTTP del servidor. */
async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
}

export const api = {
  info: () => request('GET', '/api/info'),
  createRoom: ({ pin, mode = 'blank' } = {}) => request('POST', '/api/rooms', pin ? { pin, mode } : { mode }),
  getRoom: (id) => request('GET', `/api/rooms/${encodeURIComponent(id)}`),
  /** Descarga el archivo .trazo de la sala (solo el anfitrión). */
  exportRoom: async (id, hostKey) => {
    const res = await fetch(`/api/rooms/${encodeURIComponent(id)}/export`, { headers: { 'X-Trazo-Host': hostKey } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
    }
    return res.blob();
  },
  /** Abre un archivo .trazo como sala nueva → { id, hostKey }. */
  importRoom: async (file) => {
    const res = await fetch('/api/rooms/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: file });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
    return data;
  },
  qrUrl: (text) => `/api/qr.svg?text=${encodeURIComponent(text)}`,
};

/** Normaliza lo que el usuario escribe como código (acepta también un enlace pegado). */
export function parseRoomCode(input) {
  const s = String(input || '').trim();
  const fromUrl = s.match(/[?&]room=([a-z0-9]+)/i);
  return (fromUrl ? fromUrl[1] : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

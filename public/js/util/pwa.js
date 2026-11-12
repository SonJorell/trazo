/**
 * App instalable (PWA): registra el service worker y ofrece «Instalar Trazo» cuando el
 * navegador lo permite. Solo funciona en contextos seguros (localhost o HTTPS de confianza).
 */
let deferred = null;
const listeners = new Set();

export function setupPwa() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (new URLSearchParams(location.search).has('overlay')) return; // la capa de Electron no la necesita
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    for (const fn of listeners) fn(true);
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    for (const fn of listeners) fn(false);
  });
}

/** Avisa cuando se puede (o ya no) instalar. */
export function onInstallable(fn) {
  listeners.add(fn);
  fn(Boolean(deferred));
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  for (const fn of listeners) fn(false);
  return outcome === 'accepted';
}

/** ¿Ya se está usando como app instalada? */
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

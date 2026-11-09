/** Iconos SVG en línea (trazo 2px, 24×24). */
const svg = (body) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  hand: svg('<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>'),
  select: svg('<path d="M4 4l7 17 2.5-7.5L21 11z"/>'),
  pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  rect: svg('<rect x="4" y="5" width="16" height="14" rx="2"/>'),
  ellipse: svg('<ellipse cx="12" cy="12" rx="9" ry="7"/>'),
  arrow: svg('<path d="M5 19L19 5M9 5h10v10"/>'),
  line: svg('<path d="M5 19L19 5"/>'),
  text: svg('<path d="M4 7V5h16v2M9 19h6M12 5v14"/>'),
  eraser: svg('<path d="M20 20H8l-5-5a2 2 0 0 1 0-2.8l9-9a2 2 0 0 1 2.8 0l5.2 5.2a2 2 0 0 1 0 2.8L12 20"/><path d="M7 11l6 6"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
  zoomIn: svg('<path d="M12 5v14M5 12h14"/>'),
  zoomOut: svg('<path d="M5 12h14"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  palette: svg('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/><path d="M12 21a2 2 0 0 1 0-4h2a3 3 0 0 0 3-3"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  download: svg('<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>'),
  home: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  cursor: svg('<path d="M5 3l6 16 2.5-6.5L20 10z"/><path d="M13.5 12.5L19 18"/>'),
  screen: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-3 3.5M6.6 6.6C4.4 8.1 3 12 3 12s4 6 9 6a9 9 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  maximize: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>'),
  minimize: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
};

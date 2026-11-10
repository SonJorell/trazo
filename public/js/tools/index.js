import { createSelectTool } from './select.js';
import { createPenTool } from './pen.js';
import { createShapeTool } from './shape.js';
import { createTextTool } from './text.js';
import { createEraserTool } from './eraser.js';
import { createHandTool } from './hand.js';
import { createLaserTool } from './laser.js';

/** Catálogo de herramientas: nombre, etiqueta, atajo de teclado y fábrica. */
export const TOOL_DEFS = [
  { name: 'hand', label: 'Mover vista', key: 'h', create: () => createHandTool() },
  { name: 'select', label: 'Seleccionar', key: 'v', create: (ctx) => createSelectTool(ctx) },
  { name: 'pen', label: 'Dibujar', key: 'p', create: (ctx) => createPenTool(ctx) },
  { name: 'laser', label: 'Puntero láser (se borra solo)', key: 'k', create: (ctx) => createLaserTool(ctx) },
  { name: 'rect', label: 'Rectángulo', key: 'r', create: (ctx) => createShapeTool(ctx, 'rect') },
  { name: 'ellipse', label: 'Elipse', key: 'o', create: (ctx) => createShapeTool(ctx, 'ellipse') },
  { name: 'arrow', label: 'Flecha', key: 'a', create: (ctx) => createShapeTool(ctx, 'arrow') },
  { name: 'line', label: 'Línea', key: 'l', create: (ctx) => createShapeTool(ctx, 'line') },
  { name: 'text', label: 'Texto', key: 't', create: (ctx) => createTextTool(ctx) },
  { name: 'eraser', label: 'Borrador', key: 'e', create: (ctx) => createEraserTool(ctx) },
];

export function createTools(ctx) {
  return new Map(TOOL_DEFS.map((def) => [def.name, def.create(ctx)]));
}

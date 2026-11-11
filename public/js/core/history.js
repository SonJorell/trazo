import { bump } from '/shared/elements.js';
import { Emitter } from '../util/emitter.js';

const MAX_ENTRIES = 200;

/** Copia de un elemento sin sus metadatos de versión. */
export function stripMeta(el) {
  const { id: _id, version: _v, nonce: _n, ...rest } = el;
  return rest;
}

/**
 * Deshacer/rehacer basado en operaciones. Cada entrada es una lista de
 * cambios `{ id, before, after }` (before = null si el elemento se creó).
 * Revertir es aplicar el estado anterior como una edición nueva, para que se
 * propague al resto de participantes.
 */
export class History extends Emitter {
  constructor(scene) {
    super();
    this.scene = scene;
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  push(changes) {
    if (!changes.length) return;
    this.undoStack.push(changes);
    if (this.undoStack.length > MAX_ENTRIES) this.undoStack.shift();
    this.redoStack = [];
    this.emit('change');
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this._apply([...entry].reverse(), 'before');
    this.redoStack.push(entry);
    this.emit('change');
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this._apply(entry, 'after');
    this.undoStack.push(entry);
    this.emit('change');
  }

  _apply(changes, side) {
    for (const change of changes) {
      const current = this.scene.get(change.id);
      if (!current) continue;
      const target = change[side];
      this.scene.applyLocal(bump(current, target ? stripMeta(target) : { isDeleted: true }));
    }
  }
}

/**
 * Agrupa varias ediciones en una sola entrada de historial.
 * Guarda el estado previo de cada elemento la primera vez que se toca.
 */
export class Transaction {
  constructor(scene, history) {
    this.scene = scene;
    this.history = history;
    this.before = new Map();
  }

  get isEmpty() {
    return this.before.size === 0;
  }

  /** Agrega un elemento nuevo (versión 1). */
  add(el, opts) {
    if (!this.before.has(el.id)) this.before.set(el.id, null);
    this.scene.applyLocal(el, opts);
    return el;
  }

  /** Modifica un elemento existente aplicando `changes`. */
  update(id, changes, opts) {
    const current = this.scene.get(id);
    if (!current) return null;
    if (!this.before.has(id)) this.before.set(id, current);
    const next = bump(current, changes);
    this.scene.applyLocal(next, opts);
    return next;
  }

  commit() {
    const changes = [];
    for (const [id, before] of this.before) {
      const after = this.scene.get(id);
      if (!after) continue;
      if (before === null && after.isDeleted) continue; // creado y borrado: no cuenta
      changes.push({ id, before, after });
    }
    this.before.clear();
    this.history.push(changes);
  }

  /** Deshace todo lo hecho en la transacción sin dejar rastro en el historial. */
  rollback() {
    for (const [id, before] of this.before) {
      const current = this.scene.get(id);
      if (current) this.scene.applyLocal(bump(current, before ? stripMeta(before) : { isDeleted: true }));
    }
    this.before.clear();
  }
}

// Historial de deshacer/rehacer por instantáneas. Quien lo usa llama a
// record(estado) justo ANTES de cambiar algo; undo/redo reciben el estado
// actual y devuelven el que hay que restaurar (o null si no hay).

export function createHistory({ limit = 50 } = {}) {
  const past = [];
  let future = [];
  const copy = (v) => structuredClone(v);
  return {
    record(snapshot) {
      past.push(copy(snapshot));
      if (past.length > limit) past.shift();
      future = [];
    },
    undo(current) {
      if (!past.length) return null;
      future.push(copy(current));
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      past.push(copy(current));
      return future.pop();
    },
    /** Olvida el último record() sin restaurarlo (un cambio que se ha descartado). */
    drop() { past.pop(); },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}

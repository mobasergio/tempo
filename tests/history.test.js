import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../src/frontend/lib/history.js';

test('undo/redo devuelve las instantáneas en orden', () => {
  const h = createHistory();
  let s = [1];
  h.record(s); s = [1, 2];
  h.record(s); s = [1, 2, 3];
  assert.deepEqual((s = h.undo(s)), [1, 2]);
  assert.deepEqual((s = h.undo(s)), [1]);
  assert.equal(h.undo(s), null);
  assert.deepEqual((s = h.redo(s)), [1, 2]);
  assert.deepEqual((s = h.redo(s)), [1, 2, 3]);
  assert.equal(h.redo(s), null);
});

test('las instantáneas son copias', () => {
  const h = createHistory();
  const s = [{ a: 1 }];
  h.record(s);
  s[0].a = 2;
  assert.deepEqual(h.undo(s), [{ a: 1 }]);
});

test('un cambio nuevo vacía rehacer', () => {
  const h = createHistory();
  h.record('a');
  h.undo('b');
  assert.equal(h.canRedo(), true);
  h.record('a');
  assert.equal(h.canRedo(), false);
});

test('límite de pasos', () => {
  const h = createHistory({ limit: 2 });
  h.record(1); h.record(2); h.record(3);
  assert.equal(h.undo(4), 3);
  assert.equal(h.undo(3), 2);
  assert.equal(h.undo(2), null);
});

test('drop olvida el último record sin tocar el estado', () => {
  const h = createHistory();
  let s = [1];
  h.record(s); s = [1, 2];
  h.record(s); s = [1, 2, 3];
  h.drop();                       // el cambio a [1, 2, 3] se descartó
  s = [1, 2];
  assert.deepEqual((s = h.undo(s)), [1]);
  assert.equal(h.canUndo(), false);
});

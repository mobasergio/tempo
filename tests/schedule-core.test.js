import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanBlocks, currentBlock, nextBlock, blocksStartingIn, layoutDay, isActiveAt, timerSecondsFor, MAX_BLOCKS,
} from '../src/shared/schedule-core.js';

const blk = (id, start, end, days, extra = {}) => ({ id, title: id, start, end, days, color: 'cyan', ...extra });
const at = (day, h, m = 0) => ({ day, min: h * 60 + m, sec: 0 });

test('cleanBlocks descarta bloques inválidos y normaliza', () => {
  const out = cleanBlocks([
    blk('ok', 60, 120, [3, 1, 1]),
    blk('reverso', 120, 60, [0]),
    blk('sin-dias', 60, 120, []),
    blk('fuera', 60, 1441, [0]),
    { id: 5, start: 0, end: 10, days: [0] },
    null,
    blk('dias-raros', 0, 30, [7, -1, 2.5, '4']),
    blk('color-raro', 0, 30, [0], { color: 'fucsia' }),
    blk('ok', 0, 30, [0]),   // id repetido
  ]);
  assert.deepEqual(out.map((b) => b.id), ['ok', 'dias-raros', 'color-raro']);
  assert.deepEqual(out[0].days, [1, 3]);
  assert.deepEqual(out[1].days, [4]);
  assert.equal(out[2].color, 'cyan');
});

test('cleanBlocks acepta no-arrays y limita el número', () => {
  assert.deepEqual(cleanBlocks(null), []);
  assert.deepEqual(cleanBlocks({}), []);
  const many = Array.from({ length: MAX_BLOCKS + 10 }, (_, i) => blk('b' + i, 0, 15, [0]));
  assert.equal(cleanBlocks(many).length, MAX_BLOCKS);
});

test('sort de días numérico (no lexicográfico)', () => {
  assert.deepEqual(cleanBlocks([blk('a', 0, 15, [6, 0, 5])])[0].days, [0, 5, 6]);
});

test('isActiveAt: inicio incluido, fin excluido', () => {
  const b = blk('a', 9 * 60, 10 * 60, [0]);
  assert.equal(isActiveAt(b, at(0, 9)), true);
  assert.equal(isActiveAt(b, at(0, 9, 59)), true);
  assert.equal(isActiveAt(b, at(0, 10)), false);
  assert.equal(isActiveAt(b, at(1, 9, 30)), false);
});

test('currentBlock: con solape gana el que empezó más tarde', () => {
  const blocks = [blk('largo', 8 * 60, 12 * 60, [0]), blk('corto', 9 * 60, 10 * 60, [0])];
  assert.equal(currentBlock(blocks, at(0, 9, 30)).id, 'corto');
  assert.equal(currentBlock(blocks, at(0, 11)).id, 'largo');
  assert.equal(currentBlock(blocks, at(0, 13)), null);
});

test('nextBlock: hoy, otro día y la semana siguiente', () => {
  const blocks = [blk('lun9', 9 * 60, 10 * 60, [0]), blk('mie8', 8 * 60, 9 * 60, [2])];
  assert.deepEqual(
    [nextBlock(blocks, at(0, 8)).id, nextBlock(blocks, at(0, 8)).inDays], ['lun9', 0]);
  const n = nextBlock(blocks, at(0, 9));   // ya empezó: el siguiente es el miércoles
  assert.deepEqual([n.id, n.inDays, n.day], ['mie8', 2, 2]);
  const w = nextBlock([blk('lun9', 9 * 60, 10 * 60, [0])], at(0, 12));   // el lunes que viene
  assert.deepEqual([w.id, w.inDays, w.day], ['lun9', 7, 0]);
  assert.equal(nextBlock([], at(0, 0)), null);
});

test('nextBlock: domingo → lunes', () => {
  const n = nextBlock([blk('lun', 60, 120, [0])], at(6, 23));
  assert.deepEqual([n.inDays, n.day], [1, 0]);
});

test('blocksStartingIn: intervalo (desde, hasta]', () => {
  const blocks = [blk('a', 600, 660, [0]), blk('b', 602, 660, [0]), blk('c', 600, 660, [1])];
  assert.deepEqual(blocksStartingIn(blocks, 0, 599, 600).map((b) => b.id), ['a']);
  assert.deepEqual(blocksStartingIn(blocks, 0, 600, 602).map((b) => b.id), ['b']);
  assert.deepEqual(blocksStartingIn(blocks, 0, 602, 700), []);
  // medianoche: el primer repaso del día usa desde = -1
  assert.deepEqual(blocksStartingIn([blk('m', 0, 30, [2])], 2, -1, 0).map((b) => b.id), ['m']);
});

test('layoutDay: carriles para solapes y grupos independientes', () => {
  const blocks = [
    blk('a', 0, 120, [0]),
    blk('b', 60, 180, [0]),
    blk('c', 120, 150, [0]),   // cabe en el carril de a
    blk('d', 300, 360, [0]),   // grupo aparte
    blk('x', 0, 60, [1]),
  ];
  const out = Object.fromEntries(layoutDay(blocks, 0).map((o) => [o.b.id, [o.lane, o.lanes]]));
  assert.deepEqual(out, { a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
});

test('timerSecondsFor: restante si está en curso, duración si no', () => {
  const b = blk('a', 9 * 60, 10 * 60, [0]);
  assert.equal(timerSecondsFor(b, { day: 0, min: 9 * 60 + 30, sec: 15 }), 29 * 60 + 45);
  assert.equal(timerSecondsFor(b, at(1, 9, 30)), 3600);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hhmm, parseHHMM, fmtClock, durText, weekNow } from '../src/shared/time.js';

test('hhmm', () => {
  assert.equal(hhmm(0), '00:00');
  assert.equal(hhmm(9 * 60 + 5), '09:05');
  assert.equal(hhmm(1440), '24:00');
});

test('parseHHMM', () => {
  assert.equal(parseHHMM('07:30'), 450);
  assert.equal(parseHHMM('7:30'), 450);
  assert.ok(Number.isNaN(parseHHMM('')));
  assert.ok(Number.isNaN(parseHHMM('25:00')));
  assert.ok(Number.isNaN(parseHHMM('10:75')));
  assert.ok(Number.isNaN(parseHHMM(undefined)));
});

test('fmtClock redondea hacia arriba y añade horas', () => {
  assert.equal(fmtClock(0), '00:00');
  assert.equal(fmtClock(1), '00:01');
  assert.equal(fmtClock(59_001), '01:00');
  assert.equal(fmtClock(25 * 60_000), '25:00');
  assert.equal(fmtClock(3600_000 + 5_000), '1:00:05');
  assert.equal(fmtClock(-500), '00:00');
});

test('durText', () => {
  assert.equal(durText(45), '45 min');
  assert.equal(durText(60), '1 h');
  assert.equal(durText(90), '1 h 30 min');
});

test('weekNow: lunes = 0, domingo = 6', () => {
  assert.equal(weekNow(new Date(2026, 10, 9, 8, 15, 30)).day, 0);   // lunes 9-11-2026
  const sun = weekNow(new Date(2026, 10, 15, 23, 59, 1));
  assert.deepEqual([sun.day, sun.min, sun.sec, sun.date], [6, 1439, 1, '2026-11-15']);
});

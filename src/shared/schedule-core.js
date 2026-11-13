// Lógica pura del horario semanal. Un bloque es
// { id, title, start, end, days, color }: start/end en minutos desde las
// 00:00 (end ≤ 1440), days con 0 = lunes. La usan el backend (avisos, bandeja,
// widget) y la página (dibujo), así que no toca ni el DOM ni tjs.

import { DAY_MIN } from './time.js';
import { COLORS, DEFAULT_COLOR } from './colors.js';

export const MAX_BLOCKS = 500;

/** Valida y normaliza una lista de bloques que viene de fuera (página o disco). */
export function cleanBlocks(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const b of list.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b.id !== 'string' || !b.id) continue;
    const id = b.id.slice(0, 40);
    if (seen.has(id)) continue;
    const start = Math.floor(Number(b.start));
    const end = Math.floor(Number(b.end));
    if (!(start >= 0 && end <= DAY_MIN && end > start)) continue;
    const days = Array.isArray(b.days)
      ? [...new Set(b.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((x, y) => x - y)
      : [];
    if (!days.length) continue;
    seen.add(id);
    out.push({
      id,
      title: typeof b.title === 'string' ? b.title.slice(0, 200) : '',
      start, end, days,
      color: typeof b.color === 'string' && b.color in COLORS ? b.color : DEFAULT_COLOR,
    });
  }
  return out;
}

/** ¿Está el bloque en curso en { day, min }? */
export const isActiveAt = (b, { day, min }) => b.days.includes(day) && b.start <= min && min < b.end;

/** Bloque en curso; si se solapan, gana el que empezó más tarde (el más "nuevo"). */
export function currentBlock(blocks, now) {
  let best = null;
  for (const b of blocks) {
    if (isActiveAt(b, now) && (!best || b.start > best.start)) best = b;
  }
  return best;
}

/**
 * Siguiente inicio estrictamente posterior a now: hoy y luego los 7 días
 * siguientes (k = 7 es el mismo día de la semana que viene).
 * Devuelve el bloque con inDays (0 = hoy) y day.
 */
export function nextBlock(blocks, { day, min }) {
  for (let k = 0; k <= 7; k++) {
    const d = (day + k) % 7;
    let best = null;
    for (const b of blocks) {
      if (!b.days.includes(d) || (k === 0 && b.start <= min)) continue;
      if (!best || b.start < best.start) best = b;
    }
    if (best) return { ...best, inDays: k, day: d };
  }
  return null;
}

/**
 * Bloques de `day` cuyo inicio cae en (fromMin, toMin]. Permite no perder un
 * aviso si un tick llega tarde, sin repetir los ya pasados.
 */
export function blocksStartingIn(blocks, day, fromMin, toMin) {
  return blocks.filter((b) => b.days.includes(day) && b.start > fromMin && b.start <= toMin);
}

/**
 * Reparte en carriles los bloques de un día que se solapan.
 * Devuelve [{ b, lane, lanes }] ordenado por inicio.
 */
export function layoutDay(blocks, day) {
  const list = blocks.filter((b) => b.days.includes(day)).sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    const placed = [];
    for (const b of cluster) {
      let lane = lanes.findIndex((end) => end <= b.start);
      if (lane < 0) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = b.end;
      placed.push({ b, lane });
    }
    for (const p of placed) out.push({ ...p, lanes: lanes.length });
    cluster = [];
  };
  for (const b of list) {
    if (cluster.length && b.start >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return out;
}

/** Segundos que quedan del bloque en curso (o su duración si no está en curso). */
export function timerSecondsFor(b, now) {
  return isActiveAt(b, now)
    ? b.end * 60 - (now.min * 60 + (now.sec || 0))
    : (b.end - b.start) * 60;
}

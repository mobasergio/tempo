// Utilidades de tiempo compartidas por el backend (txiki.js) y las páginas.
// Sin Intl en txiki.js: todo el formato se hace a mano.

// Los nombres de los días están en los diccionarios (shared/i18n).
export const DAY_MIN = 24 * 60;

const pad2 = (n) => String(n).padStart(2, '0');

/** Minutos desde las 00:00 → "HH:MM". */
export const hhmm = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

/** Franja "HH:MM – HH:MM". */
export const rangeText = (start, end) => `${hhmm(start)} – ${hhmm(end)}`;

/**
 * Cuándo empieza un bloque devuelto por nextBlock: "09:00" (hoy),
 * "mañana 09:00" o "martes 09:00". t: traductor de shared/i18n.
 */
export function whenText(t, { inDays, day, start }) {
  if (inDays === 0) return hhmm(start);
  if (inDays === 1) return `${t('days.tomorrow')} ${hhmm(start)}`;
  return `${t('days.long')[day].toLowerCase()} ${hhmm(start)}`;
}

/** "HH:MM" → minutos desde las 00:00 (NaN si no es válido). */
export function parseHHMM(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v || '');
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : NaN;
}

/** Milisegundos → "MM:SS" o "H:MM:SS", redondeando hacia arriba al segundo. */
export function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = pad2(total % 60);
  return h > 0 ? `${h}:${pad2(m)}:${s}` : `${pad2(m)}:${s}`;
}

/** Minutos → "1 h 30 min", "45 min", "2 h". */
export function durText(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

/**
 * Posición en la semana: day con 0 = lunes, min y sec del día y una clave
 * de fecha local para "una vez al día".
 */
export function weekNow(d = new Date()) {
  return {
    day: (d.getDay() + 6) % 7,
    min: d.getHours() * 60 + d.getMinutes(),
    sec: d.getSeconds(),
    date: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
  };
}

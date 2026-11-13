// Ventanita "Ahora": bloque en curso, cuenta atrás y el siguiente.
// El backend decide qué bloque toca; aquí solo se cuenta el tiempo.

import { $ } from './lib/util.js';
import { DAY_LONG, hhmm, fmtClock, weekNow } from '../shared/time.js';
import { colorHex } from '../shared/colors.js';

let state = { now: null, next: null };
let lastMinute = -1;

function daySec() {
  const t = weekNow();
  return t.min * 60 + t.sec;
}

function nextText(nx) {
  if (!nx) return '';
  const when = nx.inDays === 0 ? hhmm(nx.start)
    : nx.inDays === 1 ? `mañana ${hhmm(nx.start)}`
    : `${DAY_LONG[nx.day].toLowerCase()} ${hhmm(nx.start)}`;
  return `Después: ${nx.title || 'Sin título'} · ${when}`;
}

function render() {
  const { now, next } = state;
  const box = $('widget');
  const t = daySec();

  if (now) {
    box.classList.remove('idle');
    box.style.setProperty('--c', colorHex(now.color));
    $('wTitle').textContent = now.title || 'Sin título';
    const left = Math.max(0, now.end * 60 - t);
    $('wCount').textContent = fmtClock(left * 1000);
    $('wUntil').textContent = `hasta ${hhmm(now.end)}`;
    const total = (now.end - now.start) * 60;
    $('wFill').style.width = (total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) * 100 : 0) + '%';
  } else {
    box.classList.add('idle');
    box.style.setProperty('--c', colorHex(next && next.color, 'gray'));
    $('wTitle').textContent = 'Sin actividad';
    if (next && next.inDays === 0) {
      $('wCount').textContent = fmtClock(Math.max(0, next.start * 60 - t) * 1000);
      $('wUntil').textContent = 'para la siguiente';
    } else {
      $('wCount').textContent = '';
      $('wUntil').textContent = next ? '' : 'No hay nada en el horario';
    }
    $('wFill').style.width = '0%';
  }
  $('wNext').textContent = nextText(next);
  $('wNext').hidden = !next;
}

async function refresh() {
  try {
    const st = await tiny.api.call('getWidget');
    if (st) state = st;
  } catch {}
  render();
}

// Cada segundo; al cambiar de minuto se vuelve a preguntar al backend
// (por si el reloj del sistema ha saltado o un bloque ha terminado).
setInterval(() => {
  const m = Math.floor(daySec() / 60);
  if (m !== lastMinute) {
    lastMinute = m;
    refresh();
  } else {
    render();
  }
}, 1000);

tiny.api.on('widget', (st) => {
  if (st) state = st;
  render();
});

// Aviso de inicio: se agranda y destella con el color del bloque.
tiny.api.on('widget-alert', ({ color } = {}) => {
  const box = $('widget');
  box.style.setProperty('--c', colorHex(color));
  box.classList.remove('alert');
  void box.offsetWidth;            // reinicia la animación si ya estaba
  box.classList.add('alert');
});
$('widget').addEventListener('animationend', (e) => {
  if (e.animationName === 'widget-flash') $('widget').classList.remove('alert');
});

$('wClose').addEventListener('click', () => tiny.api.call('setWidget', { on: false }));
$('wTitle').addEventListener('click', () => tiny.api.call('showSchedule'));

refresh();

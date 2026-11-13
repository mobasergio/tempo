// Ventanita "Ahora": bloque en curso, cuenta atrás y el siguiente.
// El backend decide qué bloque toca; aquí solo se cuenta el tiempo.

const $ = (id) => document.getElementById(id);
// mismo mapa que schedule.js
const COLORS = {
  cyan: '#4fc3f7', amber: '#ffb74d', red: '#ef5350', green: '#66bb6a',
  violet: '#b39ddb', pink: '#f48fb1', teal: '#4db6ac', gray: '#8b94a1',
};
const DAY_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

let state = { now: null, next: null };
let lastMinute = -1;

const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

function fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

function nowSec() {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function nextText(nx) {
  if (!nx) return '';
  const when = nx.inDays === 0 ? hhmm(nx.start)
    : nx.inDays === 1 ? `mañana ${hhmm(nx.start)}`
    : `${DAY_LONG[nx.day]} ${hhmm(nx.start)}`;
  return `Después: ${nx.title || 'Sin título'} · ${when}`;
}

function render() {
  const { now, next } = state;
  const box = $('widget');
  const t = nowSec();

  if (now) {
    box.classList.remove('idle');
    box.style.setProperty('--c', COLORS[now.color] || COLORS.cyan);
    $('wTitle').textContent = now.title || 'Sin título';
    const left = Math.max(0, now.end * 60 - t);
    $('wCount').textContent = fmt(left);
    $('wUntil').textContent = `hasta ${hhmm(now.end)}`;
    const total = (now.end - now.start) * 60;
    $('wFill').style.width = (total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) * 100 : 0) + '%';
  } else {
    box.classList.add('idle');
    box.style.setProperty('--c', next ? COLORS[next.color] || COLORS.gray : COLORS.gray);
    $('wTitle').textContent = 'Sin actividad';
    if (next && next.inDays === 0) {
      $('wCount').textContent = fmt(Math.max(0, next.start * 60 - t));
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
  const m = Math.floor(nowSec() / 60);
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
  box.style.setProperty('--c', COLORS[color] || COLORS.cyan);
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

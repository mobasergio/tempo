// Backend de Tempo. La cuenta atrás del temporizador vive aquí (los timers
// del backend no se ralentizan con la ventana minimizada). Nunca se restan
// segundos: el tiempo restante siempre se calcula a partir de la hora de fin.

const APP_TITLE = 'Tempo';
const MAX_SECONDS = 24 * 60 * 60;
const DEFAULT_SECONDS = 25 * 60;

let app = null;
let ticker = null;
let lastShownSecond = -1;
let lastDuration = DEFAULT_SECONDS;

const timer = {
  status: 'idle',   // 'idle' | 'running' | 'paused' | 'done'
  duration: 0,      // ms
  endAt: 0,         // Date.now() + restante, solo válido en 'running'
  remaining: 0,     // ms, válido en 'paused' / 'idle' / 'done'
};

function remainingMs() {
  return timer.status === 'running' ? Math.max(0, timer.endAt - Date.now()) : timer.remaining;
}

function snapshot() {
  return {
    status: timer.status,
    duration: timer.duration,
    remaining: remainingMs(),
    lastDuration,
  };
}

// Sin Intl en txiki.js: formato a mano.
function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

function publish() {
  const st = snapshot();
  app.push('timer', st);
  if (st.status === 'running' || st.status === 'paused') {
    const prefix = st.status === 'paused' ? '⏸ ' : '';
    app.setTitle(`${prefix}${fmt(st.remaining)} — ${APP_TITLE}`);
    const p = st.duration > 0 ? 1 - st.remaining / st.duration : 0;
    app.progress(Math.min(1, Math.max(0, p)));
  }
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function startTicker() {
  stopTicker();
  lastShownSecond = -1;
  // 250 ms para detectar el final con poca latencia; solo se publica
  // cuando cambia el segundo mostrado (≈ una vez por segundo).
  ticker = setInterval(tick, 250);
  tick();
}

function tick() {
  const rem = remainingMs();
  if (rem <= 0) return finish();
  const sec = Math.ceil(rem / 1000);
  if (sec !== lastShownSecond) {
    lastShownSecond = sec;
    publish();
  }
}

function finish() {
  stopTicker();
  timer.status = 'done';
  timer.remaining = 0;
  app.progress(null);
  app.setTitle(`¡Tiempo! — ${APP_TITLE}`);
  app.push('timer', snapshot());
  const mins = Math.round(timer.duration / 60000);
  const body = mins >= 1
    ? `Has completado ${mins} min de práctica.`
    : `Has completado ${Math.round(timer.duration / 1000)} s de práctica.`;
  app.notify('¡Tiempo terminado!', body, { sound: true });
  app.playSound('alert');
  app.attention({ critical: false });
}

export const api = {
  async start({ seconds } = {}) {
    seconds = Math.floor(Number(seconds));
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > MAX_SECONDS) {
      throw new Error('Duración no válida (1 s – 24 h).');
    }
    timer.duration = seconds * 1000;
    timer.endAt = Date.now() + timer.duration;
    timer.remaining = timer.duration;
    timer.status = 'running';
    lastDuration = seconds;
    app.store.set('lastDuration', seconds);
    startTicker();
    return snapshot();
  },

  async pause() {
    if (timer.status !== 'running') return snapshot();
    timer.remaining = remainingMs();
    timer.status = 'paused';
    stopTicker();
    publish();
    return snapshot();
  },

  async resume() {
    if (timer.status !== 'paused') return snapshot();
    timer.endAt = Date.now() + timer.remaining;
    timer.status = 'running';
    startTicker();
    return snapshot();
  },

  async reset() {
    stopTicker();
    timer.status = 'idle';
    timer.remaining = 0;
    timer.duration = 0;
    app.progress(null);
    app.setTitle(APP_TITLE);
    app.push('timer', snapshot());
    return snapshot();
  },

  async getState() {
    return snapshot();
  },
};

export async function init(a) {
  app = a;
  app.setTitle(APP_TITLE);
  const saved = await app.store.get('lastDuration');
  if (Number.isFinite(saved) && saved >= 1 && saved <= MAX_SECONDS) lastDuration = saved;
}

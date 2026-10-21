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
  updateTray();
}

// ───────────────────────── Bandeja ─────────────────────────
// Cerrar o minimizar oculta la ventana; solo "Salir" termina la app.
// WebView2 congela la página mientras la ventana está oculta (comprobado:
// ni sus timers ni el worker del metrónomo avanzan), así que el metrónomo,
// que vive en la página, se detiene antes de ocultarla.

const tray = { icon: '', tooltip: null, labels: {}, visible: true, metro: false };

function trayLabels() {
  const s = timer.status;
  return {
    show: tray.visible ? 'Ocultar ventana' : 'Mostrar ventana',
    timer: s === 'running' ? 'Pausar temporizador'
      : s === 'paused' ? 'Reanudar temporizador'
      : 'Iniciar temporizador',
    metro: tray.metro ? 'Parar metrónomo' : 'Iniciar metrónomo',
  };
}

function trayTooltip() {
  if (timer.status === 'running') return `${APP_TITLE} — ${fmt(remainingMs())} restantes`;
  if (timer.status === 'paused') return `${APP_TITLE} — en pausa, ${fmt(remainingMs())}`;
  return APP_TITLE;
}

function setTray() {
  const l = trayLabels();
  tray.labels = l;
  tray.tooltip = trayTooltip();
  app.tray.set({
    icon: tray.icon,
    template: false,
    primaryAction: true,
    tooltip: tray.tooltip,
    menu: [
      { id: 'show', label: l.show },
      { separator: true },
      { id: 'timer', label: l.timer },
      { id: 'metro', label: l.metro },
      { separator: true },
      { id: 'quit', label: 'Salir' },
    ],
  });
}

// No hay tray.update: el tooltip solo cambia volviendo a llamar a tray.set.
// Las etiquetas se parchean con menu.update, que también llega a la bandeja.
function updateTray() {
  if (!app) return;
  if (trayTooltip() !== tray.tooltip) return setTray();
  const l = trayLabels();
  for (const id of ['show', 'timer', 'metro']) {
    if (l[id] !== tray.labels[id]) app.menu.update(id, { label: l[id] });
  }
  tray.labels = l;
}

function stopMetroForHide() {
  if (!tray.metro) return;
  tray.metro = false;   // la página lo confirmará con metroState
  app.push('metro-stop', {});
  app.notify('Metrónomo detenido', 'Se ha parado al ocultar la ventana: con la ventana oculta no puede sonar con precisión.');
}

function showWindow() {
  app.restore();
  app.show();
  tray.visible = true;
  updateTray();
}

function hideWindow() {
  const wasPlaying = tray.metro;
  stopMetroForHide();
  tray.visible = false;
  updateTray();
  // margen para que la página pare el metrónomo antes de congelarse
  if (wasPlaying) setTimeout(() => app.hide(), 150);
  else app.hide();
}

// El cierre con la X lo oculta el launcher sin pasar por aquí: se vigila la
// visibilidad real para mantener la etiqueta y parar el metrónomo.
async function pollWindow() {
  const st = await app.window('main').getState();
  if (!st) return;
  if (st.visible && st.minimized) return hideWindow();   // por si onWindowState no llegó
  if (st.visible === tray.visible) return;
  tray.visible = st.visible;
  if (!st.visible) stopMetroForHide();
  updateTray();
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
  updateTray();
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
    updateTray();
    return snapshot();
  },

  async getState() {
    return snapshot();
  },

  // La página avisa de cada arranque/parada del metrónomo (etiqueta de la bandeja).
  async metroState({ running } = {}) {
    tray.metro = !!running;
    updateTray();
  },
};

export async function onTray(id) {
  if (id === null || id === 'show') {
    if (tray.visible) hideWindow();
    else showWindow();
  } else if (id === 'timer') {
    const s = timer.status;
    if (s === 'running') await api.pause();
    else if (s === 'paused') await api.resume();
    else await api.start({ seconds: lastDuration });
  } else if (id === 'metro') {
    // lo arranca/para la página (recibe el mismo evento 'tray'); oculta
    // está congelada, así que primero se muestra
    if (!tray.visible) showWindow();
  } else if (id === 'quit') {
    app.quit();
  }
}

export function onWindowState(info) {
  if (info.win === 'main' && info.minimized) hideWindow();
}

export async function init(a) {
  app = a;
  app.setTitle(APP_TITLE);
  const saved = await app.store.get('lastDuration');
  if (Number.isFinite(saved) && saved >= 1 && saved <= MAX_SECONDS) lastDuration = saved;

  const res = (await app.paths()).resources;
  tray.icon = res ? res + '/tray.png' : '';
  app.setHideOnClose(true);
  setTray();
  setInterval(() => pollWindow().catch(() => {}), 500);
}

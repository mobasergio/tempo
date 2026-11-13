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

// Plugins opcionales (el horario es la app): deciden qué pestañas se ven y
// qué items lleva la bandeja.
const PLUGIN_IDS = ['timer', 'metro', 'todo'];
const plugins = { timer: false, metro: false, todo: false };

// ───────────────────────── Horario ─────────────────────────
// Bloques semanales: { id, title, start, end, days, color }. start/end en
// minutos desde las 00:00; days con 0 = lunes. Viven aquí (no en la página)
// para poder avisar y mostrar el bloque actual con la ventana oculta.

const DAY_MIN = 24 * 60;
const MAX_BLOCKS = 500;
let blocks = [];
let nowBlock = null;          // bloque en curso (o null)
const notified = new Set();   // `${id}@${fecha}` ya avisados hoy
let notifiedDate = '';

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function cleanBlocks(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const b of list.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b.id !== 'string') continue;
    const start = Math.floor(Number(b.start));
    const end = Math.floor(Number(b.end));
    if (!(start >= 0 && end <= DAY_MIN && end > start)) continue;
    const days = Array.isArray(b.days)
      ? [...new Set(b.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [];
    if (!days.length) continue;
    out.push({
      id: b.id.slice(0, 40),
      title: typeof b.title === 'string' ? b.title.slice(0, 200) : '',
      start, end, days,
      color: typeof b.color === 'string' ? b.color.slice(0, 20) : 'cyan',
    });
  }
  return out;
}

function nowInfo() {
  const d = new Date();
  return {
    day: (d.getDay() + 6) % 7,
    min: d.getHours() * 60 + d.getMinutes(),
    date: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
  };
}

function currentBlock({ day, min }) {
  // si se solapan, gana el que empezó más tarde (el más "nuevo")
  let best = null;
  for (const b of blocks) {
    if (b.days.includes(day) && b.start <= min && min < b.end && (!best || b.start > best.start)) best = b;
  }
  return best;
}

// Siguiente inicio a partir de ahora: hoy y luego los 7 días siguientes.
function nextBlock({ day, min }) {
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

let nextSig = '';

function widgetState() {
  return { on: widget.on, now: nowBlock, next: nextBlock(nowInfo()) };
}

function checkSchedule() {
  if (!app) return;
  const n = nowInfo();
  if (n.date !== notifiedDate) {
    notified.clear();
    notifiedDate = n.date;
  }
  for (const b of blocks) {
    if (!b.days.includes(n.day) || n.min < b.start || n.min >= b.start + 1) continue;
    const key = `${b.id}@${n.date}`;
    if (notified.has(key)) continue;
    notified.add(key);
    app.notify(`Empieza: ${b.title || 'Sin título'}`, `${hhmm(b.start)} – ${hhmm(b.end)}`, { sound: true });
    alertBlock = b.id;
  }
  const cur = currentBlock(n);
  const sig = (x) => (x ? `${x.id}|${x.title}|${x.end}` : '');
  const nx = nextBlock(n);
  const nsig = nx ? `${sig(nx)}|${nx.start}|${nx.inDays}|${nx.color}` : '';
  const changed = sig(cur) !== sig(nowBlock) || (cur && nowBlock && cur.color !== nowBlock.color);
  if (changed) {
    nowBlock = cur;
    app.push('now-block', nowBlock);
    updateTray();
  }
  if (changed || nsig !== nextSig) {
    nextSig = nsig;
    app.push('widget', widgetState());
  }
  // el destello va después del estado nuevo, para que se vea con su color
  if (alertBlock) {
    const b = blocks.find((x) => x.id === alertBlock);
    alertBlock = null;
    if (b && widget.on) app.push('widget-alert', { id: b.id, color: b.color });
  }
}

// ───────────────────────── Widget ─────────────────────────
// Ventanita siempre encima con el bloque actual. Es una ventana aparte y
// visible, así que su página no se congela al ocultar la principal.

const WIDGET_W = 300;
const WIDGET_H = 92;
const widget = { on: true, open: false, pos: null, lastSaved: '' };
let alertBlock = null;

async function widgetPosition() {
  if (widget.pos) return widget.pos;
  try {
    const screens = await app.screens();
    const s = screens.find((x) => x.primary) || screens[0];
    const v = (s && s.visible) || s;
    if (v) return { x: v.x + v.width - WIDGET_W - 16, y: v.y + v.height - WIDGET_H - 16 };
  } catch {}
  return { x: 40, y: 40 };
}

async function openWidget() {
  if (widget.open) return;
  widget.open = true;
  const { x, y } = await widgetPosition();
  app.win.open('widget', {
    page: 'widget.html',
    title: 'Tempo — Ahora',
    size: `${WIDGET_W}x${WIDGET_H}`,
    minSize: `${WIDGET_W}x${WIDGET_H}`,
    x, y,
    chrome: { frame: false, windowControls: false, acceptsFirstMouse: true },
  });
  const w = app.window('widget');
  w.setResizable(false);
  w.setAlwaysOnTop(true);
  w.show({ activate: false });
}

function closeWidget() {
  if (!widget.open) return;
  widget.open = false;
  try { app.win.close('widget'); } catch {}
}

async function setWidgetOn(on) {
  widget.on = !!on;
  await app.store.set('widget', widget.on);
  if (widget.on) await openWidget();
  else closeWidget();
  app.push('widget', widgetState());
  updateTray();
}

// Guarda la posición cuando el usuario arrastra el widget.
async function pollWidget() {
  if (!widget.open) return;
  const st = await app.window('widget').getState();
  if (!st) return;
  const key = `${st.x},${st.y}`;
  if (key === widget.lastSaved) return;
  widget.lastSaved = key;
  widget.pos = { x: st.x, y: st.y };
  await app.store.set('widgetPos', widget.pos);
}

function trayLabels() {
  const s = timer.status;
  return {
    show: tray.visible ? 'Ocultar ventana' : 'Mostrar ventana',
    timer: s === 'running' ? 'Pausar temporizador'
      : s === 'paused' ? 'Reanudar temporizador'
      : 'Iniciar temporizador',
    metro: tray.metro ? 'Parar metrónomo' : 'Iniciar metrónomo',
    widget: widget.on ? 'Ocultar widget' : 'Mostrar widget',
    now: nowBlock ? `Ahora: ${nowBlock.title || 'Sin título'} (hasta ${hhmm(nowBlock.end)})` : 'Sin actividad ahora',
  };
}

function trayTooltip() {
  if (timer.status === 'running') return `${APP_TITLE} — ${fmt(remainingMs())} restantes`;
  if (timer.status === 'paused') return `${APP_TITLE} — en pausa, ${fmt(remainingMs())}`;
  if (nowBlock) return `${APP_TITLE} — Ahora: ${nowBlock.title || 'Sin título'} (hasta ${hhmm(nowBlock.end)})`;
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
      { id: 'now', label: l.now, enabled: false },
      { separator: true },
      { id: 'show', label: l.show },
      { separator: true },
      ...(plugins.timer ? [{ id: 'timer', label: l.timer }] : []),
      ...(plugins.metro ? [{ id: 'metro', label: l.metro }] : []),
      { id: 'widget', label: l.widget },
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
  for (const id of ['now', 'show', 'timer', 'metro', 'widget']) {
    if ((id === 'timer' || id === 'metro') && !plugins[id]) continue;
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
  if (wasPlaying) setTimeout(() => app.hide({ app: false }), 150);
  else app.hide({ app: false });
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

  async getPlugins() {
    return { ...plugins };
  },

  async setPlugins(next = {}) {
    for (const id of PLUGIN_IDS) if (id in next) plugins[id] = !!next[id];
    await app.store.set('plugins', { ...plugins });
    if (!plugins.timer && (timer.status !== 'idle')) await api.reset();
    if (!plugins.metro) tray.metro = false;   // la página para el metrónomo
    setTray();
    app.push('plugins', { ...plugins });
    return { ...plugins };
  },

  async getWidget() {
    return widgetState();
  },

  async setWidget({ on } = {}) {
    await setWidgetOn(on);
    return widgetState();
  },

  // Desde el widget: abre la ventana principal en el horario.
  async showSchedule() {
    showWindow();
    app.push('show-tab', 'sched');
  },

  async getBlocks() {
    return blocks;
  },

  async saveBlocks({ blocks: list } = {}) {
    blocks = cleanBlocks(list);
    await app.store.set('blocks', blocks);
    app.push('blocks', blocks);
    checkSchedule();
    return blocks;
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
  } else if ((id === 'timer' || id === 'metro') && !plugins[id]) {
    // plugin desactivado: no hay nada que hacer
  } else if (id === 'timer') {
    const s = timer.status;
    if (s === 'running') await api.pause();
    else if (s === 'paused') await api.resume();
    else await api.start({ seconds: lastDuration });
  } else if (id === 'metro') {
    // lo arranca/para la página (recibe el mismo evento 'tray'); oculta
    // está congelada, así que primero se muestra
    if (!tray.visible) showWindow();
  } else if (id === 'widget') {
    await setWidgetOn(!widget.on);
  } else if (id === 'quit') {
    app.quit();
  }
}

export function onWindowClosed(id) {
  const wid = typeof id === 'string' ? id : id && (id.id || id.win);
  if (wid === 'widget' && widget.open) {
    widget.open = false;
    widget.on = false;
    app.store.set('widget', false);
    updateTray();
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
  const savedPlugins = await app.store.get('plugins');
  if (savedPlugins && typeof savedPlugins === 'object') {
    for (const id of PLUGIN_IDS) plugins[id] = !!savedPlugins[id];
  }
  blocks = cleanBlocks(await app.store.get('blocks'));
  nowBlock = currentBlock(nowInfo());
  const wOn = await app.store.get('widget');
  widget.on = wOn !== false;
  const wPos = await app.store.get('widgetPos');
  if (wPos && Number.isFinite(wPos.x) && Number.isFinite(wPos.y)) {
    widget.pos = { x: wPos.x, y: wPos.y };
    widget.lastSaved = `${wPos.x},${wPos.y}`;
  }

  const res = (await app.paths()).resources;
  tray.icon = res ? res + '/tray.png' : '';
  app.setHideOnClose(true);
  setTray();
  setInterval(() => pollWindow().catch(() => {}), 500);
  checkSchedule();
  setInterval(checkSchedule, 5000);
  setInterval(() => pollWidget().catch(() => {}), 1000);
  if (widget.on) openWidget().catch(() => { widget.open = false; });
}



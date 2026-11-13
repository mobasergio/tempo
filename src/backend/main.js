// Backend de Tempo: une los módulos (temporizador, horario, widget, bandeja)
// y expone la API y los hooks que llama tinyjs.

import { createTimer } from './timer.js';
import { createSchedule } from './schedule.js';
import { createWidget } from './widget.js';
import { createTray } from './tray.js';

const APP_TITLE = 'Tempo';

// Plugins opcionales (el horario es la app): deciden qué pestañas se ven y
// qué items lleva la bandeja.
const PLUGIN_IDS = ['timer', 'metro', 'todo'];
const plugins = { timer: false, metro: false, todo: false };

let app = null;
let timer = null;
let schedule = null;
let widget = null;
let tray = null;

const refreshTray = () => tray && tray.update();

export const api = {
  // ── Temporizador ──
  async start({ seconds } = {}) { return timer.start(seconds); },
  async pause() { return timer.pause(); },
  async resume() { return timer.resume(); },
  async reset() { return timer.reset(); },
  async getState() { return timer.snapshot(); },

  // ── Plugins ──
  async getPlugins() { return { ...plugins }; },

  async setPlugins(next = {}) {
    for (const id of PLUGIN_IDS) if (id in next) plugins[id] = !!next[id];
    await app.store.set('plugins', { ...plugins });
    if (!plugins.timer && timer.status !== 'idle') timer.reset();
    if (!plugins.metro) tray.setMetro(false);   // la página para el metrónomo
    tray.set();
    app.push('plugins', { ...plugins });
    return { ...plugins };
  },

  // ── Widget ──
  async getWidget() { return widget.state(); },

  async setWidget({ on } = {}) {
    await widget.setOn(on);
    return widget.state();
  },

  // Desde el widget: abre la ventana principal en el horario.
  async showSchedule() {
    tray.show();
    app.push('show-tab', 'sched');
  },

  // ── Horario ──
  async getBlocks() { return schedule.blocks; },
  async saveBlocks({ blocks } = {}) { return schedule.save(blocks); },

  // ── Metrónomo ──
  // La página avisa de cada arranque/parada (etiqueta de la bandeja).
  async metroState({ running } = {}) { tray.setMetro(running); },
};

export async function onTray(id) {
  if (id === null || id === 'show') {
    tray.toggleWindow();
  } else if ((id === 'timer' || id === 'metro') && !plugins[id]) {
    // plugin desactivado: no hay nada que hacer
  } else if (id === 'timer') {
    timer.toggle();
  } else if (id === 'metro') {
    // lo arranca/para la página (recibe el mismo evento 'tray'); oculta está
    // congelada, así que primero se muestra
    if (!tray.visible) tray.show();
  } else if (id === 'widget') {
    await widget.setOn(!widget.on);
  } else if (id === 'quit') {
    app.quit();
  }
}

export function onWindowClosed(id) {
  const wid = typeof id === 'string' ? id : id && (id.id || id.win);
  if (wid === 'widget') widget.closed();
}

export function onWindowState(info) {
  if (info.win === 'main' && info.minimized) tray.hide();
}

// Al despertar de la suspensión la hora ha saltado: recalcular el horario.
export function onSystem(kind) {
  if (kind === 'wake' && schedule) schedule.resync();
}

export async function init(a) {
  app = a;
  app.setTitle(APP_TITLE);

  const savedPlugins = await app.store.get('plugins');
  if (savedPlugins && typeof savedPlugins === 'object') {
    for (const id of PLUGIN_IDS) plugins[id] = !!savedPlugins[id];
  }

  timer = createTimer({ app, title: APP_TITLE, onChange: refreshTray });
  schedule = createSchedule({
    app,
    onNowChange: refreshTray,
    onWidgetChange: () => widget.push(),
    onStart: (b) => widget.alert(b),
  });
  widget = createWidget({
    app,
    title: APP_TITLE,
    info: () => ({ now: schedule.now, next: schedule.next() }),
    onChange: refreshTray,
  });

  await timer.load();
  await schedule.load();
  await widget.load();   // antes de la bandeja: sus etiquetas dependen de él

  const res = (await app.paths()).resources;
  tray = createTray({
    app, title: APP_TITLE, icon: res ? res + '/tray.png' : '',
    plugins, timer, schedule, widget,
  });
  app.setHideOnClose(true);
  tray.set();

  schedule.check();
  setInterval(schedule.check, 5000);
  setInterval(() => tray.poll().catch(() => {}), 500);
  setInterval(() => widget.poll().catch(() => {}), 2000);
}

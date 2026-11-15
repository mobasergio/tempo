// Backend de Tempo: une los módulos (horario, widget, aviso, bandeja, ajustes)
// y expone la API y los hooks que llama tinyjs.

import { createSchedule } from './schedule.js';
import { createWidget } from './widget.js';
import { createAlert } from './alert.js';
import { createTray } from './tray.js';
import { createSettings } from './settings.js';

const APP_TITLE = 'Tempo';

// Ventana oculta que hace de "dueña" del widget y del aviso: en Windows una
// ventana con dueño no sale en Alt+Tab ni en la barra de tareas. No vale la
// principal, que se esconde en la bandeja y se llevaría las demás con ella.
const ANCHOR = 'anchor';

// Claves de versiones anteriores (plugins, pestañas, migraciones) que ya no se
// usan: se borran al arrancar. Borrar una que no existe no hace nada.
const OBSOLETE_KEYS = ['plugins', 'lastDuration', 'bpm', 'meter', 'accents', 'volume', 'todos', 'activeTab', 'sizeMigrated'];

let app = null;
let schedule = null;
let widget = null;
let alertWin = null;
let tray = null;
let settings = null;

// Traduce siempre con el idioma vigente (puede cambiar en Ajustes).
const t = (key, vars) => settings.t(key, vars);

const refreshTray = () => tray && tray.update();

export const api = {
  // ── Horario ──
  async getBlocks() { return schedule.blocks; },
  async saveBlocks({ blocks } = {}) { return schedule.save(blocks); },

  // ── Widget ──
  async getWidget() { return widget.state(); },

  async setWidget({ on } = {}) {
    await widget.setOn(on);
    return widget.state();
  },

  // Desde el widget o el aviso: muestra la ventana principal.
  async showSchedule() { tray.show(); },

  // ── Aviso emergente ──
  async getAlert() { return alertWin.current; },
  async dismissAlert() { alertWin.close(); },

  // ── Ajustes ──
  async getSettings() {
    return {
      settings: settings.get(),
      widget: widget.on,
      launchAtLogin: await settings.launchStatus(),
    };
  },

  // patch: ver cleanSettings en shared/settings.js
  async setSettings(patch = {}) {
    const s = await settings.set(patch);
    app.push('settings', s);
    return s;
  },

  async setLaunchAtLogin({ on } = {}) {
    return settings.setLaunchAtLogin(on);
  },
};

export async function onTray(id) {
  if (id === null || id === 'show') tray.toggleWindow();
  else if (id === 'widget') await widget.setOn(!widget.on);
  else if (id === 'quit') app.quit();
}

// Atajo global de Ajustes: muestra u oculta la ventana.
export function onHotkey(info) {
  const id = typeof info === 'string' ? info : info && info.id;
  if (id === settings.HOTKEY_ID) tray.toggleWindow();
}

export function onWindowClosed(id) {
  const wid = typeof id === 'string' ? id : id && (id.id || id.win);
  if (wid === 'widget') widget.closed();
  else if (wid === 'alert') alertWin.closed();
}

export function onWindowState(info) {
  if (info.win === 'main' && info.minimized) tray.hide();
}

// Al despertar de la suspensión la hora ha saltado: recalcular el horario.
export function onSystem(kind) {
  if (kind === 'wake' && schedule) schedule.resync();
}

// Idioma nuevo: la bandeja y los títulos de las ventanitas se rehacen aquí;
// las páginas se recargan solas al recibir 'settings'.
function applyLang() {
  if (tray) tray.set();
  try { app.window('widget').setTitle(t('widget.windowTitle', { app: APP_TITLE })); } catch {}
  try { app.window('alert').setTitle(t('alert.windowTitle', { app: APP_TITLE })); } catch {}
}

// De una en una: varios delete a la vez reescriben el store en paralelo y
// alguno se pierde.
async function dropObsoleteKeys() {
  try {
    const all = await app.store.all();
    for (const k of OBSOLETE_KEYS) if (all && k in all) await app.store.delete(k);
  } catch {}
}

/** Aviso de cambio de tarea (si está activado en Ajustes). */
function popup(kind, block) {
  if (!settings.get().notifyPopup) return;
  alertWin.show({ kind, block, next: schedule.next() }).catch(() => {});
}

export async function init(a) {
  app = a;
  app.setTitle(APP_TITLE);
  await dropObsoleteKeys();

  settings = createSettings({ app, onLangChange: applyLang });
  await settings.load();

  schedule = createSchedule({
    app,
    t,
    getSettings: () => settings.get(),
    onNowChange: refreshTray,
    onWidgetChange: () => widget.push(),
    onStart: (b) => {
      widget.alert(b);
      popup('start', b);
    },
    // terminó el bloque en curso: se vuelve a uno solapado o no queda ninguno
    onSwitch: ({ ended, now }) => {
      if (now) widget.alert(now);
      popup(now ? 'start' : 'end', now || ended);
    },
  });
  alertWin = createAlert({ app, title: APP_TITLE, t, parent: ANCHOR, getSettings: () => settings.get() });
  widget = createWidget({
    app,
    title: APP_TITLE,
    t,
    info: () => ({ now: schedule.now, next: schedule.next() }),
    parent: ANCHOR,
    onChange: refreshTray,
  });

  await schedule.load();
  app.win.open(ANCHOR, {
    page: 'anchor.html',
    size: '1x1',
    show: false,
    chrome: { frame: false, windowControls: false },
  });
  await widget.load();   // antes de la bandeja: sus etiquetas dependen de él

  const res = (await app.paths()).resources;
  tray = createTray({ app, title: APP_TITLE, t, icon: res ? res + '/tray.png' : '', schedule, widget });
  app.setHideOnClose(true);
  tray.set();

  schedule.check();
  setInterval(schedule.check, 5000);
  setInterval(() => tray.poll().catch(() => {}), 1000);
  setInterval(() => widget.poll().catch(() => {}), 2000);
}

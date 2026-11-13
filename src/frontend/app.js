// Shell de la ventana principal: ajustes, idioma, tema, pestañas, plugins,
// atajos y arranque. Cada pestaña es una feature (features/*.js) que se
// registra con registerTab y recibe el contexto `ctx`; no comparten globales.

import { $, isEditable } from './lib/util.js';
import { createState } from './lib/state.js';
import { setupI18n } from './lib/i18n.js';
import { cleanSettings } from '../shared/settings.js';
import { initSchedule } from './features/schedule.js';
import { initTimer } from './features/timer.js';
import { initMetro } from './features/metro.js';
import { initTodo } from './features/todo.js';
import { initUpdate } from './features/update.js';
import { initSettings } from './features/settings.js';

// El horario es la app; temporizador, metrónomo y tareas son opcionales.
const PLUGIN_IDS = ['timer', 'metro', 'todo'];
const PANELS = ['sched', ...PLUGIN_IDS];

// Los ajustes deciden idioma y tema antes de construir nada (si el backend
// fallara, se sigue con los valores por defecto en vez de dejar la página muerta).
const initial = await tiny.api.call('getSettings').catch((e) => {
  console.error('getSettings', e);
  return { settings: cleanSettings(null), plugins: {}, widget: false, launchAtLogin: 'unsupported' };
});
const t = setupI18n(initial.settings);

const state = createState({
  activeTab: 'sched',
  plugins: { timer: false, metro: false, todo: false },
});
const tabs = {};   // nombre → { onShow?, onKey? }

const tabAvailable = (name) =>
  name === 'sched' || (PLUGIN_IDS.includes(name) && !!state.get().plugins[name]);

function showTab(name, { persist = false } = {}) {
  if (!tabAvailable(name)) name = 'sched';
  state.set({ activeTab: name });
  for (const btn of document.querySelectorAll('.tab')) {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on);
  }
  for (const p of PANELS) $('panel-' + p).hidden = name !== p;
  tabs[name]?.onShow?.();
  if (persist) tiny.store.set('activeTab', name);
}

function applyPlugins(p) {
  if (!p) return;
  state.set({ plugins: { timer: !!p.timer, metro: !!p.metro, todo: !!p.todo } });
  const { plugins, activeTab } = state.get();
  for (const id of PLUGIN_IDS) $('tab-' + id).hidden = !plugins[id];
  if (!tabAvailable(activeTab)) showTab('sched', { persist: true });
}

const ctx = {
  t,
  state,
  showTab,
  tabAvailable,
  applyPlugins,
  modalOpen: false,
  registerTab(name, handlers) { tabs[name] = handlers; },
};

for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => showTab(btn.dataset.tab, { persist: true }));
}

// El widget pide abrir el horario.
tiny.api.on('show-tab', (name) => {
  if (tabAvailable(name)) showTab(name, { persist: true });
});
tiny.api.on('plugins', applyPlugins);

// ───────────────────── Atajos de teclado ─────────────────────
// Cada pestaña atiende sus teclas con onKey; aquí solo se filtra.

document.addEventListener('keydown', (e) => {
  if (ctx.modalOpen || isEditable(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.code === 'Space') {
    e.preventDefault();          // que no "pulse" también el botón enfocado
    if (e.repeat) return;
  }
  tabs[state.get().activeTab]?.onKey?.(e);
});

// Tras un clic, quita el foco del botón para que Espacio no lo reactive.
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b && !b.hasAttribute('data-keep-focus')) b.blur();
});

// ───────────────────────── Arranque ─────────────────────────

const timer = initTimer(ctx);
const features = [
  initSchedule(ctx, { startTimer: (seconds) => timer.startFor(seconds) }),
  timer,
  initMetro(ctx),
  initTodo(ctx),
];
initUpdate(ctx);
initSettings(ctx, initial);
applyPlugins(initial.plugins);

async function boot() {
  const [tab, sizeFixed] = await Promise.all([tiny.store.get('activeTab'), tiny.store.get('sizeMigrated')]);

  // Las ventanas guardadas con el tamaño de una versión antigua (más pequeña)
  // se agrandan una sola vez; después se respeta el tamaño que elija el usuario.
  tiny.win.setMinSize(720, 480);
  if (!sizeFixed) {
    if (innerWidth < 900) tiny.win.setSize(980, 700);
    tiny.store.set('sizeMigrated', true);
  }

  // cada feature arranca por su cuenta: un fallo no impide el resto
  const results = await Promise.allSettled(features.map((f) => f.boot()));
  for (const r of results) if (r.status === 'rejected') console.error('boot', r.reason);
  showTab(tabAvailable(tab) ? tab : 'sched');
}

boot()
  .catch((e) => console.error('boot', e))
  .finally(() => document.documentElement.classList.remove('i18n-pending'));

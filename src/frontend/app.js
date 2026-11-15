// Shell de la ventana principal: ajustes, idioma, atajos y arranque. El
// horario (features/schedule.js) es la app; Ajustes y la lista de atajos son
// diálogos encima.

import { isEditable } from './lib/util.js';
import { setupI18n } from './lib/i18n.js';
import { cleanSettings } from '../shared/settings.js';
import { initSchedule } from './features/schedule.js';
import { initSettings } from './features/settings.js';
import { initShortcuts } from './features/shortcuts.js';
import { initUpdate } from './features/update.js';

// Los ajustes deciden idioma y tema antes de construir nada (si el backend
// fallara, se sigue con los valores por defecto en vez de dejar la página muerta).
const initial = await tiny.api.call('getSettings').catch((e) => {
  console.error('getSettings', e);
  return { settings: cleanSettings(null), widget: false, launchAtLogin: 'unsupported' };
});
const t = setupI18n(initial.settings);

const ctx = { t, modalOpen: false };

const schedule = initSchedule(ctx);
initUpdate(ctx);
initSettings(ctx, initial);
const shortcuts = initShortcuts(ctx);

// ───────────────────── Atajos de teclado ─────────────────────
// El horario atiende sus teclas (onKey) y Ctrl/Cmd + tecla (onShortcut:
// deshacer, copiar…); aquí solo se filtra. Dentro de un campo de texto se deja
// al navegador, que ya deshace y copia texto.
document.addEventListener('keydown', (e) => {
  if (ctx.modalOpen || isEditable(e.target)) return;
  // ? abre la lista de atajos (en cualquier distribución: se mira e.key)
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    shortcuts.open();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    if (schedule.onShortcut(e)) e.preventDefault();
    return;
  }
  // Alt solo pasa con las flechas (mover bloques): Alt+letra y Alt+Espacio
  // son del sistema.
  if (e.ctrlKey || e.metaKey || (e.altKey && !e.key.startsWith('Arrow'))) return;
  schedule.onKey(e);
});

// Tras un clic con el ratón, quita el foco del botón para que Espacio no lo
// reactive. Con teclado (Intro/Espacio → click con detail 0) el foco se queda:
// si no, quien navega con teclado lo perdería en cada pulsación.
document.addEventListener('click', (e) => {
  if (e.detail === 0) return;
  const b = e.target.closest('button');
  if (b && !b.hasAttribute('data-keep-focus')) b.blur();
});

// ───────────────────────── Arranque ─────────────────────────

tiny.win.setMinSize(720, 480);
schedule.boot()
  .catch((e) => console.error('boot', e))
  .finally(() => document.documentElement.classList.remove('i18n-pending'));

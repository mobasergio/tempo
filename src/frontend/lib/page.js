// Arranque común de las ventanitas (widget, aviso): ajustes, idioma y tema.

import { setupI18n } from './i18n.js';
import { applyTheme } from './theme.js';
import { cleanSettings } from '../../shared/settings.js';

/** Traduce la página, aplica el tema (y lo sigue) y devuelve t. */
export async function bootPage() {
  const initial = await tiny.api.call('getSettings').catch(() => ({ settings: cleanSettings(null) }));
  const t = setupI18n(initial.settings);
  applyTheme(initial.settings.theme);
  tiny.api.on('settings', (s) => { if (s) applyTheme(s.theme); });
  return t;
}

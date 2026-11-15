// Ajustes en el backend: los guarda, aplica lo que es del sistema (atajo
// global, arranque con el sistema) y avisa a todas las ventanas.

import { SETTINGS_VERSION, cleanSettings, cleanHotkey, effectiveLang } from '../shared/settings.js';
import { createT } from '../shared/i18n.js';

const HOTKEY_ID = 'toggle-window';

export function createSettings({ app, onLangChange }) {
  let s = cleanSettings(null);
  let hotkeyActive = '';
  let t = createT('es');

  // 'cmd' es Ctrl en Windows/Linux: se guarda 'ctrl' y se traduce al registrar.
  const nativeCombo = (combo) => (app.system.isMacOS() ? combo : combo.replace(/\bctrl\b/, 'cmd'));

  function applyHotkey() {
    if (hotkeyActive === s.hotkey) return;
    try { if (hotkeyActive) app.hotkey.unregister(HOTKEY_ID); } catch {}
    hotkeyActive = '';
    if (!s.hotkey) return;
    try {
      app.hotkey.register(HOTKEY_ID, nativeCombo(s.hotkey));
      hotkeyActive = s.hotkey;
    } catch (e) {
      console.error('hotkey', e);
    }
  }

  async function launchStatus() {
    try { return await app.launchAtLogin.get(); } catch { return 'unsupported'; }
  }

  return {
    HOTKEY_ID,
    get: () => s,
    get t() { return t; },

    async load() {
      s = cleanSettings(await app.store.get('settings'));
      t = createT(effectiveLang(s));
      applyHotkey();
    },

    async set(patch = {}) {
      const prevLang = t.lang;
      const next = cleanSettings({ ...s, ...patch });
      if ('hotkey' in patch && patch.hotkey && !cleanHotkey(patch.hotkey)) {
        throw new Error(t('settings.hotkeyInvalid'));
      }
      s = next;
      await app.store.set('settings', { ...s, schemaVersion: SETTINGS_VERSION });
      applyHotkey();
      t = createT(effectiveLang(s));
      if (t.lang !== prevLang) onLangChange();
      return s;
    },

    launchStatus,

    async setLaunchAtLogin(on) {
      try { return await app.launchAtLogin.set(!!on); } catch { return 'unsupported'; }
    },
  };
}

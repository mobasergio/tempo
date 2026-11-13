// Ajustes de la app: esquema, valores por defecto y validación. Los guarda el
// backend (clave 'settings' del store); plugins y widget tienen claves propias.

export const SETTINGS_VERSION = 1;
export const THEMES = ['system', 'light', 'dark'];
export const LANGS = ['es', 'en'];
export const LANG_PREFS = ['system', ...LANGS];

export const DEFAULT_SETTINGS = {
  theme: 'system',
  lang: 'system',
  sysLang: 'es',        // idioma del sistema según la última página que lo vio
  notifySound: true,
  hotkey: '',           // p. ej. 'ctrl+alt+t'; vacío = sin atajo
};

const MODS = ['ctrl', 'alt', 'shift', 'cmd'];

/**
 * Normaliza una combinación ('Alt+Ctrl+T' → 'ctrl+alt+t'). Exige al menos un
 * modificador que no sea Mayús y una tecla. Devuelve '' si no es válida.
 */
export function cleanHotkey(combo) {
  if (typeof combo !== 'string') return '';
  const parts = combo.toLowerCase().split('+').map((p) => p.trim()).filter(Boolean);
  const mods = MODS.filter((m) => parts.includes(m));
  const keys = parts.filter((p) => !MODS.includes(p));
  if (keys.length !== 1 || !/^([a-z0-9]|f([1-9]|1[0-9]|2[0-4])|space)$/.test(keys[0])) return '';
  if (!mods.some((m) => m !== 'shift')) return '';
  return [...mods, keys[0]].join('+');
}

export function cleanSettings(obj) {
  const s = { ...DEFAULT_SETTINGS };
  if (!obj || typeof obj !== 'object') return s;
  if (THEMES.includes(obj.theme)) s.theme = obj.theme;
  if (LANG_PREFS.includes(obj.lang)) s.lang = obj.lang;
  if (LANGS.includes(obj.sysLang)) s.sysLang = obj.sysLang;
  if (typeof obj.notifySound === 'boolean') s.notifySound = obj.notifySound;
  if ('hotkey' in obj) s.hotkey = cleanHotkey(obj.hotkey);
  return s;
}

/** Primer idioma soportado de una lista tipo navigator.languages ('en-US'…). */
export function resolveLang(languages) {
  for (const l of languages || []) {
    const base = String(l).toLowerCase().split('-')[0];
    if (LANGS.includes(base)) return base;
  }
  return 'es';
}

/**
 * Idioma efectivo. La página pasa navigator.languages; el backend (sin Intl ni
 * locale en Windows) usa el sysLang que le dejó la página.
 */
export function effectiveLang(settings, languages) {
  if (settings.lang !== 'system') return settings.lang;
  return languages ? resolveLang(languages) : settings.sysLang;
}

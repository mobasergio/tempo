// i18n de página: resuelve el idioma, traduce el HTML marcado con data-i18n*
// y recarga la página si el idioma cambia en Ajustes.

import { createT } from '../../shared/i18n.js';
import { effectiveLang } from '../../shared/settings.js';

/**
 * Atributos:
 *   data-i18n="clave"              → textContent
 *   data-i18n-title / -aria / -placeholder → title / aria-label / placeholder
 */
function translateDom(root, t) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
}

/**
 * Prepara el idioma de esta página a partir de los ajustes del backend:
 * traduce el DOM, ajusta <html lang>, informa al backend del idioma del
 * sistema y recarga si después cambia. Devuelve t.
 */
export function setupI18n(settings) {
  const lang = effectiveLang(settings, navigator.languages);
  const t = createT(lang);
  document.documentElement.lang = t.lang;
  translateDom(document, t);

  // El backend no puede saber el idioma del sistema en Windows: se lo dice la página.
  const sys = effectiveLang({ ...settings, lang: 'system' }, navigator.languages);
  if (sys !== settings.sysLang) tiny.api.call('setSettings', { sysLang: sys }).catch(() => {});

  tiny.api.on('settings', (s) => {
    if (s && effectiveLang(s, navigator.languages) !== t.lang) location.reload();
  });
  return t;
}

// Traducciones para backend y páginas. createT(lang) → t(key, vars).
// Si una clave falta en el idioma pedido se usa la española; si falta en
// las dos se devuelve la propia clave (visible, para detectarla).

import es from './i18n/es.js';
import en from './i18n/en.js';

export const DICTS = { es, en };

export function createT(lang) {
  const dict = DICTS[lang] || es;
  const t = (key, vars) => {
    const s = key in dict ? dict[key] : key in es ? es[key] : key;
    if (!vars || typeof s !== 'string') return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  };
  t.lang = DICTS[lang] ? lang : 'es';
  return t;
}

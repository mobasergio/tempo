// Utilidades de página compartidas por todas las features.

export const $ = (id) => document.getElementById(id);

/** ¿El elemento recibe texto (y por tanto no deben actuar los atajos)? */
export function isEditable(el) {
  return !!el && (el.tagName === 'INPUT' && el.type !== 'checkbox'
    || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

let idSeq = 0;
export const newId = () => Date.now().toString(36) + (idSeq++).toString(36);

// Panel «Atajos de teclado» (tecla ? o el botón del pie del horario): aquí
// caben todos sin apretujarse. El horario va primero, que es lo que se consulta.

import { $ } from '../lib/util.js';
import { createDialog } from '../lib/dialog.js';

// Secciones: [título, atajos]. Cada atajo: [clave de descripción, combinaciones].
// Una combinación es una lista de teclas; varias se muestran como alternativas.
// Las teclas con nombre ('key.*') se traducen; el resto se muestra tal cual.
const SECTIONS = [
  ['sched.title', [
    ['shortcuts.sched.create', [['shortcuts.drag']]],
    ['shortcuts.sched.createKey', [['key.enter']]],
    ['shortcuts.sched.nav', [['←', '→', '↑', '↓']]],
    ['shortcuts.sched.edit', [['key.enter'], ['shortcuts.type']]],
    ['shortcuts.sched.open', [['shortcuts.rightClick'], ['shortcuts.dblClick']]],
    ['shortcuts.sched.move', [['Alt', '↑'], ['Alt', '↓']]],
    ['shortcuts.sched.resize', [['Alt', 'key.shift', '↑'], ['Alt', 'key.shift', '↓']]],
    ['shortcuts.sched.delete', [['key.del']]],
    ['shortcuts.undo', [['Ctrl', 'Z']]],
    ['shortcuts.redo', [['Ctrl', 'Y'], ['Ctrl', 'key.shift', 'Z']]],
    ['shortcuts.sched.copy', [['Ctrl', 'C'], ['Ctrl', 'V']]],
    ['shortcuts.sched.deselect', [['key.esc']]],
  ]],
  ['shortcuts.general', [
    ['shortcuts.show', [['?']]],
    ['shortcuts.close', [['key.esc']]],
  ]],
];
// Combinaciones de varias teclas que se pulsan a la vez (Alt+↑) frente a
// grupos de teclas sueltas (← →): las flechas solas se separan con espacio.
const ARROWS = new Set(['←', '→', '↑', '↓']);

export function initShortcuts(ctx) {
  const { t } = ctx;
  const label = (k) => (k.startsWith('key.') || k.startsWith('shortcuts.') ? t(k) : k);

  function comboEl(combo) {
    const wrap = document.createElement('span');
    wrap.className = 'sc-combo';
    const together = !combo.every((k) => ARROWS.has(k));
    combo.forEach((k, i) => {
      if (i && together) wrap.append('+');
      // gestos de ratón («Arrastrar», «Escribir») van como texto, no como tecla
      if (k.startsWith('shortcuts.')) {
        const s = document.createElement('span');
        s.className = 'sc-gesture';
        s.textContent = label(k);
        wrap.append(s);
      } else {
        const kbd = document.createElement('kbd');
        kbd.textContent = label(k);
        wrap.append(kbd);
      }
    });
    return wrap;
  }

  function render() {
    const body = $('shortcutsBody');
    body.replaceChildren();
    for (const [title, rows] of SECTIONS) {
      const sec = document.createElement('section');
      sec.className = 'settings-sec';
      const h = document.createElement('h3');
      h.className = 'eyebrow';
      h.textContent = t(title);
      const dl = document.createElement('dl');
      dl.className = 'sc-list';
      for (const [desc, combos] of rows) {
        const row = document.createElement('div');
        row.className = 'sc-row';
        const dt = document.createElement('dt');
        dt.textContent = t(desc);
        const dd = document.createElement('dd');
        combos.forEach((c, i) => {
          if (i) {
            const or = document.createElement('span');
            or.className = 'sc-or';
            or.textContent = '/';
            dd.append(or);
          }
          dd.append(comboEl(c));
        });
        row.append(dt, dd);
        dl.append(row);
      }
      sec.append(h, dl);
      body.append(sec);
    }
  }

  const dlg = createDialog(ctx, $('shortcuts'), { onOpen: render });
  $('shortcutsBtn').addEventListener('click', dlg.open);
  $('shortcutsClose').addEventListener('click', dlg.close);
  return dlg;
}

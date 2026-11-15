// Aviso emergente: qué bloque empieza o cuál ha terminado, y qué viene después.
// Lo abre el backend (backend/alert.js); se queda hasta que se cierra.

import { $ } from './lib/util.js';
import { bootPage } from './lib/page.js';
import { rangeText, whenText } from '../shared/time.js';
import { colorHex } from '../shared/colors.js';

const t = await bootPage();

function render(p) {
  if (!p || !p.block) return;
  const { kind, block: b, next: nx } = p;
  const box = $('alertBox');
  const start = kind === 'start';
  box.classList.toggle('ended', !start);
  box.style.setProperty('--c', colorHex(b.color));
  $('aKind').textContent = start ? t('alert.now') : t('alert.ended');
  $('aTitle').textContent = b.title || t('app.untitled');
  $('aTime').textContent = rangeText(b.start, b.end);
  const notes = start ? (b.notes || '').trim() : '';
  $('aNotes').textContent = notes;
  $('aNotes').hidden = !notes;
  const showNext = nx && nx.id !== b.id;
  $('aNext').textContent = showNext ? t('widget.next', { title: nx.title || t('app.untitled'), when: whenText(t, nx) }) : '';
  $('aNext').hidden = !showNext;
  // reinicia el rebote si llega otro aviso con la ventana abierta
  box.classList.remove('pop');
  void box.offsetWidth;
  box.classList.add('pop');
}

const dismiss = () => tiny.api.call('dismissAlert').catch(() => tiny.win.close());

$('aOk').addEventListener('click', dismiss);
$('aOpen').addEventListener('click', async () => {
  await tiny.api.call('showSchedule').catch(() => {});
  dismiss();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); dismiss(); }
});

tiny.api.on('alert', render);
render(await tiny.api.call('getAlert').catch(() => null));

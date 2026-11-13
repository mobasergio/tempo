// Horario en el backend: guarda los bloques, avisa al empezar cada uno y
// sabe cuál está en curso, para poder hacerlo con la ventana oculta.

import { hhmm, weekNow } from '../shared/time.js';
import { cleanBlocks, currentBlock, nextBlock, blocksStartingIn } from '../shared/schedule-core.js';

// Un aviso se da aunque el tick llegue hasta 2 min tarde (PC cargado, el
// intervalo se retrasa); más allá (p. ej. al despertar de la suspensión) ya
// no tiene sentido avisar de que "empieza" algo.
const NOTIFY_GRACE_MIN = 2;

export function createSchedule({ app, onNowChange, onWidgetChange, onStart }) {
  let blocks = [];
  let nowBlock = null;
  const notified = new Set();   // `${id}@${fecha}` ya avisados hoy
  let notifiedDate = '';
  let lastMin = null;           // minuto del último repaso de avisos (hoy)
  let nextSig = '';

  const sig = (x) => (x ? `${x.id}|${x.title}|${x.end}|${x.color}` : '');

  function check() {
    const n = weekNow();
    if (n.date !== notifiedDate) {
      notified.clear();
      notifiedDate = n.date;
      lastMin = null;
    }

    // Inicios en (from, ahora]: desde el último repaso, sin pasar del margen.
    const from = lastMin === null ? n.min - 1 : Math.max(lastMin, n.min - 1 - NOTIFY_GRACE_MIN);
    lastMin = n.min;
    const started = [];
    for (const b of blocksStartingIn(blocks, n.day, from, n.min)) {
      const key = `${b.id}@${n.date}`;
      if (notified.has(key)) continue;
      notified.add(key);
      app.notify(`Empieza: ${b.title || 'Sin título'}`, `${hhmm(b.start)} – ${hhmm(b.end)}`, { sound: true });
      started.push(b);
    }

    const cur = currentBlock(blocks, n);
    const nx = nextBlock(blocks, n);
    const nsig = nx ? `${sig(nx)}|${nx.start}|${nx.inDays}` : '';
    const changed = sig(cur) !== sig(nowBlock);
    if (changed) {
      nowBlock = cur;
      app.push('now-block', nowBlock);
      onNowChange();
    }
    if (changed || nsig !== nextSig) {
      nextSig = nsig;
      onWidgetChange();
    }
    // el destello va después del estado nuevo, para que se vea con su color
    for (const b of started) onStart(b);
  }

  return {
    check,
    get blocks() { return blocks; },
    get now() { return nowBlock; },
    next: () => nextBlock(blocks, weekNow()),

    async load() {
      blocks = cleanBlocks(await app.store.get('blocks'));
      nowBlock = currentBlock(blocks, weekNow());
    },

    async save(list) {
      blocks = cleanBlocks(list);
      await app.store.set('blocks', blocks);
      app.push('blocks', blocks);
      check();
      return blocks;
    },

    /** Tras suspender: el día o la hora han podido cambiar mucho. */
    resync() {
      lastMin = null;
      check();
    },
  };
}

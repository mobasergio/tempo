// Pestaña Temporizador. La cuenta atrás vive en el backend; aquí se elige la
// duración y se pinta el estado que llega por el evento 'timer'.

import { $ } from '../lib/util.js';
import { fmtClock } from '../../shared/time.js';

const STATUS_TEXT = { idle: 'Listo', running: 'En marcha', paused: 'En pausa', done: '¡Tiempo terminado!' };
const MAIN_LABEL = { idle: 'Iniciar', running: 'Pausar', paused: 'Reanudar', done: 'Iniciar' };
const RING_LEN = 2 * Math.PI * 110;   // circunferencia del anillo (r = 110)
const MAX_EDIT_SECONDS = 9999 * 60 + 59;

export function initTimer(ctx) {
  let timerState = { status: 'idle', duration: 0, remaining: 0, lastDuration: 25 * 60 };

  function customSeconds() {
    const m = Math.max(0, Math.floor(Number($('customMin').value) || 0));
    const s = Math.min(59, Math.max(0, Math.floor(Number($('customSec').value) || 0)));
    return m * 60 + s;
  }

  function setCustomInputs(seconds) {
    $('customMin').value = Math.floor(seconds / 60);
    $('customSec').value = String(seconds % 60).padStart(2, '0');
    markPreset();
    sizeInputs();
  }

  // Ajusta el ancho de cada campo a sus dígitos para que se lea como el texto grande.
  function sizeInputs() {
    for (const id of ['customMin', 'customSec']) {
      $(id).style.width = Math.max(2, $(id).value.length) + 'ch';
    }
    $('timeEdit').classList.toggle('long', $('customMin').value.length > 2);
  }

  const canEditDuration = () => timerState.status === 'idle' || timerState.status === 'done';

  // Resalta el preset que coincide con la duración elegida.
  function markPreset() {
    const secs = customSeconds();
    for (const b of $('presets').children) b.setAttribute('aria-pressed', Number(b.dataset.min) * 60 === secs);
  }

  function render(st) {
    timerState = st;
    const { status } = st;
    const shown = status === 'idle' ? customSeconds() * 1000 : st.remaining;
    const text = fmtClock(shown);
    $('timerDisplay').textContent = text;
    $('timerDisplay').classList.toggle('long', text.length > 5);
    $('timerStatus').textContent = STATUS_TEXT[status];

    // La duración solo se edita con el temporizador parado; en marcha o en
    // pausa el círculo muestra la cuenta atrás y los presets quedan bloqueados.
    const editable = canEditDuration();
    $('timeEdit').hidden = !editable;
    $('timerDisplay').hidden = editable;
    for (const b of $('presets').children) b.disabled = !editable;

    const p = status === 'running' || status === 'paused'
      ? 1 - st.remaining / st.duration
      : status === 'done' ? 1 : 0;
    $('ringFill').style.strokeDashoffset = (RING_LEN * (1 - p)).toFixed(2);
    $('ring').className = 'ring ' + status;

    $('timerMain').textContent = MAIN_LABEL[status];
    $('timerMain').classList.toggle('stop', status === 'running');
    $('timerReset').disabled = status === 'idle';
  }

  async function call(method, params) {
    try {
      const st = await tiny.api.call(method, params);
      if (st) render(st);
    } catch (e) {
      $('timerStatus').textContent = String(e.message || e);
    }
  }

  function start(seconds = customSeconds()) {
    if (seconds < 1) {
      $('timerStatus').textContent = 'Introduce una duración mayor que 0.';
      return;
    }
    setCustomInputs(seconds);
    call('start', { seconds });
  }

  function toggle() {
    const s = timerState.status;
    if (s === 'running') call('pause');
    else if (s === 'paused') call('resume');
    else start();
  }

  tiny.api.on('timer', render);

  // Los presets solo eligen la duración; el temporizador arranca con Iniciar.
  for (const b of $('presets').children) {
    b.addEventListener('click', () => {
      if (!canEditDuration()) return;
      setCustomInputs(Number(b.dataset.min) * 60);
      if (timerState.status === 'idle') render(timerState);
    });
  }
  // Rueda sobre el círculo: ±1 min (±1 s si el ratón está sobre los segundos).
  $('ring').addEventListener('wheel', (e) => {
    if (!canEditDuration()) return;
    e.preventDefault();
    const step = (e.target.id === 'customSec' ? 1 : 60) * (e.deltaY < 0 ? 1 : -1);
    setCustomInputs(Math.min(MAX_EDIT_SECONDS, Math.max(0, customSeconds() + step)));
    if (timerState.status === 'idle') render(timerState);
  }, { passive: false });
  $('timerMain').addEventListener('click', toggle);
  $('timerReset').addEventListener('click', () => call('reset'));
  for (const id of ['customMin', 'customSec']) {
    $(id).addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');   // solo dígitos
      markPreset();
      sizeInputs();
      if (timerState.status === 'idle') render(timerState);
    });
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
    $(id).addEventListener('focus', (e) => e.target.select());
    $(id).addEventListener('blur', () => setCustomInputs(customSeconds()));
  }

  ctx.registerTab('timer', {
    onKey(e) {
      if (e.code === 'Space') toggle();
    },
  });

  return {
    /** Usado por el horario: arranca el temporizador y salta a su pestaña. */
    startFor(seconds) {
      start(Math.max(1, Math.round(seconds)));
      ctx.showTab('timer', { persist: true });
    },

    async boot() {
      const st = await tiny.api.call('getState');
      setCustomInputs(st.lastDuration);
      render(st);
    },
  };
}

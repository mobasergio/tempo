// Pestaña Metrónomo: escala analógica, compás, acentos y volumen. El audio lo
// genera Metronome (Web Audio) en esta misma página.

import { $, save } from '../lib/util.js';
import { Metronome } from './metronome.js';

const BPM_MIN = 30;
const BPM_MAX = 240;
const METERS = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'];
const beatsOf = (meter) => Number(meter.split('/')[0]);   // en x/8 se marca la corchea

// ── Escala analógica ──
// Como en un metrónomo de péndulo: lento arriba, rápido abajo, y escala
// logarítmica, de modo que los pasos de Maelzel (≈ 5 %) quedan equidistantes.
const SCALE = [30, 35, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76,
  80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 138, 144, 152, 160,
  168, 176, 184, 192, 200, 208, 216, 224, 232, 240];
const TEMPOS = [
  ['Grave', 30], ['Largo', 40], ['Lento', 45], ['Larghetto', 60], ['Adagio', 66],
  ['Andante', 76], ['Moderato', 108], ['Allegro', 120], ['Vivace', 156],
  ['Presto', 168], ['Prestissimo', 200],
];
const KEY_BPMS = [40, 60, 80, 120, 160, 200, 240];   // números destacados en la escala
const LOG_RANGE = Math.log(BPM_MAX / BPM_MIN);
const bpmToPos = (bpm) => Math.log(bpm / BPM_MIN) / LOG_RANGE;          // 0 arriba … 1 abajo
const posToBpm = (p) => BPM_MIN * Math.exp(Math.min(1, Math.max(0, p)) * LOG_RANGE);
const pct = (bpm) => (bpmToPos(bpm) * 100).toFixed(3) + '%';
const tempoIndex = (bpm) => TEMPOS.findLastIndex(([, from]) => bpm >= from);

export function initMetro(ctx) {
  const { t } = ctx;
  const metro = new Metronome({ onBeat: lightDot });
  const settings = { bpm: 100, meter: '4/4', accents: [0], volume: 0.8 };
  let lastVolume = settings.volume;   // para restaurar al quitar el silencio

  // Un punto por pulso; cada punto es un botón que acentúa o no ese pulso.
  function buildDots() {
    const n = beatsOf(settings.meter);
    const box = $('dots');
    box.replaceChildren();
    box.classList.toggle('many', n > 8);
    for (let i = 0; i < n; i++) {
      const d = document.createElement('button');
      const accented = settings.accents.includes(i);
      d.className = 'dot' + (accented ? ' accent' : '');
      d.setAttribute('aria-pressed', accented);
      d.setAttribute('aria-label', t('metro.accent', { n: i + 1 }));
      d.addEventListener('click', () => toggleAccent(i));
      box.appendChild(d);
    }
  }

  function lightDot(beat) {
    const dots = $('dots').children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === beat);
  }

  function buildScale() {
    const rail = $('rail');
    const add = (cls, top, text) => {
      const el = document.createElement('div');
      el.className = cls;
      el.style.top = top;
      if (text) el.textContent = text;
      rail.insertBefore(el, $('weight'));
      return el;
    };
    SCALE.forEach((bpm, i) => {
      const labelled = i % 2 === 0;   // 30, 40, 44, 48 … 240: uno sí, otro no
      add('tick' + (labelled ? ' major' : ''), pct(bpm));
      if (labelled) add('tick-num' + (KEY_BPMS.includes(bpm) ? ' key' : ''), pct(bpm), String(bpm));
    });
    TEMPOS.forEach(([name, from]) => { add('mark', pct(from), name).dataset.tempo = name; });
  }

  function setBpm(v, { persist = true } = {}) {
    const bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(Number(v) || settings.bpm)));
    settings.bpm = bpm;
    metro.setBpm(bpm);
    $('bpmDisplay').textContent = bpm;
    $('weight').style.top = pct(bpm);
    $('scale').setAttribute('aria-valuenow', bpm);
    const name = TEMPOS[tempoIndex(bpm)][0];
    $('tempoName').textContent = name;
    $('scale').setAttribute('aria-valuetext', `${bpm} BPM, ${name}`);
    for (const m of document.querySelectorAll('.mark')) m.classList.toggle('current', m.dataset.tempo === name);
    if (persist) save('bpm', bpm);
  }

  // Cambiar de compás vuelve a acentuar solo el 1.º salvo que se indique otra cosa.
  function setMeter(m, accents = [0]) {
    if (!METERS.includes(m)) m = '4/4';
    settings.meter = m;
    const [num, den] = m.split('/');
    const i = METERS.indexOf(m);
    $('meterNum').textContent = num;
    $('meterDen').textContent = den;
    $('meter').setAttribute('aria-valuenow', i);
    $('meter').setAttribute('aria-valuetext', m);
    $('meterPrev').disabled = i === 0;
    $('meterNext').disabled = i === METERS.length - 1;
    $('bpmNote').textContent = den === '8' ? t('metro.eighth') : '';
    metro.setBeatsPerBar(beatsOf(m));
    save('meter', m, 0);
    setAccents(accents.filter((b) => b < beatsOf(m)));
  }

  function stepMeter(delta) {
    const i = METERS.indexOf(settings.meter) + delta;
    if (i >= 0 && i < METERS.length) setMeter(METERS[i]);
  }

  function setAccents(list) {
    settings.accents = [...new Set(list)].sort((a, b) => a - b);
    metro.setAccents(settings.accents);
    buildDots();
    save('accents', settings.accents, 0);
  }

  function toggleAccent(beat) {
    const on = settings.accents.includes(beat);
    setAccents(on ? settings.accents.filter((b) => b !== beat) : [...settings.accents, beat]);
  }

  function setVolume(v) {
    settings.volume = Math.min(1, Math.max(0, Math.round(Number(v) * 100) / 100));
    if (settings.volume > 0) lastVolume = settings.volume;
    const pctVol = Math.round(settings.volume * 100);
    $('volRange').value = pctVol;
    $('volRange').style.setProperty('--fill', pctVol + '%');
    $('volRange').setAttribute('aria-valuetext', pctVol + ' %');
    $('volume').title = t('metro.volumeTitle', { n: pctVol });
    // el icono muestra 0, 1 o 2 ondas según el nivel
    $('volume').dataset.level = pctVol === 0 ? 0 : pctVol < 50 ? 1 : 2;
    $('volMute').setAttribute('aria-label', t(pctVol === 0 ? 'metro.unmute' : 'metro.mute'));
    metro.setVolume(settings.volume);
    save('volume', settings.volume);
  }

  function toggle() {
    const running = metro.toggle();
    $('metroToggle').textContent = t(running ? 'metro.stop' : 'metro.start');
    $('metroToggle').classList.toggle('stop', running);
    if (running) $('metroNotice').hidden = true;
    tiny.api.call('metroState', { running });
  }

  // Con la ventana oculta WebView2 congela la página (y el planificador del
  // metrónomo): se para y se avisa. El backend envía 'metro-stop' antes de
  // ocultar; visibilitychange cubre el resto de casos.
  function stopForHide() {
    if (!metro.running) return;
    toggle();
    $('metroNotice').hidden = false;
  }
  tiny.api.on('metro-stop', stopForHide);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopForHide();
  });

  // Elementos del menú de la bandeja que atiende la página (el resto, el backend).
  tiny.tray.on((id) => {
    if (id === 'metro') toggle();
  });

  // Plugin desactivado: no puede seguir sonando sin pestaña.
  ctx.state.subscribe((s) => {
    if (!s.plugins.metro && metro.running) toggle();
  });

  // Arrastrar la pesa (o pulsar en cualquier punto de la escala).
  function bpmFromPointer(e) {
    const r = $('rail').getBoundingClientRect();
    return posToBpm((e.clientY - r.top) / r.height);
  }
  $('scale').addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const scale = $('scale');
    scale.setPointerCapture(e.pointerId);
    scale.classList.add('dragging');
    scale.focus();
    setBpm(bpmFromPointer(e));
  });
  $('scale').addEventListener('pointermove', (e) => {
    if ($('scale').hasPointerCapture(e.pointerId)) setBpm(bpmFromPointer(e));
  });
  for (const ev of ['pointerup', 'pointercancel']) {
    $('scale').addEventListener(ev, () => $('scale').classList.remove('dragging'));
  }
  // Rueda: hacia abajo baja la pesa (más rápido), como en la escala.
  $('scale').addEventListener('wheel', (e) => {
    e.preventDefault();
    setBpm(settings.bpm + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  // Compás: flechas, rueda (arriba = siguiente) y ←/→ con el control enfocado.
  $('meterPrev').addEventListener('click', () => stepMeter(-1));
  $('meterNext').addEventListener('click', () => stepMeter(1));
  $('meter').addEventListener('wheel', (e) => {
    e.preventDefault();
    stepMeter(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  $('meter').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      stepMeter(e.key === 'ArrowRight' ? 1 : -1);
    }
  });

  $('volRange').addEventListener('input', (e) => setVolume(e.target.value / 100));
  $('volMute').addEventListener('click', () => setVolume(settings.volume > 0 ? 0 : lastVolume));
  $('volume').addEventListener('wheel', (e) => {
    e.preventDefault();
    setVolume(settings.volume + (e.deltaY < 0 ? 0.05 : -0.05));
  }, { passive: false });
  $('metroToggle').addEventListener('click', toggle);

  // Crea/reanuda el AudioContext en el primer gesto del usuario.
  for (const ev of ['pointerdown', 'keydown']) {
    document.addEventListener(ev, () => metro.ensureContext(), { capture: true });
  }

  ctx.registerTab('metro', {
    onKey(e) {
      if (e.code === 'Space') toggle();
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();          // evita que un deslizador enfocado se mueva además
        setBpm(settings.bpm + (e.key === 'ArrowUp' ? 1 : -1));
      }
    },
  });

  buildScale();
  buildDots();
  setBpm(settings.bpm, { persist: false });

  return {
    async boot() {
      const [bpm, meter, accents, volume] = await Promise.all(
        ['bpm', 'meter', 'accents', 'volume'].map((k) => tiny.store.get(k)));
      setBpm(bpm ?? settings.bpm, { persist: false });
      setMeter(meter ?? settings.meter, Array.isArray(accents) ? accents : settings.accents);
      setVolume(volume ?? settings.volume);
    },
  };
}

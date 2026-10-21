const $ = (id) => document.getElementById(id);

const BPM_MIN = 30;
const BPM_MAX = 240;
const METERS = { '2/4': 2, '3/4': 3, '4/4': 4, '6/8': 6 };

let activeTab = 'timer';

// ───────────────────────── Pestañas ─────────────────────────

function showTab(name) {
  activeTab = name;
  for (const btn of document.querySelectorAll('.tab')) {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on);
  }
  $('panel-timer').hidden = name !== 'timer';
  $('panel-metro').hidden = name !== 'metro';
}

for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => {
    showTab(btn.dataset.tab);
    tiny.store.set('activeTab', btn.dataset.tab);
  });
}

// ─────────────────────── Temporizador ───────────────────────

let timerState = { status: 'idle', duration: 0, remaining: 0, lastDuration: 25 * 60 };

function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${String(m).padStart(2, '0')}:${s}`;
}

function customSeconds() {
  const m = Math.max(0, Math.floor(Number($('customMin').value) || 0));
  const s = Math.min(59, Math.max(0, Math.floor(Number($('customSec').value) || 0)));
  return m * 60 + s;
}

function setCustomInputs(seconds) {
  $('customMin').value = Math.floor(seconds / 60);
  $('customSec').value = seconds % 60;
}

const STATUS_TEXT = { idle: 'Listo', running: 'En marcha', paused: 'En pausa', done: '¡Tiempo terminado!' };

function renderTimer(st) {
  timerState = st;
  const { status } = st;
  const shown = status === 'idle' ? customSeconds() * 1000 : st.remaining;
  $('timerDisplay').textContent = fmt(shown);
  $('timerStatus').textContent = STATUS_TEXT[status];
  const p = status === 'running' || status === 'paused'
    ? 1 - st.remaining / st.duration
    : status === 'done' ? 1 : 0;
  $('timerBar').style.width = (p * 100).toFixed(2) + '%';

  $('timerPause').disabled = !(status === 'running' || status === 'paused');
  $('timerPause').textContent = status === 'paused' ? 'Reanudar' : 'Pausar';
  $('timerStart').disabled = status === 'running' || status === 'paused';

  $('doneBanner').hidden = status !== 'done';
  document.body.classList.toggle('timer-done', status === 'done');
}

async function call(method, params) {
  try {
    const st = await tiny.api.call(method, params);
    if (st) renderTimer(st);
  } catch (e) {
    $('timerStatus').textContent = String(e.message || e);
  }
}

function startTimer(seconds = customSeconds()) {
  if (seconds < 1) {
    $('timerStatus').textContent = 'Introduce una duración mayor que 0.';
    return;
  }
  setCustomInputs(seconds);
  call('start', { seconds });
}

function toggleTimer() {
  const s = timerState.status;
  if (s === 'running') call('pause');
  else if (s === 'paused') call('resume');
  else startTimer();
}

tiny.api.on('timer', renderTimer);

for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => startTimer(Number(chip.dataset.min) * 60));
}
$('timerStart').addEventListener('click', () => startTimer());
$('timerPause').addEventListener('click', toggleTimer);
$('timerReset').addEventListener('click', () => call('reset'));
for (const id of ['customMin', 'customSec']) {
  $(id).addEventListener('input', () => { if (timerState.status === 'idle') renderTimer(timerState); });
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') startTimer(); });
}

// ──────────────────────── Metrónomo ─────────────────────────

const metro = new Metronome({ onBeat: lightDot });
const tapper = new TapTempo();
const settings = { bpm: 100, meter: '4/4', accent: true, volume: 0.8 };

function buildDots() {
  const n = METERS[settings.meter];
  const box = $('dots');
  box.replaceChildren();
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i === 0 && settings.accent ? ' first' : '');
    box.appendChild(d);
  }
}

function lightDot(beat) {
  const dots = $('dots').children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === beat);
}

const saveTimers = {};
function save(key, value, delay = 300) {
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => tiny.store.set(key, value), delay);
}

function setBpm(v) {
  const bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(Number(v) || settings.bpm)));
  settings.bpm = bpm;
  metro.setBpm(bpm);
  $('bpmDisplay').textContent = bpm;
  $('bpmRange').value = bpm;
  if (document.activeElement !== $('bpmInput')) $('bpmInput').value = bpm;
  save('bpm', bpm);
}

function setMeter(m) {
  if (!METERS[m]) m = '4/4';
  settings.meter = m;
  $('meterSel').value = m;
  $('bpmNote').textContent = m === '6/8' ? ' (corcheas)' : '';
  metro.setBeatsPerBar(METERS[m]);
  buildDots();
  save('meter', m, 0);
}

function setAccent(on) {
  settings.accent = !!on;
  $('accentChk').checked = settings.accent;
  metro.setAccent(settings.accent);
  buildDots();
  save('accent', settings.accent, 0);
}

function setVolume(v) {
  settings.volume = Math.min(1, Math.max(0, Number(v)));
  $('volRange').value = Math.round(settings.volume * 100);
  metro.setVolume(settings.volume);
  save('volume', settings.volume);
}

function toggleMetro() {
  const running = metro.toggle();
  $('metroToggle').textContent = running ? 'Parar' : 'Iniciar';
  if (running) $('metroNotice').hidden = true;
  tiny.api.call('metroState', { running });
}

// Con la ventana oculta WebView2 congela la página (y el planificador del
// metrónomo): se para y se avisa. El backend envía 'metro-stop' antes de
// ocultar; visibilitychange cubre el resto de casos.
function stopMetroForHide() {
  if (!metro.running) return;
  toggleMetro();
  $('metroNotice').hidden = false;
}
tiny.api.on('metro-stop', stopMetroForHide);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopMetroForHide();
});

// Elementos del menú de la bandeja que atiende la página (el resto, el backend).
tiny.tray.on((id) => {
  if (id === 'metro') toggleMetro();
});

$('bpmRange').addEventListener('input', (e) => setBpm(e.target.value));
$('bpmInput').addEventListener('change', (e) => setBpm(e.target.value));
$('bpmInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') setBpm(e.target.value); });
for (const b of document.querySelectorAll('[data-step]')) {
  b.addEventListener('click', () => setBpm(settings.bpm + Number(b.dataset.step)));
}
$('tapBtn').addEventListener('click', () => {
  const bpm = tapper.tap();
  if (bpm) setBpm(bpm);
});
$('meterSel').addEventListener('change', (e) => setMeter(e.target.value));
$('accentChk').addEventListener('change', (e) => setAccent(e.target.checked));
$('volRange').addEventListener('input', (e) => setVolume(e.target.value / 100));
$('metroToggle').addEventListener('click', toggleMetro);

// Crea/reanuda el AudioContext en el primer gesto del usuario.
for (const ev of ['pointerdown', 'keydown']) {
  document.addEventListener(ev, () => metro.ensureContext(), { capture: true });
}

// ───────────────────── Atajos de teclado ─────────────────────

function isEditable(el) {
  return el && (el.tagName === 'INPUT' && el.type !== 'range' && el.type !== 'checkbox'
    || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

document.addEventListener('keydown', (e) => {
  if (isEditable(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;

  if (e.code === 'Space') {
    e.preventDefault();          // que no "pulse" también el botón enfocado
    if (e.repeat) return;
    if (activeTab === 'timer') toggleTimer();
    else toggleMetro();
  } else if (activeTab === 'metro' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();          // evita que un deslizador enfocado se mueva además
    setBpm(settings.bpm + (e.key === 'ArrowUp' ? 1 : -1));
  }
});

// Tras un clic, quita el foco del botón para que Espacio no lo reactive.
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) b.blur();
});

// ───────────────────────── Arranque ─────────────────────────

async function boot() {
  const [tab, bpm, meter, accent, volume] = await Promise.all(
    ['activeTab', 'bpm', 'meter', 'accent', 'volume'].map((k) => tiny.store.get(k)));

  showTab(tab === 'metro' ? 'metro' : 'timer');
  setBpm(bpm ?? settings.bpm);
  setMeter(meter ?? settings.meter);
  setAccent(accent ?? settings.accent);
  setVolume(volume ?? settings.volume);

  const st = await tiny.api.call('getState');
  setCustomInputs(st.lastDuration);
  renderTimer(st);
}

showTab('timer');
buildDots();
boot().catch((e) => { $('timerStatus').textContent = 'Error al iniciar: ' + e; });

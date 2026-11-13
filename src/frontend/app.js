const $ = (id) => document.getElementById(id);

const BPM_MIN = 30;
const BPM_MAX = 240;
const METERS = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'];
const beatsOf = (meter) => Number(meter.split('/')[0]);   // en x/8 se marca la corchea

let activeTab = 'sched';
let plugins = { timer: false, metro: false, todo: false };
const PLUGIN_TABS = ['timer', 'metro', 'todo'];
const tabAvailable = (name) => name === 'sched' || (PLUGIN_TABS.includes(name) && plugins[name]);

// ───────────────────────── Pestañas ─────────────────────────

function showTab(name) {
  if (!tabAvailable(name)) name = 'sched';
  activeTab = name;
  for (const btn of document.querySelectorAll('.tab')) {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on);
  }
  for (const p of ['timer', 'metro', 'todo', 'sched']) $('panel-' + p).hidden = name !== p;
  if (name === 'sched' && typeof schedShown === 'function') schedShown();
}

for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => {
    showTab(btn.dataset.tab);
    tiny.store.set('activeTab', btn.dataset.tab);
  });
}

// ───────────────────────── Plugins ─────────────────────────
// El horario es la app; temporizador, metrónomo y tareas son opcionales.

function applyPlugins(p) {
  if (!p) return;
  plugins = { timer: !!p.timer, metro: !!p.metro, todo: !!p.todo };
  for (const id of PLUGIN_TABS) {
    $('tab-' + id).hidden = !plugins[id];
    const box = document.querySelector(`.toggle[data-plugin="${id}"]`);
    if (box) box.checked = plugins[id];
  }
  if (!plugins.metro && metro.running) toggleMetro();
  if (!tabAvailable(activeTab)) {
    showTab('sched');
    tiny.store.set('activeTab', 'sched');
  }
  if (typeof schedPluginsChanged === 'function') schedPluginsChanged();
}

tiny.api.on('plugins', applyPlugins);

function setPluginsMenu(open) {
  $('pluginsMenu').hidden = !open;
  $('pluginsBtn').setAttribute('aria-expanded', open);
}
$('pluginsBtn').addEventListener('click', () => setPluginsMenu($('pluginsMenu').hidden));
document.addEventListener('pointerdown', (e) => {
  if (!$('pluginsMenu').hidden && !e.target.closest('#pluginsMenu, #pluginsBtn')) setPluginsMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('pluginsMenu').hidden) setPluginsMenu(false);
});
for (const box of document.querySelectorAll('.toggle[data-plugin]')) {
  box.addEventListener('change', async () => {
    try {
      applyPlugins(await tiny.api.call('setPlugins', { [box.dataset.plugin]: box.checked }));
    } catch (e) {
      box.checked = !box.checked;
      console.error('setPlugins', e);
    }
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

const STATUS_TEXT = { idle: 'Listo', running: 'En marcha', paused: 'En pausa', done: '¡Tiempo terminado!' };
const MAIN_LABEL = { idle: 'Iniciar', running: 'Pausar', paused: 'Reanudar', done: 'Iniciar' };
const RING_LEN = 2 * Math.PI * 110;   // circunferencia del anillo (r = 110)

function renderTimer(st) {
  timerState = st;
  const { status } = st;
  const shown = status === 'idle' ? customSeconds() * 1000 : st.remaining;
  const text = fmt(shown);
  $('timerDisplay').textContent = text;
  $('timerDisplay').classList.toggle('long', text.length > 5);
  $('timerStatus').textContent = STATUS_TEXT[status];

  // La duración solo se edita con el temporizador parado; en marcha o en pausa
  // el círculo muestra la cuenta atrás y los presets quedan bloqueados.
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

// Usado por el horario: arranca el temporizador y salta a su pestaña.
function startTimerFor(seconds) {
  startTimer(Math.max(1, Math.round(seconds)));
  showTab('timer');
  tiny.store.set('activeTab', 'timer');
}

function toggleTimer() {
  const s = timerState.status;
  if (s === 'running') call('pause');
  else if (s === 'paused') call('resume');
  else startTimer();
}

tiny.api.on('timer', renderTimer);

// El widget pide abrir el horario.
tiny.api.on('show-tab', (name) => {
  if (!tabAvailable(name)) return;
  showTab(name);
  tiny.store.set('activeTab', name);
});

// Los presets solo eligen la duración; el temporizador arranca con Iniciar.
for (const b of $('presets').children) {
  b.addEventListener('click', () => {
    if (!canEditDuration()) return;
    setCustomInputs(Number(b.dataset.min) * 60);
    if (timerState.status === 'idle') renderTimer(timerState);
  });
}
// Rueda sobre el círculo: ±1 min (±1 s si el ratón está sobre los segundos).
$('ring').addEventListener('wheel', (e) => {
  if (!canEditDuration()) return;
  e.preventDefault();
  const step = (e.target.id === 'customSec' ? 1 : 60) * (e.deltaY < 0 ? 1 : -1);
  setCustomInputs(Math.min(9999 * 60 + 59, Math.max(0, customSeconds() + step)));
}, { passive: false });
$('timerMain').addEventListener('click', toggleTimer);
$('timerReset').addEventListener('click', () => call('reset'));
for (const id of ['customMin', 'customSec']) {
  $(id).addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');   // solo dígitos
    markPreset();
    sizeInputs();
    if (timerState.status === 'idle') renderTimer(timerState);
  });
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') startTimer(); });
  $(id).addEventListener('focus', (e) => e.target.select());
  $(id).addEventListener('blur', () => setCustomInputs(customSeconds()));
}

// ──────────────────────── Metrónomo ─────────────────────────

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
    d.setAttribute('aria-label', `Acento en el pulso ${i + 1}`);
    d.addEventListener('click', () => toggleAccent(i));
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
const LOG_RANGE =Math.log(BPM_MAX / BPM_MIN);
const bpmToPos = (bpm) => Math.log(bpm / BPM_MIN) / LOG_RANGE;          // 0 arriba … 1 abajo
const posToBpm = (p) => BPM_MIN * Math.exp(Math.min(1, Math.max(0, p)) * LOG_RANGE);
const pct = (bpm) => (bpmToPos(bpm) * 100).toFixed(3) + '%';
const tempoIndex = (bpm) => TEMPOS.findLastIndex(([, from]) => bpm >= from);

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

function setBpm(v) {
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
  save('bpm', bpm);
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
  $('bpmNote').textContent = den === '8' ? 'pulso de corchea' : '';
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
  $('volume').title = `Volumen ${pctVol} %`;
  // el icono muestra 0, 1 o 2 ondas según el nivel
  $('volume').dataset.level = pctVol === 0 ? 0 : pctVol < 50 ? 1 : 2;
  $('volMute').setAttribute('aria-label', pctVol === 0 ? 'Activar sonido' : 'Silenciar');
  metro.setVolume(settings.volume);
  save('volume', settings.volume);
}

function toggleMetro() {
  const running = metro.toggle();
  $('metroToggle').textContent = running ? 'Parar' : 'Iniciar';
  $('metroToggle').classList.toggle('stop', running);
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
$('metroToggle').addEventListener('click', toggleMetro);

// Crea/reanuda el AudioContext en el primer gesto del usuario.
for (const ev of ['pointerdown', 'keydown']) {
  document.addEventListener(ev, () => metro.ensureContext(), { capture: true });
}

// ────────────────────────── Tareas ──────────────────────────

let todos = [];   // { id, text, done }
let todoSeq = 0;
const newId = () => Date.now().toString(36) + (todoSeq++).toString(36);
const saveTodos = () => save('todos', todos, 0);

function renderTodos() {
  const list = $('todoList');
  list.replaceChildren();
  for (const t of todos) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (t.done ? ' done' : '');
    li.dataset.id = t.id;

    const grip = document.createElement('span');
    grip.className = 'todo-grip';
    grip.textContent = '⋮⋮';
    grip.title = 'Arrastra para ordenar';
    grip.addEventListener('pointerdown', (e) => dragTodo(e, li));

    const check = document.createElement('button');
    check.className = 'todo-check';
    check.setAttribute('aria-pressed', t.done);
    check.setAttribute('aria-label', t.done ? 'Marcar como pendiente' : 'Marcar como hecha');
    check.addEventListener('click', () => { t.done = !t.done; saveTodos(); renderTodos(); });

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = t.text;
    text.title = 'Doble clic para editar';
    text.addEventListener('dblclick', () => editTodo(li, t));

    const del = document.createElement('button');
    del.className = 'todo-del';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Borrar tarea');
    del.addEventListener('click', () => { todos = todos.filter((x) => x !== t); saveTodos(); renderTodos(); });

    li.append(grip, check, text, del);
    list.appendChild(li);
  }
  const pending = todos.filter((t) => !t.done).length;
  $('todoEmpty').hidden = todos.length > 0;
  $('todoCount').textContent = !todos.length ? ''
    : !pending ? 'Todo hecho'
    : pending === 1 ? '1 pendiente' : `${pending} pendientes`;
  $('todoClear').disabled = pending === todos.length;
}

// Doble clic: el texto pasa a ser un campo. Intro o salir guarda (vacío borra), Esc cancela.
function editTodo(li, t) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'field todo-edit';
  input.maxLength = 200;
  input.value = t.text;
  li.querySelector('.todo-text').replaceWith(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    if (commit) {
      const text = input.value.trim();
      if (text) t.text = text;
      else todos = todos.filter((x) => x !== t);
      saveTodos();
    }
    renderTodos();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// Arrastrar por el asa. Durante el arrastre solo se usan transforms: la tarea
// sigue al ratón y las demás se deslizan para hacerle hueco (transición CSS).
// El DOM y el orden de `todos` se actualizan al soltar, tras asentarse.
function dragTodo(e, li) {
  if (e.button !== 0 || li.classList.contains('dragging')) return;
  e.preventDefault();
  const list = $('todoList');
  const items = [...list.children];
  const from = items.indexOf(li);
  const listTop = list.getBoundingClientRect().top - list.scrollTop;
  const top = items.map((n) => n.getBoundingClientRect().top - listTop);   // relativo al contenido
  const h = items.map((n) => n.offsetHeight);
  const mid = top.map((t, i) => t + h[i] / 2);
  const startY = e.clientY;
  const startScroll = list.scrollTop;
  let to = from;
  let dy = 0;

  li.classList.add('dragging');
  list.classList.add('sorting');

  const move = (ev) => {
    const box = list.getBoundingClientRect();   // cerca de los bordes, desplaza la lista
    if (ev.clientY < box.top + 24) list.scrollTop -= 8;
    else if (ev.clientY > box.bottom - 24) list.scrollTop += 8;

    dy = ev.clientY - startY + list.scrollTop - startScroll;
    li.style.transform = `translateY(${dy}px)`;
    // nuevo índice = cuántas de las otras tareas quedan por encima del centro de la arrastrada
    const center = mid[from] + dy;
    to = mid.filter((m, i) => i !== from && m < center).length;
    items.forEach((n, i) => {
      if (n === li) return;
      const shift = from < i && i <= to ? -h[from] : to <= i && i < from ? h[from] : 0;
      n.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };

  const end = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', end);
    document.removeEventListener('pointercancel', end);

    // asentar la tarea en su hueco (bordes superiores al subir, inferiores al bajar)
    const target = to < from ? top[to] - top[from]
      : to > from ? top[to] + h[to] - top[from] - h[from] : 0;
    li.classList.add('settling');
    li.style.transform = `translateY(${target}px)`;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      li.removeEventListener('transitionend', onEnd);
      list.classList.remove('sorting');   // sin transición: el cambio de DOM no se anima
      for (const n of items) n.style.transform = '';
      li.classList.remove('dragging', 'settling');
      if (to !== from) {
        items.splice(from, 1);
        items.splice(to, 0, li);
        list.append(...items);
        const [t] = todos.splice(from, 1);
        todos.splice(to, 0, t);
        saveTodos();
      }
    };
    // transitionend sube desde los hijos (opacidad del asa, botones…): solo vale el transform propio
    const onEnd = (ev) => { if (ev.target === li && ev.propertyName === 'transform') finish(); };
    li.addEventListener('transitionend', onEnd);
    setTimeout(finish, 250);   // por si no hay transición (ya estaba en su sitio)
  };

  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}

$('todoForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('todoInput').value.trim();
  if (text) {
    todos.push({ id: newId(), text, done: false });
    saveTodos();
    renderTodos();
    $('todoList').scrollTop = $('todoList').scrollHeight;
  }
  $('todoInput').value = '';
  $('todoInput').focus();
});
$('todoClear').addEventListener('click', () => {
  todos = todos.filter((t) => !t.done);
  saveTodos();
  renderTodos();
});

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
    else if (activeTab === 'metro') toggleMetro();
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

// ─────────────────────── Actualizaciones ───────────────────────
// tinyjs comprueba el manifest al arrancar ("auto": "launch") y avisa aquí.

tiny.api.on('update-available', ({ latest } = {}) => {
  $('updateVer').textContent = latest ? latest : '';
  $('updateBar').hidden = false;
});

$('updateInstall').addEventListener('click', async () => {
  const btn = $('updateInstall');
  btn.disabled = true;
  btn.textContent = 'Actualizando…';
  $('updateErr').hidden = true;
  try {
    await tiny.app.update.install();   // verifica sha256, sustituye y reinicia
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Reintentar';
    $('updateErr').textContent = '· No se pudo actualizar: ' + (e?.message || e);
    $('updateErr').hidden = false;
  }
});

// ───────────────────────── Arranque ─────────────────────────

async function boot() {
  const [tab, bpm, meter, accents, volume, savedTodos] = await Promise.all(
    ['activeTab', 'bpm', 'meter', 'accents', 'volume', 'todos'].map((k) => tiny.store.get(k)));

  // ventanas guardadas con el tamaño de la versión anterior
  tiny.win.setMinSize(720, 480);
  if (innerWidth < 900) tiny.win.setSize(980, 700);
  applyPlugins(await tiny.api.call('getPlugins'));
  showTab(tabAvailable(tab) ? tab : 'sched');
  if (Array.isArray(savedTodos)) {
    todos = savedTodos
      .filter((t) => t && typeof t.text === 'string' && t.text.trim())
      .map((t) => ({ id: typeof t.id === 'string' ? t.id : newId(), text: t.text, done: !!t.done }));
    renderTodos();
  }
  setBpm(bpm ?? settings.bpm);
  setMeter(meter ?? settings.meter, Array.isArray(accents) ? accents : settings.accents);
  setVolume(volume ?? settings.volume);

  const st = await tiny.api.call('getState');
  setCustomInputs(st.lastDuration);
  renderTimer(st);
}

showTab('sched');
buildScale();
buildDots();
setBpm(settings.bpm);
renderTodos();
boot().catch((e) => { $('timerStatus').textContent = 'Error al iniciar: ' + e; });

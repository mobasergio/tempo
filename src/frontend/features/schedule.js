// Horario semanal (time blocker por día de la semana, no por calendario).
// Un bloque es una sola entidad que aparece en cada uno de sus días (ver
// shared/schedule-core.js). El backend guarda los bloques, avisa al empezar
// cada uno y muestra el actual en la bandeja; aquí solo se dibujan y editan.

import { $, newId } from '../lib/util.js';
import { DAY_MIN, DAY_SHORT, DAY_LONG, hhmm, parseHHMM, durText, weekNow } from '../../shared/time.js';
import { COLORS, DEFAULT_COLOR, colorHex } from '../../shared/colors.js';
import { layoutDay, isActiveAt, timerSecondsFor } from '../../shared/schedule-core.js';

const HOUR_PX = 48;
const SNAP = 15;                 // minutos

const snap = (min) => Math.round(min / SNAP) * SNAP;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param ctx  contexto de la app (state, registerTab…)
 * @param deps.startTimer(seconds)  arranca el temporizador (plugin)
 */
export function initSchedule(ctx, { startTimer }) {
  let blocks = [];
  let selectedId = null;
  let cursor = null;             // { day, min }: posición marcada con un clic
  let editing = null;            // { id, isNew }
  let dragging = false;
  let saveTimer = null;
  let savesInFlight = 0;
  let scrolledOnce = false;
  const cols = [];

  const isShown = () => ctx.state.get().activeTab === 'sched';
  const blockById = (id) => blocks.find((b) => b.id === id);

  // ───────────────────────── Estructura ─────────────────────────

  function buildGrid() {
    const head = $('schedHead');
    head.append(document.createElement('div'));          // esquina sobre las horas
    for (let d = 0; d < 7; d++) {
      const h = document.createElement('div');
      h.className = 'sched-day';
      h.title = DAY_LONG[d];
      h.textContent = DAY_LONG[d];
      head.append(h);
    }

    const hours = $('schedHours');
    for (let h = 0; h < 24; h++) {
      const l = document.createElement('div');
      l.className = 'sched-hour';
      l.style.top = h * HOUR_PX + 'px';
      l.textContent = h ? hhmm(h * 60) : '';
      hours.append(l);
    }

    for (let d = 0; d < 7; d++) {
      const c = document.createElement('div');
      c.className = 'sched-col';
      c.dataset.day = d;
      $('schedGrid').append(c);
      cols.push(c);
    }
    $('schedGrid').style.height = 24 * HOUR_PX + 'px';
  }

  // ───────────────────────── Dibujo ─────────────────────────

  function blockEl(b, day, lane, lanes) {
    const el = document.createElement('div');
    el.className = 'sblock';
    el.dataset.id = b.id;
    el.dataset.day = day;
    el.style.setProperty('--c', colorHex(b.color));
    placeEl(el, b.start, b.end);
    el.style.left = `calc(${(lane / lanes) * 100}% + 2px)`;
    el.style.width = `calc(${100 / lanes}% - 4px)`;
    if ((b.end - b.start) < 45) el.classList.add('short');
    if (b.id === selectedId) el.classList.add('selected');

    const title = document.createElement('div');
    title.className = 'sblock-title';
    title.textContent = b.title || 'Sin título';
    const time = document.createElement('div');
    time.className = 'sblock-time';
    time.textContent = `${hhmm(b.start)} – ${hhmm(b.end)}`;
    const top = document.createElement('div');
    top.className = 'sblock-handle top';
    const bot = document.createElement('div');
    bot.className = 'sblock-handle bot';
    el.append(title, time, top, bot);
    el.title = `${b.title || 'Sin título'}\n${hhmm(b.start)} – ${hhmm(b.end)}\n${b.days.map((d) => DAY_SHORT[d]).join(' ')}`;
    return el;
  }

  function placeEl(el, start, end) {
    el.style.top = (start / 60) * HOUR_PX + 'px';
    el.style.height = Math.max(10, ((end - start) / 60) * HOUR_PX - 2) + 'px';
  }

  function render() {
    for (const c of cols) c.replaceChildren();
    for (let d = 0; d < 7; d++) {
      for (const { b, lane, lanes } of layoutDay(blocks, d)) cols[d].append(blockEl(b, d, lane, lanes));
    }
    if (cursor) {
      const c = document.createElement('div');
      c.className = 'sched-cursor';
      c.style.top = (cursor.min / 60) * HOUR_PX + 'px';
      const label = document.createElement('span');
      label.textContent = hhmm(cursor.min);
      c.append(label);
      cols[cursor.day].append(c);
    }
    renderNow();
  }

  // Línea de "ahora", día de hoy resaltado y bloque en curso.
  function renderNow() {
    const t = weekNow();
    const heads = $('schedHead').children;
    for (let d = 0; d < 7; d++) {
      heads[d + 1].classList.toggle('today', d === t.day);
      cols[d].classList.toggle('today', d === t.day);
    }
    let line = $('schedNow');
    if (!line) {
      line = document.createElement('div');
      line.id = 'schedNow';
      line.className = 'sched-now';
    }
    line.style.top = (t.min / 60) * HOUR_PX + 'px';
    if (line.parentNode !== cols[t.day]) cols[t.day].append(line);

    for (const el of document.querySelectorAll('.sblock')) {
      const b = blockById(el.dataset.id);
      el.classList.toggle('current', !!b && Number(el.dataset.day) === t.day && isActiveAt(b, t));
    }
  }

  function onShow() {
    render();
    if (!scrolledOnce) {
      scrolledOnce = true;
      // espera al cambio de tamaño de la ventana antes de desplazar
      requestAnimationFrame(() => {
        $('schedBody').scrollTop = Math.max(0, ((weekNow().min - 60) / 60) * HOUR_PX);
      });
    }
  }

  // ───────────────────────── Guardado ─────────────────────────

  function saveBlocks() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      savesInFlight++;
      try {
        await tiny.api.call('saveBlocks', { blocks });
      } catch (e) {
        console.error('saveBlocks', e);
      } finally {
        savesInFlight--;
      }
    }, 300);
  }

  // El eco del backend se ignora mientras haya cambios propios pendientes.
  tiny.api.on('blocks', (list) => {
    if (saveTimer || savesInFlight || dragging || editing) return;
    blocks = Array.isArray(list) ? list : [];
    if (isShown()) render();
  });
  tiny.api.on('now-block', () => { if (isShown()) renderNow(); });

  // ───────────────────────── Gestos ─────────────────────────

  function minuteAt(col, clientY) {
    const r = col.getBoundingClientRect();
    return clamp(((clientY - r.top) / HOUR_PX) * 60, 0, DAY_MIN);
  }

  function colAt(clientX) {
    for (const c of cols) {
      const r = c.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return c;
    }
    return clientX < cols[0].getBoundingClientRect().left ? cols[0] : cols[6];
  }

  // Cerca de los bordes, desplaza el horario.
  function autoScroll(clientY) {
    const body = $('schedBody');
    const r = body.getBoundingClientRect();
    if (clientY < r.top + 50) body.scrollTop -= 10;
    else if (clientY > r.bottom - 24) body.scrollTop += 10;
  }

  function track(e, onMove, onEnd) {
    dragging = true;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      moved = true;
      autoScroll(ev.clientY);
      onMove(ev);
    };
    const end = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      document.body.classList.remove('sched-dragging');
      dragging = false;
      onEnd(ev, moved);
    };
    document.body.classList.add('sched-dragging');
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  $('schedGrid').addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const col = e.target.closest('.sched-col');
    if (!col) return;
    e.preventDefault();
    const blockNode = e.target.closest('.sblock');
    if (blockNode) dragBlock(e, blockNode);
    else dragCreate(e, col);
  });

  // Arrastrar en vacío crea un bloque; un clic solo marca la posición.
  function dragCreate(e, col) {
    const day = Number(col.dataset.day);
    const anchor = Math.floor(minuteAt(col, e.clientY) / SNAP) * SNAP;
    let range = [anchor, anchor + SNAP];
    const ghost = document.createElement('div');
    ghost.className = 'sblock ghost';
    ghost.style.left = '2px';
    ghost.style.width = 'calc(100% - 4px)';

    track(e, (ev) => {
      if (cursor) { cursor = null; $('schedGrid').querySelector('.sched-cursor')?.remove(); }
      const m = snap(minuteAt(col, ev.clientY));
      range = m > anchor ? [anchor, m] : [Math.min(m, anchor), anchor + SNAP];
      if (!ghost.parentNode) col.append(ghost);
      placeEl(ghost, range[0], range[1]);
      ghost.textContent = `${hhmm(range[0])} – ${hhmm(range[1])}`;
    }, (ev, moved) => {
      ghost.remove();
      if (!moved) {
        cursor = { day, min: Math.min(anchor, DAY_MIN - SNAP) };
        selectedId = null;
        render();
        return;
      }
      const b = { id: newId(), title: '', start: range[0], end: range[1], days: [day], color: DEFAULT_COLOR };
      blocks.push(b);
      selectedId = b.id;
      render();
      openEditor(b.id, day, true);
    });
  }

  // Mover (cuerpo) o redimensionar (bordes). En vertical cambia la hora en
  // todos sus días; en horizontal solo se mueven los bloques de un único día.
  function dragBlock(e, node) {
    const b = blockById(node.dataset.id);
    if (!b) return;
    const mode = e.target.classList.contains('top') ? 'top'
      : e.target.classList.contains('bot') ? 'bot' : 'move';
    const fromDay = Number(node.dataset.day);
    const grab = minuteAt(node.parentNode, e.clientY);
    const dur = b.end - b.start;
    let next = { start: b.start, end: b.end, day: fromDay };
    const els = [...document.querySelectorAll(`.sblock[data-id="${CSS.escape(b.id)}"]`)];

    cursor = null;
    track(e, (ev) => {
      const m = minuteAt(cols[0], ev.clientY);
      if (mode === 'move') {
        const start = clamp(snap(b.start + m - grab), 0, DAY_MIN - dur);
        next = { start, end: start + dur, day: b.days.length === 1 ? Number(colAt(ev.clientX).dataset.day) : fromDay };
      } else if (mode === 'top') {
        next = { ...next, start: clamp(snap(m), 0, b.end - SNAP) };
      } else {
        next = { ...next, end: clamp(snap(m), b.start + SNAP, DAY_MIN) };
      }
      for (const el of els) {
        el.classList.add('dragging');
        placeEl(el, next.start, next.end);
        el.style.left = '2px';
        el.style.width = 'calc(100% - 4px)';
        el.querySelector('.sblock-time').textContent = `${hhmm(next.start)} – ${hhmm(next.end)}`;
      }
      if (next.day !== fromDay && els[0].parentNode !== cols[next.day]) cols[next.day].append(els[0]);
    }, (ev, moved) => {
      selectedId = b.id;
      if (!moved) {
        render();
        openEditor(b.id, fromDay, false);
        return;
      }
      b.start = next.start;
      b.end = next.end;
      if (b.days.length === 1) b.days = [next.day];
      render();
      saveBlocks();
    });
  }

  // ───────────────────────── Editor ─────────────────────────

  const ed = { days: new Set(), color: DEFAULT_COLOR };

  function buildEditor() {
    for (let d = 0; d < 7; d++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = DAY_SHORT[d];
      btn.title = DAY_LONG[d];
      btn.dataset.day = d;
      btn.addEventListener('click', () => {
        if (ed.days.has(d)) ed.days.delete(d);
        else ed.days.add(d);
        paintEditor();
      });
      $('edDays').append(btn);
    }
    for (const btn of document.querySelectorAll('.ed-quick button')) {
      btn.addEventListener('click', () => {
        ed.days = new Set(btn.dataset.days.split(',').map(Number));
        paintEditor();
      });
    }
    for (const [name, hex] of Object.entries(COLORS)) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'ed-swatch';
      sw.dataset.color = name;
      sw.style.setProperty('--c', hex);
      sw.setAttribute('aria-label', name);
      sw.addEventListener('click', () => { ed.color = name; paintEditor(); });
      $('edColors').append(sw);
    }
    for (const id of ['edStart', 'edEnd']) $(id).addEventListener('input', paintEditor);
  }

  function readEditor() {
    const start = parseHHMM($('edStart').value);
    let end = parseHHMM($('edEnd').value);
    if (end === 0 && start > 0) end = DAY_MIN;    // 00:00 como fin = medianoche
    return { title: $('edTitle').value.trim(), start, end, days: [...ed.days].sort((a, b) => a - b), color: ed.color };
  }

  function editorError(v) {
    if (!Number.isFinite(v.start) || !Number.isFinite(v.end)) return 'Hora no válida.';
    if (v.end <= v.start) return 'El fin debe ser posterior al inicio.';
    if (!v.days.length) return 'Elige al menos un día.';
    return '';
  }

  function paintEditor() {
    for (const btn of $('edDays').children) btn.setAttribute('aria-pressed', ed.days.has(Number(btn.dataset.day)));
    for (const sw of $('edColors').children) sw.setAttribute('aria-pressed', sw.dataset.color === ed.color);
    const v = readEditor();
    $('edDur').textContent = Number.isFinite(v.start) && Number.isFinite(v.end) && v.end > v.start ? durText(v.end - v.start) : '';
    $('edErr').hidden = true;
  }

  function openEditor(id, day, isNew) {
    const b = blockById(id);
    if (!b) return;
    editing = { id, isNew };
    $('edTitle').value = b.title;
    $('edStart').value = hhmm(b.start);
    $('edEnd').value = hhmm(b.end % DAY_MIN);
    ed.days = new Set(b.days);
    ed.color = b.color in COLORS ? b.color : DEFAULT_COLOR;
    $('edDelete').textContent = isNew ? 'Descartar' : 'Eliminar';
    paintEditor();

    $('schedEditor').hidden = false;
    positionEditor(id, day);
    $('edTitle').focus();
    if (!isNew) $('edTitle').select();
  }

  // Junto al bloque: a la derecha si cabe, si no a la izquierda.
  function positionEditor(id, day) {
    const box = $('schedEditor');
    const panel = $('panel-sched').getBoundingClientRect();
    const el = document.querySelector(`.sblock[data-id="${CSS.escape(id)}"][data-day="${day}"]`)
      || document.querySelector(`.sblock[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    let x = r.right + 8;
    if (x + w > panel.right - 8) x = r.left - w - 8;
    if (x < panel.left + 8) x = panel.left + 8;
    const y = clamp(r.top, panel.top + 8, panel.bottom - h - 8);
    box.style.left = x - panel.left + 'px';
    box.style.top = y - panel.top + 'px';
  }

  function closeEditor() {
    editing = null;
    $('schedEditor').hidden = true;
  }

  // Guarda lo editado; devuelve false si no es válido.
  function commitEditor() {
    if (!editing) return true;
    const b = blockById(editing.id);
    if (!b) { closeEditor(); return true; }
    const v = readEditor();
    const err = editorError(v);
    if (err) {
      $('edErr').textContent = err;
      $('edErr').hidden = false;
      return false;
    }
    Object.assign(b, v);
    closeEditor();
    render();
    saveBlocks();
    return true;
  }

  function cancelEditor() {
    if (!editing) return;
    if (editing.isNew) {
      const id = editing.id;
      blocks = blocks.filter((b) => b.id !== id);
      selectedId = null;
    }
    closeEditor();
    render();
  }

  function deleteBlock(id) {
    blocks = blocks.filter((b) => b.id !== id);
    if (selectedId === id) selectedId = null;
    if (editing && editing.id === id) closeEditor();
    render();
    saveBlocks();
  }

  $('schedEditor').addEventListener('submit', (e) => {
    e.preventDefault();
    commitEditor();
  });
  $('schedEditor').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditor();
    }
  });
  $('edDelete').addEventListener('click', () => {
    if (!editing) return;
    if (editing.isNew) cancelEditor();
    else deleteBlock(editing.id);
  });
  $('edTimer').addEventListener('click', () => {
    if (!editing) return;
    const id = editing.id;
    if (!commitEditor()) return;
    const b = blockById(id);
    if (b) startTimer(timerSecondsFor(b, weekNow()));   // en curso: lo que queda
  });

  // Clic fuera del editor: guarda (o descarta si no es válido). Si el clic cae
  // en un hueco vacío solo cierra; sobre otro bloque, además lo abre.
  document.addEventListener('pointerdown', (e) => {
    if (!editing || $('schedEditor').contains(e.target)) return;
    const node = e.target.closest('.sblock');
    const inGrid = !!e.target.closest('.sched-col');
    const day = node ? Number(node.dataset.day) : -1;
    if (!commitEditor()) cancelEditor();
    // el render ha sustituido los nodos: no se deja seguir el gesto original
    if (inGrid) e.stopPropagation();
    if (node && blockById(node.dataset.id)) {
      selectedId = node.dataset.id;
      render();
      openEditor(selectedId, day, false);
    } else {
      selectedId = null;
      render();
    }
  }, true);

  // Solo Supr borra: Retroceso se pulsa sin querer con demasiada facilidad.
  function onKey(e) {
    if (editing) return;
    if (e.key === 'Delete' && selectedId) {
      e.preventDefault();
      deleteBlock(selectedId);
    } else if (e.key === 'Escape' && (selectedId || cursor)) {
      selectedId = null;
      cursor = null;
      render();
    }
  }

  // "Iniciar temporizador" solo si el plugin está activo.
  ctx.state.subscribe((s, prev) => {
    if (s.plugins !== prev.plugins) $('edTimer').hidden = !s.plugins.timer;
  });
  $('edTimer').hidden = !ctx.state.get().plugins.timer;

  // ───────────────────────── Widget ─────────────────────────

  let widgetOn = false;
  function paintWidgetBtn() {
    $('schedWidget').textContent = widgetOn ? 'Ocultar widget' : 'Mostrar widget';
  }
  tiny.api.on('widget', (st) => {
    if (st && typeof st.on === 'boolean') { widgetOn = st.on; paintWidgetBtn(); }
  });
  $('schedWidget').addEventListener('click', async () => {
    try {
      const st = await tiny.api.call('setWidget', { on: !widgetOn });
      widgetOn = !!(st && st.on);
      paintWidgetBtn();
    } catch (e) { console.error('setWidget', e); }
  });

  // ───────────────────────── Arranque ─────────────────────────

  buildGrid();
  buildEditor();
  setInterval(() => { if (isShown() && !dragging) renderNow(); }, 30000);
  ctx.registerTab('sched', { onShow, onKey });

  return {
    async boot() {
      const [list, w] = await Promise.all([tiny.api.call('getBlocks'), tiny.api.call('getWidget')]);
      blocks = Array.isArray(list) ? list : [];
      widgetOn = !!(w && w.on);
      paintWidgetBtn();
      if (isShown()) render();
    },
  };
}

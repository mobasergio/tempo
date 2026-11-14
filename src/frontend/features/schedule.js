// Horario semanal (time blocker por día de la semana, no por calendario).
// Un bloque es una sola entidad que aparece en cada uno de sus días (ver
// shared/schedule-core.js). El backend guarda los bloques, avisa al empezar
// cada uno y muestra el actual en la bandeja; aquí solo se dibujan y editan.

import { $, newId } from '../lib/util.js';
import { createHistory } from '../lib/history.js';
import { toast } from '../lib/toast.js';
import { DAY_MIN, hhmm, parseHHMM, durText, weekNow } from '../../shared/time.js';
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
  const { t } = ctx;
  const DAY_SHORT = t('days.short');
  const DAY_LONG = t('days.long');
  const untitled = (b) => b.title || t('app.untitled');
  let blocks = [];
  let selectedId = null;
  let selectedDay = 0;           // columna donde se seleccionó (bloques de varios días)
  let cursor = null;             // { day, min }: posición marcada con un clic
  let editing = null;            // { id }
  let clip = null;               // bloque copiado (Ctrl+C), sin id
  const history = createHistory({ limit: 50 });
  let dragging = false;
  let saveTimer = null;
  let savesInFlight = 0;
  let scrolledOnce = false;
  const cols = [];

  const isShown = () => ctx.state.get().activeTab === 'sched';
  const blockById = (id) => blocks.find((b) => b.id === id);
  // Llamar justo antes de cada cambio que se pueda deshacer.
  const remember = () => history.record(blocks);

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
    title.textContent = untitled(b);
    const time = document.createElement('div');
    time.className = 'sblock-time';
    time.textContent = `${hhmm(b.start)} – ${hhmm(b.end)}`;
    const top = document.createElement('div');
    top.className = 'sblock-handle top';
    const bot = document.createElement('div');
    bot.className = 'sblock-handle bot';
    el.append(title, time, top, bot);
    el.title = `${untitled(b)}\n${hhmm(b.start)} – ${hhmm(b.end)}\n${b.days.map((d) => DAY_SHORT[d]).join(' ')}`;
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
    const now = weekNow();
    const heads = $('schedHead').children;
    for (let d = 0; d < 7; d++) {
      heads[d + 1].classList.toggle('today', d === now.day);
      cols[d].classList.toggle('today', d === now.day);
    }
    let line = $('schedNow');
    if (!line) {
      line = document.createElement('div');
      line.id = 'schedNow';
      line.className = 'sched-now';
    }
    line.style.top = (now.min / 60) * HOUR_PX + 'px';
    if (line.parentNode !== cols[now.day]) cols[now.day].append(line);

    for (const el of document.querySelectorAll('.sblock')) {
      const b = blockById(el.dataset.id);
      el.classList.toggle('current', !!b && Number(el.dataset.day) === now.day && isActiveAt(b, now));
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

  // Sigue un gesto de arrastre. Los pointermove se agrupan en un frame
  // (requestAnimationFrame); si el horario se desplaza solo cerca de un borde,
  // se sigue repintando aunque el ratón esté quieto.
  function track(e, onMove, onEnd) {
    dragging = true;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let last = null;
    let raf = 0;
    const frame = () => {
      raf = 0;
      if (!last) return;
      const body = $('schedBody');
      const before = body.scrollTop;
      autoScroll(last.clientY);
      onMove(last);
      if (body.scrollTop !== before) raf = requestAnimationFrame(frame);
    };
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      moved = true;
      last = ev;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const end = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (moved && last) onMove(last);       // el último movimiento sin pintar
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
      // Queda seleccionado, sin abrir el editor: Supr lo borra, y Enter,
      // un clic o empezar a escribir lo nombran.
      remember();
      blocks.push(b);
      selectedId = b.id;
      selectedDay = day;
      render();
      saveBlocks();
    });
  }

  // Mover (cuerpo) o redimensionar (bordes). En vertical cambia la hora en
  // todos sus días; en horizontal solo se mueven los bloques de un único día.
  // El bloque sigue al ratón sin saltos y una sombra marca dónde caerá
  // (ajustado a 15 min y a la columna); al soltar se coloca ahí.
  function dragBlock(e, node) {
    const b = blockById(node.dataset.id);
    if (!b) return;
    const mode = e.target.classList.contains('top') ? 'top'
      : e.target.classList.contains('bot') ? 'bot' : 'move';
    const fromDay = Number(node.dataset.day);
    const single = b.days.length === 1;
    const grab = minuteAt(node.parentNode, e.clientY);
    const dur = b.end - b.start;
    const startX = e.clientX;
    let next = { start: b.start, end: b.end, day: fromDay };
    const els = [...document.querySelectorAll(`.sblock[data-id="${CSS.escape(b.id)}"]`)];
    const ghosts = els.map((el) => {
      const g = document.createElement('div');
      g.className = 'sblock ghost';
      g.style.left = '2px';
      g.style.width = 'calc(100% - 4px)';
      g.dataset.day = el.dataset.day;
      return g;
    });
    // límites horizontales: que no salga de la primera ni de la última columna
    const left0 = cols[fromDay].getBoundingClientRect().left;
    const dxMin = cols[0].getBoundingClientRect().left - left0;
    const dxMax = cols[6].getBoundingClientRect().left - left0;
    let started = false;

    cursor = null;
    track(e, (ev) => {
      if (!started) {
        started = true;
        for (const el of els) {
          el.classList.add('dragging');
          el.style.left = '2px';
          el.style.width = 'calc(100% - 4px)';
        }
      }
      const m = minuteAt(cols[0], ev.clientY);
      let rawStart = b.start;
      let rawEnd = b.end;
      if (mode === 'move') {
        rawStart = clamp(b.start + m - grab, 0, DAY_MIN - dur);
        rawEnd = rawStart + dur;
        const start = clamp(snap(rawStart), 0, DAY_MIN - dur);
        next = { start, end: start + dur, day: single ? Number(colAt(ev.clientX).dataset.day) : fromDay };
      } else if (mode === 'top') {
        rawStart = clamp(m, 0, b.end - SNAP);
        next = { ...next, start: clamp(snap(m), 0, b.end - SNAP) };
      } else {
        rawEnd = clamp(m, b.start + SNAP, DAY_MIN);
        next = { ...next, end: clamp(snap(m), b.start + SNAP, DAY_MIN) };
      }

      const label = `${hhmm(next.start)} – ${hhmm(next.end)}`;
      const dy = ((rawStart - b.start) / 60) * HOUR_PX;
      const dx = single ? clamp(ev.clientX - startX, dxMin, dxMax) : 0;
      els.forEach((el, i) => {
        if (mode === 'move') el.style.transform = `translate(${dx}px, ${dy}px)`;
        else placeEl(el, rawStart, rawEnd);
        el.querySelector('.sblock-time').textContent = label;
        const g = ghosts[i];
        const col = cols[single ? next.day : Number(g.dataset.day)];
        if (g.parentNode !== col) col.append(g);
        placeEl(g, next.start, next.end);
        g.textContent = label;
      });
    }, (ev, moved) => {
      for (const g of ghosts) g.remove();
      selectedId = b.id;
      selectedDay = moved ? next.day : fromDay;
      if (!moved) {
        render();
        openEditor(b.id, fromDay);
        return;
      }
      if (next.start === b.start && next.end === b.end && (!single || next.day === b.days[0])) {
        render();
        return;
      }
      remember();
      b.start = next.start;
      b.end = next.end;
      if (single) b.days = [next.day];
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
      sw.setAttribute('aria-label', t(`color.${name}`));
      sw.title = t(`color.${name}`);
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
    if (!Number.isFinite(v.start) || !Number.isFinite(v.end)) return t('sched.errTime');
    if (v.end <= v.start) return t('sched.errOrder');
    if (!v.days.length) return t('sched.errDays');
    return '';
  }

  function paintEditor() {
    for (const btn of $('edDays').children) btn.setAttribute('aria-pressed', ed.days.has(Number(btn.dataset.day)));
    for (const sw of $('edColors').children) sw.setAttribute('aria-pressed', sw.dataset.color === ed.color);
    const v = readEditor();
    $('edDur').textContent = Number.isFinite(v.start) && Number.isFinite(v.end) && v.end > v.start ? durText(v.end - v.start) : '';
    $('edErr').hidden = true;
  }

  // seed: tecla con la que se empezó a escribir sobre el bloque seleccionado.
  function openEditor(id, day, { seed } = {}) {
    const b = blockById(id);
    if (!b) return;
    editing = { id };
    $('edTitle').value = seed ?? b.title;
    $('edStart').value = hhmm(b.start);
    $('edEnd').value = hhmm(b.end % DAY_MIN);
    ed.days = new Set(b.days);
    ed.color = b.color in COLORS ? b.color : DEFAULT_COLOR;
    paintEditor();

    $('schedEditor').hidden = false;
    positionEditor(id, day);
    const title = $('edTitle');
    title.focus();
    if (seed == null) title.select();
    else title.setSelectionRange(title.value.length, title.value.length);
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
    const same = v.title === b.title && v.start === b.start && v.end === b.end
      && v.color === b.color && v.days.join() === b.days.join();
    if (!same) {
      remember();
      Object.assign(b, v);
    }
    closeEditor();
    render();
    saveBlocks();
    return true;
  }

  function cancelEditor() {
    if (!editing) return;
    closeEditor();
    render();
  }

  function deleteBlock(id) {
    if (!blockById(id)) return;
    remember();
    blocks = blocks.filter((b) => b.id !== id);
    if (selectedId === id) selectedId = null;
    if (editing && editing.id === id) closeEditor();
    render();
    saveBlocks();
    toast(t('toast.blockDeleted'), { action: { label: t('toast.undo'), run: () => undo() } });
  }

  // ─────────────────── Deshacer, copiar y pegar ───────────────────

  function restore(list, msg) {
    if (!list) return;
    blocks = list;
    if (selectedId && !blockById(selectedId)) selectedId = null;
    cursor = null;
    render();
    saveBlocks();
    toast(msg, { ms: 1800 });
  }
  // Si el editor está abierto, primero se guarda (y así entra en el historial).
  function closeEditing() {
    if (editing && !commitEditor()) cancelEditor();
  }
  function undo() {
    closeEditing();
    restore(history.undo(blocks), t('toast.undone'));
  }
  function redo() {
    closeEditing();
    restore(history.redo(blocks), t('toast.redone'));
  }

  function copySelected() {
    const b = selectedId && blockById(selectedId);
    if (!b) return false;
    clip = { title: b.title, color: b.color, start: b.start, end: b.end, days: [...b.days] };
    toast(t('toast.copied'), { ms: 1800 });
    return true;
  }

  // Con un hueco marcado (clic), se pega ahí en ese día; si no, justo después
  // del original (o justo antes si no cabe antes de medianoche).
  function paste() {
    if (!clip) return false;
    closeEditing();
    const dur = clip.end - clip.start;
    let start, end, days;
    if (cursor) {
      start = cursor.min;
      end = Math.min(DAY_MIN, start + dur);
      days = [cursor.day];
    } else {
      start = clip.end + dur <= DAY_MIN ? clip.end : Math.max(0, clip.start - dur);
      end = start + dur;
      days = [...clip.days];
    }
    const b = { id: newId(), title: clip.title, color: clip.color, start, end, days };
    remember();
    blocks.push(b);
    selectedId = b.id;
    selectedDay = days[0];
    cursor = null;
    render();
    saveBlocks();
    return true;
  }

  function onShortcut(e) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { undo(); return true; }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { redo(); return true; }
    if (k === 'c') return copySelected();
    if (k === 'v') return paste();
    return false;
  }

  $('schedEditor').addEventListener('submit', (e) => {
    e.preventDefault();
    commitEditor();
  });
  $('schedEditor').addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditor();
    } else if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && editing) {
      // Supr borra el bloque salvo que en el título quede algo que borrar
      // (texto seleccionado o el cursor antes del final). Las horas, normal.
      if (el.classList.contains('ed-time')) return;
      if (el === $('edTitle') && (el.selectionStart !== el.selectionEnd || el.selectionEnd < el.value.length)) return;
      e.preventDefault();
      deleteBlock(editing.id);
    }
  });
  $('edDelete').addEventListener('click', () => {
    if (!editing) return;
    deleteBlock(editing.id);
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
      selectedDay = day;
      render();
      openEditor(selectedId, day);
    } else {
      selectedId = null;
      render();
    }
  }, true);

  // Solo Supr borra: Retroceso se pulsa sin querer con demasiada facilidad.
  function onKey(e) {
    if (editing) return;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (selectedId && !blockById(selectedId)) selectedId = null;
    if (plain && selectedId && e.key === 'Enter') {
      e.preventDefault();
      openEditor(selectedId, selectedDay);
    } else if (plain && selectedId && e.key.length === 1 && e.key !== ' ') {
      // empezar a escribir sobre el bloque seleccionado = ponerle nombre
      e.preventDefault();
      openEditor(selectedId, selectedDay, { seed: e.key });
    } else if (e.key === 'Delete' && selectedId) {
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
    $('schedWidget').textContent = t(widgetOn ? 'sched.widgetHide' : 'sched.widgetShow');
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
  ctx.registerTab('sched', { onShow, onKey, onShortcut });

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

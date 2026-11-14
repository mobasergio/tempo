// Horario semanal (time blocker por día de la semana, no por calendario).
// Un bloque es una sola entidad que aparece en cada uno de sus días (ver
// shared/schedule-core.js). El backend guarda los bloques, avisa al empezar
// cada uno y muestra el actual en la bandeja; aquí solo se dibujan y editan.
//
// Se maneja igual con ratón que con teclado: arrastrar crea / mueve /
// redimensiona; las flechas recorren bloques (o un cursor en los huecos),
// Alt+flechas los mueven e Intro crea o edita. El editor se acopla como
// panel lateral en ventanas anchas y flota junto al bloque en las estrechas.

import { $, newId } from '../lib/util.js';
import { createHistory } from '../lib/history.js';
import { toast } from '../lib/toast.js';
import { trapTab, announce } from '../lib/dialog.js';
import { DAY_MIN, hhmm, parseHHMM, durText, weekNow } from '../../shared/time.js';
import { COLORS, DEFAULT_COLOR, colorHex } from '../../shared/colors.js';
import { layoutDay, isActiveAt, timerSecondsFor } from '../../shared/schedule-core.js';

const HOUR_PX = 48;
const SNAP = 15;                 // minutos
const DOCK_MIN = 1100;           // ancho del panel desde el que el editor se acopla
const NUDGE_MERGE_MS = 1000;     // pulsaciones seguidas de Alt+flecha = un solo deshacer
const ARROWS = {
  ArrowUp: { dx: 0, dy: -1 }, ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 },
};

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
  let cursor = null;             // { day, min }: posición marcada con un clic o las flechas
  let editing = null;            // { id, day, isNew }
  let clip = null;               // bloque copiado (Ctrl+C), sin id
  const history = createHistory({ limit: 50 });
  let lastNudge = { key: '', at: 0 };
  let dragging = false;
  let dismissing = false;        // el clic que cierra el editor no marca el cursor
  let saveTimer = null;
  let savesInFlight = 0;
  let scrolledOnce = false;
  const cols = [];
  const panel = $('panel-sched');
  const grid = $('schedGrid');
  const body = $('schedBody');
  const box = $('schedEditor');

  const isShown = () => ctx.state.get().activeTab === 'sched';
  const isDocked = () => panel.classList.contains('dock');
  const blockById = (id) => blocks.find((b) => b.id === id);
  // Llamar justo antes de cada cambio que se pueda deshacer.
  const remember = () => { lastNudge = { key: '', at: 0 }; history.record(blocks); };
  const rangeText = (start, end) => `${hhmm(start)} – ${hhmm(end)}`;
  const blockLabel = (b) => t('sched.blockLabel', {
    title: untitled(b), start: hhmm(b.start), end: hhmm(b.end), days: b.days.map((d) => DAY_LONG[d]).join(', '),
  });

  // ───────────────────────── Estructura ─────────────────────────

  function buildGrid() {
    const head = $('schedHead');
    head.append(document.createElement('div'));          // esquina sobre las horas
    for (let d = 0; d < 7; d++) {
      const h = document.createElement('div');
      h.className = 'sched-day';
      h.title = DAY_LONG[d];
      // nombre completo o abreviado según el ancho (container query en el CSS)
      const long = document.createElement('span');
      long.className = 'd-long';
      long.textContent = DAY_LONG[d];
      const short = document.createElement('span');
      short.className = 'd-short';
      short.textContent = DAY_LONG[d].slice(0, 3);
      h.append(long, short);
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
      grid.append(c);
      cols.push(c);
    }
    grid.style.height = 24 * HOUR_PX + 'px';
  }

  // ───────────────────────── Dibujo ─────────────────────────

  function blockEl(b, day, lane, lanes) {
    const el = document.createElement('div');
    el.className = 'sblock';
    el.dataset.id = b.id;
    el.dataset.day = day;
    el.tabIndex = -1;                       // se enfoca desde el teclado (flechas)
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', blockLabel(b));
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
    time.textContent = rangeText(b.start, b.end);
    const top = document.createElement('div');
    top.className = 'sblock-handle top';
    const bot = document.createElement('div');
    bot.className = 'sblock-handle bot';
    el.append(title, time, top, bot);
    el.title = `${untitled(b)}\n${rangeText(b.start, b.end)}\n${b.days.map((d) => DAY_SHORT[d]).join(' ')}`;
    return el;
  }

  function placeEl(el, start, end) {
    el.style.top = (start / 60) * HOUR_PX + 'px';
    el.style.height = Math.max(10, ((end - start) / 60) * HOUR_PX - 2) + 'px';
  }

  function render() {
    const hadFocus = grid.contains(document.activeElement) && document.activeElement !== grid;
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
    $('schedHint').hidden = blocks.length > 0;
    renderNow();
    // el foco estaba en un bloque que se ha vuelto a crear: se recupera
    if (hadFocus) focusSelection();
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

  function selectedEl() {
    if (!selectedId) return null;
    const id = CSS.escape(selectedId);
    return document.querySelector(`.sblock[data-id="${id}"][data-day="${selectedDay}"]`)
      || document.querySelector(`.sblock[data-id="${id}"]`);
  }

  // Enfoca el bloque seleccionado (o la rejilla) y lo hace visible.
  function focusSelection() {
    const el = selectedEl();
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest' });
    } else {
      grid.focus({ preventScroll: true });
      if (cursor) cols[cursor.day].querySelector('.sched-cursor')?.scrollIntoView({ block: 'nearest' });
    }
  }

  function scrollToNow({ smooth = false } = {}) {
    const top = Math.max(0, ((weekNow().min - 60) / 60) * HOUR_PX);
    body.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }

  function onShow() {
    updateDock();
    render();
    if (!scrolledOnce) {
      scrolledOnce = true;
      // espera al cambio de tamaño de la ventana antes de desplazar
      requestAnimationFrame(() => scrollToNow());
    }
  }

  // ───────────────────── Panel lateral / flotante ─────────────────────

  function updateDock() {
    const dock = panel.clientWidth >= DOCK_MIN;
    panel.classList.toggle('dock', dock);
    document.body.classList.toggle('sched-docked', dock && isShown());
    placeEditor();
  }
  new ResizeObserver(() => { if (isShown()) updateDock(); }).observe(panel);
  ctx.state.subscribe((s, prev) => {
    if (s.activeTab !== prev.activeTab) document.body.classList.toggle('sched-docked', isDocked() && isShown());
  });

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

  // Cerca de los bordes, desplaza el horario; más deprisa cuanto más cerca.
  function autoScroll(clientY) {
    const r = body.getBoundingClientRect();
    const TOP = 56;              // incluye la cabecera fija de los días
    const BOT = 40;
    const MAX = 18;
    const up = clientY - r.top;
    const down = r.bottom - clientY;
    if (up < TOP) body.scrollTop -= Math.ceil(((TOP - up) / TOP) * MAX);
    else if (down < BOT) body.scrollTop += Math.ceil(((BOT - down) / BOT) * MAX);
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

  grid.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const col = e.target.closest('.sched-col');
    if (!col) return;
    e.preventDefault();
    // preventDefault evita el foco nativo: se da a mano para que el teclado
    // siga donde se ha hecho clic
    grid.focus({ preventScroll: true });
    grid.dataset.pointer = '';        // foco por ratón: sin anillo de teclado
    const blockNode = e.target.closest('.sblock');
    if (blockNode) dragBlock(e, blockNode);
    else dragCreate(e, col);
  });

  // Arrastrar en vacío crea un bloque y abre el editor; un clic solo marca la posición.
  function dragCreate(e, col) {
    const day = Number(col.dataset.day);
    const anchor = Math.floor(minuteAt(col, e.clientY) / SNAP) * SNAP;
    const dismiss = dismissing;
    dismissing = false;
    let range = [anchor, anchor + SNAP];
    const ghost = document.createElement('div');
    ghost.className = 'sblock ghost';
    ghost.style.left = '2px';
    ghost.style.width = 'calc(100% - 4px)';

    track(e, (ev) => {
      if (cursor) { cursor = null; grid.querySelector('.sched-cursor')?.remove(); }
      const m = snap(minuteAt(col, ev.clientY));
      range = m > anchor ? [anchor, m] : [Math.min(m, anchor), anchor + SNAP];
      if (!ghost.parentNode) col.append(ghost);
      placeEl(ghost, range[0], range[1]);
      ghost.textContent = rangeText(range[0], range[1]);
    }, (ev, moved) => {
      ghost.remove();
      if (!moved) {
        // el clic que solo cerraba el editor no deja un cursor de recuerdo
        cursor = dismiss ? null : { day, min: Math.min(anchor, DAY_MIN - SNAP) };
        selectedId = null;
        render();
        return;
      }
      createBlock(day, range[0], range[1]);
    });
  }

  // Crea un bloque, lo selecciona y abre el editor con el título enfocado.
  function createBlock(day, start, end) {
    const b = { id: newId(), title: '', start, end, days: [day], color: DEFAULT_COLOR };
    remember();
    blocks.push(b);
    selectedId = b.id;
    selectedDay = day;
    cursor = null;
    render();
    saveBlocks();
    announce(t('sched.created', { start: hhmm(start), end: hhmm(end), day: DAY_LONG[day] }));
    openEditor(b.id, day, { isNew: true });
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

      const label = rangeText(next.start, next.end);
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

  // ───────────────────────── Teclado ─────────────────────────

  // Al volver al teclado reaparece el anillo de foco (ver data-pointer).
  document.addEventListener('keydown', () => { delete grid.dataset.pointer; }, true);

  function select(id, day) {
    selectedId = id;
    selectedDay = day;
    cursor = null;
    render();
    focusSelection();
  }

  // Flechas con un bloque seleccionado: ↑/↓ el anterior / siguiente del mismo
  // día; ←/→ el más cercano en hora del día con bloques más próximo.
  function moveSelection({ dx, dy }) {
    const cur = blockById(selectedId);
    if (!cur) return;
    const dayBlocks = (d) => layoutDay(blocks, d).map((x) => x.b)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    if (dy) {
      const list = dayBlocks(selectedDay);
      const next = list[list.indexOf(cur) + dy];
      if (next) select(next.id, selectedDay);
      return;
    }
    for (let d = selectedDay + dx; d >= 0 && d < 7; d += dx) {
      const list = dayBlocks(d);
      if (!list.length) continue;
      const near = list.reduce((a, b) => (Math.abs(b.start - cur.start) < Math.abs(a.start - cur.start) ? b : a));
      select(near.id, d);
      return;
    }
  }

  // Flechas sin selección: un cursor recorre los huecos (15 min / un día).
  function moveCursor({ dx, dy }) {
    if (!cursor) {
      const now = weekNow();
      cursor = { day: now.day, min: clamp(Math.floor(now.min / SNAP) * SNAP, 0, DAY_MIN - SNAP) };
    } else {
      cursor = {
        day: clamp(cursor.day + dx, 0, 6),
        min: clamp(cursor.min + dy * SNAP, 0, DAY_MIN - SNAP),
      };
    }
    render();
    focusSelection();
    // sobre un bloque se anuncia cuál es (Intro lo abre)
    const hit = blockAtCursor();
    const where = `${DAY_LONG[cursor.day]} ${hhmm(cursor.min)}`;
    announce(hit ? `${where} · ${blockLabel(hit)}` : where);
  }

  const blockAtCursor = () => cursor
    && layoutDay(blocks, cursor.day).map((x) => x.b).find((b) => b.start <= cursor.min && cursor.min < b.end);

  // Alt+flechas: mueve el bloque 15 min (↑/↓) o de día (←/→, solo si es de un
  // día). Con Mayús, ↑/↓ cambian la hora de fin.
  function nudge({ dx, dy }, resize) {
    const b = blockById(selectedId);
    if (!b) return;
    let { start, end, days } = b;
    if (resize) {
      if (!dy) return;
      end = clamp(end + dy * SNAP, start + SNAP, DAY_MIN);
    } else if (dy) {
      const dur = end - start;
      start = clamp(start + dy * SNAP, 0, DAY_MIN - dur);
      end = start + dur;
    } else {
      if (days.length !== 1) return;
      days = [clamp(days[0] + dx, 0, 6)];
    }
    if (start === b.start && end === b.end && days[0] === b.days[0]) return;

    const key = selectedId + (resize ? ':r' : ':m');
    const now = Date.now();
    if (lastNudge.key !== key || now - lastNudge.at > NUDGE_MERGE_MS) remember();
    lastNudge = { key, at: now };

    Object.assign(b, { start, end, days });
    if (days.length === 1) selectedDay = days[0];
    render();
    focusSelection();
    saveBlocks();
    announce(blockLabel(b));
  }

  // ───────────────────────── Editor ─────────────────────────

  const ed = { days: new Set(), color: DEFAULT_COLOR };

  function buildEditor() {
    for (let d = 0; d < 7; d++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = DAY_SHORT[d];
      btn.title = DAY_LONG[d];
      btn.setAttribute('aria-label', DAY_LONG[d]);
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

  /** '' si es válido; si no, { field: 'time' | 'days', msg }. */
  function editorError(v) {
    if (!Number.isFinite(v.start) || !Number.isFinite(v.end)) return { field: 'time', msg: t('sched.errTime') };
    if (v.end <= v.start) return { field: 'time', msg: t('sched.errOrder') };
    if (!v.days.length) return { field: 'days', msg: t('sched.errDays') };
    return '';
  }

  function showError(err) {
    const msg = err ? err.msg : '';
    if ($('edErr').textContent !== msg) $('edErr').textContent = msg;   // role=alert: solo si cambia
    $('edErr').hidden = !err;
    for (const id of ['edStart', 'edEnd']) $(id).setAttribute('aria-invalid', err?.field === 'time');
    $('edDays').setAttribute('aria-invalid', err?.field === 'days');
  }

  // Se valida mientras se edita, salvo "hora no válida": un campo de hora a
  // medio escribir está vacío y el aviso saltaría a cada tecla.
  function paintEditor() {
    for (const btn of $('edDays').children) btn.setAttribute('aria-pressed', ed.days.has(Number(btn.dataset.day)));
    for (const sw of $('edColors').children) sw.setAttribute('aria-pressed', sw.dataset.color === ed.color);
    const v = readEditor();
    $('edDur').textContent = Number.isFinite(v.start) && Number.isFinite(v.end) && v.end > v.start ? durText(v.end - v.start) : '';
    const err = editorError(v);
    showError(err && err.msg !== t('sched.errTime') ? err : '');
    box.style.setProperty('--c', colorHex(ed.color));
  }

  // seed: tecla con la que se empezó a escribir sobre el bloque seleccionado.
  // isNew: recién creado; cancelar lo descarta (era un arrastre de prueba).
  function openEditor(id, day, { seed, isNew = false } = {}) {
    const b = blockById(id);
    if (!b) return;
    editing = { id, day, isNew };
    $('edTitle').value = seed ?? b.title;
    $('edStart').value = hhmm(b.start);
    $('edEnd').value = hhmm(b.end % DAY_MIN);
    ed.days = new Set(b.days);
    ed.color = b.color in COLORS ? b.color : DEFAULT_COLOR;
    paintEditor();

    box.hidden = false;
    panel.classList.add('editing');
    placeEditor();
    const title = $('edTitle');
    title.focus({ preventScroll: true });
    if (seed == null) title.select();
    else title.setSelectionRange(title.value.length, title.value.length);
  }

  // Flotante: junto al bloque, a la derecha si cabe, si no a la izquierda, y
  // siempre dentro del horario. Acoplado: lo coloca el CSS.
  function placeEditor() {
    if (!editing || box.hidden) return;
    if (isDocked()) {
      box.style.left = box.style.top = '';
      return;
    }
    const p = panel.getBoundingClientRect();
    const view = body.getBoundingClientRect();
    const id = CSS.escape(editing.id);
    const el = document.querySelector(`.sblock[data-id="${id}"][data-day="${editing.day}"]`)
      || document.querySelector(`.sblock[data-id="${id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    let x = r.right + 8;
    if (x + w > p.right - 8) x = r.left - w - 8;
    if (x < p.left + 8) x = p.left + 8;
    const y = clamp(r.top, Math.max(p.top, view.top) + 8, Math.min(p.bottom, view.bottom) - h - 8);
    box.style.left = Math.round(x - p.left) + 'px';
    box.style.top = Math.round(Math.max(8, y - p.top)) + 'px';
  }
  let placeRaf = 0;
  body.addEventListener('scroll', () => {
    if (!editing || isDocked() || placeRaf) return;
    placeRaf = requestAnimationFrame(() => { placeRaf = 0; placeEditor(); });
  }, { passive: true });

  // Cierra el editor; devuelve si tenía el foco (para devolverlo al bloque).
  function closeEditor() {
    const hadFocus = box.contains(document.activeElement);
    editing = null;
    box.hidden = true;
    panel.classList.remove('editing');
    return hadFocus;
  }

  // Guarda lo editado; devuelve false si no es válido.
  function commitEditor() {
    if (!editing) return true;
    const b = blockById(editing.id);
    if (!b) { closeEditor(); return true; }
    const v = readEditor();
    const err = editorError(v);
    if (err) {
      showError(err);
      (err.field === 'days' ? $('edDays').firstElementChild : $('edStart')).focus();
      return false;
    }
    const same = v.title === b.title && v.start === b.start && v.end === b.end
      && v.color === b.color && v.days.join() === b.days.join();
    // un bloque nuevo ya guardó su instantánea al crearse: crear y nombrar = un deshacer
    if (!same && !editing.isNew) remember();
    if (!same) Object.assign(b, v);
    if (!b.days.includes(selectedDay)) selectedDay = b.days[0];
    const refocus = closeEditor();
    render();
    if (refocus) focusSelection();
    saveBlocks();
    return true;
  }

  // Esc: descarta los cambios. Si el bloque era nuevo, descarta el bloque.
  function cancelEditor() {
    if (!editing) return;
    const { id, isNew } = editing;
    const refocus = closeEditor();
    const b = blockById(id);
    if (isNew && b) {
      blocks = blocks.filter((x) => x !== b);
      history.drop();
      cursor = { day: b.days[0], min: b.start };
      selectedId = null;
      saveBlocks();
      announce(t('sched.discarded'));
    }
    render();
    if (refocus) focusSelection();
  }

  function deleteBlock(id) {
    if (!blockById(id)) return;
    const refocus = box.contains(document.activeElement) || grid.contains(document.activeElement);
    remember();
    blocks = blocks.filter((b) => b.id !== id);
    if (selectedId === id) selectedId = null;
    if (editing && editing.id === id) closeEditor();
    render();
    if (refocus) focusSelection();
    saveBlocks();
    toast(t('toast.blockDeleted'), { action: { label: t('toast.undo'), keys: 'Control+Z', run: () => undo() } });
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
    focusSelection();
    saveBlocks();
    announce(blockLabel(b));
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

  box.addEventListener('submit', (e) => {
    e.preventDefault();
    commitEditor();
  });
  box.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelEditor();
    } else if (e.key === 'Tab') {
      // flotante: el foco no se escapa al horario de debajo
      if (!isDocked()) trapTab(e, box);
    } else if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && editing) {
      // Supr borra el bloque salvo que en el título quede algo que borrar
      // (texto seleccionado o el cursor antes del final). Las horas, normal.
      if (el.classList.contains('ed-time')) return;
      if (el === $('edTitle') && (el.selectionStart !== el.selectionEnd || el.selectionEnd < el.value.length)) return;
      e.preventDefault();
      deleteBlock(editing.id);
    }
  });
  // ×: guarda lo hecho, salvo un bloque recién creado y sin nombre (se descarta).
  $('edClose').addEventListener('click', () => {
    if (!editing) return;
    if (editing.isNew && !$('edTitle').value.trim()) cancelEditor();
    else if (!commitEditor()) cancelEditor();
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

  // Clic fuera del editor: guarda (o descarta si no es válido). Sobre otro
  // bloque, además lo abre; en un hueco, el mismo gesto puede crear otro.
  document.addEventListener('pointerdown', (e) => {
    if (!editing || box.contains(e.target)) return;
    const node = e.target.closest('.sblock');
    const day = node ? Number(node.dataset.day) : -1;
    if (!commitEditor()) cancelEditor();
    if (node) {
      // el render ha sustituido los nodos: no se deja seguir el gesto original
      e.stopPropagation();
      if (blockById(node.dataset.id)) {
        selectedId = node.dataset.id;
        selectedDay = day;
        render();
        openEditor(selectedId, day);
      }
    } else {
      selectedId = null;
      if (e.target.closest('.sched-col')) dismissing = true;
      render();
    }
  }, true);

  // Solo Supr borra: Retroceso se pulsa sin querer con demasiada facilidad.
  function onKey(e) {
    if (editing) return;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (selectedId && !blockById(selectedId)) selectedId = null;

    const arrow = ARROWS[e.key];
    if (arrow) {
      e.preventDefault();
      if (selectedId && e.altKey) nudge(arrow, e.shiftKey);
      else if (selectedId && plain && !e.shiftKey) moveSelection(arrow);
      else if (!selectedId && plain) moveCursor(arrow);
      return;
    }
    if (!plain) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = !selectedId && blockAtCursor();
      if (selectedId) openEditor(selectedId, selectedDay);
      else if (hit) { select(hit.id, cursor.day); openEditor(hit.id, selectedDay); }
      else if (cursor) createBlock(cursor.day, cursor.min, Math.min(DAY_MIN, cursor.min + 60));
      else moveCursor({ dx: 0, dy: 0 });   // sin nada marcado: cursor en "ahora"
    } else if (selectedId && e.key.length === 1 && e.key !== ' ' && e.key !== '?') {
      // empezar a escribir sobre el bloque seleccionado = ponerle nombre
      e.preventDefault();
      openEditor(selectedId, selectedDay, { seed: e.key });
    } else if (e.key === 'Delete' && selectedId) {
      e.preventDefault();
      deleteBlock(selectedId);
    } else if (e.key === 'Escape' && (selectedId || cursor)) {
      // deseleccionar deja el cursor donde estaba el bloque: el teclado no pierde el sitio
      const b = blockById(selectedId);
      cursor = b && !cursor ? { day: selectedDay, min: b.start } : null;
      selectedId = null;
      render();
      focusSelection();
    }
  }

  // "Iniciar temporizador" solo si el plugin está activo.
  ctx.state.subscribe((s, prev) => {
    if (s.plugins !== prev.plugins) $('edTimer').hidden = !s.plugins.timer;
  });
  $('edTimer').hidden = !ctx.state.get().plugins.timer;

  $('schedNowBtn').addEventListener('click', () => scrollToNow({ smooth: true }));

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

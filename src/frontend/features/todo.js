// Pestaña Tareas: lista de pendientes ordenable, guardada en tiny.store.

import { $, newId, save } from '../lib/util.js';
import { toast } from '../lib/toast.js';
import { announce } from '../lib/dialog.js';

export function initTodo(ctx) {
  const { t: tr } = ctx;
  let todos = [];   // { id, text, done }
  const persist = () => save('todos', todos, 0);

  // Qué parte de qué tarea tiene el foco, para devolvérselo tras repintar.
  function focusedPart() {
    const el = document.activeElement;
    const li = el?.closest?.('.todo-item');
    if (!li || !$('todoList').contains(li)) return null;
    const part = ['todo-check', 'todo-text', 'todo-del'].find((c) => el.classList.contains(c)) || 'todo-text';
    return { id: li.dataset.id, part };
  }

  function focusItem(id, part = 'todo-text') {
    const li = id && $('todoList').querySelector(`.todo-item[data-id="${CSS.escape(id)}"]`);
    if (!li) { $('todoInput').focus(); return; }
    const el = li.querySelector('.' + part) || li.querySelector('.todo-text');
    el.focus({ preventScroll: true });
    li.scrollIntoView({ block: 'nearest' });
  }

  // Con deshacer: el estado anterior vuelve con el botón del aviso.
  function removeWithUndo(next, msg) {
    const prev = todos.slice();
    todos = next;
    persist();
    render();
    toast(msg, { action: { label: tr('toast.undo'), run: () => { todos = prev; persist(); render(); } } });
  }

  function deleteTodo(t) {
    const i = todos.indexOf(t);
    const after = todos[i + 1] || todos[i - 1];
    const hadFocus = $('todoList').contains(document.activeElement);
    removeWithUndo(todos.filter((x) => x !== t), tr('todo.deleted'));
    if (hadFocus) focusItem(after?.id);
  }

  // Alt+↑/↓: mueve la tarea un puesto.
  function moveTodo(t, delta) {
    const i = todos.indexOf(t);
    const j = i + delta;
    if (j < 0 || j >= todos.length) return;
    todos.splice(i, 1);
    todos.splice(j, 0, t);
    persist();
    render();
    focusItem(t.id);
    announce(tr('todo.moved', { n: j + 1, total: todos.length }));
  }

  function render() {
    const keep = focusedPart();
    const list = $('todoList');
    list.replaceChildren();
    for (const t of todos) {
      const li = document.createElement('li');
      li.className = 'todo-item' + (t.done ? ' done' : '');
      li.dataset.id = t.id;

      const grip = document.createElement('span');
      grip.className = 'todo-grip';
      grip.textContent = '⋮⋮';
      grip.title = tr('todo.drag');
      grip.setAttribute('aria-hidden', 'true');   // con teclado: Alt+↑/↓
      grip.addEventListener('pointerdown', (e) => drag(e, li));

      const check = document.createElement('button');
      check.type = 'button';
      check.className = 'todo-check';
      check.setAttribute('aria-pressed', t.done);
      check.setAttribute('aria-label', tr(t.done ? 'todo.markPending' : 'todo.markDone'));
      check.addEventListener('click', () => { t.done = !t.done; persist(); render(); });

      const text = document.createElement('span');
      text.className = 'todo-text';
      text.textContent = t.text;
      text.title = tr('todo.editHint');
      text.tabIndex = 0;
      text.setAttribute('role', 'button');
      text.setAttribute('aria-roledescription', tr('todo.item'));
      text.setAttribute('aria-describedby', 'todoItemHelp');
      text.addEventListener('dblclick', () => edit(li, t));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'todo-del';
      del.textContent = '×';
      del.setAttribute('aria-label', tr('todo.delete'));
      del.addEventListener('click', () => deleteTodo(t));

      // Teclado sobre la tarea: Intro/F2 edita, Espacio la marca, Supr la
      // borra y Alt+↑/↓ la mueve.
      li.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          e.stopPropagation();
          moveTodo(t, e.key === 'ArrowUp' ? -1 : 1);
        } else if (e.altKey || e.ctrlKey || e.metaKey) {
          return;
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // flechas: tarea anterior / siguiente, en la misma columna
          e.preventDefault();
          const sib = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling;
          if (sib) focusItem(sib.dataset.id, focusedPart()?.part);
        } else if (e.target === text && (e.key === 'Enter' || e.key === 'F2')) {
          e.preventDefault();
          edit(li, t);
        } else if (e.target === text && e.key === ' ') {
          e.preventDefault();
          check.click();
        } else if (e.key === 'Delete') {
          e.preventDefault();
          deleteTodo(t);
        }
      });

      li.append(grip, check, text, del);
      list.appendChild(li);
    }
    const pending = todos.filter((t) => !t.done).length;
    $('todoEmpty').hidden = todos.length > 0;
    $('todoCount').textContent = !todos.length ? ''
      : !pending ? tr('todo.allDone')
      : tr.plural('todo.pending', pending);
    $('todoClear').disabled = pending === todos.length;
    if (keep) focusItem(keep.id, keep.part);
  }

  // Doble clic, Intro o F2: el texto pasa a ser un campo. Intro o salir guarda (vacío borra), Esc cancela.
  function edit(li, t) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field todo-edit';
    input.maxLength = 200;
    input.value = t.text;
    li.querySelector('.todo-text').replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    // refocus: se terminó con el teclado (Intro/Esc) → el foco vuelve a la tarea;
    // al salir con un clic se queda donde se hizo clic.
    const finish = (commit, refocus = false) => {
      if (finished) return;
      finished = true;
      if (commit) {
        const text = input.value.trim();
        if (text) t.text = text;
        else { deleteTodo(t); return; }
        persist();
      }
      render();
      if (refocus) focusItem(t.id);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true, true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false, true); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  // Arrastrar por el asa. Durante el arrastre solo se usan transforms: la tarea
  // sigue al ratón y las demás se deslizan para hacerle hueco (transición CSS).
  // El DOM y el orden de `todos` se actualizan al soltar, tras asentarse.
  function drag(e, li) {
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
          persist();
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
      persist();
      render();
      $('todoList').scrollTop = $('todoList').scrollHeight;
    }
    $('todoInput').value = '';
    $('todoInput').focus();
  });
  $('todoClear').addEventListener('click', () => {
    const n = todos.filter((t) => t.done).length;
    removeWithUndo(todos.filter((t) => !t.done), tr.plural('todo.cleared', n));
  });

  ctx.registerTab('todo', {});
  render();

  return {
    async boot() {
      const saved = await tiny.store.get('todos');
      if (!Array.isArray(saved)) return;
      todos = saved
        .filter((t) => t && typeof t.text === 'string' && t.text.trim())
        .map((t) => ({ id: typeof t.id === 'string' ? t.id : newId(), text: t.text, done: !!t.done }));
      render();
    },
  };
}

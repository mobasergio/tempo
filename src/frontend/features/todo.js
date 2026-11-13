// Pestaña Tareas: lista de pendientes ordenable, guardada en tiny.store.

import { $, newId, save } from '../lib/util.js';

export function initTodo(ctx) {
  let todos = [];   // { id, text, done }
  const persist = () => save('todos', todos, 0);

  function render() {
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
      grip.addEventListener('pointerdown', (e) => drag(e, li));

      const check = document.createElement('button');
      check.className = 'todo-check';
      check.setAttribute('aria-pressed', t.done);
      check.setAttribute('aria-label', t.done ? 'Marcar como pendiente' : 'Marcar como hecha');
      check.addEventListener('click', () => { t.done = !t.done; persist(); render(); });

      const text = document.createElement('span');
      text.className = 'todo-text';
      text.textContent = t.text;
      text.title = 'Doble clic para editar';
      text.addEventListener('dblclick', () => edit(li, t));

      const del = document.createElement('button');
      del.className = 'todo-del';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Borrar tarea');
      del.addEventListener('click', () => { todos = todos.filter((x) => x !== t); persist(); render(); });

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
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      if (commit) {
        const text = input.value.trim();
        if (text) t.text = text;
        else todos = todos.filter((x) => x !== t);
        persist();
      }
      render();
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
    todos = todos.filter((t) => !t.done);
    persist();
    render();
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

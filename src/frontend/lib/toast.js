// Aviso flotante abajo, con una acción opcional ("Deshacer").
// Usa el <div id="toast"> de index.html; un aviso nuevo sustituye al anterior.

let timer = null;

export function hideToast() {
  clearTimeout(timer);
  const el = document.getElementById('toast');
  if (el) { el.hidden = true; el.replaceChildren(); }
}

export function toast(text, { action, ms = 5000 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(timer);
  const msg = document.createElement('span');
  msg.textContent = text;
  el.replaceChildren(msg);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn link';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { hideToast(); action.run(); });
    el.append(btn);
  }
  el.hidden = false;
  timer = setTimeout(hideToast, ms);
}

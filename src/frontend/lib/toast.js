// Aviso flotante abajo, con una acción opcional ("Deshacer").
// Usa el <div id="toast"> de index.html; un aviso nuevo sustituye al anterior.
// Mientras el ratón o el foco están encima, no se cierra (da tiempo a leerlo
// y a llegar al botón con el teclado).

let timer = null;
let remaining = 0;
let startedAt = 0;
let bound = false;

function el() { return document.getElementById('toast'); }

function arm(ms) {
  clearTimeout(timer);
  remaining = ms;
  startedAt = Date.now();
  timer = setTimeout(hideToast, ms);
}

function pause() {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
  remaining = Math.max(1200, remaining - (Date.now() - startedAt));
}

function resume() {
  const box = el();
  if (!box || box.hidden || timer) return;
  if (box.matches(':hover') || box.contains(document.activeElement)) return;
  arm(remaining);
}

function bind(box) {
  if (bound) return;
  bound = true;
  box.addEventListener('pointerenter', pause);
  box.addEventListener('pointerleave', resume);
  box.addEventListener('focusin', pause);
  box.addEventListener('focusout', () => setTimeout(resume));
}

function hideToast() {
  clearTimeout(timer);
  timer = null;
  const box = el();
  if (box) { box.hidden = true; box.replaceChildren(); }
}

/**
 * @param action  { label, run, keys? } — keys: atajo equivalente para
 *                aria-keyshortcuts (p. ej. 'Control+Z')
 */
export function toast(text, { action, ms = 5000 } = {}) {
  const box = el();
  if (!box) return;
  bind(box);
  const msg = document.createElement('span');
  msg.textContent = text;
  box.replaceChildren(msg);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn link';
    btn.textContent = action.label;
    if (action.keys) btn.setAttribute('aria-keyshortcuts', action.keys);
    btn.addEventListener('click', () => { hideToast(); action.run(); });
    box.append(btn);
  }
  box.hidden = false;
  // reinicia la animación de entrada si ya había un aviso visible
  box.style.animation = 'none';
  void box.offsetWidth;
  box.style.animation = '';
  arm(ms);
}

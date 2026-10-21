// Mini contador: solo muestra el estado del temporizador que envía el backend.
const t = document.getElementById('t');
let lastStatus = null;

function render(st) {
  const { status } = st;
  t.textContent = fmt(status === 'idle' ? st.lastDuration * 1000 : st.remaining);
  t.className = status;
  if ((status === 'running' || status === 'paused') && st.remaining < 60000) t.classList.add('warn');
  if (status === 'done') {
    // parpadea solo al entrar en 'done' (≈ 4 s), luego queda fijo en rojo
    if (lastStatus !== 'done') t.classList.add('blink');
    else if (t.dataset.blinking) t.classList.add('blink');
  }
  lastStatus = status;
}

t.addEventListener('animationstart', () => { t.dataset.blinking = '1'; });
t.addEventListener('animationend', () => { delete t.dataset.blinking; t.classList.remove('blink'); });

tiny.api.on('timer', render);

// data-tiny-drag convierte el doble clic en "maximizar" (listener del runtime
// en window). Lo interceptamos antes, en captura, para mostrar la principal.
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (e.detail === 2) {
    e.stopPropagation();
    tiny.api.call('focusMain');
    return;
  }
  watchDrag();
}, { capture: true });

// El arrastre es nativo y no avisa al terminar: se sondea la posición hasta
// que deja de cambiar y entonces se guarda.
let watching = false;
async function watchDrag() {
  if (watching) return;
  watching = true;
  try {
    let prev = await tiny.win.getState();
    const start = prev;
    let still = 0;
    while (still < 2) {
      await new Promise((r) => setTimeout(r, 250));
      const cur = await tiny.win.getState();
      if (!cur) return;
      still = cur.x === prev.x && cur.y === prev.y ? still + 1 : 0;
      prev = cur;
    }
    if (prev.x !== start.x || prev.y !== start.y) {
      await tiny.store.set('miniPos', { x: prev.x, y: prev.y });
    }
  } finally {
    watching = false;
  }
}

tiny.api.call('getState').then(render);

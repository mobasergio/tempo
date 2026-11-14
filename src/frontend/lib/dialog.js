// Diálogos accesibles: foco atrapado dentro, Esc cierra y el foco vuelve a
// donde estaba. Lo usan los modales (Ajustes, Atajos) y el editor de bloques.

const FOCUSABLE = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Elementos enfocables y visibles dentro de `root`. */
export function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && !el.hidden && el.offsetParent);
}

/**
 * Hace que Tab y Mayús+Tab den la vuelta dentro de `root`. Devuelve true si
 * ha movido el foco (el llamador no debe hacer nada más con el evento).
 */
export function trapTab(e, root) {
  if (e.key !== 'Tab') return false;
  const items = focusables(root);
  if (!items.length) return false;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && (active === last || !root.contains(active))) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/**
 * Modal con fondo (scrim). `scrim` contiene un elemento [role=dialog].
 * @param ctx   contexto de la app (se marca ctx.modalOpen mientras está abierto)
 * @param opts.onOpen / onClose   ganchos opcionales
 * @param opts.canClose()         false para ignorar Esc (p. ej. grabando un atajo)
 */
export function createDialog(ctx, scrim, { onOpen, onClose, canClose } = {}) {
  const dialog = scrim.querySelector('[role="dialog"]');
  let lastFocus = null;
  let closing = null;

  function open() {
    if (!scrim.hidden && !closing) return;
    if (closing) { clearTimeout(closing); closing = null; scrim.classList.remove('closing'); }
    lastFocus = document.activeElement;
    scrim.hidden = false;
    ctx.modalOpen = true;
    onOpen?.();
    dialog.focus();
  }

  // Animación de salida corta; con movimiento reducido el CSS la anula.
  function close() {
    if (scrim.hidden || closing) return;
    onClose?.();
    ctx.modalOpen = false;
    scrim.classList.add('closing');
    closing = setTimeout(() => {
      closing = null;
      scrim.classList.remove('closing');
      scrim.hidden = true;
    }, 120);
    if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus();
  }

  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
  scrim.addEventListener('keydown', (e) => {
    if (canClose && !canClose()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else trapTab(e, dialog);
  });

  return { open, close, isOpen: () => !scrim.hidden && !closing, toggle: () => (scrim.hidden || closing ? open() : close()) };
}

/** Región aria-live compartida para anuncios de lector de pantalla. */
export function announce(text) {
  const el = document.getElementById('srLive');
  if (!el) return;
  // vaciar primero para que el mismo texto se repita
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = text; });
}

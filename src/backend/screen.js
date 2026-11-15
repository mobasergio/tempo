// Pantalla principal: su zona visible (sin barra de tareas), o null si el
// sistema no la da. La usan el widget (esquina) y el aviso (centro).

export async function primaryVisible(app) {
  try {
    const screens = await app.screens();
    const s = screens.find((x) => x.primary) || screens[0];
    return (s && s.visible) || s || null;
  } catch {
    return null;
  }
}

/** Abre una ventanita sin marco, fija y siempre encima, sin robar el foco. */
export function openFloating(app, id, { page, title, w, h, x, y, parent }) {
  app.win.open(id, {
    page,
    title,
    size: `${w}x${h}`,
    minSize: `${w}x${h}`,
    x, y,
    parent,   // con dueño: fuera de Alt+Tab y de la barra de tareas
    chrome: { frame: false, windowControls: false, acceptsFirstMouse: true },
  });
  const win = app.window(id);
  win.setResizable(false);
  win.setAlwaysOnTop(true);
  win.show({ activate: false });
}

// Widget "Ahora": ventanita siempre encima con el bloque actual. Es una
// ventana aparte y visible, así que su página no se congela al ocultar la
// principal.

const WIDGET_W = 300;
const WIDGET_H = 92;

export function createWidget({ app, title, t, info, onChange }) {
  const w = { on: true, open: false, pos: null, lastSaved: '' };

  const state = () => ({ on: w.on, ...info() });

  async function defaultPosition() {
    try {
      const screens = await app.screens();
      const s = screens.find((x) => x.primary) || screens[0];
      const v = (s && s.visible) || s;
      if (v) return { x: v.x + v.width - WIDGET_W - 16, y: v.y + v.height - WIDGET_H - 16 };
    } catch {}
    return { x: 40, y: 40 };
  }

  async function open() {
    if (w.open) return;
    w.open = true;
    const { x, y } = w.pos || await defaultPosition();
    app.win.open('widget', {
      page: 'widget.html',
      title: t('widget.windowTitle', { app: title }),
      size: `${WIDGET_W}x${WIDGET_H}`,
      minSize: `${WIDGET_W}x${WIDGET_H}`,
      x, y,
      chrome: { frame: false, windowControls: false, acceptsFirstMouse: true },
    });
    const win = app.window('widget');
    win.setResizable(false);
    win.setAlwaysOnTop(true);
    win.show({ activate: false });
  }

  function close() {
    if (!w.open) return;
    w.open = false;
    try { app.win.close('widget'); } catch {}
  }

  return {
    state,
    get on() { return w.on; },

    async load() {
      w.on = (await app.store.get('widget')) !== false;
      const pos = await app.store.get('widgetPos');
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        w.pos = { x: pos.x, y: pos.y };
        w.lastSaved = `${pos.x},${pos.y}`;
      }
      if (w.on) open().catch(() => { w.open = false; });
    },

    async setOn(on) {
      w.on = !!on;
      await app.store.set('widget', w.on);
      if (w.on) await open();
      else close();
      this.push();
      onChange();
    },

    push() { app.push('widget', state()); },

    /** Destello al empezar un bloque. */
    alert(b) {
      if (w.on) app.push('widget-alert', { id: b.id, color: b.color });
    },

    /**
     * No hay evento de "ventana movida": se consulta la posición de vez en
     * cuando y solo se guarda si ha cambiado.
     */
    async poll() {
      if (!w.open) return;
      const st = await app.window('widget').getState();
      if (!st) return;
      const key = `${st.x},${st.y}`;
      if (key === w.lastSaved) return;
      w.lastSaved = key;
      w.pos = { x: st.x, y: st.y };
      await app.store.set('widgetPos', w.pos);
    },

    /** El usuario cerró la ventanita por su cuenta (Alt+F4…). */
    closed() {
      if (!w.open) return;
      w.open = false;
      w.on = false;
      app.store.set('widget', false);
      app.push('widget', state());   // que el botón de la página se entere
      onChange();
    },
  };
}

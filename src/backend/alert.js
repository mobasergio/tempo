// Aviso emergente: ventanita centrada y siempre encima que dice qué bloque
// empieza (o cuál ha terminado). Se queda hasta que se cierra, para que un
// cambio de tarea no pase desapercibido como un toast de Windows.

import { primaryVisible, openFloating } from './screen.js';

const ALERT_W = 420;
const ALERT_H = 210;

export function createAlert({ app, title, t, parent, getSettings }) {
  let payload = null;
  let open = false;

  async function centerPosition() {
    const v = await primaryVisible(app);
    return v
      ? { x: Math.round(v.x + (v.width - ALERT_W) / 2), y: Math.round(v.y + (v.height - ALERT_H) / 2) }
      : { x: 200, y: 200 };
  }

  return {
    get current() { return payload; },

    /** kind: 'start' | 'end'; block: el bloque; next: el siguiente (o null). */
    async show(next) {
      payload = next;
      const s = getSettings();
      if (s.notifySound) app.playSound('alert');
      app.attention({ critical: false });
      if (open) {
        app.push('alert', payload);
        try { app.window('alert').show({ activate: false }); } catch {}
        return;
      }
      open = true;
      const { x, y } = await centerPosition();
      // sin activar: no roba el foco ni se cierra con una tecla que ibas a pulsar
      openFloating(app, 'alert', {
        page: 'alert.html', title: t('alert.windowTitle', { app: title }), w: ALERT_W, h: ALERT_H, x, y, parent,
      });
    },

    close() {
      payload = null;
      if (!open) return;
      open = false;
      try { app.win.close('alert'); } catch {}
    },

    /** El usuario la cerró por su cuenta (Alt+F4…). */
    closed() {
      open = false;
      payload = null;
    },
  };
}

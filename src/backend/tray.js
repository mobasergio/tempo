// Bandeja y visibilidad de la ventana principal.
// Cerrar o minimizar oculta la ventana; solo "Salir" termina la app.

import { hhmm } from '../shared/time.js';

export function createTray({ app, title, t, icon, schedule, widget }) {
  const tray = { tooltip: null, labels: {}, visible: true };
  const nowVars = (now) => ({ app: title, title: now.title || t('app.untitled'), end: hhmm(now.end) });

  function labels() {
    const now = schedule.now;
    return {
      now: now ? t('tray.now', nowVars(now)) : t('tray.nothing'),
      show: t(tray.visible ? 'tray.hide' : 'tray.show'),
      widget: t(widget.on ? 'tray.widgetHide' : 'tray.widgetShow'),
      quit: t('tray.quit'),
    };
  }

  const tooltip = () => (schedule.now ? t('tray.tipNow', nowVars(schedule.now)) : title);

  function set() {
    const l = labels();
    tray.labels = l;
    tray.tooltip = tooltip();
    app.tray.set({
      icon,
      template: false,
      primaryAction: true,
      tooltip: tray.tooltip,
      menu: [
        { id: 'now', label: l.now, enabled: false },
        { separator: true },
        { id: 'show', label: l.show },
        { id: 'widget', label: l.widget },
        { separator: true },
        { id: 'quit', label: l.quit },
      ],
    });
  }

  // No hay tray.update: el tooltip solo cambia volviendo a llamar a tray.set.
  // Las etiquetas se parchean con menu.update, que también llega a la bandeja.
  function update() {
    if (tooltip() !== tray.tooltip) return set();
    const l = labels();
    for (const id of ['now', 'show', 'widget']) {
      if (l[id] !== tray.labels[id]) app.menu.update(id, { label: l[id] });
    }
    tray.labels = l;
  }

  function show() {
    app.restore();
    app.show();
    tray.visible = true;
    update();
  }

  function hide() {
    tray.visible = false;
    update();
    app.hide({ app: false });
  }

  return {
    set,
    update,
    show,
    hide,

    toggleWindow() {
      if (tray.visible) hide();
      else show();
    },

    // El cierre con la X lo oculta el launcher sin pasar por el backend y
    // onWindowState no informa de la visibilidad: se vigila la real para
    // mantener la etiqueta de mostrar/ocultar.
    async poll() {
      const st = await app.window('main').getState();
      if (!st) return;
      if (st.visible && st.minimized) return hide();   // por si onWindowState no llegó
      if (st.visible === tray.visible) return;
      tray.visible = st.visible;
      update();
    },
  };
}

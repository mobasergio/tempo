// Bandeja y visibilidad de la ventana principal.
// Cerrar o minimizar oculta la ventana; solo "Salir" termina la app.
// WebView2 congela la página mientras la ventana está oculta (comprobado: ni
// sus timers ni el worker del metrónomo avanzan), así que el metrónomo, que
// vive en la página, se detiene antes de ocultarla.

import { fmtClock, hhmm } from '../shared/time.js';

export function createTray({ app, title, icon, plugins, timer, schedule, widget }) {
  const tray = { tooltip: null, labels: {}, visible: true, metro: false };

  function labels() {
    const s = timer.status;
    const now = schedule.now;
    return {
      show: tray.visible ? 'Ocultar ventana' : 'Mostrar ventana',
      timer: s === 'running' ? 'Pausar temporizador'
        : s === 'paused' ? 'Reanudar temporizador'
        : 'Iniciar temporizador',
      metro: tray.metro ? 'Parar metrónomo' : 'Iniciar metrónomo',
      widget: widget.on ? 'Ocultar widget' : 'Mostrar widget',
      now: now ? `Ahora: ${now.title || 'Sin título'} (hasta ${hhmm(now.end)})` : 'Sin actividad ahora',
    };
  }

  function tooltip() {
    const now = schedule.now;
    if (timer.status === 'running') return `${title} — ${fmtClock(timer.remainingMs())} restantes`;
    if (timer.status === 'paused') return `${title} — en pausa, ${fmtClock(timer.remainingMs())}`;
    if (now) return `${title} — Ahora: ${now.title || 'Sin título'} (hasta ${hhmm(now.end)})`;
    return title;
  }

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
        { separator: true },
        ...(plugins.timer ? [{ id: 'timer', label: l.timer }] : []),
        ...(plugins.metro ? [{ id: 'metro', label: l.metro }] : []),
        { id: 'widget', label: l.widget },
        { separator: true },
        { id: 'quit', label: 'Salir' },
      ],
    });
  }

  // No hay tray.update: el tooltip solo cambia volviendo a llamar a tray.set.
  // Las etiquetas se parchean con menu.update, que también llega a la bandeja.
  function update() {
    if (tooltip() !== tray.tooltip) return set();
    const l = labels();
    for (const id of ['now', 'show', 'timer', 'metro', 'widget']) {
      if ((id === 'timer' || id === 'metro') && !plugins[id]) continue;
      if (l[id] !== tray.labels[id]) app.menu.update(id, { label: l[id] });
    }
    tray.labels = l;
  }

  function stopMetroForHide() {
    if (!tray.metro) return;
    tray.metro = false;   // la página lo confirmará con metroState
    app.push('metro-stop', {});
    app.notify('Metrónomo detenido', 'Se ha parado al ocultar la ventana: con la ventana oculta no puede sonar con precisión.');
  }

  function show() {
    app.restore();
    app.show();
    tray.visible = true;
    update();
  }

  function hide() {
    const wasPlaying = tray.metro;
    stopMetroForHide();
    tray.visible = false;
    update();
    // margen para que la página pare el metrónomo antes de congelarse
    if (wasPlaying) setTimeout(() => app.hide({ app: false }), 150);
    else app.hide({ app: false });
  }

  return {
    set,
    update,
    show,
    hide,
    get visible() { return tray.visible; },

    toggleWindow() {
      if (tray.visible) hide();
      else show();
    },

    setMetro(running) {
      tray.metro = !!running;
      update();
    },

    // El cierre con la X lo oculta el launcher sin pasar por el backend y
    // onWindowState no informa de la visibilidad: se vigila la real para
    // mantener la etiqueta y parar el metrónomo.
    async poll() {
      const st = await app.window('main').getState();
      if (!st) return;
      if (st.visible && st.minimized) return hide();   // por si onWindowState no llegó
      if (st.visible === tray.visible) return;
      tray.visible = st.visible;
      if (!st.visible) stopMetroForHide();
      update();
    },
  };
}

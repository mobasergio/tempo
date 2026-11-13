// Bandeja y visibilidad de la ventana principal.
// Cerrar o minimizar oculta la ventana; solo "Salir" termina la app.
// WebView2 congela la página mientras la ventana está oculta (comprobado: ni
// sus timers ni el worker del metrónomo avanzan), así que el metrónomo, que
// vive en la página, se detiene antes de ocultarla.

import { fmtClock, hhmm } from '../shared/time.js';

export function createTray({ app, title, t, icon, plugins, timer, schedule, widget }) {
  const tray = { tooltip: null, labels: {}, visible: true, metro: false };

  function labels() {
    const s = timer.status;
    const now = schedule.now;
    return {
      show: t(tray.visible ? 'tray.hide' : 'tray.show'),
      timer: t(s === 'running' ? 'tray.timerPause' : s === 'paused' ? 'tray.timerResume' : 'tray.timerStart'),
      metro: t(tray.metro ? 'tray.metroStop' : 'tray.metroStart'),
      widget: t(widget.on ? 'tray.widgetHide' : 'tray.widgetShow'),
      now: now ? t('tray.now', { title: now.title || t('app.untitled'), end: hhmm(now.end) }) : t('tray.nothing'),
      quit: t('tray.quit'),
    };
  }

  function tooltip() {
    const now = schedule.now;
    if (timer.status === 'running') return t('tray.tipRunning', { app: title, time: fmtClock(timer.remainingMs()) });
    if (timer.status === 'paused') return t('tray.tipPaused', { app: title, time: fmtClock(timer.remainingMs()) });
    if (now) return t('tray.tipNow', { app: title, title: now.title || t('app.untitled'), end: hhmm(now.end) });
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
        { id: 'quit', label: l.quit },
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
    app.notify(t('metro.stoppedTitle'), t('metro.stoppedBody'));
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

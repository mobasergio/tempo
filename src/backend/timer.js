// Temporizador. La cuenta atrás vive en el backend (sus timers no se
// ralentizan con la ventana minimizada). Nunca se restan segundos: el tiempo
// restante siempre se calcula a partir de la hora de fin.

import { fmtClock } from '../shared/time.js';

export const MAX_SECONDS = 24 * 60 * 60;
const DEFAULT_SECONDS = 25 * 60;

export function createTimer({ app, title, onChange }) {
  const t = {
    status: 'idle',   // 'idle' | 'running' | 'paused' | 'done'
    duration: 0,      // ms
    endAt: 0,         // Date.now() + restante, solo válido en 'running'
    remaining: 0,     // ms, válido en 'paused' / 'idle' / 'done'
  };
  let lastDuration = DEFAULT_SECONDS;
  let ticker = null;
  let lastShownSecond = -1;

  const remainingMs = () => (t.status === 'running' ? Math.max(0, t.endAt - Date.now()) : t.remaining);

  const snapshot = () => ({
    status: t.status,
    duration: t.duration,
    remaining: remainingMs(),
    lastDuration,
  });

  function publish() {
    const st = snapshot();
    app.push('timer', st);
    if (st.status === 'running' || st.status === 'paused') {
      const prefix = st.status === 'paused' ? '⏸ ' : '';
      app.setTitle(`${prefix}${fmtClock(st.remaining)} — ${title}`);
      const p = st.duration > 0 ? 1 - st.remaining / st.duration : 0;
      app.progress(Math.min(1, Math.max(0, p)));
    }
    onChange();
  }

  function stopTicker() {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  // 250 ms para detectar el final con poca latencia; solo se publica cuando
  // cambia el segundo mostrado (≈ una vez por segundo).
  function startTicker() {
    stopTicker();
    lastShownSecond = -1;
    ticker = setInterval(tick, 250);
    tick();
  }

  function tick() {
    const rem = remainingMs();
    if (rem <= 0) return finish();
    const sec = Math.ceil(rem / 1000);
    if (sec !== lastShownSecond) {
      lastShownSecond = sec;
      publish();
    }
  }

  function finish() {
    stopTicker();
    t.status = 'done';
    t.remaining = 0;
    app.progress(null);
    app.setTitle(`¡Tiempo! — ${title}`);
    app.push('timer', snapshot());
    onChange();
    const mins = Math.round(t.duration / 60000);
    const body = mins >= 1 ? `Han pasado ${mins} min.` : `Han pasado ${Math.round(t.duration / 1000)} s.`;
    app.notify('¡Tiempo terminado!', body, { sound: true });
    app.playSound('alert');
    app.attention({ critical: false });
  }

  return {
    snapshot,
    remainingMs,
    get status() { return t.status; },
    get lastDuration() { return lastDuration; },

    async load() {
      const saved = await app.store.get('lastDuration');
      if (Number.isFinite(saved) && saved >= 1 && saved <= MAX_SECONDS) lastDuration = saved;
    },

    start(seconds) {
      seconds = Math.floor(Number(seconds));
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > MAX_SECONDS) {
        throw new Error('Duración no válida (1 s – 24 h).');
      }
      t.duration = seconds * 1000;
      t.endAt = Date.now() + t.duration;
      t.remaining = t.duration;
      t.status = 'running';
      lastDuration = seconds;
      app.store.set('lastDuration', seconds);
      startTicker();
      return snapshot();
    },

    pause() {
      if (t.status !== 'running') return snapshot();
      t.remaining = remainingMs();
      t.status = 'paused';
      stopTicker();
      publish();
      return snapshot();
    },

    resume() {
      if (t.status !== 'paused') return snapshot();
      t.endAt = Date.now() + t.remaining;
      t.status = 'running';
      startTicker();
      return snapshot();
    },

    reset() {
      stopTicker();
      t.status = 'idle';
      t.remaining = 0;
      t.duration = 0;
      app.progress(null);
      app.setTitle(title);
      app.push('timer', snapshot());
      onChange();
      return snapshot();
    },

    /** Pausa ↔ reanuda, o arranca con la última duración. */
    toggle() {
      if (t.status === 'running') return this.pause();
      if (t.status === 'paused') return this.resume();
      return this.start(lastDuration);
    },
  };
}

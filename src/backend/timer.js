// Temporizador. La cuenta atrás vive en el backend (sus timers no se
// ralentizan con la ventana minimizada). Nunca se restan segundos: el tiempo
// restante siempre se calcula a partir de la hora de fin.

import { fmtClock } from '../shared/time.js';

export const MAX_SECONDS = 24 * 60 * 60;
const DEFAULT_SECONDS = 25 * 60;

export function createTimer({ app, title, t, onChange }) {
  const st = {
    status: 'idle',   // 'idle' | 'running' | 'paused' | 'done'
    duration: 0,      // ms
    endAt: 0,         // Date.now() + restante, solo válido en 'running'
    remaining: 0,     // ms, válido en 'paused' / 'idle' / 'done'
  };
  let lastDuration = DEFAULT_SECONDS;
  let ticker = null;
  let lastShownSecond = -1;

  const remainingMs = () => (st.status === 'running' ? Math.max(0, st.endAt - Date.now()) : st.remaining);

  const snapshot = () => ({
    status: st.status,
    duration: st.duration,
    remaining: remainingMs(),
    lastDuration,
  });

  function publish() {
    const snap = snapshot();
    app.push('timer', snap);
    if (snap.status === 'running' || snap.status === 'paused') {
      const prefix = snap.status === 'paused' ? '⏸ ' : '';
      app.setTitle(`${prefix}${fmtClock(snap.remaining)} — ${title}`);
      const p = snap.duration > 0 ? 1 - snap.remaining / snap.duration : 0;
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
    st.status = 'done';
    st.remaining = 0;
    app.progress(null);
    app.setTitle(t('timer.doneTitle', { app: title }));
    app.push('timer', snapshot());
    onChange();
    const mins = Math.round(st.duration / 60000);
    const body = mins >= 1
      ? t('timer.doneMin', { n: mins })
      : t('timer.doneSec', { n: Math.round(st.duration / 1000) });
    app.notify(t('timer.doneNotify'), body, { sound: true });
    app.playSound('alert');
    app.attention({ critical: false });
  }

  return {
    snapshot,
    remainingMs,
    get status() { return st.status; },
    get lastDuration() { return lastDuration; },

    async load() {
      const saved = await app.store.get('lastDuration');
      if (Number.isFinite(saved) && saved >= 1 && saved <= MAX_SECONDS) lastDuration = saved;
    },

    start(seconds) {
      seconds = Math.floor(Number(seconds));
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > MAX_SECONDS) {
        throw new Error(t('timer.invalid'));
      }
      st.duration = seconds * 1000;
      st.endAt = Date.now() + st.duration;
      st.remaining = st.duration;
      st.status = 'running';
      lastDuration = seconds;
      app.store.set('lastDuration', seconds);
      startTicker();
      return snapshot();
    },

    pause() {
      if (st.status !== 'running') return snapshot();
      st.remaining = remainingMs();
      st.status = 'paused';
      stopTicker();
      publish();
      return snapshot();
    },

    resume() {
      if (st.status !== 'paused') return snapshot();
      st.endAt = Date.now() + st.remaining;
      st.status = 'running';
      startTicker();
      return snapshot();
    },

    reset() {
      stopTicker();
      st.status = 'idle';
      st.remaining = 0;
      st.duration = 0;
      app.progress(null);
      app.setTitle(title);
      app.push('timer', snapshot());
      onChange();
      return snapshot();
    },

    /** Pausa ↔ reanuda, o arranca con la última duración. */
    toggle() {
      if (st.status === 'running') return this.pause();
      if (st.status === 'paused') return this.resume();
      return this.start(lastDuration);
    },
  };
}

// Metrónomo con Web Audio y planificación anticipada ("lookahead scheduler").
// Un Web Worker marca un tick cada 25 ms (los timers de un worker no se
// ralentizan cuando la ventana pierde el foco); en cada tick se programan
// sobre audioContext.currentTime los clics que caen en los próximos 100 ms.
// La parte visual lee una cola de notas programadas con requestAnimationFrame.

const LOOKAHEAD_MS = 25;        // cada cuánto despierta el planificador
const SCHEDULE_AHEAD = 0.1;     // segundos de audio programados por adelantado

// La página se sirve por file://, desde donde Chromium no deja cargar un
// worker por URL: se crea desde un Blob con el código inline.
const WORKER_SRC = `
let id = null;
onmessage = (e) => {
  if (e.data === 'start') {
    if (id === null) id = setInterval(() => postMessage('tick'), ${LOOKAHEAD_MS});
  } else if (e.data === 'stop') {
    clearInterval(id);
    id = null;
  }
};`;

class Metronome {
  constructor({ onBeat } = {}) {
    this.bpm = 100;
    this.beatsPerBar = 4;
    this.accent = true;
    this.volume = 0.8;
    this.onBeat = onBeat || (() => {});

    this.ctx = null;
    this.master = null;
    this.running = false;
    this.beat = 0;
    this.nextNoteTime = 0;
    this.queue = [];
    this.raf = 0;

    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    this.worker = new Worker(url);
    URL.revokeObjectURL(url);
    this.worker.onmessage = () => this.scheduler();
  }

  // Llamar desde un gesto del usuario (clic / tecla): ahí se permite crear
  // y reanudar el AudioContext.
  ensureContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setBpm(bpm) { this.bpm = bpm; }

  setBeatsPerBar(n) {
    this.beatsPerBar = n;
    this.beat = 0;
  }

  setAccent(on) { this.accent = on; }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  start() {
    if (this.running) return;
    this.ensureContext();
    this.running = true;
    this.beat = 0;
    this.queue = [];
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.scheduler();
    this.worker.postMessage('start');
    this.raf = requestAnimationFrame(() => this.draw());
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.worker.postMessage('stop');
    cancelAnimationFrame(this.raf);
    this.queue = [];
    this.onBeat(-1);
  }

  toggle() {
    this.running ? this.stop() : this.start();
    return this.running;
  }

  scheduler() {
    if (!this.running) return;
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD;
    while (this.nextNoteTime < horizon) {
      this.scheduleClick(this.beat, this.nextNoteTime);
      this.nextNoteTime += 60 / this.bpm;
      this.beat = (this.beat + 1) % this.beatsPerBar;
    }
  }

  scheduleClick(beat, time) {
    const accented = this.accent && beat === 0;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = accented ? 'square' : 'sine';
    osc.frequency.value = accented ? 1760 : 880;

    const peak = accented ? 0.6 : 0.45;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peak, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.001, time + (accented ? 0.05 : 0.035));

    osc.connect(env).connect(this.master);
    osc.start(time);
    osc.stop(time + 0.06);

    this.queue.push({ beat, time });
    if (this.queue.length > 32) this.queue.shift();   // ventana oculta: rAF no consume
  }

  // Ilumina el pulso que está sonando ahora. Con la ventana oculta rAF se
  // detiene; al volver se descartan las notas pasadas y solo se pinta la última.
  draw() {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    let current = null;
    while (this.queue.length && this.queue[0].time <= now) current = this.queue.shift();
    if (current) this.onBeat(current.beat);
    this.raf = requestAnimationFrame(() => this.draw());
  }
}

// Tap tempo: media de los intervalos entre los últimos toques.
class TapTempo {
  constructor({ maxTaps = 5, resetAfterMs = 2000 } = {}) {
    this.maxTaps = maxTaps;
    this.resetAfterMs = resetAfterMs;
    this.taps = [];
  }

  // Devuelve el BPM calculado, o null si aún no hay suficientes toques.
  tap(now = performance.now()) {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && now - last > this.resetAfterMs) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > this.maxTaps) this.taps.shift();
    if (this.taps.length < 2) return null;
    const avg = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
    return 60000 / avg;
  }
}

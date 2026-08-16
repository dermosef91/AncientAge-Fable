// Lightweight procedural audio via WebAudio. No assets — everything is
// synthesized. Sounds are throttled so crowds don't become noise.
import type { SimEvent } from '../core/types';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private lastPlay = new Map<string, number>();

  constructor() {
    this.muted = localStorage.getItem('aa_muted') === '1';
  }

  /** Call from a user gesture to unlock audio. */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem('aa_muted', m ? '1' : '0');
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  private throttled(key: string, minGap: number): boolean {
    const now = performance.now();
    const last = this.lastPlay.get(key) ?? -1e9;
    if (now - last < minGap) return true;
    this.lastPlay.set(key, now);
    return false;
  }

  private tone(freq: number, dur: number, opts: {
    type?: OscillatorType; gain?: number; slide?: number; attack?: number; delay?: number;
  } = {}) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + dur);
    const gain = opts.gain ?? 0.12;
    const atk = opts.attack ?? 0.008;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, opts: {
    freq?: number; q?: number; gain?: number; type?: BiquadFilterType; slide?: number; delay?: number;
  } = {}) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = opts.type ?? 'bandpass';
    filt.frequency.setValueAtTime(opts.freq ?? 1200, t0);
    if (opts.slide !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(30, opts.slide), t0 + dur);
    filt.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    const gain = opts.gain ?? 0.1;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ---------------- UI sounds ----------------
  select() { if (!this.throttled('select', 60)) this.tone(660, 0.07, { type: 'triangle', gain: 0.08 }); }
  command() { if (!this.throttled('command', 80)) { this.tone(440, 0.06, { type: 'triangle', gain: 0.07 }); this.tone(560, 0.06, { type: 'triangle', gain: 0.06, delay: 0.05 }); } }
  error() { if (!this.throttled('error', 200)) this.tone(190, 0.18, { type: 'square', gain: 0.05, slide: 150 }); }
  place() { this.noise(0.12, { freq: 500, gain: 0.1, type: 'lowpass' }); this.tone(320, 0.1, { type: 'triangle', gain: 0.08 }); }
  button() { if (!this.throttled('button', 60)) this.tone(520, 0.05, { type: 'triangle', gain: 0.06 }); }

  // ---------------- world sounds ----------------
  chop() { if (!this.throttled('chop', 130)) this.noise(0.08, { freq: 900 + Math.random() * 400, q: 2, gain: 0.09 }); }
  mine() { if (!this.throttled('mine', 130)) { this.noise(0.05, { freq: 2400, q: 4, gain: 0.07 }); this.tone(1800 + Math.random() * 600, 0.04, { gain: 0.03 }); } }
  hammer() { if (!this.throttled('hammer', 180)) { this.noise(0.06, { freq: 700, q: 2, gain: 0.09 }); this.tone(240, 0.08, { type: 'triangle', gain: 0.05 }); } }
  deposit() { if (!this.throttled('deposit', 250)) { this.tone(880, 0.06, { type: 'sine', gain: 0.045 }); this.tone(1320, 0.07, { type: 'sine', gain: 0.035, delay: 0.04 }); } }
  arrow() { if (!this.throttled('arrow', 90)) this.noise(0.16, { freq: 2600, q: 6, gain: 0.05, slide: 900 }); }
  swing() { if (!this.throttled('swing', 100)) this.noise(0.1, { freq: 500, q: 1.4, gain: 0.06, slide: 1600 }); }
  impact() { if (!this.throttled('impact', 90)) { this.tone(120, 0.1, { type: 'triangle', gain: 0.1, slide: 70 }); this.noise(0.06, { freq: 900, gain: 0.06 }); } }
  death() { if (!this.throttled('death', 150)) this.tone(300, 0.3, { type: 'sawtooth', gain: 0.05, slide: 90 }); }
  boom() {
    this.tone(90, 0.6, { type: 'triangle', gain: 0.22, slide: 38 });
    this.noise(0.7, { freq: 400, type: 'lowpass', gain: 0.2, slide: 90 });
    this.noise(0.25, { freq: 1600, gain: 0.08 });
  }
  trained() { if (!this.throttled('trained', 300)) { this.tone(523, 0.08, { type: 'triangle', gain: 0.07 }); this.tone(659, 0.1, { type: 'triangle', gain: 0.07, delay: 0.07 }); } }
  built() { this.tone(392, 0.1, { type: 'triangle', gain: 0.09 }); this.tone(523, 0.12, { type: 'triangle', gain: 0.09, delay: 0.08 }); this.tone(659, 0.16, { type: 'triangle', gain: 0.09, delay: 0.16 }); }
  research() { for (let i = 0; i < 4; i++) this.tone(523 * Math.pow(1.25, i), 0.12, { type: 'sine', gain: 0.06, delay: i * 0.09 }); }
  warn() {
    if (this.throttled('warn', 4000)) return;
    this.tone(220, 0.5, { type: 'sawtooth', gain: 0.12, slide: 260 });
    this.tone(220, 0.5, { type: 'sawtooth', gain: 0.1, slide: 260, delay: 0.55 });
  }
  victory() {
    const notes = [392, 523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone(n, 0.5, { type: 'triangle', gain: 0.12, delay: i * 0.16 }));
    this.tone(784, 1.2, { type: 'sine', gain: 0.09, delay: 0.9 });
  }
  defeat() {
    const notes = [392, 349, 311, 262];
    notes.forEach((n, i) => this.tone(n, 0.6, { type: 'triangle', gain: 0.1, delay: i * 0.3 }));
  }

  /** React to simulation events. */
  handleEvents(events: SimEvent[], isExplored: (x: number, z: number) => boolean) {
    for (const e of events) {
      switch (e.t) {
        case 'gatherTick':
          if (!isExplored(e.x, e.z)) break;
          if (e.kind === 'tree') this.chop();
          else if (e.kind === 'stone' || e.kind === 'gold') this.mine();
          else if (Math.random() < 0.3) this.chop();
          break;
        case 'shoot': if (isExplored(e.x, e.z)) this.arrow(); break;
        case 'hit': if (isExplored(e.x, e.z)) this.impact(); break;
        case 'die': if (isExplored(e.x, e.z)) this.death(); break;
        case 'boom': if (isExplored(e.x, e.z)) this.boom(); break;
        case 'built': if (e.owner === 0) this.built(); break;
        case 'trained': if (e.owner === 0) this.trained(); break;
        case 'research': if (e.owner === 0) this.research(); break;
        case 'deposit': if (e.owner === 0) this.deposit(); break;
        case 'underattack': this.warn(); break;
        case 'place': if (e.owner === 0) this.place(); break;
        case 'trade': if (e.owner === 0) this.deposit(); break;
        case 'wonderStart': if (e.owner === 0) this.research(); else this.warn(); break;
      }
    }
  }
}

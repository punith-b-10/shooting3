import type * as THREE from 'three';
import type { WeaponId } from '../core/types';

type Ambience = 'desert' | 'city' | 'industrial' | 'forest';

/** Fully procedural WebGL-free sound: every effect is synthesised with the Web Audio API — no audio files to load or license. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private volume = 0.7;
  private ambNodes: AudioNode[] = [];
  private ambTimer: number | null = null;
  private ambKind: Ambience | null = null;
  private lx = 0; private lz = 0; private lyaw = 0;
  private voices = 0;
  private surface: Ambience = 'desert';

  /** Must be called from a user gesture (click) the first time. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.5;
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.setVolume(this.volume);

    // 2 s of white noise reused by every effect
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Synthetic room tail
    const len = Math.floor(ctx.sampleRate * 1.3);
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const a = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = imp;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.22;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.sfx);
    if (this.ambKind) this.ambience(this.ambKind);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  setListener(pos: THREE.Vector3, yaw: number) {
    this.lx = pos.x; this.lz = pos.z; this.lyaw = yaw;
  }

  setSurface(k: Ambience) {
    this.surface = k;
  }

  /** Route a sound through distance attenuation, stereo pan and a darker tone with distance. */
  private out(x: number | null, z: number | null, gain: number, tail = 0): { node: AudioNode; ok: boolean } {
    const ctx = this.ctx!;
    let g = gain;
    let pan = 0;
    let lp = 20000;
    if (x !== null && z !== null) {
      const dx = x - this.lx, dz = z - this.lz;
      const d = Math.hypot(dx, dz);
      g *= 1 / (1 + d / 10);
      if (g < 0.01) return { node: ctx.destination, ok: false };
      // listener right vector for yaw: forward = (-sin, -cos), right = (cos, -sin)
      const rx = Math.cos(this.lyaw), rz = -Math.sin(this.lyaw);
      pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.9 : 0;
      lp = Math.max(1500, 16000 - d * 260);
    }
    const gn = ctx.createGain();
    gn.gain.value = g;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    gn.connect(f).connect(p).connect(this.sfx);
    if (tail > 0) {
      const s = ctx.createGain();
      s.gain.value = tail;
      gn.connect(s).connect(this.reverbSend);
    }
    return { node: gn, ok: true };
  }

  private burst(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, sweepTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private busy(): boolean {
    if (!this.ctx || this.ctx.state !== 'running') return true;
    if (this.voices > 28) return true;
    this.voices++;
    setTimeout(() => this.voices--, 220);
    return false;
  }

  shot(w: WeaponId, x: number | null, z: number | null) {
    if (this.busy()) return;
    const t = this.ctx!.currentTime;
    const gainMul = x === null ? 1 : 1.5;
    const cfg: Record<WeaponId, { crack: number; dur: number; thump: number; gain: number; tail: number }> = {
      pistol: { crack: 2600, dur: 0.14, thump: 150, gain: 0.5, tail: 0.5 },
      rifle: { crack: 1900, dur: 0.2, thump: 95, gain: 0.7, tail: 0.7 },
      smg: { crack: 3000, dur: 0.11, thump: 130, gain: 0.5, tail: 0.4 },
      shotgun: { crack: 1100, dur: 0.34, thump: 70, gain: 1.0, tail: 0.9 },
      sniper: { crack: 1400, dur: 0.6, thump: 55, gain: 1.1, tail: 1.2 },
    };
    const c = cfg[w];
    const { node, ok } = this.out(x, z, c.gain * gainMul, c.tail);
    if (!ok) return;
    this.burst(node, t, c.dur, 'bandpass', c.crack, 0.7, 1.0, c.crack * 0.35);
    this.burst(node, t, c.dur * 0.6, 'highpass', 3500, 0.5, 0.35);
    this.tone(node, t, c.dur * 0.9, c.thump * 2, c.thump * 0.4, 0.9);
    if (w === 'sniper') this.burst(node, t + 0.05, 0.8, 'lowpass', 500, 0.5, 0.5, 120);
  }

  dry(x: number | null, z: number | null) {
    if (this.busy()) return;
    const { node, ok } = this.out(x, z, 0.5);
    if (ok) this.burst(node, this.ctx!.currentTime, 0.04, 'highpass', 4200, 2, 0.5);
  }

  reload(dur: number, x: number | null, z: number | null) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const { node, ok } = this.out(x, z, 0.55);
    if (!ok) return;
    const click = (at: number, f: number, g: number) => {
      this.burst(node, t + at, 0.05, 'bandpass', f, 6, g);
      this.tone(node, t + at, 0.05, f * 0.5, f * 0.3, g * 0.3, 'square');
    };
    click(dur * 0.22, 2200, 0.6); // mag out
    click(dur * 0.58, 1500, 0.8); // mag in
    click(dur * 0.82, 2800, 0.7); // bolt / rack
    click(dur * 0.88, 1800, 0.6);
  }

  switchWeapon(x: number | null, z: number | null) {
    if (this.busy()) return;
    const { node, ok } = this.out(x, z, 0.4);
    if (ok) this.burst(node, this.ctx!.currentTime, 0.07, 'bandpass', 1800, 4, 0.5);
  }

  step(x: number, z: number, sprint: boolean) {
    if (this.busy()) return;
    const k = this.surface;
    const { node, ok } = this.out(x, z, sprint ? 0.55 : 0.38);
    if (!ok) return;
    const t = this.ctx!.currentTime;
    const f = k === 'industrial' ? 1800 : k === 'city' ? 900 : k === 'forest' ? 420 : 520;
    this.burst(node, t, k === 'industrial' ? 0.1 : 0.12, 'bandpass', f * (0.85 + Math.random() * 0.3), 1.2, 0.9);
    this.tone(node, t, 0.08, 120, 60, 0.3);
  }

  impact(x: number, z: number) {
    if (this.busy()) return;
    const { node, ok } = this.out(x, z, 0.35);
    if (!ok) return;
    const t = this.ctx!.currentTime;
    this.burst(node, t, 0.07, 'bandpass', 2400 + Math.random() * 1200, 3, 0.6);
    if (Math.random() < 0.3) this.tone(node, t + 0.02, 0.25, 3000, 1800, 0.07); // ricochet whine
  }

  fleshHit(x: number, z: number) {
    if (this.busy()) return;
    const { node, ok } = this.out(x, z, 0.5);
    if (ok) {
      this.burst(node, this.ctx!.currentTime, 0.1, 'lowpass', 700, 0.8, 0.8);
      this.tone(node, this.ctx!.currentTime, 0.08, 180, 70, 0.5);
    }
  }

  hitMarker(head: boolean, kill: boolean) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { node } = this.out(null, null, 0.4);
    const t = this.ctx.currentTime;
    this.tone(node, t, 0.06, head ? 2600 : 1800, head ? 2600 : 1800, 0.6, 'triangle');
    if (head) this.tone(node, t + 0.05, 0.08, 3400, 3400, 0.5, 'triangle');
    if (kill) this.tone(node, t + 0.02, 0.18, 900, 500, 0.45, 'sine');
  }

  hurt() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { node } = this.out(null, null, 0.7);
    const t = this.ctx.currentTime;
    this.burst(node, t, 0.15, 'lowpass', 500, 0.8, 0.9);
    this.tone(node, t, 0.15, 140, 60, 0.7);
  }

  death() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { node } = this.out(null, null, 0.7);
    this.tone(node, this.ctx.currentTime, 0.7, 220, 40, 0.6, 'sawtooth');
  }

  explosion(x: number, z: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { node, ok } = this.out(x, z, 2.2, 1.0);
    if (!ok) return;
    const t = this.ctx.currentTime;
    this.burst(node, t, 1.4, 'lowpass', 1400, 0.7, 1.4, 90);
    this.tone(node, t, 1.0, 90, 25, 1.4);
    this.burst(node, t, 0.3, 'bandpass', 2500, 0.6, 0.8);
  }

  uiClick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { node } = this.out(null, null, 0.3);
    this.tone(node, this.ctx.currentTime, 0.05, 900, 600, 0.5, 'square');
  }

  beep(high = false) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { node } = this.out(null, null, 0.4);
    this.tone(node, this.ctx.currentTime, high ? 0.45 : 0.15, high ? 1320 : 880, high ? 1320 : 880, 0.6, 'sine');
  }

  stinger(win: boolean) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { node } = this.out(null, null, 0.5);
    const t = this.ctx.currentTime;
    const notes = win ? [523, 659, 784, 1047] : [392, 349, 311, 262];
    notes.forEach((f, i) => this.tone(node, t + i * 0.16, 0.5, f, f, 0.4, 'triangle'));
  }

  // ------------------------------------------------------------------ ambience
  ambience(kind: Ambience | null) {
    this.stopAmbience();
    this.ambKind = kind;
    if (!kind || !this.ctx) return;
    const ctx = this.ctx;
    const mk = (type: BiquadFilterType, f: number, q: number, g: number, lfoRate: number, lfoDepth: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const gn = ctx.createGain();
      gn.gain.value = g;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoRate;
      const ld = ctx.createGain();
      ld.gain.value = lfoDepth;
      lfo.connect(ld).connect(gn.gain);
      src.connect(fl).connect(gn).connect(this.amb);
      src.start();
      lfo.start();
      this.ambNodes.push(src, lfo, gn, fl, ld);
    };
    const osc = (f: number, g: number) => {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const gn = ctx.createGain(); gn.gain.value = g;
      o.connect(gn).connect(this.amb);
      o.start();
      this.ambNodes.push(o, gn);
    };
    if (kind === 'desert') { mk('bandpass', 420, 0.6, 0.18, 0.11, 0.1); mk('highpass', 2500, 0.5, 0.025, 0.07, 0.02); }
    if (kind === 'city') { mk('lowpass', 220, 0.5, 0.22, 0.05, 0.05); mk('bandpass', 700, 0.5, 0.05, 0.09, 0.03); osc(60, 0.04); }
    if (kind === 'industrial') { osc(50, 0.07); osc(100.4, 0.04); osc(150.7, 0.015); mk('lowpass', 300, 0.5, 0.12, 0.08, 0.04); }
    if (kind === 'forest') { mk('bandpass', 900, 0.4, 0.14, 0.13, 0.08); mk('highpass', 3000, 0.4, 0.03, 0.2, 0.02); }
    this.surface = kind;
    const schedule = () => {
      this.ambTimer = window.setTimeout(() => {
        this.ambientEvent(kind);
        schedule();
      }, 3500 + Math.random() * 6500);
    };
    schedule();
  }

  private ambientEvent(kind: Ambience) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const x = this.lx + (Math.random() - 0.5) * 120, z = this.lz + (Math.random() - 0.5) * 120;
    const { node, ok } = this.out(x, z, 0.5, 0.6);
    if (!ok) return;
    if (kind === 'forest') {
      for (let i = 0; i < 3; i++) this.tone(node, t + i * 0.13, 0.1, 3200 + Math.random() * 800, 4200, 0.25);
    } else if (kind === 'industrial') {
      this.tone(node, t, 0.6, 320, 300, 0.4, 'triangle');
      this.burst(node, t, 0.2, 'bandpass', 1500, 4, 0.5);
    } else if (kind === 'city') {
      this.tone(node, t, 0.5, 420, 400, 0.18, 'sawtooth'); // distant horn
    } else {
      this.tone(node, t, 0.9, 1800, 1300, 0.12); // distant bird / hawk
    }
  }

  stopAmbience() {
    if (this.ambTimer) clearTimeout(this.ambTimer);
    this.ambTimer = null;
    for (const n of this.ambNodes) {
      try { (n as AudioScheduledSourceNode).stop?.(); } catch { /* already stopped */ }
      n.disconnect();
    }
    this.ambNodes = [];
  }

  /** Duck ambience in menus. */
  setAmbienceLevel(v: number) {
    if (this.ctx) this.amb.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }
}

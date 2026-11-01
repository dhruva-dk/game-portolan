// Every sound is synthesised here with Web Audio: guns, hits and splashes placed around the camera, the sea and wind
// beneath them, the storm when you are in it, a gull's cry, a leviathan's song, and a plucked pentatonic score that
// quickens as the circle closes. Nothing is loaded.
import type { GameEvent, Match, WeaponKind } from './game.ts';
import type { Stage } from './scene.ts';

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Sound {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly sfx: GainNode;
  private readonly music: GainNode;
  private readonly amb: GainNode;
  private readonly verb: GainNode;
  private readonly noise: AudioBuffer;
  private readonly ks = new Map<number, AudioBuffer>();
  private readonly waves: { g: GainNode; f: BiquadFilterNode };
  private readonly wind: { g: GainNode; f: BiquadFilterNode };
  private readonly storm: { g: GainNode; f: BiquadFilterNode };
  private readonly rain: { g: GainNode };
  private nextNote = 0;
  private bar = 0;
  private beat = 0;
  private intensity = 0;
  private chord = 0;
  private musicOn = true;
  private lastFire = new Map<number, number>();
  private x = 0; private z = 0; private yaw = 0;

  constructor(music: number, sfx: number) {
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'interactive' }));
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = this.gain(1, comp);
    this.sfx = this.gain(sfx, this.master);
    this.music = this.gain(music * 0.5, this.master);
    this.amb = this.gain(sfx * 0.9, this.master);
    // a hall of sea air: decaying noise as the impulse
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    conv.buffer = ir;
    conv.connect(this.master);
    this.verb = this.gain(0.32, conv);
    this.music.connect(this.verb);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // beds that run all the time and are faded in and out
    this.waves = this.bed('lowpass', 520, 0.6);
    this.wind = this.bed('bandpass', 700, 1.2);
    this.storm = this.bed('lowpass', 240, 0.8);
    this.rain = { g: this.bed('highpass', 2600, 0.4).g };
    // the browser starts muted until a touch
    const wake = () => { if (ctx.state !== 'running') void ctx.resume(); };
    addEventListener('pointerdown', wake);
    addEventListener('keydown', wake);
  }

  private gain(v: number, to: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(to);
    return g;
  }

  private bed(type: BiquadFilterType, f: number, q: number): { g: GainNode; f: BiquadFilterNode } {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const fl = this.ctx.createBiquadFilter();
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = this.gain(0, this.amb);
    src.connect(fl).connect(g);
    src.start();
    return { g, f: fl };
  }

  setVolumes(music: number, sfx: number): void {
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(music * 0.5, t, 0.1);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.1);
    this.amb.gain.setTargetAtTime(sfx * 0.9, t, 0.1);
  }

  pause(on: boolean): void {
    this.master.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, 0.15);
  }

  // ---------------------------------------------------------------- building blocks

  /** A voice: gain, then pan, into the effects bus and a little into the hall. */
  private voice(vol: number, pan = 0, wet = 0.2): GainNode {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.sfx);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; p.connect(s); s.connect(this.verb); }
    return g;
  }

  private tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, attack = 0.004): void {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(out: AudioNode, type: BiquadFilterType, f0: number, f1: number, q: number, t: number, dur: number, vol: number, attack = 0.003): void {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  /** A bell: two detuned partials over a sine, for chimes and the score's high notes. */
  private bell(out: AudioNode, f: number, t: number, dur: number, vol: number): void {
    this.tone(out, 'sine', f, f, t, dur, vol, 0.004);
    this.tone(out, 'sine', f * 2.76, f * 2.76, t, dur * 0.4, vol * 0.25, 0.002);
    this.tone(out, 'triangle', f * 2, f * 2, t, dur * 0.6, vol * 0.15, 0.003);
  }

  /** A plucked string, Karplus-Strong, rendered once per pitch. */
  private pluck(out: AudioNode, note: number, t: number, vol: number): void {
    let buf = this.ks.get(note);
    if (!buf) {
      const sr = this.ctx.sampleRate, len = Math.floor(sr * 2.2);
      buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0), N = Math.round(sr / midi(note)), ring = new Float32Array(N);
      for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
      let p = 0;
      for (let i = 0; i < len; i++) {
        const nx = (p + 1) % N, v = (ring[p] + ring[nx]) * 0.5 * 0.996;
        d[i] = ring[p];
        ring[p] = v;
        p = nx;
      }
      this.ks.set(note, buf);
    }
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = buf;
    g.gain.value = vol;
    s.connect(g).connect(out);
    s.start(t);
  }

  /** Volume and pan for a sound at a point, heard from the camera; null when too far to matter. */
  private at(x: number, z: number, far: number): [number, number] | null {
    const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz);
    if (d > far) return null;
    const k = Math.pow(1 - d / far, 1.6);
    if (k < 0.01) return null;
    const right = dx * -Math.cos(this.yaw) + dz * Math.sin(this.yaw);
    return [k, Math.max(-0.85, Math.min(0.85, right / Math.max(d, 8)))];
  }

  // ---------------------------------------------------------------- the interface

  ui(kind: string): void {
    const t = this.ctx.currentTime, v = this.voice(0.5, 0, 0.1);
    switch (kind) {
      case 'tap': this.tone(v, 'triangle', 1100, 900, t, 0.06, 0.25); break;
      case 'deny': this.tone(v, 'square', 160, 120, t, 0.16, 0.12); break;
      case 'hail': this.gullCry(t, 0.6, 0); break;
      case 'banner': this.tone(v, 'sawtooth', 147, 147, t, 0.9, 0.06, 0.08); this.tone(v, 'sawtooth', 220, 220, t + 0.18, 0.9, 0.05, 0.08); break;
      case 'play':
        this.hiss(v, 'bandpass', 400, 2400, 1, t, 0.7, 0.4, 0.2);
        [0, 4, 7, 12].forEach((n, i) => this.bell(v, midi(74 + n), t + 0.08 * i, 1.2, 0.25));
        break;
      case 'victory':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.bell(this.voice(0.6, (i % 3 - 1) * 0.4, 0.4), midi(67 + n), t + 0.11 * i, 2.2, 0.35));
        break;
      case 'results': [0, 7, 12].forEach((n, i) => this.bell(v, midi(62 + n), t + 0.15 * i, 1.6, 0.25)); break;
    }
  }

  private gullCry(t: number, vol: number, pan: number): void {
    const v = this.voice(vol, pan, 0.35), ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), tt = t + i * 0.2;
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1300, tt);
      o.frequency.linearRampToValueAtTime(1900, tt + 0.05);
      o.frequency.exponentialRampToValueAtTime(1050, tt + 0.17);
      m.frequency.value = 38; mg.gain.value = 120;
      m.connect(mg).connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2100; f.Q.value = 2;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.25, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.18);
      o.connect(f).connect(g).connect(v);
      o.start(tt); m.start(tt); o.stop(tt + 0.2); m.stop(tt + 0.2);
    }
  }

  private whale(t: number, vol: number, pan: number): void {
    const v = this.voice(vol, pan, 0.9), ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 1.6);
    o.frequency.exponentialRampToValueAtTime(170, t + 3.4);
    vib.frequency.value = 5; vg.gain.value = 6;
    vib.connect(vg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    o.connect(g).connect(v);
    o.start(t); vib.start(t); o.stop(t + 3.7); vib.stop(t + 3.7);
    this.tone(v, 'triangle', 220, 520, t + 0.2, 3, 0.08, 0.8);
  }

  // ---------------------------------------------------------------- the match

  private gun(kind: WeaponKind, t: number, vol: number, pan: number, mine: boolean): void {
    const v = this.voice(vol, pan, mine ? 0.15 : 0.35);
    switch (kind) {
      case 'cannon':
        this.tone(v, 'sine', 110, 38, t, 0.32, 0.9);
        this.hiss(v, 'lowpass', 2400, 300, 0.7, t, 0.38, 0.7);
        this.hiss(v, 'highpass', 4000, 4000, 0.5, t, 0.04, 0.25);
        break;
      case 'scatter':
        this.tone(v, 'sine', 95, 40, t, 0.28, 0.8);
        this.hiss(v, 'bandpass', 1600, 400, 0.6, t, 0.45, 0.9);
        this.hiss(v, 'highpass', 5000, 3000, 0.7, t + 0.02, 0.12, 0.3);
        break;
      case 'harpoon':
        this.tone(v, 'sawtooth', 240, 90, t, 0.22, 0.3);
        this.hiss(v, 'bandpass', 900, 5200, 2, t, 0.25, 0.45);
        this.tone(v, 'triangle', 80, 60, t, 0.4, 0.5);
        break;
      case 'mortar':
        this.tone(v, 'sine', 75, 30, t, 0.6, 1);
        this.hiss(v, 'lowpass', 900, 150, 0.8, t, 0.55, 0.7);
        break;
      case 'repeater':
        this.tone(v, 'square', 150, 70, t, 0.07, 0.18);
        this.hiss(v, 'bandpass', 2200, 1200, 1.2, t, 0.08, 0.5);
        break;
    }
  }

  react(m: Match, events: readonly GameEvent[], stage: Stage): void {
    const t = this.ctx.currentTime, me = m.player;
    if (this.ctx.state !== 'running') return;
    this.x = stage.camera.position.x; this.z = stage.camera.position.z;
    this.yaw = stage.rig.yaw;
    for (const e of events) {
      switch (e.t) {
        case 'fire': {
          const mine = e.ship === me;
          // a repeater's stream is thinned for distant ships
          const last = this.lastFire.get(e.ship) ?? -1;
          if (!mine && e.kind === 'repeater' && t - last < 0.18) break;
          this.lastFire.set(e.ship, t);
          const a = mine ? [1, 0] as [number, number] : this.at(e.x, e.z, 420);
          if (a) this.gun(e.kind, t, (mine ? 0.85 : 0.75) * a[0], a[1], mine);
          break;
        }
        case 'impact': {
          const a = this.at(e.x, e.z, e.kind === 'mortar' ? 500 : 220);
          if (!a) break;
          const v = this.voice(a[0], a[1], 0.3);
          if (e.kind === 'mortar') { this.tone(v, 'sine', 90, 28, t, 0.9, 1); this.hiss(v, 'lowpass', 1800, 120, 0.7, t, 1.1, 0.9); }
          if (e.on === 'water') this.hiss(v, 'bandpass', 2800, 500, 0.8, t, 0.5, 0.35 + e.big * 0.3, 0.02);
          else if (e.on === 'land') { this.tone(v, 'sine', 140, 50, t, 0.2, 0.4); this.hiss(v, 'lowpass', 1400, 200, 0.6, t, 0.3, 0.4); }
          break;
        }
        case 'hit': {
          if (e.kind === 'storm') {
            if (e.target === me) { const v = this.voice(0.6, 0, 0.3); this.hiss(v, 'bandpass', 300, 120, 2, t, 0.5, 0.6); this.tone(v, 'sawtooth', 70, 50, t, 0.4, 0.15); }
            break;
          }
          if (e.src === me && e.target !== me) {
            // the hitmarker's tick: shield rings glassy, hull knocks, a crit sings
            const v = this.voice(0.55, 0, 0.1);
            if (e.shield > 0 && e.hull <= 0) { this.tone(v, 'sine', 2600, 2500, t, 0.12, 0.3); this.tone(v, 'sine', 3900, 3800, t, 0.09, 0.15); }
            else this.tone(v, 'triangle', 1500, 1300, t, 0.06, 0.45);
            if (e.crit) { this.bell(v, 2093, t + 0.03, 0.35, 0.3); this.bell(v, 3136, t + 0.07, 0.3, 0.2); }
            if (e.broke) { this.hiss(v, 'highpass', 3000, 7000, 0.7, t, 0.4, 0.5); this.tone(v, 'sine', 1800, 300, t, 0.5, 0.25); }
          }
          if (e.target === me) {
            const v = this.voice(0.8, 0, 0.2);
            if (e.shield > 0) { this.tone(v, 'sine', 900, 600, t, 0.2, 0.3); this.hiss(v, 'bandpass', 2400, 1200, 3, t, 0.15, 0.3); }
            if (e.hull > 0) { this.tone(v, 'sine', 120, 45, t, 0.3, 0.8); this.hiss(v, 'bandpass', 500, 220, 1.4, t, 0.3, 0.8); }
            if (e.broke) this.hiss(v, 'highpass', 2500, 6000, 0.6, t, 0.6, 0.6);
          } else if (e.src !== me) {
            const a = this.at(e.x, e.z, 200);
            if (a) this.tone(this.voice(a[0] * 0.5, a[1], 0.4), 'sine', 140, 60, t, 0.25, 0.5);
          }
          break;
        }
        case 'elim': {
          const s = m.ships[e.victim];
          const a = e.victim === me ? [1, 0] as [number, number] : this.at(s.x, s.z, 600);
          if (a) {
            const v = this.voice(a[0], a[1], 0.6);
            this.tone(v, 'sine', 70, 25, t, 1.4, 1);
            this.hiss(v, 'lowpass', 1200, 80, 0.6, t, 1.8, 0.8);
            this.hiss(v, 'bandpass', 600, 200, 1.5, t + 0.4, 2.4, 0.3, 0.6);
          }
          if (e.killer === me && e.victim !== me) {
            const v = this.voice(0.7, 0, 0.5);
            [0, 7, 12, 16].forEach((n, i) => this.bell(v, midi(76 + n), t + 0.06 + i * 0.07, 1.2, 0.3));
          }
          break;
        }
        case 'pickup':
          if (e.ship === me) {
            const v = this.voice(0.55, 0, 0.3), r = e.item.rarity;
            this.tone(v, 'triangle', 660, 660, t, 0.08, 0.25);
            this.bell(v, midi(79 + PENTA[r % 5]), t + 0.06, 0.6 + r * 0.25, 0.25 + r * 0.04);
            if (r >= 3) [12, 16, 19].forEach((n, i) => this.bell(v, midi(79 + n), t + 0.15 + i * 0.06, 0.9, 0.12));
          }
          break;
        case 'mote':
          if (e.ship === me) {
            const n = 72 + PENTA[e.chain % 5] + 12 * Math.min(2, Math.floor(e.chain / 5));
            this.bell(this.voice(0.4, 0, 0.4), midi(n), t, 0.7, 0.3);
          }
          break;
        case 'clam': {
          const a = this.at(e.x, e.z, 150);
          if (!a) break;
          const v = this.voice(a[0] * 0.8, a[1], 0.4);
          this.tone(v, 'sawtooth', 90, 140, t, 0.35, 0.12, 0.1);
          if (e.ship === me) [0, 4, 7, 9, 12].forEach((k, i) => this.bell(v, midi(84 + k), t + 0.25 + i * 0.05, 0.8, 0.18));
          break;
        }
        case 'gust': {
          const s = m.ships[e.ship], a = e.ship === me ? [1, 0] as [number, number] : this.at(s.x, s.z, 150);
          if (a) this.hiss(this.voice(a[0] * 0.8, a[1], 0.3), 'bandpass', 300, 1800, 1.4, t, 0.7, 0.8, 0.15);
          break;
        }
        case 'drop':
          if (e.ship === me) this.hiss(this.voice(0.6, 0, 0.3), 'bandpass', 1800, 300, 1, t, 1.2, 0.6, 0.1);
          break;
        case 'splash': {
          const a = e.ship === me ? [1, 0] as [number, number] : this.at(e.x, e.z, 200);
          if (a) { const v = this.voice(a[0], a[1], 0.4); this.hiss(v, 'lowpass', 3500, 300, 0.6, t, 1.2, 0.9, 0.02); this.tone(v, 'sine', 90, 40, t, 0.5, 0.6); }
          break;
        }
        case 'scrape':
          if (e.ship === me) this.hiss(this.voice(0.5 * Math.min(1, e.power + 0.3), 0, 0.2), 'bandpass', 380, 200, 2, t, 0.5, 0.6, 0.05);
          break;
        case 'ram': {
          const a = e.a === me || e.b === me ? [1, 0] as [number, number] : this.at(e.x, e.z, 200);
          if (a) { const v = this.voice(a[0], a[1], 0.3); this.tone(v, 'sine', 100, 40, t, 0.4, 0.9); this.hiss(v, 'bandpass', 700, 250, 1, t, 0.5, 0.8); }
          break;
        }
        case 'reload':
          if (e.ship === me) { const v = this.voice(0.4, 0, 0.05); this.hiss(v, 'bandpass', 3200, 3200, 4, t, 0.04, 0.5); this.hiss(v, 'bandpass', 2200, 2200, 4, t + 0.22, 0.05, 0.5); }
          break;
        case 'empty':
          if (e.ship === me) this.hiss(this.voice(0.4, 0, 0), 'bandpass', 2600, 2600, 5, t, 0.04, 0.4);
          break;
        case 'used':
          if (e.ship === me) { const v = this.voice(0.5, 0, 0.4); [0, 4, 7].forEach((k, i) => this.bell(v, midi((e.kind === 'glass' || e.kind === 'pearl' ? 81 : 69) + k), t + i * 0.06, 0.8, 0.2)); }
          break;
        case 'storm':
          if (e.state === 'shrink') { const v = this.voice(0.7, 0, 0.6); this.hiss(v, 'lowpass', 300, 60, 0.7, t, 4, 0.9, 0.4); this.tone(v, 'sine', 55, 40, t, 3.5, 0.5, 0.5); }
          break;
        case 'hail':
          if (e.ship !== me) break;
          this.gullCry(t, 0.5, 0);
          break;
        case 'parcel':
          if (e.ship === me) { this.gullCry(t, 0.4, 0); const v = this.voice(0.5, 0, 0.3); this.hiss(v, 'lowpass', 2500, 400, 0.6, t + 0.2, 0.5, 0.5); }
          break;
        case 'leviathan': {
          const a = this.at(e.x, e.z, 900) ?? [0.25, 0] as [number, number];
          if (e.state === 'rising') this.whale(t, 0.5 * Math.max(0.4, a[0]), a[1]);
          else { const v = this.voice(a[0], a[1], 0.6); this.tone(v, 'sine', 60, 22, t, 2, 1); this.hiss(v, 'lowpass', 2500, 100, 0.5, t, 2.5, 1, 0.05); this.whale(t + 0.3, 0.4 * a[0], a[1]); }
          break;
        }
        case 'stunt':
          if (e.ship === me) [0, 4, 7, 12, 16, 19].forEach((k, i) => this.bell(this.voice(0.5, (i % 2 - 0.5) * 0.6, 0.6), midi(72 + k), t + i * 0.08, 1.4, 0.25));
          break;
        case 'claim':
          // a rising run of bells, longer for a bigger claim
          if (e.ship === me && e.cells > 0) { const n = Math.min(7, 3 + Math.floor(e.cells / 120)); for (let i = 0; i < n; i++) this.bell(this.voice(0.45, (i % 2 - 0.5) * 0.5, 0.5), midi(67 + [0, 4, 7, 11, 12, 16, 19][i]), t + i * 0.07, 1.2, 0.22); }
          break;
        case 'cut':
          if (e.by === me || e.victim === me) { const v = this.voice(0.7, 0, 0.3); this.hiss(v, 'bandpass', 3200, 600, 0.6, t, 0.25, 0.9, 0.01); this.tone(v, 'triangle', e.victim === me ? 140 : 520, e.victim === me ? 60 : 900, t, 0.3, 0.5); }
          break;
        case 'win':
          if (e.ship === me) this.ui('victory');
          break;
      }
    }
  }

  // ---------------------------------------------------------------- the beds and the score

  /** Sets the sea, the wind and the storm beds for this frame, and schedules the score a little ahead. */
  update(m: Match | null, stage: Stage, dt: number): void {
    const ctx = this.ctx, t = ctx.currentTime;
    if (ctx.state !== 'running') return;
    const me = m?.me;
    const speed = me && me.alive ? (me.phase === 'sea' ? me.speed : Math.hypot(me.vx, me.vz, me.vy)) : 3;
    const air = me && (me.phase === 'gale' || me.phase === 'glide');
    const camY = stage.camera.position.y;
    this.waves.g.gain.setTargetAtTime(air ? 0.05 : 0.22 * Math.max(0.3, 1 - camY / 120) + Math.sin(t * 0.4) * 0.05, t, 0.3);
    this.waves.f.frequency.setTargetAtTime(380 + Math.sin(t * 0.23) * 120, t, 0.5);
    this.wind.g.gain.setTargetAtTime(air ? 0.35 : 0.04 + Math.min(0.2, speed / 70), t, 0.3);
    this.wind.f.frequency.setTargetAtTime(air ? 900 + speed * 12 : 500 + speed * 30, t, 0.3);
    let outside = 0;
    if (m && me) {
      const s = m.storm, cx = stage.camera.position.x, cz = stage.camera.position.z;
      if (s.state !== 'idle') outside = Math.max(0, Math.min(1, (Math.hypot(cx - s.x, cz - s.z) - s.r + 30) / 40));
    }
    this.storm.g.gain.setTargetAtTime(outside * 0.6, t, 0.4);
    this.storm.f.frequency.setTargetAtTime(160 + outside * 200 + Math.random() * 60, t, 0.2);
    this.rain.g.gain.setTargetAtTime(stage.water.rain * 0.12, t, 1);
    // the score: intensity follows the storm's phase and fighting nearby
    const want = !m ? 0.15 : m.over ? 0.2 : m.gale.t < m.gale.dur ? 0.35 : 0.3 + Math.min(0.6, (m.storm.phase + 1) * 0.1) + (me && me.lastHitT > m.time - 4 ? 0.2 : 0);
    this.intensity += (want - this.intensity) * Math.min(1, dt * 0.5);
    if (!this.musicOn) return;
    if (this.nextNote < t) this.nextNote = t + 0.05;
    const beatLen = 60 / (76 + this.intensity * 30) / 2; // eighth notes
    const CHORDS = [0, 5, 9, 7]; // I, IV, vi, V in pentatonic-friendly roots
    while (this.nextNote < t + 0.15) {
      const tt = this.nextNote, b = this.beat % 16, root = 50 + CHORDS[this.chord];
      // bass on the bar, a pluck melody wandering the scale, bells when it is tense
      if (b === 0) this.pluck(this.music, root - 12, tt, 0.5);
      if (b === 8 && this.intensity > 0.3) this.pluck(this.music, root - 5, tt, 0.35);
      const dens = 0.25 + this.intensity * 0.5;
      if (Math.random() < dens && (b % 2 === 0 || this.intensity > 0.55)) {
        const deg = Math.floor(Math.random() * 7), n = root + 12 + PENTA[deg % 5] + (deg >= 5 ? 12 : 0);
        this.pluck(this.music, n, tt, 0.2 + Math.random() * 0.12);
      }
      if (this.intensity > 0.55 && (b === 4 || b === 12)) this.tone(this.music, 'sine', 70, 45, tt, 0.25, 0.25);
      if (this.intensity > 0.7 && b % 4 === 2) this.hiss(this.music, 'highpass', 6000, 6000, 1, tt, 0.05, 0.06);
      this.beat++;
      if (this.beat % 16 === 0) { this.bar++; this.chord = (this.chord + 1) % CHORDS.length; }
      this.nextNote += beatLen;
    }
  }
}

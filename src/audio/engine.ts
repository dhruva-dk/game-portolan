// WP28: the audio engine on Web Audio. One context (live, or offline for the tests), four buses (sfx, ambience, ui and
// the music bus WP29's score plays into), each through its own duck stage into the master, then glue compression, a
// fast limiter and a soft-clip ceiling, so a ten-ship fight never clips. Sounds come from the synthesized bank (sfx.ts),
// placed on the sphere relative to a listener tied to the camera: inverse-distance level, pan by the ear's right, air
// absorption and the horizon's occlusion as a low-pass, and the delay of sound crossing the water. Voices are limited per
// sound and per pool, and stolen by priority × level, so the important sounds always get through.
//
// API (WP25 haptics, WP26/27 interface sounds, WP29 score): play(), ui(), chestOpen(), coins(), broadside(), chord(),
// loop()/setVoice()/stopVoice(), onCue() (every sound heard, with its level and when it is heard: pair haptics to it),
// setVolumes(), duck(), buses.music, clock (the music clock), key (the loop chord's key), unlockOn(), suspend()/resume().
import { rng, SR, type Buf } from './dsp.ts';
import { Bank, SOUNDS, type Bus, type SoundDef, type SoundName } from './sfx.ts';

export interface Point { x: number; y: number; z: number }

/** Hearing on the sphere (radius 200 u): full level within `near`, gone past `far`; sound crosses `speed` u a second;
 * the listener's ear stands `eye` u above the water, which sets the horizon beyond which sound is occluded. */
export const HEAR = { near: 2, far: 95, speed: 30, eye: 1, radius: 200 };
/** Voices at once per pool. */
export const VOICES: Record<Bus, number> = { sfx: 24, ambience: 14, ui: 4 };
/** The output never exceeds this (the soft-clip stage's ceiling). */
export const CEILING = 0.97;
/** Bus levels at full volume. */
const LEVEL = { sfx: 0.9, ambience: 0.6, ui: 0.7, music: 0.55 };

export type BusName = Bus | 'music';

export interface PlayOptions {
  at?: Point | null; // where on the sphere; omitted: on the listener (the player's own ship, the interface)
  gain?: number;
  rate?: number;
  variant?: number;
  delay?: number; // seconds from now, before the travel delay
  pan?: number; // added to the spatial pan
  priority?: number;
  duration?: number; // a loop: seconds before it fades out by itself
}

/** A sound as heard: for haptics (WP25) to pair with. `when` is the context time it reaches the listener. */
export interface Cue { sound: SoundName; level: number; when: number; near: boolean }

interface Voice {
  id: number;
  name: SoundName;
  pool: Bus;
  src: AudioBufferSourceNode;
  lp: BiquadFilterNode;
  amp: GainNode;
  pan: StereoPannerNode;
  score: number;
  start: number;
  end: number;
  at: Point | null;
  gain: number;
}

/** The music clock (WP29's seam): beats from an origin at a tempo, and the next beat boundary to change on. */
export class MusicClock {
  bpm = 84;
  origin = 0;
  private readonly ctx: BaseAudioContext;
  constructor(ctx: BaseAudioContext) { this.ctx = ctx; }
  beat(t = this.ctx.currentTime): number { return ((t - this.origin) * this.bpm) / 60; }
  /** Context time of the next boundary of `div` beats at or after t. */
  next(div = 1, t = this.ctx.currentTime): number {
    const b = Math.ceil(this.beat(t) / div - 1e-9) * div;
    return this.origin + (b * 60) / this.bpm;
  }
}

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class AudioEngine {
  readonly ctx: BaseAudioContext;
  readonly master: GainNode;
  readonly buses: Record<BusName, GainNode>;
  readonly ducks: Record<BusName, GainNode>;
  readonly glue: DynamicsCompressorNode;
  readonly limiter: DynamicsCompressorNode;
  readonly clock: MusicClock;
  /** The loop chord's root, Hz: WP29 sets the current key; D4 by default. */
  key = 293.66;
  readonly bank = new Bank();
  readonly stats = { started: 0, dropped: 0, stolen: 0, peakVoices: 0 };
  /** The listener: on the sphere, facing `fwd` (tangent). */
  readonly listener = { pos: { x: 0, y: 0, z: HEAR.radius } as Point, fwd: { x: 0, y: 1, z: 0 } as Point };
  private readonly live: boolean;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly last = new Map<SoundName, number>();
  private readonly cues = new Set<(c: Cue) => void>();
  private readonly rand = rng(0x28a);
  private voices: Voice[] = [];
  private nextId = 1;
  private volumes = { sound: 1, music: 1 };
  private held = false;

  constructor(ctx?: BaseAudioContext) {
    this.ctx = ctx ?? new AudioContext({ latencyHint: 'interactive' });
    this.live = typeof AudioContext !== 'undefined' && this.ctx instanceof AudioContext;
    const c = this.ctx;
    this.master = c.createGain();
    this.glue = c.createDynamicsCompressor();
    this.glue.threshold.value = -16; this.glue.knee.value = 8; this.glue.ratio.value = 3;
    this.glue.attack.value = 0.005; this.glue.release.value = 0.2;
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -4; this.limiter.knee.value = 0; this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001; this.limiter.release.value = 0.08;
    const clip = c.createWaveShaper(), curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1, a = Math.abs(x);
      curve[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + (CEILING - 0.7 - 0.01) * Math.tanh((a - 0.7) / (CEILING - 0.7)));
    }
    clip.curve = curve;
    this.master.connect(this.glue).connect(this.limiter).connect(clip).connect(c.destination);
    const make = (b: BusName): [GainNode, GainNode] => {
      const g = c.createGain(), d = c.createGain();
      g.gain.value = LEVEL[b];
      g.connect(d).connect(this.master);
      return [g, d];
    };
    const sfx = make('sfx'), amb = make('ambience'), ui = make('ui'), music = make('music');
    this.buses = { sfx: sfx[0], ambience: amb[0], ui: ui[0], music: music[0] };
    this.ducks = { sfx: sfx[1], ambience: amb[1], ui: ui[1], music: music[1] };
    this.clock = new MusicClock(c);
  }

  get now(): number { return this.ctx.currentTime; }
  get running(): boolean { return this.ctx.state === 'running'; }

  /** Audio starts on the first touch (iOS): resume the context and play a silent sample inside the gesture. Stays
   * listening, so a context the system interrupted comes back on the next touch. */
  unlockOn(target: EventTarget): void {
    const go = (): void => {
      if (!this.live || this.held || this.running) return;
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, SR);
      s.connect(this.ctx.destination);
      s.start();
      void this.resume();
    };
    for (const e of ['pointerdown', 'touchend', 'keydown']) target.addEventListener(e, go, { passive: true });
  }

  /** The app goes to the background: silence and release the audio hardware. */
  async suspend(): Promise<void> {
    this.held = true;
    if (this.live && this.ctx.state === 'running') await (this.ctx as AudioContext).suspend().catch(() => undefined);
  }

  async resume(): Promise<void> {
    this.held = false;
    if (this.live && this.ctx.state === 'suspended') await (this.ctx as AudioContext).resume().catch(() => undefined);
  }

  /** Settings (WP26): sound covers effects, ambience and the interface; music the score. 0…1. */
  setVolumes(v: { sound?: number; music?: number }): void {
    this.volumes = { sound: clamp(v.sound ?? this.volumes.sound, 0, 1), music: clamp(v.music ?? this.volumes.music, 0, 1) };
    const t = this.now;
    for (const b of ['sfx', 'ambience', 'ui'] as const) this.buses[b].gain.setTargetAtTime(LEVEL[b] * this.volumes.sound, t, 0.05);
    this.buses.music.gain.setTargetAtTime(LEVEL.music * this.volumes.music, t, 0.05);
  }

  /** Dip a bus by db for `hold` s (the score under a big moment, the ambience under a broadside), then recover. */
  duck(bus: BusName, db: number, hold: number, release = 0.6, attack = 0.03): void {
    const g = this.ducks[bus].gain, t = this.now, to = Math.pow(10, -Math.abs(db) / 20);
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.min(1, g.value), t);
    g.linearRampToValueAtTime(to, t + attack);
    g.setValueAtTime(to, t + attack + hold);
    g.linearRampToValueAtTime(1, t + attack + hold + release);
  }

  /** Subscribe to every sound as it will be heard (haptics pair to these). Returns the unsubscribe. */
  onCue(f: (c: Cue) => void): () => void {
    this.cues.add(f);
    return () => this.cues.delete(f);
  }

  /** Tie the listener to the camera (or the player's ship): its position on the sphere and its facing. */
  setListener(pos: Point, fwd: Point): void {
    this.listener.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.listener.fwd = { x: fwd.x, y: fwd.y, z: fwd.z };
  }

  /** How a sound at `at` is heard from the listener: level, pan, low-pass cutoff, travel delay, distance. */
  spatial(at: Point | null | undefined): { gain: number; pan: number; cutoff: number; delay: number; d: number } {
    if (!at) return { gain: 1, pan: 0, cutoff: 20000, delay: 0, d: 0 };
    const L = this.listener.pos, F = this.listener.fwd;
    const dx = at.x - L.x, dy = at.y - L.y, dz = at.z - L.z, d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return { gain: 1, pan: 0, cutoff: 20000, delay: 0, d: 0 };
    const ul = Math.hypot(L.x, L.y, L.z) || 1, ux = L.x / ul, uy = L.y / ul, uz = L.z / ul;
    const rx = F.y * uz - F.z * uy, ry = F.z * ux - F.x * uz, rz = F.x * uy - F.y * ux, rl = Math.hypot(rx, ry, rz) || 1;
    const fl = Math.hypot(F.x, F.y, F.z) || 1;
    const side = (dx * rx + dy * ry + dz * rz) / (rl * d), ahead = (dx * F.x + dy * F.y + dz * F.z) / (fl * d);
    const horizon = Math.sqrt(2 * HEAR.radius * HEAR.eye), occl = smooth(horizon * 0.8, horizon * 1.6, d);
    let gain = d <= HEAR.near ? 1 : HEAR.near / d;
    gain *= (1 - smooth(HEAR.far * 0.75, HEAR.far, d)) * (1 - 0.5 * occl);
    let cutoff = 18000 / (1 + d / 12);
    if (ahead < 0) cutoff *= 1 + 0.35 * ahead;
    cutoff *= 1 - 0.85 * occl;
    return { gain, pan: clamp(side * Math.min(1, d / HEAR.near), -0.85, 0.85), cutoff: Math.max(200, cutoff), delay: d > HEAR.near * 2 ? d / HEAR.speed : 0, d };
  }

  private buffer(name: SoundName, v: number): AudioBuffer {
    const key = `${name}:${v}`;
    let b = this.buffers.get(key);
    if (!b) {
      const chs: Buf[] = this.bank.get(name, v);
      b = this.ctx.createBuffer(chs.length, chs[0].length, SR);
      chs.forEach((c, i) => b!.copyToChannel(c as Float32Array<ArrayBuffer>, i));
      this.buffers.set(key, b);
    }
    return b;
  }

  /** Render a sound's buffer now (warm the bank off the critical moment). */
  prepare(name: SoundName, v = 0): void { this.buffer(name, v); }

  /** Voices sounding at context time t, all pools or one. */
  active(t: number, pool?: Bus): number {
    return this.voices.filter((v) => v.start <= t && v.end > t && (!pool || v.pool === pool)).length;
  }

  get nodes(): number { return this.voices.filter((v) => v.end > this.now).length * 4 + 17; }

  private pick(name: SoundName, d: SoundDef): number {
    if (d.variants <= 1) return 0;
    const prev = this.last.get(name) ?? -1, v = (prev + 1 + Math.floor(this.rand() * (d.variants - 1))) % d.variants;
    this.last.set(name, v);
    return v;
  }

  /** Steal a voice at `at`: it is silent within 30 ms (a 6 ms fade), and no longer counts from `at`. */
  private kill(v: Voice, at: number): void {
    const t = Math.max(at, this.now);
    v.amp.gain.cancelScheduledValues(t);
    v.amp.gain.setTargetAtTime(0, t, 0.006);
    try { v.src.stop(t + 0.03); } catch { /* already stopped */ }
    v.end = Math.min(v.end, t);
  }

  /** Play a sound; returns its voice id, or 0 when inaudible or outranked. */
  play(name: SoundName, o: PlayOptions = {}): number {
    const d: SoundDef = SOUNDS[name];
    if (this.ctx.state === 'closed') return 0;
    const sp = this.spatial(o.at), gain = d.gain * (o.gain ?? 1) * sp.gain;
    if (gain < 0.003) { this.stats.dropped++; return 0; }
    const when = this.now + (o.delay ?? 0) + sp.delay, score = (o.priority ?? d.priority) * (0.25 + Math.min(1, gain));
    this.voices = this.voices.filter((v) => v.end > this.now - 0.5);
    const variant = o.variant !== undefined ? Math.min(d.variants - 1, o.variant) : this.pick(name, d);
    const buffer = this.buffer(name, variant), rate = (o.rate ?? 1) * (1 + d.jitter * (this.rand() * 2 - 1));
    const until = d.loop ? (o.duration !== undefined ? when + o.duration + 0.4 : Infinity) : when + buffer.duration / rate;
    // every voice that will overlap this one anywhere (scheduling may run ahead of time and out of order)
    const sounding = this.voices.filter((v) => v.start < until && v.end > when);
    // the most voices sounding at once anywhere in [when, until): at its start or where one of them begins
    const peakOver = (vs: Voice[]): number => {
      let m = 0;
      for (const t of [when, ...vs.filter((v) => v.start > when).map((v) => v.start)]) {
        let k = 0;
        for (const v of vs) if (v.start <= t && v.end > t) k++;
        m = Math.max(m, k);
      }
      return m;
    };
    // room for this voice under the cap, stealing the weakest voices that rank below it, or none at all
    const contest = (rivals: Voice[], cap: number): boolean => {
      if (rivals.length < cap) return true;
      const weaker = rivals.filter((v) => v.score < score).sort((a, b) => a.score - b.score || a.start - b.start), victims: Voice[] = [];
      let rest = rivals;
      while (peakOver(rest) >= cap) {
        const v = weaker.shift();
        if (!v) return false;
        victims.push(v);
        rest = rest.filter((x) => x !== v);
      }
      for (const v of victims) { this.kill(v, when); this.stats.stolen++; sounding.splice(sounding.indexOf(v), 1); }
      return true;
    };
    if (!contest(sounding.filter((v) => v.name === name), d.max) || !contest(sounding.filter((v) => v.pool === d.bus), VOICES[d.bus])) {
      this.stats.dropped++;
      return 0;
    }
    const c = this.ctx;
    const src = c.createBufferSource(), lp = c.createBiquadFilter(), amp = c.createGain(), pan = c.createStereoPanner();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    lp.type = 'lowpass'; lp.frequency.value = sp.cutoff; lp.Q.value = 0.5;
    amp.gain.value = gain * (1 + (this.rand() - 0.5) * 0.12);
    pan.pan.value = clamp(sp.pan + (o.pan ?? 0), -1, 1);
    src.connect(lp).connect(amp).connect(pan).connect(this.buses[d.bus]);
    const end = until;
    if (d.loop) {
      src.loop = true;
      if (o.duration !== undefined) {
        amp.gain.setValueAtTime(amp.gain.value, when + o.duration);
        amp.gain.linearRampToValueAtTime(0, when + o.duration + 0.35);
        src.stop(end);
      }
    }
    src.start(when);
    const v: Voice = { id: this.nextId++, name, pool: d.bus, src, lp, amp, pan, score, start: when, end, at: o.at ?? null, gain };
    src.onended = () => { src.disconnect(); lp.disconnect(); amp.disconnect(); pan.disconnect(); v.end = Math.min(v.end, this.now); };
    this.voices.push(v);
    this.stats.started++;
    this.stats.peakVoices = Math.max(this.stats.peakVoices, sounding.length + 1);
    if (this.cues.size) { const cue = { sound: name, level: gain, when, near: sp.d < HEAR.near * 3 }; for (const f of this.cues) f(cue); }
    return v.id;
  }

  /** Start a looping bed or emitter (silent until set); returns its id. */
  loop(name: SoundName, o: PlayOptions = {}): number {
    return this.play(name, { gain: 1, ...o });
  }

  /** Steer a sounding voice: level (× its def gain), playback rate, low-pass cutoff, or move it (re-spatialised). */
  setVoice(id: number, s: { gain?: number; rate?: number; cutoff?: number; at?: Point | null }, tau = 0.25): void {
    const v = this.voices.find((x) => x.id === id);
    if (!v) return;
    const t = this.now, d = SOUNDS[v.name];
    if (s.at !== undefined) v.at = s.at;
    if (s.gain !== undefined) v.gain = d.gain * s.gain;
    const sp = this.spatial(v.at);
    if (s.gain !== undefined || s.at !== undefined) v.amp.gain.setTargetAtTime(v.gain * sp.gain, t, tau);
    if (s.at !== undefined) v.pan.pan.setTargetAtTime(sp.pan, t, tau);
    if (s.cutoff !== undefined || s.at !== undefined) v.lp.frequency.setTargetAtTime(Math.min(s.cutoff ?? 20000, sp.cutoff), t, tau);
    if (s.rate !== undefined) v.src.playbackRate.setTargetAtTime(s.rate, t, tau);
  }

  stopVoice(id: number, fade = 0.3): void {
    const v = this.voices.find((x) => x.id === id);
    if (!v) return;
    const t = this.now;
    v.amp.gain.cancelScheduledValues(t);
    v.amp.gain.setTargetAtTime(0, t, fade / 3);
    try { v.src.stop(t + fade + 0.05); } catch { /* stopped */ }
    v.end = t + fade + 0.05;
  }

  // ———— composite moments ————

  /** Interface sounds (WP26/27): a tap, a page turning, the quill, confirm and back. */
  ui(name: 'tap' | 'page' | 'quill' | 'confirm' | 'back'): number { return this.play(name); }

  /** A chest opened, by pigment tier 0…4. */
  chestOpen(tier: number, at?: Point | null): number {
    return this.play((['open0', 'open1', 'open2', 'open3', 'open4'] as const)[clamp(Math.round(tier), 0, 4)], { at });
  }

  /** Coins streaming in, `count` of them, each a little higher than the last and closer together. */
  coins(count: number, at?: Point | null, delay = 0): void {
    const k = Math.min(24, Math.max(1, Math.round(count)));
    let t = delay;
    for (let i = 0; i < k; i++) {
      this.play('coin', { at, delay: t, rate: Math.pow(2, Math.min(14, i * 0.75) / 12), gain: 0.7 + 0.3 * (i / k), priority: 5 + Math.min(3, i / 6) });
      t += Math.max(0.035, 0.11 * Math.pow(0.9, i));
    }
  }

  /** A battery's broadside: guns firing in a ripple from bow to stern, booming from afar past the horizon. */
  broadside(at: Point, guns: number, opts: { delay?: number; own?: boolean } = {}): void {
    const sp = this.spatial(at), far = sp.d > 25, g = Math.max(1, Math.round(guns));
    let t = opts.delay ?? 0;
    for (let i = 0; i < g; i++) {
      this.play(far ? 'cannonFar' : 'cannon', { at, delay: t, pan: (g > 1 ? i / (g - 1) - 0.5 : 0) * (far ? 0.05 : 0.3), gain: 0.85 + 0.15 * this.rand() });
      t += 0.07 + 0.08 * this.rand();
    }
    if (opts.own || sp.d < 6) { this.duck('ambience', 6, 0.6 + t); this.duck('music', 3, 0.4 + t); }
  }

  /** The loop-closing chord in the score's key, sized 0…3 by the claim. */
  chord(size: number): number {
    this.duck('music', 6, 1.6);
    return this.play('chord', { variant: clamp(Math.round(size), 0, 3), rate: this.key / 293.66 });
  }
}

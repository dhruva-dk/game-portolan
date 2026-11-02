// The Web Audio engine, ported from the old game's and extended. Three mixer buses (effects, ambience and the
// interface), each with a volume and a duck, into a glue compressor, a limiter and a soft clip. Sounds are placed
// from 3D positions around a listener on the planet: distance, air absorption, the curve of the horizon, which ear,
// and the time sound takes to travel. Effects also feed a hall and an echo whose depth the regions set, and fog
// muffles the world. Voices are capped per sound and per bus, and the weakest are stolen when a stronger one needs
// the room. The bank renders on a worker; anything not ready yet is rendered on the spot.
import { rng, SR, type Buf } from './dsp.ts';
import type { Bus, SoundDef } from './def.ts';
import { Bank, SOUNDS, type SoundName } from './bank.ts';

export interface Vec3 { x: number; y: number; z: number }

export interface PlayOptions {
  /** World position in metres. Leave it out for your own sounds and the interface: heard centred and whole. */
  pos?: Vec3 | null;
  gain?: number;
  /** Playback rate: 1 is as rendered; 2 is an octave up. */
  rate?: number;
  /** Seconds from now. */
  delay?: number;
  /** Pick a variant directly. */
  variant?: number;
  /** For weapons and pickups: the rarity, 0 (common) to 4 (legendary). */
  rarity?: number;
  /** For the shield crack: how weak the shield is, 0 to 1. */
  level?: number;
  /** Extra stereo offset, -1 to 1. */
  pan?: number;
  /** For loops: stop after this many seconds. The consumables' use loops climb in pitch over it. */
  duration?: number;
  priority?: number;
  /** A lowpass on this voice, in Hz. */
  cutoff?: number;
  /** Seconds to rise from silence: the ambience beds glide in. Loops get a few milliseconds anyway. */
  fadeIn?: number;
}

/** One line of the log of every sound that fired, for the capture tools. */
export interface Cue { name: SoundName; variant: number; when: number; gain: number; pos: Vec3 | null; bus: Bus }

export interface Volumes { master?: number; effects?: number; ambience?: number; interface?: number }

/** Voices each bus may hold at once. */
export const VOICES: Record<Bus, number> = { fx: 28, amb: 18, ui: 6 };
/** Levels of the buses before the player's volumes. */
const LEVEL: Record<Bus, number> = { fx: 0.9, amb: 0.65, ui: 0.7 };
/** The output never goes above this. */
export const CEILING = 0.97;
/** Within this many metres a sound is heard whole. */
export const NEAR = 20;
const SPEED_OF_SOUND = 343;

interface Nodes { src: AudioBufferSourceNode; lp: BiquadFilterNode | null; amp: GainNode; pan: StereoPannerNode | null }

interface Voice {
  id: number;
  name: SoundName;
  pool: Bus;
  buffer: AudioBuffer;
  score: number;
  start: number;
  end: number;
  duration: number | undefined;
  fadeIn: number;
  at: Vec3 | null;
  gain: number;
  rate: number;
  pan: number;
  cutoff: number;
  tone: boolean;
  nodes: Nodes | null;
}

const LOOKAHEAD = 0.25, PUMP = 0.05, OPEN = 15000;

const kRate = (p: AudioParam): void => { try { p.automationRate = 'k-rate'; } catch { /* older engines */ } };
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const byTime = (a: number, b: number): number => a - b;
const count = (sorted: number[], t: number, strict: boolean): number => {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (strict ? sorted[m] < t : sorted[m] <= t) lo = m + 1; else hi = m; }
  return lo;
};
const upTo = (sorted: number[], t: number): number => count(sorted, t, false);
const below = (sorted: number[], t: number): number => count(sorted, t, true);
export const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** A decaying noise burst as the hall's impulse. */
function hall(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const r = rng(0x4a11), len = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += (r() * 2 - 1 - lp) * (0.5 - 0.4 * t); // darker as it decays
      d[i] = lp * Math.pow(1 - t, 3) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
    }
  }
  return b;
}

export class AudioEngine {
  readonly ctx: BaseAudioContext;
  readonly master: GainNode;
  readonly buses: Record<Bus, GainNode>;
  readonly ducks: Record<Bus, GainNode>;
  readonly muffles: { fx: BiquadFilterNode; amb: BiquadFilterNode };
  readonly sends: { reverb: GainNode; echo: GainNode; echoTime: DelayNode };
  readonly bank = new Bank();
  readonly stats = { started: 0, dropped: 0, stolen: 0, peakVoices: 0, rendered: 0 };
  readonly listener = { pos: { x: 0, y: 0, z: 554 } as Vec3, fwd: { x: 0, y: 1, z: 0 } as Vec3, up: { x: 0, y: 0, z: 1 } as Vec3 };
  /** The planet's radius in metres, for the horizon. */
  radius: number;
  private readonly live: boolean;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly last = new Map<SoundName, number>();
  private readonly cues = new Set<(c: Cue) => void>();
  private readonly pumps = new Set<(dt: number) => void>();
  private readonly rand = rng(0x28a);
  private voices: Voice[] = [];
  private readonly byId = new Map<number, Voice>();
  private pending: Voice[] = [];
  private nextId = 1;
  private volumes = { master: 1, effects: 1, ambience: 1, interface: 1 };
  private held = false;
  private lastPump = 0;
  private worker: Worker | null = null;
  private readonly asked = new Set<string>();

  constructor(ctx?: BaseAudioContext, radius = 554) {
    this.ctx = ctx ?? new AudioContext({ latencyHint: 'interactive' });
    this.radius = radius;
    this.live = typeof AudioContext !== 'undefined' && this.ctx instanceof AudioContext;
    const c = this.ctx;
    this.master = c.createGain();
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -16; glue.knee.value = 8; glue.ratio.value = 3; glue.attack.value = 0.005; glue.release.value = 0.2;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
    const clip = c.createWaveShaper(), curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1, a = Math.abs(x);
      curve[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + (CEILING - 0.7 - 0.01) * Math.tanh((a - 0.7) / (CEILING - 0.7)));
    }
    clip.curve = curve;
    this.master.connect(glue).connect(limiter).connect(clip).connect(c.destination);
    const lp = (): BiquadFilterNode => { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 20000; f.Q.value = 0.5; return f; };
    this.muffles = { fx: lp(), amb: lp() };
    const make = (b: Bus): [GainNode, GainNode] => {
      const g = c.createGain(), d = c.createGain();
      g.gain.value = LEVEL[b];
      if (b === 'ui') g.connect(d); else g.connect(this.muffles[b]).connect(d);
      d.connect(this.master);
      return [g, d];
    };
    const fx = make('fx'), amb = make('amb'), ui = make('ui');
    this.buses = { fx: fx[0], amb: amb[0], ui: ui[0] };
    this.ducks = { fx: fx[1], amb: amb[1], ui: ui[1] };
    // the hall and the echo, fed from the effects bus; the regions set how much
    const conv = c.createConvolver();
    conv.buffer = hall(c, 2.6);
    const reverb = c.createGain(), echo = c.createGain(), echoTime = c.createDelay(2), fb = c.createGain(), dark = c.createBiquadFilter();
    reverb.gain.value = 0.12; echo.gain.value = 0;
    echoTime.delayTime.value = 0.35; fb.gain.value = 0.35; dark.type = 'lowpass'; dark.frequency.value = 1800;
    this.ducks.fx.connect(reverb).connect(conv).connect(this.master);
    this.ducks.fx.connect(echo).connect(echoTime).connect(dark).connect(this.master);
    dark.connect(fb).connect(echoTime);
    this.sends = { reverb, echo, echoTime };
    if (this.live) setInterval(() => this.pump(), PUMP * 1000);
    else if (typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext) {
      const o = c, end = o.length / o.sampleRate;
      for (let t = PUMP; t < end - PUMP; t += PUMP) o.suspend(t).then(() => { this.pump(); return o.resume(); }).catch(() => undefined);
    }
  }

  get now(): number { return this.ctx.currentTime; }
  get running(): boolean { return this.ctx.state === 'running'; }

  /** Starts the bank rendering on a worker, most-needed sounds first. */
  startWorker(order: readonly [SoundName, number][]): void {
    if (this.worker || typeof Worker === 'undefined') return;
    try {
      const w = new Worker(new URL('./bankWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ name: SoundName; v: number; chs: Float32Array[] }>) => {
        if (!this.buffers.has(`${e.data.name}:${e.data.v}`)) this.bank.put(e.data.name, e.data.v, e.data.chs);
      };
      w.postMessage({ order });
      this.worker = w;
    } catch { this.worker = null; }
  }

  /** Whether a sound is rendered and can start without a hitch. */
  ready(name: SoundName, v = 0): boolean {
    const key = `${name}:${v}`;
    return this.buffers.has(key) || this.bank.has(name, v);
  }

  /** Asks the worker to render a sound next. Without a worker it is rendered now. */
  want(name: SoundName, v = 0): void {
    if (this.ready(name, v)) return;
    const key = `${name}:${v}`;
    if (!this.worker) { this.buffer(name, v); return; }
    if (this.asked.has(key)) return;
    this.asked.add(key);
    this.worker.postMessage({ want: [[name, v]] });
  }

  /** Call from a user gesture, or let it listen for the first one: browsers keep audio silent until a touch. */
  unlockOn(target: EventTarget): void {
    const go = (): void => { if (!this.held && !this.running) this.unlock(); };
    for (const e of ['pointerdown', 'touchend', 'keydown']) target.addEventListener(e, go, { passive: true });
  }

  unlock(): void {
    if (!this.live || this.running) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.ctx.createBuffer(1, 1, SR);
    s.connect(this.ctx.destination);
    s.start();
    void this.resume();
  }

  async suspend(): Promise<void> {
    this.held = true;
    if (this.live && this.ctx.state === 'running') await (this.ctx as AudioContext).suspend().catch(() => undefined);
  }

  async resume(): Promise<void> {
    this.held = false;
    if (this.live && this.ctx.state !== 'running') await (this.ctx as AudioContext).resume().catch(() => undefined);
  }

  setVolumes(v: Volumes): void {
    const o = this.volumes, t = this.now;
    this.volumes = {
      master: clamp(v.master ?? o.master, 0, 1), effects: clamp(v.effects ?? o.effects, 0, 1),
      ambience: clamp(v.ambience ?? o.ambience, 0, 1), interface: clamp(v.interface ?? o.interface, 0, 1),
    };
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.buses.fx.gain.setTargetAtTime(LEVEL.fx * this.volumes.effects, t, 0.05);
    this.buses.amb.gain.setTargetAtTime(LEVEL.amb * this.volumes.ambience, t, 0.05);
    this.buses.ui.gain.setTargetAtTime(LEVEL.ui * this.volumes.interface, t, 0.05);
  }

  /** Pulls a bus down by db for hold seconds, then lets it back up. */
  duck(bus: Bus, db: number, hold: number, release = 0.6, attack = 0.03): void {
    const g = this.ducks[bus].gain, t = this.now, to = Math.pow(10, -Math.abs(db) / 20);
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.min(1, g.value), t);
    g.linearRampToValueAtTime(to, t + attack);
    g.setValueAtTime(to, t + attack + hold);
    g.linearRampToValueAtTime(1, t + attack + hold + release);
  }

  /** The acoustic space: how much hall and echo the effects get, and how long the echo takes to come back. */
  space(reverb: number, echo: number, echoTime: number): void {
    const t = this.now;
    this.sends.reverb.gain.setTargetAtTime(clamp(reverb, 0, 1), t, 0.5);
    this.sends.echo.gain.setTargetAtTime(clamp(echo, 0, 1), t, 0.5);
    this.sends.echoTime.delayTime.setTargetAtTime(clamp(echoTime, 0.05, 1.9), t, 0.5);
  }

  /** Fog: 0 is clear air, 1 muffles the world down to a dull thud. */
  muffle(amount: number): void {
    const a = clamp(amount, 0, 1), t = this.now;
    this.muffles.fx.frequency.setTargetAtTime(20000 * Math.pow(1800 / 20000, a), t, 0.4);
    this.muffles.amb.frequency.setTargetAtTime(20000 * Math.pow(3000 / 20000, a), t, 0.4);
  }

  onCue(f: (c: Cue) => void): () => void {
    this.cues.add(f);
    return () => this.cues.delete(f);
  }

  /** Runs f every pump (about 20 times a second) with the seconds since the last. */
  onPump(f: (dt: number) => void): () => void {
    this.pumps.add(f);
    return () => this.pumps.delete(f);
  }

  /** The listener: usually the camera. Forward and up need not be exact; right is worked out from them. */
  setListener(pos: Vec3, fwd: Vec3, up: Vec3): void {
    this.listener.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.listener.fwd = { x: fwd.x, y: fwd.y, z: fwd.z };
    this.listener.up = { x: up.x, y: up.y, z: up.z };
  }

  /** How a sound at a point is heard from the listener. */
  spatial(at: Vec3 | null | undefined, range = 400, near = NEAR): { gain: number; pan: number; cutoff: number; delay: number; d: number } {
    if (!at) return { gain: 1, pan: 0, cutoff: 20000, delay: 0, d: 0 };
    const L = this.listener.pos, F = this.listener.fwd, U = this.listener.up;
    const dx = at.x - L.x, dy = at.y - L.y, dz = at.z - L.z, d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return { gain: 1, pan: 0, cutoff: 20000, delay: 0, d: 0 };
    // right = forward × up
    const rx = F.y * U.z - F.z * U.y, ry = F.z * U.x - F.x * U.z, rz = F.x * U.y - F.y * U.x, rl = Math.hypot(rx, ry, rz) || 1;
    const fl = Math.hypot(F.x, F.y, F.z) || 1;
    const side = (dx * rx + dy * ry + dz * rz) / (rl * d), ahead = (dx * F.x + dy * F.y + dz * F.z) / (fl * d);
    // the curve of the planet hides what is beyond both horizons
    const R = this.radius, hl = Math.max(1, Math.hypot(L.x, L.y, L.z) - R), hs = Math.max(1, Math.hypot(at.x, at.y, at.z) - R);
    const reach = Math.sqrt(2 * R * hl) + Math.sqrt(2 * R * hs), occl = smooth(reach * 0.9, reach * 1.4, d);
    const beyond = Math.max(0, d - near);
    let gain = near / (near + beyond * 0.6);
    gain *= (1 - smooth(range * 0.7, range, d)) * (1 - 0.6 * occl);
    let cutoff = 20000 / (1 + beyond / 60);
    if (ahead < 0) cutoff *= 1 + 0.3 * ahead;
    cutoff *= 1 - 0.8 * occl;
    const pan = clamp(side * Math.min(1, d / 8), -0.85, 0.85);
    return { gain, pan, cutoff: Math.max(200, cutoff), delay: beyond / SPEED_OF_SOUND, d };
  }

  private buffer(name: SoundName, v: number): AudioBuffer {
    const key = `${name}:${v}`;
    let b = this.buffers.get(key);
    if (!b) {
      const chs: Buf[] = this.bank.get(name, v);
      b = this.ctx.createBuffer(chs.length, chs[0].length, SR);
      chs.forEach((c, i) => b!.copyToChannel(c as Float32Array<ArrayBuffer>, i));
      this.buffers.set(key, b);
      this.bank.drop(name, v); // the AudioBuffer holds the only copy
      this.stats.rendered++;
    }
    return b;
  }

  /** Renders a sound now so its first play has no hitch. */
  prepare(name: SoundName, v = 0): void { this.buffer(name, v); }

  /** Frees a rendered sound, such as a far region's bed. It is rendered again if played. */
  release(name: SoundName): void {
    for (let v = 0; v < SOUNDS[name].variants; v++) {
      const key = `${name}:${v}`;
      if (this.voices.some((x) => x.name === name && x.end > this.now)) return;
      this.buffers.delete(key);
      this.bank.drop(name, v);
      this.asked.delete(key);
    }
  }

  active(t: number, pool?: Bus): number {
    let k = 0;
    for (const v of this.voices) if (v.start <= t && v.end > t && (!pool || v.pool === pool)) k++;
    return k;
  }

  /** Every voice sounding or scheduled, for the sound board's meter. */
  playing(): { name: SoundName; pool: Bus; start: number; end: number }[] {
    return this.voices.filter((v) => v.end > this.now).map(({ name, pool, start, end }) => ({ name, pool, start, end }));
  }

  private pick(name: SoundName, d: SoundDef, o: PlayOptions): number {
    if (o.variant !== undefined) return clamp(Math.round(o.variant), 0, d.variants - 1);
    if (d.grade === 'rarity' && o.rarity !== undefined) return clamp(Math.round(o.rarity), 0, d.variants - 1);
    if (d.grade === 'level' && o.level !== undefined) return clamp(Math.floor(o.level * d.variants), 0, d.variants - 1);
    if (d.grade !== 'random' || d.variants <= 1) return 0;
    const prev = this.last.get(name) ?? -1, v = (prev + 1 + Math.floor(this.rand() * (d.variants - 1))) % d.variants;
    this.last.set(name, v);
    return v;
  }

  private prune(): void {
    const t = this.now;
    if (!this.voices.some((v) => v.end <= t)) return;
    this.voices = this.voices.filter((v) => {
      if (v.end > t) return true;
      this.byId.delete(v.id);
      return false;
    });
    this.pending = this.pending.filter((v) => v.end > t);
  }

  pump(): void {
    const t = this.now, dt = this.lastPump ? Math.min(0.25, t - this.lastPump) : PUMP;
    this.lastPump = t;
    if (this.pending.length) {
      const keep: Voice[] = [];
      for (const v of this.pending) {
        if (v.end <= Math.max(t, v.start)) continue;
        if (v.start - t < LOOKAHEAD) this.build(v); else keep.push(v);
      }
      this.pending = keep;
    }
    this.prune();
    if (this.running) for (const f of this.pumps) f(dt);
  }

  private build(v: Voice): void {
    const c = this.ctx, t = this.now, d = SOUNDS[v.name], sp = this.spatial(v.at, d.range, d.near);
    const begin = Math.max(v.start, t), offset = d.loop ? 0 : (begin - v.start) * v.rate;
    if (!d.loop && offset >= v.buffer.duration) return;
    const src = c.createBufferSource();
    src.buffer = v.buffer;
    src.playbackRate.value = v.rate;
    if (d.loop && v.duration !== undefined && d.climb !== 1) {
      src.playbackRate.setValueAtTime(v.rate, v.start);
      src.playbackRate.linearRampToValueAtTime(v.rate * d.climb, v.start + v.duration);
    }
    const cutoff = Math.min(v.cutoff, sp.cutoff), pan = clamp(sp.pan + v.pan, -1, 1), mono = v.buffer.numberOfChannels === 1;
    let lp: BiquadFilterNode | null = null, pn: StereoPannerNode | null = null, head: AudioNode = src;
    if (v.tone || cutoff < OPEN) {
      lp = c.createBiquadFilter();
      lp.type = 'lowpass'; kRate(lp.frequency); kRate(lp.Q);
      lp.frequency.value = cutoff; lp.Q.value = 0.5;
      head = head.connect(lp);
    }
    const amp = c.createGain();
    head = head.connect(amp);
    if ((v.tone && v.at) || Math.abs(pan) > 0.01) {
      pn = c.createStereoPanner();
      kRate(pn.pan);
      pn.pan.value = pan;
      head = head.connect(pn);
    }
    head.connect(this.buses[v.pool]);
    const centre = !pn && mono ? Math.SQRT1_2 : 1;
    const level = v.gain * sp.gain * centre * (1 + (this.rand() - 0.5) * 0.12);
    amp.gain.value = level;
    if (v.fadeIn > 0 && offset === 0) {
      amp.gain.setValueAtTime(0, begin);
      amp.gain.linearRampToValueAtTime(level, begin + v.fadeIn);
    }
    if (d.loop) {
      src.loop = true;
      if (v.duration !== undefined) {
        amp.gain.setValueAtTime(level, v.start + v.duration);
        amp.gain.linearRampToValueAtTime(0, v.start + v.duration + 0.35);
      }
    }
    if (Number.isFinite(v.end) && (d.loop ? v.duration === undefined || v.end < v.start + v.duration + 0.4 : v.end < v.start + v.buffer.duration / v.rate - 1e-3)) {
      amp.gain.setTargetAtTime(0, Math.max(begin, v.end), 0.006);
    }
    src.start(begin, offset);
    if (Number.isFinite(v.end)) src.stop(Math.max(begin, v.end) + 0.03);
    v.nodes = { src, lp, amp, pan: pn };
    src.onended = () => {
      src.disconnect(); lp?.disconnect(); amp.disconnect(); pn?.disconnect();
      v.nodes = null;
      v.end = Math.min(v.end, this.now);
    };
  }

  private kill(v: Voice, at: number): void {
    const t = Math.max(at, this.now);
    v.end = Math.min(v.end, t);
    const nd = v.nodes;
    if (!nd) return;
    nd.amp.gain.cancelScheduledValues(t);
    nd.amp.gain.setTargetAtTime(0, t, 0.006);
    try { nd.src.stop(t + 0.03); } catch { /* already stopped */ }
  }

  /** Plays a sound and returns its voice id, or 0 if it was too quiet, too far or outranked. */
  play(name: SoundName, o: PlayOptions = {}): number {
    const d: SoundDef = SOUNDS[name];
    if (!d || this.ctx.state === 'closed') return 0;
    const at = d.bus === 'ui' ? null : o.pos ?? null;
    const sp = this.spatial(at, d.range, d.near), gain = d.gain * (o.gain ?? 1) * sp.gain;
    if (gain < 0.003) { this.stats.dropped++; return 0; }
    this.prune();
    const when = this.now + (o.delay ?? 0) + sp.delay, score = (o.priority ?? d.priority) * (0.25 + Math.min(1, gain));
    const variant = this.pick(name, d, o);
    const buffer = this.buffer(name, variant), rate = (o.rate ?? 1) * (1 + d.jitter * (this.rand() * 2 - 1));
    const until = d.loop ? (o.duration !== undefined ? when + o.duration + 0.4 : Infinity) : when + buffer.duration / rate;
    const sounding = this.voices.filter((v) => v.start < until && v.end > when && v.end > v.start);
    const contest = (rivals: Voice[], cap: number): Voice[] | null => {
      if (rivals.length < cap) return [];
      const starts = rivals.map((v) => v.start).sort(byTime), ends = rivals.map((v) => v.end).sort(byTime);
      const pts = [when];
      for (const t of starts) if (t > when) pts.push(t);
      const cnt = pts.map((t) => upTo(starts, t) - upTo(ends, t));
      let over = 0;
      for (const k of cnt) if (k >= cap) over++;
      if (!over) return [];
      const weaker = rivals.filter((v) => v.score < score).sort((x, y) => x.score - y.score || x.start - y.start), victims: Voice[] = [];
      for (const v of weaker) {
        let first = -1;
        for (let i = below(pts, v.start); i < pts.length && pts[i] < v.end; i++) if (cnt[i] >= cap) { first = i; break; }
        if (first < 0) continue;
        victims.push(v);
        for (let i = first; i < pts.length && pts[i] < v.end; i++) if (cnt[i]-- === cap) over--;
        if (!over) return victims;
      }
      return null;
    };
    const byName = contest(sounding.filter((v) => v.name === name), d.max);
    const byPool = byName && contest(sounding.filter((v) => v.pool === d.bus && !byName.includes(v)), VOICES[d.bus]);
    if (!byName || !byPool) { this.stats.dropped++; return 0; }
    for (const v of [...byName, ...byPool]) { this.kill(v, when); this.stats.stolen++; }
    const v: Voice = {
      id: this.nextId++, name, pool: d.bus, buffer, score, start: when, end: until, duration: d.loop ? o.duration : undefined,
      at, gain: d.gain * (o.gain ?? 1), rate, fadeIn: o.fadeIn ?? (d.loop ? 0.02 : 0), pan: o.pan ?? 0, cutoff: o.cutoff ?? 20000, tone: o.cutoff !== undefined || (d.loop && !!at), nodes: null,
    };
    this.voices.push(v);
    this.byId.set(v.id, v);
    if (when - this.now < LOOKAHEAD) this.build(v); else this.pending.push(v);
    this.stats.started++;
    this.stats.peakVoices = Math.max(this.stats.peakVoices, sounding.length + 1 - byName.length - byPool.length);
    if (this.cues.size) { const cue: Cue = { name, variant, when, gain, pos: at, bus: d.bus }; for (const f of this.cues) f(cue); }
    return v.id;
  }

  /** Changes a playing voice: its level, rate, lowpass or position, gliding over tau seconds. */
  setVoice(id: number, s: { gain?: number; rate?: number; cutoff?: number; pos?: Vec3 | null }, tau = 0.25): void {
    const v = this.byId.get(id);
    if (!v) return;
    const d = SOUNDS[v.name];
    if (s.pos !== undefined && d.bus !== 'ui') v.at = s.pos;
    if (s.gain !== undefined) v.gain = d.gain * s.gain;
    if (s.cutoff !== undefined) v.cutoff = s.cutoff;
    if (s.rate !== undefined) v.rate = s.rate;
    const nd = v.nodes;
    if (!nd) return;
    const t = this.now, sp = this.spatial(v.at, d.range, d.near), centre = !nd.pan && v.buffer.numberOfChannels === 1 ? Math.SQRT1_2 : 1;
    if (s.gain !== undefined || s.pos !== undefined) nd.amp.gain.setTargetAtTime(v.gain * sp.gain * centre, t, tau);
    if (s.pos !== undefined && nd.pan) nd.pan.pan.setTargetAtTime(clamp(sp.pan + v.pan, -1, 1), t, tau);
    if ((s.cutoff !== undefined || s.pos !== undefined) && nd.lp) nd.lp.frequency.setTargetAtTime(Math.min(v.cutoff, sp.cutoff), t, tau);
    if (s.rate !== undefined) nd.src.playbackRate.setTargetAtTime(s.rate, t, tau);
  }

  stopVoice(id: number, fade = 0.3): void {
    const v = this.byId.get(id);
    if (!v) return;
    const t = this.now;
    v.end = Math.min(v.end, t + fade + 0.05);
    const nd = v.nodes;
    if (!nd) return;
    nd.amp.gain.cancelScheduledValues(t);
    nd.amp.gain.setTargetAtTime(0, t, fade / 3);
    try { nd.src.stop(t + fade + 0.05); } catch { /* already stopped */ }
  }

  /** A run of coins, rising in pitch, for a reward of count coins. */
  coins(n: number, pos?: Vec3 | null, delay = 0): void {
    const k = Math.min(24, Math.max(1, Math.round(n)));
    let t = delay;
    for (let i = 0; i < k; i++) {
      this.play('coin', { pos, delay: t, rate: Math.pow(2, Math.min(14, i * 0.75) / 12), gain: 0.7 + 0.3 * (i / k), priority: 5 + Math.min(3, i / 6) });
      t += Math.max(0.035, 0.11 * Math.pow(0.9, i));
    }
  }
}

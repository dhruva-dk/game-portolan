import { rng, SR, type Buf } from './dsp.ts';
import { Bank, SOUNDS, type Bus, type SoundDef, type SoundName } from './sfx.ts';

export interface Point { x: number; y: number; z: number }

export const HEAR = { near: 2, far: 95, speed: 30, eye: 1, radius: 200 };
export const VOICES: Record<Bus, number> = { sfx: 24, ambience: 14, ui: 4 };
export const CEILING = 0.97;
const LEVEL = { sfx: 0.9, ambience: 0.6, ui: 0.7, music: 0.55 };

export type BusName = Bus | 'music';

export interface PlayOptions {
  at?: Point | null;
  gain?: number;
  rate?: number;
  variant?: number;
  delay?: number;
  pan?: number;
  priority?: number;
  duration?: number;
  cutoff?: number;
}

export interface Cue { sound: SoundName; level: number; when: number; near: boolean }

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
  at: Point | null;
  gain: number;
  rate: number;
  pan: number;
  cutoff: number;
  tone: boolean;
  nodes: Nodes | null;
}

const LOOKAHEAD = 0.25, PUMP = 0.05;
const OPEN = 15000;

const kRate = (p: AudioParam): void => { try { p.automationRate = 'k-rate'; } catch {  } };

export class MusicClock {
  bpm = 84;
  origin = 0;
  private readonly ctx: BaseAudioContext;
  constructor(ctx: BaseAudioContext) { this.ctx = ctx; }
  beat(t = this.ctx.currentTime): number { return ((t - this.origin) * this.bpm) / 60; }
  next(div = 1, t = this.ctx.currentTime): number {
    const b = Math.ceil(this.beat(t) / div - 1e-9) * div;
    return this.origin + (b * 60) / this.bpm;
  }
}

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const byTime = (a: number, b: number): number => a - b;
const count = (sorted: number[], t: number, strict: boolean): number => {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (strict ? sorted[m] < t : sorted[m] <= t) lo = m + 1; else hi = m; }
  return lo;
};
const upTo = (sorted: number[], t: number): number => count(sorted, t, false);
const below = (sorted: number[], t: number): number => count(sorted, t, true);
const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class AudioEngine {
  readonly ctx: BaseAudioContext;
  readonly master: GainNode;
  readonly buses: Record<BusName, GainNode>;
  readonly ducks: Record<BusName, GainNode>;
  readonly glue: DynamicsCompressorNode;
  readonly limiter: DynamicsCompressorNode;
  readonly clock: MusicClock;
  key = 293.66;
  readonly bank = new Bank();
  readonly stats = { started: 0, dropped: 0, stolen: 0, peakVoices: 0 };
  readonly listener = { pos: { x: 0, y: 0, z: HEAR.radius } as Point, fwd: { x: 0, y: 1, z: 0 } as Point, near: HEAR.near };
  private readonly live: boolean;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly last = new Map<SoundName, number>();
  private readonly cues = new Set<(c: Cue) => void>();
  private readonly rand = rng(0x28a);
  private voices: Voice[] = [];
  private readonly byId = new Map<number, Voice>();
  private pending: Voice[] = [];
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
    if (this.live) setInterval(() => this.pump(), PUMP * 1000);
    else if (typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext) {
      const o = c, end = o.length / o.sampleRate;
      for (let t = PUMP; t < end - PUMP; t += PUMP) o.suspend(t).then(() => { this.pump(); return o.resume(); }).catch(() => undefined);
    }
  }

  get now(): number { return this.ctx.currentTime; }
  get running(): boolean { return this.ctx.state === 'running'; }

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

  async suspend(): Promise<void> {
    this.held = true;
    if (this.live && this.ctx.state === 'running') await (this.ctx as AudioContext).suspend().catch(() => undefined);
  }

  async resume(): Promise<void> {
    this.held = false;
    if (this.live && this.ctx.state === 'suspended') await (this.ctx as AudioContext).resume().catch(() => undefined);
  }

  setVolumes(v: { sound?: number; music?: number }): void {
    this.volumes = { sound: clamp(v.sound ?? this.volumes.sound, 0, 1), music: clamp(v.music ?? this.volumes.music, 0, 1) };
    const t = this.now;
    for (const b of ['sfx', 'ambience', 'ui'] as const) this.buses[b].gain.setTargetAtTime(LEVEL[b] * this.volumes.sound, t, 0.05);
    this.buses.music.gain.setTargetAtTime(LEVEL.music * this.volumes.music, t, 0.05);
  }

  duck(bus: BusName, db: number, hold: number, release = 0.6, attack = 0.03): void {
    const g = this.ducks[bus].gain, t = this.now, to = Math.pow(10, -Math.abs(db) / 20);
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.min(1, g.value), t);
    g.linearRampToValueAtTime(to, t + attack);
    g.setValueAtTime(to, t + attack + hold);
    g.linearRampToValueAtTime(1, t + attack + hold + release);
  }

  onCue(f: (c: Cue) => void): () => void {
    this.cues.add(f);
    return () => this.cues.delete(f);
  }

  setListener(pos: Point, fwd: Point, near: number = HEAR.near): void {
    this.listener.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.listener.fwd = { x: fwd.x, y: fwd.y, z: fwd.z };
    this.listener.near = Math.max(HEAR.near, near);
  }

  spatial(at: Point | null | undefined): { gain: number; pan: number; cutoff: number; delay: number; d: number } {
    if (!at) return { gain: 1, pan: 0, cutoff: 20000, delay: 0, d: 0 };
    const L = this.listener.pos, F = this.listener.fwd;
    const dx = at.x - L.x, dy = at.y - L.y, dz = at.z - L.z, d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return { gain: 1, pan: 0, cutoff: 20000, delay: 0, d: 0 };
    const ul = Math.hypot(L.x, L.y, L.z) || 1, ux = L.x / ul, uy = L.y / ul, uz = L.z / ul, near = this.listener.near;
    const rx = F.y * uz - F.z * uy, ry = F.z * ux - F.x * uz, rz = F.x * uy - F.y * ux, rl = Math.hypot(rx, ry, rz) || 1;
    const fl = Math.hypot(F.x, F.y, F.z) || 1;
    const side = (dx * rx + dy * ry + dz * rz) / (rl * d), ahead = (dx * F.x + dy * F.y + dz * F.z) / (fl * d);
    const horizon = Math.sqrt(2 * HEAR.radius * Math.max(HEAR.eye, ul - HEAR.radius)), occl = smooth(horizon * 0.8, horizon * 1.6, d);
    const beyond = Math.max(0, d - near);
    let gain = d <= near ? 1 : near / d;
    gain *= (1 - smooth(HEAR.far * 0.75, HEAR.far, d)) * (1 - 0.5 * occl);
    let cutoff = 18000 / (1 + beyond / 12);
    if (ahead < 0) cutoff *= 1 + 0.35 * ahead;
    cutoff *= 1 - 0.85 * occl;
    return { gain, pan: clamp(side * Math.min(1, d / Math.max(HEAR.near, Math.min(near, 6))), -0.85, 0.85), cutoff: Math.max(200, cutoff), delay: beyond > 0.3 ? beyond / HEAR.speed : 0, d };
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

  prepare(name: SoundName, v = 0): void { this.buffer(name, v); }

  active(t: number, pool?: Bus): number {
    let n = 0;
    for (const v of this.voices) if (v.start <= t && v.end > t && (!pool || v.pool === pool)) n++;
    return n;
  }

  get nodes(): number {
    let n = 17;
    for (const v of this.voices) if (v.nodes) n += 2 + (v.nodes.lp ? 1 : 0) + (v.nodes.pan ? 1 : 0);
    return n;
  }

  private pick(name: SoundName, d: SoundDef): number {
    if (d.variants <= 1) return 0;
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
    const t = this.now;
    if (this.pending.length) {
      const keep: Voice[] = [];
      for (const v of this.pending) {
        if (v.end <= Math.max(t, v.start)) continue;
        if (v.start - t < LOOKAHEAD) this.build(v); else keep.push(v);
      }
      this.pending = keep;
    }
    this.prune();
  }

  private build(v: Voice): void {
    const c = this.ctx, t = this.now, sp = this.spatial(v.at), d = SOUNDS[v.name];
    const begin = Math.max(v.start, t), offset = d.loop ? 0 : (begin - v.start) * v.rate;
    if (!d.loop && offset >= v.buffer.duration) return;
    const src = c.createBufferSource();
    src.buffer = v.buffer;
    src.playbackRate.value = v.rate;
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
    amp.gain.value = v.gain * sp.gain * centre * (1 + (this.rand() - 0.5) * 0.12);
    if (d.loop) {
      src.loop = true;
      if (v.duration !== undefined) {
        amp.gain.setValueAtTime(amp.gain.value, v.start + v.duration);
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
    const n = v.nodes;
    if (!n) return;
    n.amp.gain.cancelScheduledValues(t);
    n.amp.gain.setTargetAtTime(0, t, 0.006);
    try { n.src.stop(t + 0.03); } catch {  }
  }

  play(name: SoundName, o: PlayOptions = {}): number {
    const d: SoundDef = SOUNDS[name];
    if (this.ctx.state === 'closed') return 0;
    const sp = this.spatial(o.at), gain = d.gain * (o.gain ?? 1) * sp.gain;
    if (gain < 0.003) { this.stats.dropped++; return 0; }
    this.prune();
    const when = this.now + (o.delay ?? 0) + sp.delay, score = (o.priority ?? d.priority) * (0.25 + Math.min(1, gain));
    const variant = o.variant !== undefined ? Math.min(d.variants - 1, o.variant) : this.pick(name, d);
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
      at: o.at ?? null, gain: d.gain * (o.gain ?? 1), rate, pan: o.pan ?? 0, cutoff: o.cutoff ?? 20000, tone: o.cutoff !== undefined || (d.loop && !!o.at), nodes: null,
    };
    this.voices.push(v);
    this.byId.set(v.id, v);
    if (when - this.now < LOOKAHEAD) this.build(v); else this.pending.push(v);
    this.stats.started++;
    this.stats.peakVoices = Math.max(this.stats.peakVoices, sounding.length + 1 - byName.length - byPool.length);
    if (this.cues.size) { const cue = { sound: name, level: gain, when, near: sp.d < this.listener.near + 4 }; for (const f of this.cues) f(cue); }
    return v.id;
  }

  loop(name: SoundName, o: PlayOptions = {}): number {
    return this.play(name, { gain: 1, ...o });
  }

  setVoice(id: number, s: { gain?: number; rate?: number; cutoff?: number; at?: Point | null }, tau = 0.25): void {
    const v = this.byId.get(id);
    if (!v) return;
    const d = SOUNDS[v.name];
    if (s.at !== undefined) v.at = s.at;
    if (s.gain !== undefined) v.gain = d.gain * s.gain;
    if (s.cutoff !== undefined) v.cutoff = s.cutoff;
    if (s.rate !== undefined) v.rate = s.rate;
    const n = v.nodes;
    if (!n) return;
    const t = this.now, sp = this.spatial(v.at), centre = !n.pan && v.buffer.numberOfChannels === 1 ? Math.SQRT1_2 : 1;
    if (s.gain !== undefined || s.at !== undefined) n.amp.gain.setTargetAtTime(v.gain * sp.gain * centre, t, tau);
    if (s.at !== undefined && n.pan) n.pan.pan.setTargetAtTime(clamp(sp.pan + v.pan, -1, 1), t, tau);
    if ((s.cutoff !== undefined || s.at !== undefined) && n.lp) n.lp.frequency.setTargetAtTime(Math.min(v.cutoff, sp.cutoff), t, tau);
    if (s.rate !== undefined) n.src.playbackRate.setTargetAtTime(s.rate, t, tau);
  }

  stopVoice(id: number, fade = 0.3): void {
    const v = this.byId.get(id);
    if (!v) return;
    const t = this.now;
    v.end = Math.min(v.end, t + fade + 0.05);
    const n = v.nodes;
    if (!n) return;
    n.amp.gain.cancelScheduledValues(t);
    n.amp.gain.setTargetAtTime(0, t, fade / 3);
    try { n.src.stop(t + fade + 0.05); } catch {  }
  }

  ui(name: 'tap' | 'page' | 'quill' | 'confirm' | 'back'): number { return this.play(name); }

  chestOpen(tier: number, at?: Point | null): number {
    return this.play((['open0', 'open1', 'open2', 'open3', 'open4'] as const)[clamp(Math.round(tier), 0, 4)], { at });
  }

  coins(count: number, at?: Point | null, delay = 0): void {
    const k = Math.min(24, Math.max(1, Math.round(count)));
    let t = delay;
    for (let i = 0; i < k; i++) {
      this.play('coin', { at, delay: t, rate: Math.pow(2, Math.min(14, i * 0.75) / 12), gain: 0.7 + 0.3 * (i / k), priority: 5 + Math.min(3, i / 6) });
      t += Math.max(0.035, 0.11 * Math.pow(0.9, i));
    }
  }

  broadside(at: Point, guns: number, opts: { delay?: number; own?: boolean } = {}): void {
    const sp = this.spatial(at), far = sp.d - this.listener.near > 25, g = Math.max(1, Math.round(guns));
    let t = opts.delay ?? 0;
    for (let i = 0; i < g; i++) {
      this.play(far ? 'cannonFar' : 'cannon', { at, delay: t, pan: (g > 1 ? i / (g - 1) - 0.5 : 0) * (far ? 0.05 : 0.3), gain: 0.85 + 0.15 * this.rand() });
      t += 0.07 + 0.08 * this.rand();
    }
    if (opts.own || sp.d < this.listener.near + 4) { this.duck('ambience', 6, 0.6 + t); this.duck('music', 3, 0.4 + t); }
  }

  chord(size: number): number {
    this.duck('music', 6, 1.6);
    return this.play('chord', { variant: clamp(Math.round(size), 0, 3), rate: this.key / 293.66 });
  }
}

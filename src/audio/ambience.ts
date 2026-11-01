// The ambience mixer. Integration tells it where the listener is in the world (how much of each region, the
// weather overhead, surf nearby, wind, speed, height, the Storm, the hour), and it crossfades the beds to match,
// scatters each region's life around the listener, and sets the acoustic space and the fog's muffle.
import { rng } from './dsp.ts';
import { SOUNDS, type SoundName } from './bank.ts';
import { smooth, type AudioEngine, type Vec3 } from './engine.ts';
import { REGION_IDS, REGION_SOUND, type RegionId, type RegionSound } from './regions.ts';

export type Weather = 'fog' | 'rain' | 'thunder' | 'calm' | 'snow' | 'ash';
export const WEATHERS: readonly Weather[] = ['fog', 'rain', 'thunder', 'calm', 'snow', 'ash'];

export interface AmbienceMix {
  /** How much of each region is around the listener. Weights are normalised; a border is two of them. */
  regions?: Partial<Record<RegionId, number>>;
  /** How strongly each kind of weather is overhead, 0 to 1. */
  weather?: Partial<Record<Weather, number>>;
  /** 0 on open sea, 1 with surf breaking right beside you. */
  nearSurf?: number;
  /** Wind at the listener: 0 still, 1 a fresh breeze, 2 a gale. */
  wind?: number;
  /** Your ship's speed through the water, m/s. */
  speed?: number;
  /** How rough the sea is: 0 glassy, 1 normal, 2 heavy. */
  rough?: number;
  /** The listener's height above the sea, m. High up in the Gale the sea fades and the air roars. */
  altitude?: number;
  /** 0 well inside the safe zone, 1 inside the Storm. */
  storm?: number;
  /** 0 day, 1 night. */
  night?: number;
  /** In the Maelstrom: 0 at the rim, 1 at the Eye. The roar rises toward the centre. */
  vortex?: number;
  /** False when there is no ship of yours on the water (spectating, the title): the hull's own beds go quiet. */
  afloat?: boolean;
}

const SHARED = ['sea', 'swell', 'bowWash', 'wind', 'rigging', 'surf', 'night', 'rain', 'rainHeavy', 'fog', 'snow', 'ash', 'calm', 'stormWall', 'galeWind'] as const;
type Shared = (typeof SHARED)[number];

interface Want { gain: number; rate: number; cutoff: number }

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export class Ambience {
  private mix: Required<Omit<AmbienceMix, 'regions' | 'weather'>> & { regions: Partial<Record<RegionId, number>>; weather: Partial<Record<Weather, number>> } = {
    regions: {}, weather: {}, nearSurf: 0, wind: 1, speed: 0, rough: 1, altitude: 0, storm: 0, night: 0, vortex: 0, afloat: true,
  };
  private readonly ids = new Map<SoundName, number>();
  private readonly sent = new Map<SoundName, Want>();
  private readonly quiet = new Map<SoundName, number>();
  private readonly r = rng(0x5ea5);
  private on = false;
  readonly engine: AudioEngine;

  constructor(engine: AudioEngine) {
    this.engine = engine;
    engine.onPump((dt) => this.tick(dt));
  }

  /** Sets the mix. Fields left out keep their last value. The beds glide to it over about a second. */
  set(m: AmbienceMix): void {
    const o = this.mix;
    this.mix = {
      ...o, ...Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined)),
      regions: m.regions ?? o.regions, weather: m.weather ?? o.weather,
    };
    this.on = true;
  }

  /** Fades every bed out. */
  stop(): void {
    this.on = false;
    for (const id of this.ids.values()) this.engine.stopVoice(id, 1.2);
    this.ids.clear();
    this.sent.clear();
  }

  /** Region weights normalised to sum to 1. */
  weights(): [RegionId, number][] {
    const ws = REGION_IDS.map((id) => [id, Math.max(0, this.mix.regions[id] ?? 0)] as [RegionId, number]).filter(([, w]) => w > 0);
    const sum = ws.reduce((a, [, w]) => a + w, 0);
    return sum > 0 ? ws.map(([id, w]) => [id, w / sum]) : [];
  }

  /** What every bed should be doing now. */
  targets(): Map<SoundName, Want> {
    const m = this.mix, w = (k: Weather): number => clamp01(m.weather[k] ?? 0), out = new Map<SoundName, Want>();
    const regions = this.weights(), sum = (f: (r: RegionSound) => number, none: number): number =>
      regions.length ? regions.reduce((a, [id, k]) => a + k * f(REGION_SOUND[id]), 0) : none;
    const high = smooth(25, 150, m.altitude), low = 1 - 0.92 * high;
    const calm = 1 - 0.85 * w('calm'), afloat = m.afloat ? 1 : 0, rough = Math.min(2, Math.max(0, m.rough)) * (1 - 0.5 * w('calm'));
    const seaK = sum((r) => r.sea, 1), windK = sum((r) => r.wind, 1), nightK = sum((r) => r.night, 0.2);
    const wind = Math.min(2, Math.max(0, m.wind)) * calm + 0.5 * w('rain') + 0.6 * w('thunder') + 0.4 * w('snow');
    const set = (name: Shared | SoundName, gain: number, rate = 1, cutoff = 20000): void => { out.set(name, { gain: Math.max(0, gain), rate, cutoff }); };
    set('sea', (0.25 + 0.3 * rough + 0.12 * Math.min(1, m.speed / 8)) * seaK * low, 1, 900 + 3000 * Math.min(1, rough));
    set('swell', (0.2 + 0.25 * rough) * seaK * low);
    set('bowWash', afloat * 0.6 * smooth(1, 14, m.speed) * low, 0.9 + 0.2 * Math.min(1, m.speed / 14));
    set('wind', (0.08 + 0.32 * Math.min(1.6, wind)) * windK * (1 - 0.6 * m.storm) * (1 - 0.7 * high), 0.85 + 0.2 * Math.min(1.6, wind), 700 + 1600 * Math.min(1.6, wind));
    set('rigging', afloat * 0.5 * Math.max(0, wind - 0.8) * windK * low, 0.8 + 0.3 * Math.min(1.6, wind));
    set('surf', 0.8 * clamp01(m.nearSurf) * low);
    set('night', 0.4 * clamp01(m.night) * nightK * (1 - w('rain')) * (1 - w('snow')) * low);
    set('rain', (0.75 * w('rain') + 0.3 * w('thunder')) * (1 - 0.5 * high));
    set('rainHeavy', 0.85 * w('thunder') * (1 - 0.5 * high));
    set('fog', 0.7 * w('fog') * low);
    set('snow', 0.8 * w('snow'));
    set('ash', 0.8 * w('ash') * low);
    set('calm', 0.7 * w('calm') * low);
    set('stormWall', 0.95 * clamp01(m.storm));
    set('galeWind', 0.9 * high, 0.9 + 0.2 * high);
    for (const [id, k] of regions) {
      const r = REGION_SOUND[id], v = id === 'maelstrom' ? clamp01(m.vortex) : 0;
      set(r.bed, r.gain * Math.sqrt(k) * low * (id === 'maelstrom' ? 0.6 + 0.6 * v : 1), 0.92 + 0.2 * v, id === 'maelstrom' ? 1500 + 18000 * v : 20000);
    }
    return out;
  }

  private tick(dt: number): void {
    if (!this.on) return;
    const e = this.engine, want = this.targets();
    // beds no longer wanted fade out
    for (const name of this.ids.keys()) if (!want.has(name)) want.set(name, { gain: 0, rate: 1, cutoff: 20000 });
    for (const [name, { gain: g, rate, cutoff }] of want) {
      let id = this.ids.get(name);
      if (id === undefined) {
        if (g <= 0.01) continue;
        if (!e.ready(name)) { e.want(name); continue; }
        // beds start at their level and glide in from silence; play() would drop a near-silent start
        id = e.play(name, { gain: g, rate, cutoff: cutoff < 20000 ? cutoff : undefined, fadeIn: 1.5 });
        if (!id) continue;
        this.ids.set(name, id);
        this.sent.set(name, { gain: g, rate, cutoff });
      }
      const was = this.sent.get(name);
      if (!was || Math.abs(g - was.gain) > 0.01 + 0.03 * was.gain || Math.abs(rate / was.rate - 1) > 0.004 || Math.abs(cutoff / was.cutoff - 1) > 0.04) {
        e.setVoice(id, { gain: g, rate, cutoff: cutoff < 20000 ? cutoff : undefined }, 0.6);
        this.sent.set(name, { gain: g, rate, cutoff });
      }
      const q = g <= 0.01 ? (this.quiet.get(name) ?? 0) + dt : 0;
      this.quiet.set(name, q);
      if (q > 4 && this.ids.has(name)) { e.stopVoice(id, 0.5); this.ids.delete(name); }
    }
    // a region's bed unheard for a minute is freed, and rendered again if you come back
    for (const [name, q] of this.quiet) {
      if (want.has(name) && want.get(name)!.gain > 0.01) continue;
      const nq = want.has(name) ? q : q + dt;
      if (nq > 60 && name.startsWith('bed')) { e.release(name); this.quiet.delete(name); } else this.quiet.set(name, nq);
    }
    this.space();
    this.life(dt);
  }

  /** The hall, the echo and the fog's muffle. */
  private space(): void {
    const m = this.mix, regions = this.weights(), w = (k: Weather): number => clamp01(m.weather[k] ?? 0);
    let reverb = 0.1, echo = 0, time = 0.35;
    if (regions.length) {
      reverb = echo = time = 0;
      for (const [id, k] of regions) { const r = REGION_SOUND[id]; reverb += k * r.reverb; echo += k * r.echo; time += k * r.echoTime; }
    }
    this.engine.space(reverb + 0.1 * w('fog'), echo, time);
    this.engine.muffle(0.8 * w('fog') + 0.35 * w('snow') + 0.2 * w('rain'));
  }

  /** Scatters each region's life, and far thunder in thunder weather, around the listener. */
  private life(dt: number): void {
    const m = this.mix, e = this.engine, r = this.r, high = smooth(25, 150, m.altitude);
    if (high > 0.7) return;
    const night = m.night > 0.5;
    for (const [id, k] of this.weights()) {
      if (k < 0.05) continue;
      for (const l of REGION_SOUND[id].life) {
        if ((l.when === 'day' && night) || (l.when === 'night' && !night)) continue;
        for (let v = 0; v < SOUNDS[l.sound].variants; v++) e.want(l.sound, v);
        if (r() < (dt / l.every) * k) e.play(l.sound, { pos: this.around(l.dist[0] + r() * (l.dist[1] - l.dist[0]), l.height ?? 1), gain: (l.gain ?? 1) * (0.6 + 0.4 * r()) });
      }
    }
    const thunder = clamp01(m.weather.thunder ?? 0);
    if (thunder > 0 && r() < (dt / 14) * thunder) e.play('thunder', { pos: this.around(300 + r() * 900, 300), gain: 0.5 + 0.5 * thunder });
  }

  /** A point d metres from the listener's spot on the sea, at a random bearing, h metres up. */
  around(d: number, h: number): Vec3 {
    const L = this.engine.listener, R = this.engine.radius, p = L.pos, pl = Math.hypot(p.x, p.y, p.z) || 1;
    const ux = p.x / pl, uy = p.y / pl, uz = p.z / pl, f = L.fwd, k = f.x * ux + f.y * uy + f.z * uz;
    let fx = f.x - k * ux, fy = f.y - k * uy, fz = f.z - k * uz, fl = Math.hypot(fx, fy, fz);
    if (fl < 1e-6) { fx = -uy; fy = ux; fz = 0; fl = Math.hypot(fx, fy) || 1; }
    fx /= fl; fy /= fl; fz /= fl;
    const rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
    const a = this.r() * Math.PI * 2, c = Math.cos(a) * d, s = Math.sin(a) * d;
    const qx = ux * R + fx * c + rx * s, qy = uy * R + fy * c + ry * s, qz = uz * R + fz * c + rz * s, ql = Math.hypot(qx, qy, qz) || 1, to = (R + h) / ql;
    return { x: qx * to, y: qy * to, z: qz * to };
  }

  /** Renders a region's bed and life ahead of arriving there. */
  prepare(id: RegionId): void {
    const r = REGION_SOUND[id];
    this.engine.want(r.bed);
    for (const l of r.life) this.engine.want(l.sound);
  }
}

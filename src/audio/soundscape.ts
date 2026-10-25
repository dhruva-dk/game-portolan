// WP28: the match heard. Soundscape keeps the ambience beds (sea, swell, surf, wind, rigging, rain, the storm wall,
// night, harbour, the Maelstrom, steam) at levels the sim's state sets, and the player's own ship alive between events
// (hull creak with sea and heel, bow slaps, canvas filling and flogging, blocks on a sail change, thunder in squalls, gulls
// along the coast). MatchAudio turns every tick's events into sounds placed where they happen. GameAudio is what the app
// holds: one engine, unlocked on the first touch, suspended with the app, a match's audio while one runs.
import { AFLOAT, EVENT, type MatchState } from '../sim/state.ts';
import { aground, newWind, vortexAt, windAt, type Sea } from '../sim/environment.ts';
import { hourOf, newSky, skyAt } from '../sim/weather.ts';
import { newStormView, stormView } from '../sim/storm.ts';
import { BATTERY, CONSUMABLE } from '../sim/tables.ts';
import { rng } from './dsp.ts';
import { AudioEngine, type Point } from './engine.ts';
import type { SoundName } from './sfx.ts';

export interface Scene {
  wind: number; // the wind's strength over the listener, fair = 1
  gust: number; // 0…1
  speed: number; // the own ship's speed, u/s
  turn: number; // its turn rate, rad/s (heel follows it)
  rough: number; // the sea's roughness, fair = 1
  rain: number; // 0…1: squall depth
  storm: number; // 0…1: nearness of the storm wall, 1 inside
  coast: number; // 0…1: land near (surf)
  night: number; // 0…1
  harbour: number; // 0…1
  maelstrom: number; // 0…1
  steam: number; // 0…1
  afloat: boolean;
}

export const calmScene = (): Scene => ({
  wind: 1, gust: 0, speed: 0, turn: 0, rough: 1, rain: 0, storm: 0, coast: 0, night: 0, harbour: 0, maelstrom: 0, steam: 0, afloat: true,
});

const BEDS = ['sea', 'swell', 'surf', 'wind', 'rigging', 'rain', 'storm', 'night', 'harbour', 'maelstrom', 'steam'] as const;
type Bed = (typeof BEDS)[number];

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const len = (p: Point): number => Math.hypot(p.x, p.y, p.z);

/** A point `d` u from p across the water toward bearing a (radians from fwd toward the right), on p's sphere. */
function offset(p: Point, fwd: Point, a: number, d: number): Point {
  const l = len(p) || 1, ux = p.x / l, uy = p.y / l, uz = p.z / l;
  const rx = fwd.y * uz - fwd.z * uy, ry = fwd.z * ux - fwd.x * uz, rz = fwd.x * uy - fwd.y * ux;
  const c = Math.cos(a) * d, s = Math.sin(a) * d;
  const q = { x: p.x + fwd.x * c + rx * s, y: p.y + fwd.y * c + ry * s, z: p.z + fwd.z * c + rz * s }, m = l / (len(q) || 1);
  return { x: q.x * m, y: q.y * m, z: q.z * m };
}

export class Soundscape {
  private readonly ids = new Map<Bed, number>();
  private readonly quiet = new Map<Bed, number>();
  private readonly sent = new Map<Bed, [number, number, number]>();
  private readonly r = rng(0x5ea5);
  private sail = -1;
  private readonly engine: AudioEngine;
  constructor(engine: AudioEngine) { this.engine = engine; }

  /** The beds' levels, pitch and brightness from the scene; a bed starts when first heard and stops after 4 s silent. */
  beds(s: Scene, dt: number): void {
    const w = Math.min(1.6, s.wind), wg = Math.min(1.6, s.wind + s.gust * 0.5), ashore = Math.max(s.coast, s.harbour);
    const want: Record<Bed, [number, number, number]> = {
      sea: [0.3 + 0.35 * Math.min(1.5, s.rough) + 0.15 * Math.min(1, s.speed / 6), 1, 900 + 3000 * Math.min(1, s.rough)],
      swell: [0.25 + 0.3 * Math.min(1.5, s.rough), 1, 20000],
      surf: [0.85 * s.coast, 1, 20000],
      wind: [(0.12 + 0.4 * w) * (1 - 0.5 * s.storm), 0.85 + 0.25 * w, 700 + 1800 * w],
      rigging: [0.6 * Math.max(0, wg - 0.65), 0.8 + 0.35 * wg, 20000],
      rain: [0.75 * s.rain, 1, 20000],
      storm: [0.95 * s.storm, 1, 600 + 6000 * s.storm],
      night: [0.3 * s.night * (1 - s.rain) * Math.max(0, 1 - s.wind / 2) * ashore, 1, 20000],
      harbour: [0.6 * s.harbour, 1, 20000],
      maelstrom: [0.9 * s.maelstrom, 1, 20000],
      steam: [0.5 * s.steam, 1, 20000],
    };
    for (const b of BEDS) {
      const [g, rate, cutoff] = want[b];
      let id = this.ids.get(b);
      if (id === undefined) {
        if (g <= 0.01) continue;
        id = this.engine.loop(b, { gain: 0.01, cutoff: cutoff < 20000 ? cutoff : undefined });
        if (!id) continue;
        this.ids.set(b, id);
        this.sent.delete(b);
      }
      // steer it only when the scene has moved it audibly: every automation event keeps the audio thread busy
      const was = this.sent.get(b);
      if (!was || Math.abs(g - was[0]) > 0.01 + 0.03 * was[0] || Math.abs(rate / was[1] - 1) > 0.004 || Math.abs(cutoff / was[2] - 1) > 0.04) {
        this.engine.setVoice(id, { gain: g, rate, cutoff: cutoff < 20000 ? cutoff : undefined }, 0.6);
        this.sent.set(b, [g, rate, cutoff]);
      }
      const q = g <= 0.01 ? (this.quiet.get(b) ?? 0) + dt : 0;
      this.quiet.set(b, q);
      if (q > 4) { this.engine.stopVoice(id, 0.5); this.ids.delete(b); }
    }
  }

  /** The own ship and the air between events: chance per frame of each, by the scene. */
  life(s: Scene, dt: number, sail: number, me: Point, fwd: Point, windAhead: number): void {
    const e = this.engine, r = this.r, chance = (perSecond: number): boolean => r() < perSecond * dt;
    if (s.afloat) {
      const heel = clamp(Math.abs(s.turn) * s.speed * 0.4, 0, 1);
      if (chance(0.12 + 0.5 * Math.min(1.5, s.rough) * Math.min(1, s.speed / 3) + 0.9 * heel)) e.play('creak', { gain: 0.45 + 0.55 * heel, pan: (r() - 0.5) * 0.6 });
      if (chance((0.25 + 0.3 * s.speed) * Math.min(1.5, s.rough))) e.play('slap', { gain: 0.3 + 0.4 * Math.min(1, s.speed / 6), pan: (r() - 0.5) * 0.8 });
      if (windAhead > 0.6 && sail > 0 && chance(0.5)) e.play('canvasFlog', { gain: 0.4 + 0.4 * Math.min(1, s.wind) });
      if (this.sail >= 0 && sail !== this.sail) {
        e.play('block', { pan: 0.2 });
        e.play(sail > this.sail ? 'canvasFill' : 'canvasFlog', { delay: 0.12, gain: sail > this.sail ? 1 : 0.6 });
      }
      this.sail = sail;
    }
    if ((s.rain > 0.5 || s.storm > 0.6) && chance(1 / 14)) e.play('thunder', { at: offset(me, fwd, r() * Math.PI * 2, 20 + r() * 50) });
    if (s.night < 0.5 && s.coast > 0.2 && chance(0.06 * s.coast)) e.play('gull', { at: offset(me, fwd, r() * Math.PI * 2, 6 + r() * 14), gain: 0.6 });
    if (s.harbour > 0.3 && chance(1 / 25)) e.play('bell', { at: offset(me, fwd, r() * Math.PI * 2, 8) });
  }

  stop(): void {
    for (const id of this.ids.values()) this.engine.stopVoice(id, 0.8);
    this.ids.clear();
  }
}

/** What a match event sounds like, placed where it happens. */
export interface Happening { kind: number; ship: number; by: number; at: Point; amount: number }

const CONSUMABLE_SOUND: Record<number, SoundName> = {
  [CONSUMABLE.patchKit]: 'patch', [CONSUMABLE.ward]: 'ward', [CONSUMABLE.gust]: 'gust', [CONSUMABLE.fogFlask]: 'fogFlask', [CONSUMABLE.flare]: 'flare',
};

/** A claim's size class for the chord and its coins, from its area in u². */
const sizeOf = (u2: number): number => (u2 < 150 ? 0 : u2 < 600 ? 1 : u2 < 2000 ? 2 : 3);

export class MatchAudio {
  readonly scape: Soundscape;
  readonly scene = calmScene();
  private readonly wind = newWind();
  private readonly sky = newSky();
  private readonly sv = newStormView();
  private readonly fires = new Map<number, { id: number; until: number }>();
  private readonly vort: Point = { x: 0, y: 0, z: 0 };
  private fwd: Point = { x: 0, y: 1, z: 0 };
  private windAhead = 0;
  private sceneAge = 1;
  private coastAge = 1;
  private streak = { t: -9, n: 0 };
  private time = 0;

  readonly engine: AudioEngine;
  readonly sea: Sea | null;
  readonly me: number;
  constructor(engine: AudioEngine, sea: Sea | null, me = 0) {
    this.engine = engine;
    this.sea = sea;
    this.me = me;
    this.scape = new Soundscape(engine);
  }

  private posOf(state: MatchState, i: number): Point | null {
    const s = state.ships[i];
    return s ? s.pos : null;
  }

  /** After every tick: its events. */
  tick(state: MatchState): void {
    for (const e of state.events) this.event(e, (i) => this.posOf(state, i));
  }

  /** One event; `pos` gives a ship's position. Exposed for the tests. */
  event(e: Happening, pos: (ship: number) => Point | null): void {
    const a = this.engine, mine = e.ship === this.me, at = e.at, shipAt = pos(e.ship) ?? at;
    const L = a.listener.pos, near = Math.hypot(at.x - L.x, at.y - L.y, at.z - L.z) < 8;
    switch (e.kind) {
      case EVENT.home: if (mine) a.chord(0); break;
      case EVENT.loop:
        if (mine) { const k = sizeOf(e.amount); a.chord(k); a.coins(4 + k * 4, null, 0.35); } else a.play('chord', { at, gain: 0.35, variant: 0 });
        break;
      case EVENT.broken: if (mine || e.by === this.me) a.play('broken', { gain: mine ? 1 : 0.6 }); else a.play('broken', { at, gain: 0.5 }); break;
      case EVENT.spill: a.coins(Math.min(8, 2 + e.amount / 20), mine ? null : at); break;
      case EVENT.bank: if (mine) { a.play('bank'); a.coins(Math.min(20, 4 + e.amount / 25), null, 0.1); } break;
      case EVENT.scoop:
        if (e.by === AFLOAT.coin) {
          if (mine) {
            this.streak = this.time - this.streak.t < 1.5 ? { t: this.time, n: this.streak.n + 1 } : { t: this.time, n: 0 };
            a.play('coin', { rate: Math.pow(2, Math.min(12, this.streak.n) / 12) });
          } else a.play('coin', { at, gain: 0.6 });
        } else a.play(e.by === AFLOAT.bottle ? 'coin' : 'block', { at: mine ? null : at, rate: e.by === AFLOAT.bottle ? 0.5 : 1 });
        break;
      case EVENT.lead: if (mine || e.by === this.me) a.play('lead'); break;
      case EVENT.find: a.chestOpen(1, mine ? null : at); break;
      case EVENT.erupt: a.play('erupt', { at }); this.scene.steam = 1; break;
      case EVENT.breakOff: case EVENT.thrown: if (mine) a.play('rush'); break;
      case EVENT.sunk:
        a.play('groan', { at: mine ? null : shipAt });
        if (mine) a.duck('ambience', 8, 3);
        this.douse(e.ship);
        break;
      case EVENT.bounty: if (mine) a.coins(Math.min(16, 3 + e.amount / 20)); break;
      case EVENT.chest: a.play('splash', { at, gain: 0.5, rate: 0.8 }); break;
      case EVENT.win: if (mine) a.chord(3); break;
      case EVENT.broadside:
        a.broadside(mine ? L : at, e.amount === BATTERY.port || e.amount === BATTERY.starboard ? 4 : 2, { own: mine });
        break;
      case EVENT.hit:
        if (mine) { a.play('hit', { gain: 1 }); a.duck('ambience', 5, 0.4); }
        else if (near && e.by !== this.me) { a.play('whistle', { at }); a.play('hit', { at, delay: 0.2 }); }
        else a.play('hit', { at });
        break;
      case EVENT.splash:
        if (near && e.ship !== this.me) a.play('whistle', { at });
        a.play(e.amount === 1 ? 'thud' : 'splash', { at, delay: near ? 0.2 : 0 });
        break;
      case EVENT.ram: a.play('ram', { at: mine || e.by === this.me ? null : at }); break;
      case EVENT.struck: a.play('scrape', { at: mine ? null : shipAt }); break;
      case EVENT.ablaze: {
        a.play('ignite', { at: mine ? null : shipAt });
        const id = this.fires.get(e.ship)?.id ?? a.loop('crackle', { at: mine ? null : shipAt, gain: 0.8 });
        if (id) this.fires.set(e.ship, { id, until: this.time + Math.min(40, e.amount) });
        break;
      }
      case EVENT.opened: if (mine) a.chestOpen(e.amount); break;
      case EVENT.chosen: if (mine) a.play('confirm'); break;
      case EVENT.swapped: if (mine) a.play('block'); break;
      case EVENT.used: { const s = CONSUMABLE_SOUND[e.by]; if (s) a.play(s, { at: mine ? null : shipAt }); break; }
      case EVENT.keg: a.play('splash', { at, gain: 0.4, rate: 1.3 }); break;
      case EVENT.kegBurst: case EVENT.shell: a.play('explosion', { at }); break;
      case EVENT.mortar: a.play('mortar', { at: mine ? null : shipAt }); break;
      case EVENT.called: if (mine) { a.play('kek'); a.coins(Math.min(6, 1 + e.amount / 40)); } break;
      case EVENT.departed: a.play('wings', { at: mine ? null : at, gain: 0.7 }); break;
      case EVENT.returning: a.play('gull', { at }); break;
      case EVENT.landed: a.play('chestLand', { at: mine ? null : shipAt }); break;
      case EVENT.chestLost: a.play('splash', { at }); break;
      case EVENT.dive: a.play('dive', { at }); break;
      case EVENT.snatch: if (mine) { a.play('kek'); a.coins(4); } break;
      case EVENT.spotted: if (mine) a.play('kek', { at }); break;
      default: break;
    }
  }

  private douse(ship: number): void {
    const f = this.fires.get(ship);
    if (f) { this.engine.stopVoice(f.id, 1.2); this.fires.delete(ship); }
  }

  /** The scene over the listener from the sim, at 10 Hz; coast and Maelstrom sampled at 2 Hz. */
  private sense(state: MatchState, me: Point): void {
    const sea = this.sea, s = this.scene, ship = state.ships[this.me];
    s.afloat = !!ship && ship.hull > 0;
    s.speed = ship ? Math.abs(ship.speed) : 0;
    s.turn = ship ? ship.rate : 0;
    const h = hourOf(state);
    s.night = clamp(smooth(19, 21, h) + 1 - smooth(4.5, 6.5, h), 0, 1);
    if (sea) {
      windAt(sea, state, me, this.wind);
      s.wind = this.wind.strength; s.gust = this.wind.gust;
      const wl = len(this.wind.v) || 1;
      this.windAhead = -(this.wind.v.x * this.fwd.x + this.wind.v.y * this.fwd.y + this.wind.v.z * this.fwd.z) / wl;
    }
    skyAt(state, me, this.sky);
    s.rough = this.sky.rough; s.rain = this.sky.squall;
    stormView(state, this.sv);
    const c = this.sv.calm, cl = len(c.at) || 1, ml = len(me) || 1;
    const ang = Math.acos(clamp((me.x * c.at.x + me.y * c.at.y + me.z * c.at.z) / (cl * ml), -1, 1)), edge = (c.r - ang) * ml;
    s.storm = c.r >= Math.PI - 1e-6 ? 0 : edge < 0 ? 1 : 1 - smooth(0, 30, edge);
    if (this.coastAge >= 0.5 && sea) {
      this.coastAge = 0;
      let coast = 0, swirl = vortexAt(me, this.vort) ? 1 : 0;
      for (const [d, wgt] of [[3, 1], [7, 0.6], [12, 0.3]] as const) {
        for (let k = 0; k < 8 && coast < wgt; k++) if (aground(sea, state, offset(me, this.fwd, (k * Math.PI) / 4, d))) coast = Math.max(coast, wgt);
      }
      if (!swirl) for (let k = 0; k < 4; k++) if (vortexAt(offset(me, this.fwd, (k * Math.PI) / 2, 10), this.vort)) swirl = 0.5;
      s.coast += (coast - s.coast) * 0.5;
      s.maelstrom += (swirl - s.maelstrom) * 0.5;
    }
  }

  /** Every frame: the listener on the own ship (WP25's camera may set it instead), the scene, beds, life and fires. */
  frame(state: MatchState, dt: number): void {
    this.time += dt;
    this.sceneAge += dt;
    this.coastAge += dt;
    const ship = state.ships[this.me];
    if (!ship) return;
    const me = ship.pos, l = len(me) || 1, h = ship.head, up = (h.x * me.x + h.y * me.y + h.z * me.z) / (l * l);
    const fx = h.x - up * me.x, fy = h.y - up * me.y, fz = h.z - up * me.z, fl = Math.hypot(fx, fy, fz);
    if (fl > 1e-9) this.fwd = { x: fx / fl, y: fy / fl, z: fz / fl };
    this.engine.setListener(me, this.fwd);
    if (this.sceneAge >= 0.1) { this.sense(state, me); this.sceneAge = 0; }
    this.scene.steam = Math.max(0, this.scene.steam - dt / 20);
    this.scape.beds(this.scene, dt);
    this.scape.life(this.scene, dt, ship.sail, me, this.fwd, this.windAhead);
    for (const [i, f] of this.fires) {
      const s = state.ships[i];
      if (!s || this.time > f.until || s.fire <= 0) this.douse(i);
      else if (i !== this.me) this.engine.setVoice(f.id, { at: s.pos });
    }
  }

  stop(): void {
    this.scape.stop();
    for (const i of [...this.fires.keys()]) this.douse(i);
  }
}

/** The app's audio: the engine, unlocked on the first touch, its bank rendered by a worker, and a match's audio while one runs. */
export class GameAudio {
  private match: MatchAudio | null = null;
  readonly engine: AudioEngine;
  constructor(engine: AudioEngine) { this.engine = engine; }

  /** null where Web Audio is unavailable. */
  static create(target?: EventTarget): GameAudio | null {
    try {
      const g = new GameAudio(new AudioEngine());
      g.engine.unlockOn(target ?? window);
      try { // the bank renders in a worker, beds and the commonest sounds first; anything asked for sooner renders inline
        const w = new Worker(new URL('./bankWorker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<{ name: SoundName; v: number; chs: Float32Array[] }>) => g.engine.bank.put(e.data.name, e.data.v, e.data.chs);
      } catch { /* no workers */ }
      return g;
    } catch {
      return null;
    }
  }

  startMatch(sea: Sea): void {
    this.match?.stop();
    this.match = new MatchAudio(this.engine, sea);
  }

  /** After every tick of the running match. */
  tick(state: MatchState): void { this.match?.tick(state); }

  /** Every frame. */
  frame(dt: number, state: MatchState | null): void {
    if (this.match && state) this.match.frame(state, dt);
  }

  endMatch(): void {
    this.match?.stop();
    this.match = null;
  }

  suspend(): void { void this.engine.suspend(); }
  resume(): void { void this.engine.resume(); }
}

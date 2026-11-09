// One match as the app plays it: the simulation made from the career's plan, stepped by the loop, steered by the
// player's intents (or a script, or a captain at the helm), and read back each frame as moments, the actors' view and
// the stage's view. Ported from the old game's Session (2025e68:src/app/session.ts).
//
// Steering follows the camera: the player turns the look, and the stick says which way to sail relative to it. With no
// look for a moment the view swings back behind the ship, so the keys alone still sail her round. The guns aim along
// the look, as far as its pitch reaches, and lock onto a ship close to that line.
import { captainIndex, CAPTAINS, LEARNING, type Expect, type MatchPlan, type TemperamentId } from '../career/index.ts';
import type { AmbienceMix, RegionId } from '../audio/index.ts';
import type { ActorsView, CosmeticIds, LootView, ProjectileView, ShipView, WhaleView } from '../render/actors/index.ts';
import type { StageView, WeatherSystem } from '../render/stage.ts';
import { sink, settle } from '../sim/end.ts';
import {
  CAUSE, PHASE, PLAYER, SEEN, SHIPS, TICK, WEATHER_NAMES, WHALE_STATE, ZONES, createMatch, hourOf, idleInput, inStorm, matchHash, newStormView,
  newWind, over, seaLevel, seen, step, stormView, sunDir, windAt, type FleetEntry, type MatchSetup, type MatchState, type Ship,
  type ShipInput, type Shot,
} from '../sim/match.ts';
import { ebbAt, sunHeight } from '../sim/environment.ts';
import { R, along, angleTo, apart, flatten, surfaceDistance, tangentAt, tangentToward, turned } from '../sim/sphere.ts';
import { ABOUT, DAY, LOOT, WEAPONS, isWeapon } from '../sim/tables.ts';
import { landing } from '../sim/combat.ts';
import { newSky, skyAt, vigour } from '../sim/weather.ts';
import { deckAt, newDeck } from '../sim/seaway.ts';
import { REGION_COUNT, REGIONS, VORTEX, heightAt, regionWeights, type WeatherKind } from '../sim/world/index.ts';
import { v3, type V3 } from '../sim/math.ts';
import { MatchTally } from './career.ts';
import type { Intents } from './controls.ts';
import type { Moment } from './events.ts';
import type { Stepper } from './loop.ts';
import { gunDir, heldStill, lootKind, momentsOf, weaponOf } from './moments.ts';
import { cosmeticsOf } from './views.ts';

/** The career's temperaments as the simulation's styles (Hunter, Homesteader, Raider, Turtle, Scavenger, Brawler). */
const STYLE: Record<TemperamentId, number> = { hunter: 0, holder: 1, ambusher: 2, survivor: 3, looter: 4, skirmisher: 5 };

export interface PlayOptions {
  seed?: number;
  /** Dive at once and sail on until the player's ship is at sea. */
  skipGale?: boolean;
  /** A captain sails the player's ship. */
  autopilot?: boolean;
  /** The player's input from a tick on, merged into what was held: [[tick, input], ...]. */
  script?: [number, Partial<ShipInput>][];
}

/** The career's expectation (confidence 0 to LEARNING.full) as the simulation keeps it (confidence 0 to 1). */
const sure = (e: Expect): Expect => ({ value: e.value, confidence: Math.min(1, e.confidence / LEARNING.full) });

/** The simulation's setup for the career's plan: the player as ship 0, the plan's captains as ships 1 to 19. */
export function setupFrom(plan: MatchPlan, seed = plan.seed): MatchSetup {
  const fleet: FleetEntry[] = [{ captain: false, name: 0, look: 0, active: plan.player.active, passive: plan.player.passive }];
  plan.fleet.forEach((e, k) => {
    const knows = e.knows;
    fleet.push({
      captain: true, name: k + 1, look: Math.max(0, captainIndex(e.captain)), temperament: STYLE[e.temperament], skill: e.skill,
      gentle: e.gentle, active: e.active, passive: e.passive,
      // what it learnt of the player: where they dive, when they run and how long they stay out in the Storm
      mind: {
        ...(knows.drop.value >= 0 ? { dive: sure(knows.drop) } : {}),
        ...(knows.runAt.value > 0 ? { run: sure(knows.runAt) } : {}),
        ...(knows.storm.value >= 0 ? { storm: sure(knows.storm) } : {}),
      },
    });
  });
  return { seed, fleet, gentle: plan.first };
}

const SECOND = Math.round(1 / TICK);
/** Riding to a marked dive: within this of the mark (m) she drops straight down to it. */
const PICK = { drop: 120 } as const;
const AIM = { near: 40, far: 260, lock: 300, cone: 0.2, pitch: [0.06, 0.6] as const };
const WIND = newWind(), STORM = newStormView(), DECK = newDeck();
/** What the ear reads: the region weights, the sky, and land felt for on eight bearings this far out (m). */
const EAR = { weights: new Float64Array(REGION_COUNT), sky: newSky(), t: v3(), q: v3(), surf: 35 };
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Where a falling shell will come down. */
const LAND = v3();
const metres = (p: V3, h = 0, out: V3 = v3()): V3 => {
  out.x = p.x * (R + h);
  out.y = p.y * (R + h);
  out.z = p.z * (R + h);
  return out;
};

/** Between last tick's position and this one's, `k` of the way. */
function between(a: V3, b: V3, k: number, out: V3): V3 {
  const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, z = a.z + (b.z - a.z) * k, l = Math.hypot(x, y, z) || 1;
  out.x = x / l;
  out.y = y / l;
  out.z = z / l;
  return out;
}

export class Session implements Stepper {
  readonly state: MatchState;
  readonly plan: MatchPlan;
  readonly tally: MatchTally;
  readonly names: string[];
  readonly looks: CosmeticIds[];
  /** Every moment as it happens; the app routes them on. */
  onMoment: (m: Moment) => void = () => {};
  /** Where the player looks: a tangent at the ship followed, and how far down (radians). */
  readonly view: V3;
  pitch = 0.2;
  /** Fire and dive held at least once since the last tick: a tap between ticks still reaches one. */
  private firing = false;
  private diving = false;
  /** The ship the camera follows: the player's, or after they sink, the one they watch. */
  watch = PLAYER;
  /** The ship the guns have locked onto, or -1, and the point they aim at (a unit vector). */
  lock = -1;
  /** Fire on its own while the guns hold a lock (a setting). */
  autoFire = false;
  /** Where the player marked on the full map (a unit vector), or null: she leaves the Gale as she nears
   *  it, then glides for it and drops. */
  mark: V3 | null = null;
  private targetD = Infinity;
  readonly aim = v3(0, 0, 1);
  private readonly input = idleInput();
  private readonly held = idleInput();
  /** How much sail the player has set. */
  get throttle(): number {
    return this.input.throttle;
  }
  private script: [number, Partial<ShipInput>][] | null;
  /** Where a scripted moment aims, for the view to turn to as a player's look would, or null. */
  private scriptAim: V3 | null = null;
  private readonly look = v3();
  /** The other ships' inputs while a scripted moment holds them still, or null for their captains. */
  private still: (ShipInput | null)[] | null = null;
  private readonly autopilot: boolean;
  private readonly buf: Moment[] = [];
  private readonly ids = new WeakMap<Shot, number>();
  private nextId = 1;
  private hurtTick = -1e9;
  private readonly p = v3();
  private readonly q = v3();
  private readonly want = v3();
  private readonly ships: ShipView[] = [];
  private readonly shots: ProjectileView[] = [];
  private readonly loot: LootView[] = [];
  private readonly whale: WhaleView = { id: 0, pos: v3(), head: v3(), state: 'deep', k: 0 };

  constructor(plan: MatchPlan, look: CosmeticIds, o: PlayOptions = {}) {
    this.plan = plan;
    this.state = createMatch(setupFrom(plan, o.seed ?? plan.seed));
    this.tally = new MatchTally(SHIPS);
    this.names = ['You', ...plan.fleet.map((e) => e.name)];
    this.looks = [look, ...plan.fleet.map((e) => cosmeticsOf(CAPTAINS[captainIndex(e.captain)]?.look ?? e.look))];
    plan.fleet.forEach((e, k) => { this.state.ships[k + 1].captain.grudge = e.grudge; });
    this.script = o.script ? [...o.script].sort((a, b) => a[0] - b[0]) : null;
    this.autopilot = o.autopilot ?? false;
    if (this.autopilot) this.state.ships[PLAYER].captain.on = true;
    this.view = { ...this.state.gale.head };
    if (o.skipGale) this.skipGale();
  }

  get me(): Ship {
    return this.state.ships[PLAYER];
  }

  /** Where ship i is on the water, in the world's metres. */
  shipAt(i: number): V3 {
    return metres(this.state.ships[i].pos);
  }

  get over(): boolean {
    return over(this.state);
  }

  /** Seconds since the match began. */
  get seconds(): number {
    return this.state.tick * TICK;
  }

  step(): boolean {
    const s = this.state;
    if (over(s)) return false;
    step(s, this.autopilot ? null : this.script ? this.scripted() : this.input, this.still);
    this.spend();
    this.read();
    if (s.tick % SECOND === 0) this.sample();
    return true;
  }

  /** Stages a scripted moment: the player's input from now on, and with `hold` every other ship held still. */
  stage(script: [number, Partial<ShipInput>][], hold: boolean): void {
    this.script = [...script].sort((a, b) => a[0] - b[0]);
    this.still = hold ? heldStill() : null;
    const w = this.state.ships[this.watch], aim = this.script.find(([, inp]) => inp.aim)?.[1].aim;
    this.scriptAim = aim && this.watch === PLAYER ? { ...aim } : null;
    if (this.scriptAim) this.scriptLook(w.pos, w.head, this.view);
    else {
      this.view.x = w.head.x;
      this.view.y = w.head.y;
      this.view.z = w.head.z;
    }
  }

  /** Dives now and sails on until the player's ship is at sea; the moments on the way go to the tally only. */
  private skipGale(): void {
    const s = this.state, dive = { ...idleInput(), dive: true }, quiet = this.onMoment;
    this.onMoment = () => {};
    for (let n = 0; n < 120 * SECOND && this.me.phase !== PHASE.sea && !over(s); n++) {
      step(s, this.autopilot ? null : dive);
      this.read();
      if (s.tick % SECOND === 0) this.sample();
    }
    this.onMoment = quiet;
    this.view.x = this.me.head.x;
    this.view.y = this.me.head.y;
    this.view.z = this.me.head.z;
  }

  /** A scripted moment's look: from astern, turned toward where it aims only until that is in sight beside the ship,
   *  clear of her sails (looked at straight, the aim is behind them). */
  private scriptLook(p: V3, head: V3, out: V3): V3 {
    const a = angleTo(head, tangentToward(p, this.scriptAim!, out), p);
    return turned(head, p, Math.sign(a) * Math.max(0, Math.abs(a) - 0.7), out);
  }

  private scripted(): ShipInput {
    const t = this.state.tick, h = this.held;
    for (const [at, inp] of this.script!) {
      if (at > t) break;
      if (at === t) Object.assign(h, inp, inp.aim ? { aim: { ...inp.aim } } : {});
    }
    return h;
  }

  /** The one-tick parts of the input, spent once a tick has read them. */
  private spend(): void {
    const i = this.input;
    i.gust = i.reload = i.ability = i.drop = i.take = false;
    this.firing = this.diving = false;
    i.select = i.swap = i.hail = -1;
  }

  private read(): void {
    const s = this.state;
    this.buf.length = 0;
    momentsOf(s, this.buf);
    for (const m of this.buf) {
      this.tally.observe(m, (i) => metres(s.ships[i].pos), (i) => s.ships[i].hull);
      if (m.k === 'hit' && m.ship === this.watch && !m.steady && m.shield + m.hull > 0) this.hurtTick = s.tick;
      // the player's own sinking is the app's to cut from (spectate, as the match leaves for it)
      if (m.k === 'sink' && m.ship === this.watch && m.ship !== PLAYER) this.rewatch(m.by);
      this.onMoment(m);
    }
  }

  private sample(): void {
    const s = this.state;
    stormView(s, STORM);
    const storm = { closing: STORM.calm.r < ZONES[0] - 1, outside: s.ships[PLAYER].phase === PHASE.sea && inStorm(s, s.ships[PLAYER].pos) };
    this.tally.sample(this.seconds, s.ships.map((sh) => ({ pos: sh.pos, afloat: sh.phase !== PHASE.sunk })), storm);
  }

  /** Spectating once the player's ship has sunk: watch the ship that sank it, or else the one afloat with the most kills. */
  spectate(): void {
    if (this.watch === PLAYER && this.me.phase === PHASE.sunk) this.rewatch(this.me.by);
  }

  /** After the ship followed sinks: watch the one that sank it, or else the ship afloat with the most kills. */
  private rewatch(by: number): void {
    const ships = this.state.ships;
    if (by >= 0 && ships[by].phase !== PHASE.sunk) {
      this.watch = by;
      return;
    }
    let best = -1;
    for (let i = 0; i < SHIPS; i++) if (ships[i].phase !== PHASE.sunk && (best < 0 || ships[i].kills > ships[best].kills)) best = i;
    if (best >= 0) this.watch = best;
  }

  /** Turns this frame's intents into the input the next tick sails by, and moves the look. */
  control(it: Intents, dt: number): void {
    const w = this.state.ships[this.watch], p = w.pos, head = w.head;
    flatten(this.view, p, head, this.view);
    const mine = this.watch === PLAYER && w.phase !== PHASE.sunk;
    if (!mine || this.autopilot || this.script) {
      // spectating, or watching the helm sail itself: the view rides behind the ship, turned in a scripted moment to
      // bring what it aims at into sight
      const to = mine && this.script && this.scriptAim ? this.scriptLook(p, head, this.look) : head;
      turned(this.view, p, angleTo(this.view, to, p) * (1 - Math.exp(-dt * 3)), this.view);
      if (!mine) return;
    } else {
      if (it.look.x) turned(this.view, p, it.look.x, this.view);
      this.pitch = Math.min(AIM.pitch[1], Math.max(AIM.pitch[0], this.pitch + it.look.y * 0.8));
      // no look for a while: swing back behind the ship
      if (it.idle > 1.2) turned(this.view, p, angleTo(this.view, head, p) * (1 - Math.exp(-dt * 1.4)), this.view);
    }
    flatten(this.view, p, head, this.view);
    if (this.autopilot || this.script) return;

    const inp = this.input, st = it.stick, mag = Math.hypot(st.x, st.y);
    if (mag > 0.2) {
      turned(this.view, p, Math.atan2(st.x, st.y), this.want);
      inp.steer = angleTo(w.head, this.want, p);
    } else if (this.mark && w.phase !== PHASE.sea) this.toward(w, this.mark, inp);
    else inp.steer = 0;
    inp.throttle = it.throttle;
    if (it.fire) this.firing = true;
    if (it.dive) this.diving = true;
    inp.fire = (it.fire || this.firing || (this.autoFire && this.lock >= 0)) && w.phase === PHASE.sea;
    inp.dive = it.dive || this.diving;
    if (it.gust) inp.gust = true;
    if (it.reload) inp.reload = true;
    if (it.ability) inp.ability = true;
    if (it.drop) inp.drop = true;
    if (it.take) inp.take = true;
    if (it.select >= 0) inp.select = it.select;
    if (it.swap >= 0) inp.swap = it.swap;
    if (it.hail >= 0) inp.hail = it.hail;
    this.aimAt(w);
    inp.aim.x = this.aim.x;
    inp.aim.y = this.aim.y;
    inp.aim.z = this.aim.z;
    inp.aimY = 0;
  }

  /** Marks where to come down: a point on the planet. */
  aimFor(p: V3): void {
    this.mark = { x: p.x, y: p.y, z: p.z };
    this.targetD = Infinity;
  }

  /** Rides to the mark: the Gale outruns any glide, so she rides it until it has carried her nearest the mark (or over
   *  it), then glides for it and drops onto it. */
  private toward(w: Ship, c: V3, inp: ShipInput): void {
    const d = apart(w.pos, c);
    if (w.phase === PHASE.gale) {
      if (d < PICK.drop || d > this.targetD + 0.01) this.diving = true;
      this.targetD = d;
      inp.steer = 0;
      return;
    }
    tangentToward(w.pos, c, this.want);
    inp.steer = angleTo(w.head, this.want, w.pos);
    if (d < PICK.drop) this.diving = true;
  }

  /** Along the look as far as its pitch reaches, or at a ship close to that line. */
  private aimAt(w: Ship): void {
    const s = this.state, p = w.pos;
    let best = -1, bestCost = AIM.cone;
    for (let i = 0; i < SHIPS; i++) {
      const o = s.ships[i];
      if (i === this.watch || o.phase !== PHASE.sea) continue;
      const d = apart(p, o.pos);
      if (d > AIM.lock || d < 4 || !(seen(s, this.watch, i) & SEEN.visible)) continue;
      flatten(o.pos, p, this.view, this.q);
      const off = Math.abs(angleTo(this.view, this.q, p)), cost = off + d / AIM.lock * 0.05;
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    this.lock = best;
    if (best >= 0) {
      const o = s.ships[best].pos;
      this.aim.x = o.x;
      this.aim.y = o.y;
      this.aim.z = o.z;
      return;
    }
    const k = (AIM.pitch[1] - this.pitch) / (AIM.pitch[1] - AIM.pitch[0]);
    along(p, this.view, AIM.near + (AIM.far - AIM.near) * k, this.aim);
  }

  // ── views ──

  /** The match as the actors draw it, `alpha` of the way from the last tick to the next. */
  actorsView(time: number, alpha: number, sun: V3): ActorsView {
    const s = this.state, ships = this.ships;
    ships.length = 0;
    for (let i = 0; i < SHIPS; i++) {
      const sh = s.ships[i], alive = sh.phase !== PHASE.sunk;
      // ships in fog or past sight stay hidden; the sunk stay listed so they finish sinking
      if (alive && i !== this.watch && !(seen(s, this.watch, i) & (SEEN.visible | SEEN.lantern))) continue;
      if (!alive && sh.sunk < 0) continue;
      ships.push(this.shipView(i, sh, alive, alpha));
    }
    const shots = this.shots;
    shots.length = 0;
    for (const sh of s.shots) {
      let id = this.ids.get(sh);
      if (id === undefined) this.ids.set(sh, (id = this.nextId++));
      const up = sh.pos, v = sh.v;
      const vel = { x: sh.dir.x * v + up.x * sh.vy, y: sh.dir.y * v + up.y * sh.vy, z: sh.dir.z * v + up.z * sh.vy };
      const pos = metres(up, sh.y), back = (1 - alpha) * TICK;
      pos.x -= vel.x * back;
      pos.y -= vel.y * back;
      pos.z -= vel.z * back;
      const view: ProjectileView = { id, weapon: weaponOf(sh.kind), rarity: Math.max(0, Math.min(4, sh.rarity)) as 0, pos, vel, ship: sh.owner };
      // a shell that bursts: where it will come down, for the ring on the water there
      if (sh.splash > 0 && sh.g > 0) {
        const seconds = landing(sh, LAND) + (1 - alpha) * TICK;
        view.land = { at: metres(LAND, seaLevel(s) + 1), reach: sh.splash, seconds };
      }
      shots.push(view);
    }
    const loot = this.loot, me = s.ships[PLAYER], afloat = me.phase === PHASE.sea;
    loot.length = 0;
    for (const l of s.loot) {
      // in reach as the sim's own sweep (items.ts pickups) measures it
      const near = afloat && apart(me.pos, l.at) <= LOOT.reach;
      loot.push({ id: l.id, pos: metres(l.at), kind: lootKind(l.item.kind), rarity: Math.max(0, Math.min(4, l.item.rarity)) as 0, age: l.age, near });
    }
    const wind = windAt(s, s.ships[this.watch].pos, WIND).v;
    return {
      time, sun, seaLevel: seaLevel(s), wind: { ...wind }, player: PLAYER, ships, projectiles: shots, loot, whales: [this.whaleView()],
    };
  }

  private shipView(i: number, sh: Ship, alive: boolean, alpha: number): ShipView {
    const at = between(sh.was, sh.pos, alpha, this.p);
    const slot = sh.slots[sh.sel], weapon = isWeapon(slot.kind) ? weaponOf(slot.kind) : weaponOf(sh.slots.find((x) => isWeapon(x.kind))?.kind ?? 1);
    // the whale's toss: over and back while the flip runs
    const flip = sh.flip > 0 ? Math.PI * 0.9 * Math.sin(Math.PI * (1 - sh.flip / 3)) : 0;
    return {
      id: i, pos: metres(at), head: { ...sh.head }, speed: sh.speed, turn: -sh.rate, alt: sh.alt, flip, hull: sh.hull / 100,
      shield: sh.shield, shieldMax: 100, weapon, aim: gunDir(sh), cosmetics: this.looks[i] ?? this.looks[0], alive,
      parts: { torn: sh.torn, mast: sh.fallen > 0 ? 'down' : sh.jury ? 'jury' : 'up', flood: sh.flood, listTo: sh.listTo, burn: sh.burn, ice: sh.ice },
      irons: sh.irons > 0, lurch: sh.lurch / ABOUT.lurch, roll: deckAt(this.state, i, DECK).roll,
      windup: sh.windup > 0 && WEAPONS[slot.kind] ? Math.min(1, 1 - (sh.windup - (alpha - 1) * TICK) / WEAPONS[slot.kind].windup) : 0,
    };
  }

  private whaleView(): WhaleView {
    const w = this.state.whale, v = this.whale;
    metres(w.at, 0, v.pos);
    v.head.x = w.head.x;
    v.head.y = w.head.y;
    v.head.z = w.head.z;
    const t = Math.max(0, w.t), k = (len: number) => Math.max(0, Math.min(1, 1 - t / len));
    if (w.state === WHALE_STATE.under) [v.state, v.k] = ['deep', k(40)];
    else if (w.state === WHALE_STATE.rising) [v.state, v.k] = ['rising', k(6)];
    else if (w.state === WHALE_STATE.breach) [v.state, v.k] = ['surface', k(4)];
    else if (t < 3) [v.state, v.k] = ['diving', k(3)];
    else [v.state, v.k] = ['surface', Math.max(0, Math.min(1, 1 - (t - 3) / 17))];
    return v;
  }

  /** The match as the stage draws it. */
  stageView(time: number, alpha: number): StageView {
    const s = this.state, w = s.ships[this.watch], at = between(w.was, w.pos, alpha, this.q);
    stormView(s, STORM);
    const formed = STORM.calm.r < ZONES[0] - 1;
    const dist = formed ? R * Math.acos(Math.max(-1, Math.min(1, at.x * STORM.calm.at.x + at.y * STORM.calm.at.y + at.z * STORM.calm.at.z))) : 0;
    const outside = formed && dist > STORM.calm.r ? Math.min(1, 0.45 + (dist - STORM.calm.r) / 60) : 0;
    // the screen's hurt and low-hull edges are the player's own; spectating, the Storm's tint is half as strong
    const own = this.watch === PLAYER;
    const hurt = own ? Math.max(0, 1 - ((s.tick - this.hurtTick) * TICK) / 0.5) : 0;
    const low = !own || w.phase === PHASE.sunk ? 0 : Math.max(0, (35 - w.hull) / 35) * 0.8;
    const weather: WeatherSystem[] = [];
    s.weather.forEach((sys, slot) => {
      if (sys.kind >= 0) weather.push({ kind: WEATHER_NAMES[sys.kind] as WeatherKind, at: sys.at, radius: sys.r, strength: vigour(sys), id: slot });
    });
    return {
      time, hour: hourOf(s), tilt: (s.tilt * 180) / Math.PI, tide: seaLevel(s), ebb: ebbAt(s.tick * TICK),
      wind: { ...windAt(s, at, WIND).v }, camera: 'chase',
      target: { pos: { ...at }, heading: { ...this.view }, height: 2.5 + w.alt },
      weather,
      storm: formed ? { centre: { ...STORM.calm.at }, radius: STORM.calm.r } : null,
      territory: { owner: s.owner, trail: s.trail, version: Math.floor(s.tick / 6), me: this.watch + 1 },
      screen: { storm: own ? outside : outside * 0.5, hurt, low },
    };
  }

  /** The sea's beds around the watched ship: the regions it is in, the weather over it, its wind and speed, the Storm,
   *  the night, and surf where land is near. */
  hearing(): AmbienceMix {
    const s = this.state, w = s.ships[this.watch], p = w.pos, sky = skyAt(s, p, EAR.sky);
    regionWeights(p, EAR.weights);
    const regions: Partial<Record<RegionId, number>> = {};
    for (let i = 0; i < REGION_COUNT; i++) if (EAR.weights[i] > 0.01) regions[REGIONS[i].id] = EAR.weights[i];
    stormView(s, STORM);
    const formed = STORM.calm.r < ZONES[0] - 1, level = seaLevel(s);
    let land = 0;
    for (let k = 0; k < 8; k++) if (heightAt(along(p, tangentAt(p, (k * Math.PI) / 4, EAR.t), EAR.surf, EAR.q)) > level) land++;
    return {
      regions,
      weather: { fog: sky.fog, rain: sky.rain, thunder: sky.thunder, calm: sky.calm, snow: sky.snow, ash: sky.ash },
      nearSurf: clamp01(land / 3), wind: windAt(s, p, WIND).strength, speed: Math.abs(w.speed), rough: sky.rough,
      altitude: Math.max(0, w.alt),
      storm: formed ? clamp01((surfaceDistance(p, STORM.calm.at) - STORM.calm.r + 15) / 20) : 0,
      night: clamp01((DAY.dusk + 0.1 - sunHeight(s, p)) / 0.2),
      vortex: clamp01(1 - surfaceDistance(p, VORTEX.pos) / VORTEX.r),
      afloat: w.phase === PHASE.sea,
    };
  }

  /** The sun's direction this tick. */
  sun(out: V3): V3 {
    return sunDir(this.state, out);
  }

  // ── the hook's shortcuts ──

  /** Sinks ships now, by ship `by` (-1: none) with `cause` (the Storm unless named), then lets the match see whether it is won. */
  sinkNow(ships: readonly number[], by = -1, cause: number = CAUSE.storm): void {
    const s = this.state;
    s.events.length = 0;
    for (const i of ships) sink(s, i, i === by ? -1 : by, cause);
    settle(s);
    this.read();
  }

  hash(): string {
    return matchHash(this.state);
  }

  /** How a ship stands, for placing those still afloat when the match ends early: hull and shield. */
  standing(i: number): number {
    const sh = this.state.ships[i];
    return sh.phase === PHASE.sunk ? -1 : i === this.state.winner ? 1e6 : sh.hull + sh.shield;
  }
}

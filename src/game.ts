// The match: twenty ships, the Gale that carries them in, the storm that closes, loot, weapons and the damage model.
// Pure simulation: no drawing here. It reads inputs, advances, and leaves events for the stage, the HUD and the sound.
import { ARCH, DRAFT, flowAt, PLAY_R, rng, sampleHeight, smooth, type World } from './world.ts';
import { CUT, PERK, Territory, type InkEvent } from './territory.ts';

// ---------------------------------------------------------------- items

export const RARITY = [
  { name: 'Common', color: '#b7bec7', glow: 0xc9d1da, dmg: 1, reload: 1 },
  { name: 'Uncommon', color: '#5ad65a', glow: 0x55e05a, dmg: 1.08, reload: 0.95 },
  { name: 'Rare', color: '#3ea6ff', glow: 0x3aa0ff, dmg: 1.16, reload: 0.9 },
  { name: 'Epic', color: '#c46bff', glow: 0xb85cff, dmg: 1.24, reload: 0.85 },
  { name: 'Legendary', color: '#ffb22e', glow: 0xffa21f, dmg: 1.32, reload: 0.8 },
] as const;

export type WeaponKind = 'cannon' | 'scatter' | 'harpoon' | 'mortar' | 'repeater';
export interface WeaponDef {
  name: string; blurb: string; dmg: number; interval: number; mag: number; reload: number; speed: number; gravity: number;
  spread: number; pellets: number; range: number; crit: number; splash: number; auto: boolean; lob: boolean;
}
export const WEAPONS: Record<WeaponKind, WeaponDef> = {
  cannon: { name: 'Cannon', blurb: 'Steady all-rounder', dmg: 20, interval: 0.42, mag: 8, reload: 1.9, speed: 165, gravity: 7, spread: 0.008, pellets: 1, range: 250, crit: 1.5, splash: 0, auto: true, lob: false },
  scatter: { name: 'Scattergun', blurb: 'Brutal up close', dmg: 8, interval: 1.0, mag: 4, reload: 2.3, speed: 135, gravity: 4, spread: 0.065, pellets: 8, range: 80, crit: 1.5, splash: 0, auto: false, lob: false },
  harpoon: { name: 'Harpoon', blurb: 'One heavy long shot', dmg: 80, interval: 1.4, mag: 1, reload: 2.1, speed: 320, gravity: 2.5, spread: 0, pellets: 1, range: 440, crit: 1.75, splash: 0, auto: false, lob: false },
  mortar: { name: 'Mortar', blurb: 'Lobbed blast, hits an area', dmg: 60, interval: 1.3, mag: 2, reload: 2.8, speed: 0, gravity: 26, spread: 0.012, pellets: 1, range: 270, crit: 1, splash: 11, auto: false, lob: true },
  repeater: { name: 'Repeater', blurb: 'A hail of small shot', dmg: 7, interval: 0.1, mag: 30, reload: 2.0, speed: 185, gravity: 3, spread: 0.024, pellets: 1, range: 170, crit: 1.5, splash: 0, auto: true, lob: false },
};
export const WEAPON_ORDER: WeaponKind[] = ['cannon', 'scatter', 'harpoon', 'mortar', 'repeater'];

export type UseKind = 'glass' | 'pearl' | 'drift' | 'heart';
export interface UseDef { name: string; blurb: string; shield: number; hull: number; cap: number; time: number; stack: number; color: string }
export const USES: Record<UseKind, UseDef> = {
  glass: { name: 'Sea Glass', blurb: '+25 shield, up to 50', shield: 25, hull: 0, cap: 50, time: 1.0, stack: 6, color: '#58c8ff' },
  pearl: { name: 'Moon Pearl', blurb: '+50 shield', shield: 50, hull: 0, cap: 100, time: 2.6, stack: 3, color: '#8fb4ff' },
  drift: { name: 'Driftwood', blurb: '+15 hull, up to 75', shield: 0, hull: 15, cap: 75, time: 1.8, stack: 8, color: '#9be26a' },
  heart: { name: 'Heartwood', blurb: 'Full hull repair', shield: 0, hull: 100, cap: 100, time: 5.0, stack: 2, color: '#e6f06a' },
};

/** What the gull will fetch, for glimmer. */
export const PARCELS = [
  { name: 'Supplies', blurb: 'Sea Glass and Driftwood', cost: 20 },
  { name: 'Armament', blurb: 'A Rare or better weapon', cost: 45 },
  { name: 'Treasure', blurb: 'Epic or Legendary weapon, and a Moon Pearl', cost: 80 },
] as const;
export const GULL_FLIGHT = 3.2, GULL_COOLDOWN = 18, GLIMMER_PER_M = 1 / 40;
/** Hull mended per second in your own water, once nobody has hit you for a few seconds. */
export const HOME_REPAIR = 2.5;

export type Item =
  | { type: 'weapon'; kind: WeaponKind; rarity: number; ammo: number }
  | { type: 'use'; kind: UseKind; count: number; rarity: number };

export function itemName(it: Item): string {
  return it.type === 'weapon' ? `${RARITY[it.rarity].name} ${WEAPONS[it.kind].name}` : USES[it.kind].name;
}
export function itemColor(it: Item): string {
  return RARITY[it.rarity].color;
}

// ---------------------------------------------------------------- ships

export const SLOTS = 5;
export const MAX_HULL = 100, MAX_SHIELD = 100;
const BOT_VS_BOT = 0.4;
// bots go easier on the player, gentlest just after landing: a new arrival gets a moment to find a gun
const BOT_VS_PLAYER = 0.65, LANDING_GRACE = 0.4;
export const TOP_SPEED = 14.5, GUST_SPEED = 13, GUST_TIME = 1.15, GUST_RECHARGE = 6.5;

export interface Input {
  steerX: number; steerZ: number; // desired direction of travel, world space, length 0..1
  fire: boolean;
  aimYaw: number; aimPitch: number;
  aimOrigin: [number, number, number] | null; aimDir: [number, number, number] | null; // the crosshair's ray, when a camera aims
  aimPoint: [number, number, number] | null; // or a point to hit, for bots
  gust: boolean; reload: boolean; drop: boolean; dive: boolean; swap: boolean;
  select: number; // slot to select, -1 for none
  hail: number; // gull parcel to ask for, -1 for none
}
export const newInput = (): Input => ({ steerX: 0, steerZ: 0, fire: false, aimYaw: 0, aimPitch: 0, aimOrigin: null, aimDir: null, aimPoint: null, gust: false, reload: false, drop: false, dive: false, swap: false, select: -1, hail: -1 });

export type Phase = 'gale' | 'glide' | 'sea' | 'sunk';

export interface Ship {
  id: number; name: string; bot: boolean; look: number; skill: number;
  phase: Phase; alt: number; vy: number;
  x: number; z: number; heading: number; speed: number; drift: number; turn: number; vx: number; vz: number;
  hull: number; shield: number; alive: boolean; sink: number;
  slots: (Item | null)[]; sel: number; lastWeapon: number;
  cooldown: number; reloadT: number; equipT: number;
  useT: number; useSlot: number;
  gusts: number; gustT: number; boostT: number; hop: number;
  aimYaw: number; aimPitch: number; aimX: number; aimY: number; aimZ: number;
  kills: number; dealt: number; place: number; lastHitBy: number; lastHitT: number; hitFlash: number; killer: number; landT: number;
  input: Input;
  nearLoot: number; // loot id within reach that would need a swap, or -1
  survived: number; stormAcc: number;
  glimmer: number; sailed: number; // glimmer, and the distance toward the next one
  gull: 'home' | 'away' | 'rest'; gullT: number; gullTier: number;
  blessed: boolean; threaded: boolean; px: number; pz: number;
}

export interface Projectile {
  id: number; owner: number; kind: WeaponKind; rarity: number;
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  dmg: number; life: number; gravity: number; splash: number; crit: number; travelled: number; range: number;
}

export interface Loot { id: number; x: number; z: number; item: Item; vx: number; vz: number; age: number; from: 'orb' | 'drop' | 'clam' | 'gull' | 'leviathan' | 'storm' | 'stunt' }
/** A spark of glimmer floating in a lane; `t` counts down to its return once taken. */
export interface Mote { x: number; z: number; t: number; lane: number }
export interface Leviathan { state: 'none' | 'rising' | 'breach'; x: number; z: number; t: number; count: number }
export interface Clam { id: number; x: number; z: number; open: boolean; place: number; openT: number }

export type GameEvent =
  | { t: 'fire'; ship: number; kind: WeaponKind; rarity: number; x: number; y: number; z: number; dx: number; dy: number; dz: number }
  | { t: 'impact'; on: 'water' | 'land' | 'ship'; kind: WeaponKind; x: number; y: number; z: number; big: number }
  | { t: 'hit'; target: number; src: number; dmg: number; crit: boolean; shield: number; hull: number; x: number; y: number; z: number; broke: boolean; kind: HarmKind }
  | { t: 'elim'; victim: number; killer: number; kind: HarmKind }
  | { t: 'pickup'; ship: number; item: Item }
  | { t: 'clam'; id: number; x: number; z: number; ship: number }
  | { t: 'gust'; ship: number }
  | { t: 'drop'; ship: number }
  | { t: 'splash'; ship: number; x: number; z: number }
  | { t: 'scrape'; ship: number; x: number; z: number; power: number }
  | { t: 'ram'; a: number; b: number; x: number; z: number; power: number }
  | { t: 'reload'; ship: number; kind: WeaponKind }
  | { t: 'used'; ship: number; kind: UseKind }
  | { t: 'empty'; ship: number }
  | { t: 'storm'; phase: number; state: 'wait' | 'shrink' }
  | { t: 'mote'; ship: number; chain: number }
  | { t: 'hail'; ship: number; tier: number }
  | { t: 'parcel'; ship: number; x: number; z: number; tier: number }
  | { t: 'leviathan'; state: 'rising' | 'breach'; x: number; z: number }
  | { t: 'stunt'; ship: number; kind: 'arch' | 'falls'; x: number; z: number }
  | { t: 'win'; ship: number }
  | InkEvent;

/** What can hurt a hull: a weapon, the storm, a ramming, or a trail cut. */
export type HarmKind = WeaponKind | 'storm' | 'ram' | 'ink';

// ---------------------------------------------------------------- the storm

/** The storm wall's first stand, round the whole sailable sea. */
export const RIM = PLAY_R + 15;

export const STORM_PHASES = [
  { wait: 45, shrink: 40, r: 380, dmg: 1 },
  { wait: 35, shrink: 35, r: 250, dmg: 2 },
  { wait: 30, shrink: 30, r: 150, dmg: 3 },
  { wait: 25, shrink: 25, r: 80, dmg: 5 },
  { wait: 20, shrink: 20, r: 35, dmg: 7 },
  { wait: 15, shrink: 20, r: 10, dmg: 9 },
  { wait: 10, shrink: 20, r: 0, dmg: 12 },
];

export interface Storm {
  phase: number; // index of the phase in progress, -1 before the first
  state: 'idle' | 'wait' | 'shrink';
  t: number; // seconds left in this state
  x: number; z: number; r: number; // the circle now
  fx: number; fz: number; fr: number; // where this phase started
  nx: number; nz: number; nr: number; // where it will close to
  dmg: number;
}

// ---------------------------------------------------------------- names

export const CAPTAINS = [
  'Kestrel', 'Saltwind', 'Moonmoth', 'Ember Koi', 'Gloaming', 'Tidecaller', 'Little Squall', 'Bramble', 'Nightjar', 'Sable',
  'Wren', 'Marlin', 'Cobalt', 'Juniper', 'Halcyon', 'Brine', 'Vesper', 'Foxglove', 'Tamarisk', 'Plover', 'Driftfire', 'Larkspur',
];

// ---------------------------------------------------------------- the match

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * How well she sails at an angle `a` off the wind (0 running before it, PI straight into it): lateens like the wind
 * on the beam best, are a touch slower running, and stall as they point up into it.
 */
export const pointOfSail = (a: number) => 0.95 + 0.15 * smooth(0, 1.2, a) - 0.1 * smooth(1.9, 2.5, a) - 0.25 * smooth(2.5, 3, a);

export interface MatchOptions { seed: number; count: number; playerName: string; playerLook: number; dropTime?: number }

export class Match {
  readonly world: World;
  readonly ships: Ship[] = [];
  readonly projectiles: Projectile[] = [];
  readonly loot: Loot[] = [];
  readonly clams: Clam[] = [];
  readonly motes: Mote[] = [];
  readonly leviathan: Leviathan = { state: 'none', x: 0, z: 0, t: 0, count: 0 };
  readonly events: GameEvent[] = [];
  readonly storm: Storm;
  /** The ink: who holds which water. */
  readonly ink: Territory;
  readonly gale: { ax: number; az: number; bx: number; bz: number; t: number; dur: number; alt: number; x: number; z: number };
  readonly r: () => number;
  time = 0;
  /** The heading the wind blows toward; it veers back and forth through the match. */
  wind: number;
  private readonly windBase: number;
  private readonly flow: [number, number] = [0, 0];
  over = false;
  winner = -1;
  player = 0;
  private nextId = 1;

  constructor(world: World, o: MatchOptions) {
    this.world = world;
    this.r = rng(o.seed);
    this.wind = this.windBase = rng(o.seed + 7919)() * Math.PI * 2;
    const r = this.r;
    // the Gale's crossing
    const a = r() * Math.PI * 2, off = (r() - 0.5) * 260;
    const nx = -Math.sin(a), nz = Math.cos(a);
    this.gale = {
      ax: Math.cos(a) * -680 + nx * off, az: Math.sin(a) * -680 + nz * off, bx: Math.cos(a) * 680 + nx * off, bz: Math.sin(a) * 680 + nz * off,
      t: 0, dur: o.dropTime ?? 32, alt: 230, x: 0, z: 0,
    };
    this.storm = { phase: -1, state: 'idle', t: 0, x: 0, z: 0, r: RIM, fx: 0, fz: 0, fr: RIM, nx: 0, nz: 0, nr: RIM, dmg: 0 };
    this.ink = new Territory(o.count);
    const names = [...CAPTAINS].sort(() => r() - 0.5);
    for (let i = 0; i < o.count; i++) {
      const bot = i !== 0;
      this.ships.push({
        id: i, name: bot ? names[i % names.length] : o.playerName, bot, look: bot ? Math.floor(r() * 1e6) : o.playerLook, skill: bot ? 0.25 + r() * 0.65 : 1,
        phase: 'gale', alt: this.gale.alt, vy: 0,
        x: this.gale.ax, z: this.gale.az, heading: a + Math.PI / 2, speed: 0, drift: 0, turn: 0, vx: 0, vz: 0,
        hull: MAX_HULL, shield: 0, alive: true, sink: 0,
        slots: [{ type: 'weapon', kind: 'cannon', rarity: 0, ammo: WEAPONS.cannon.mag }, null, null, null, null], sel: 0, lastWeapon: 0,
        cooldown: 0, reloadT: 0, equipT: 0, useT: 0, useSlot: -1,
        gusts: 2, gustT: 0, boostT: 0, hop: 0,
        aimYaw: 0, aimPitch: 0, aimX: 0, aimY: 0, aimZ: 0,
        kills: 0, dealt: 0, place: 0, lastHitBy: -1, lastHitT: -99, hitFlash: 0, killer: -1, landT: -1,
        input: newInput(), nearLoot: -1, survived: 0, stormAcc: 0,
        glimmer: 0, sailed: 0, gull: 'home', gullT: 0, gullTier: 0, blessed: false, threaded: false, px: 0, pz: 0,
      });
    }
    // loot on the water, and clams in the shallows
    for (const o2 of world.orbs) this.loot.push({ id: this.nextId++, x: o2.x, z: o2.z, item: this.roll(false), vx: 0, vz: 0, age: 99, from: 'orb' });
    for (const c of world.clams) this.clams.push({ id: this.nextId++, x: c.x, z: c.z, open: false, place: c.place, openT: 0 });
    this.layLanes();
  }

  /** Lanes of glimmer: gentle curves of sparks across open water, to be sailed through like a string of beads. */
  private layLanes(): void {
    const r = this.r, nav = this.world.nav;
    let lane = 0;
    for (let tries = 0; tries < 400 && lane < 18; tries++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (PLAY_R - 60);
      let x = Math.cos(a) * d, z = Math.sin(a) * d, h = r() * Math.PI * 2;
      const bend = (r() - 0.5) * 0.12;
      const pts: [number, number][] = [];
      for (let i = 0; i < 16; i++) {
        if (!nav.open(x, z) || !nav.open(x + 12, z) || !nav.open(x - 12, z) || !nav.open(x, z + 12) || !nav.open(x, z - 12)) break;
        pts.push([x, z]);
        h += bend;
        x += Math.sin(h) * 8; z += Math.cos(h) * 8;
      }
      if (pts.length < 10) continue;
      if (this.motes.some((m) => Math.hypot(m.x - pts[0][0], m.z - pts[0][1]) < 120)) continue;
      for (const [px, pz] of pts) this.motes.push({ x: px, z: pz, t: 0, lane });
      lane++;
    }
  }

  get me(): Ship {
    return this.ships[this.player];
  }

  get alive(): number {
    let n = 0;
    for (const s of this.ships) if (s.alive) n++;
    return n;
  }

  /** A random item: clams pay out better. */
  roll(clam: boolean, weights = clam ? [0, 34, 36, 21, 9] : [42, 30, 17, 8, 3], weapon = clam ? 1 : 0.62): Item {
    const r = this.r;
    const total = weights.reduce((a, b) => a + b, 0);
    let u = r() * total, rarity = 0;
    for (let i = 0; i < 5; i++) { if ((u -= weights[i]) <= 0) { rarity = i; break; } }
    if (r() < weapon) {
      const kind = WEAPON_ORDER[Math.floor(r() * WEAPON_ORDER.length)];
      return { type: 'weapon', kind, rarity, ammo: WEAPONS[kind].mag };
    }
    const u2 = r();
    const kind: UseKind = u2 < 0.34 ? 'glass' : u2 < 0.56 ? 'drift' : u2 < 0.84 ? 'pearl' : 'heart';
    const count = kind === 'glass' ? 3 : kind === 'drift' ? 4 : kind === 'pearl' ? 1 : 1;
    return { type: 'use', kind, count, rarity: kind === 'glass' || kind === 'drift' ? 1 : kind === 'pearl' ? 2 : 3 };
  }

  heightAt(x: number, z: number): number {
    return sampleHeight(this.world.heights, x, z);
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  // ---------------------------------------------------------------- stepping

  step(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    this.wind = wrap(this.windBase + 0.5 * Math.sin(this.time / 70) + 0.25 * Math.sin(this.time / 23 + 1));
    this.stepGale(dt);
    for (const s of this.ships) this.stepShip(s, dt);
    this.collideShips();
    this.stepProjectiles(dt);
    this.stepLoot(dt);
    this.stepStorm(dt);
    this.stepInk(dt);
    this.stepLeviathan(dt);
    if (!this.over) {
      const alive = this.ships.filter((s) => s.alive);
      if (alive.length <= 1) {
        this.over = true;
        this.winner = alive[0]?.id ?? -1;
        if (alive[0]) { alive[0].place = 1; this.emit({ t: 'win', ship: alive[0].id }); }
      }
    }
  }

  private stepGale(dt: number): void {
    const g = this.gale;
    if (g.t >= g.dur) return;
    g.t = Math.min(g.dur, g.t + dt);
    const k = g.t / g.dur;
    g.x = g.ax + (g.bx - g.ax) * k;
    g.z = g.az + (g.bz - g.az) * k;
    if (g.t >= g.dur) for (const s of this.ships) if (s.phase === 'gale') this.drop(s);
  }

  get galeVel(): [number, number] {
    const g = this.gale;
    return [(g.bx - g.ax) / g.dur, (g.bz - g.az) / g.dur];
  }

  drop(s: Ship): void {
    if (s.phase !== 'gale') return;
    const [vx, vz] = this.galeVel;
    s.phase = 'glide';
    s.vx = vx * 0.7;
    s.vz = vz * 0.7;
    s.vy = -6;
    this.emit({ t: 'drop', ship: s.id });
  }

  private stepShip(s: Ship, dt: number): void {
    const inp = s.input;
    s.hitFlash = Math.max(0, s.hitFlash - dt * 5);
    if (!s.alive) {
      s.sink = Math.min(1, s.sink + dt * 0.22);
      s.speed *= Math.max(0, 1 - dt * 0.8);
      s.x += Math.sin(s.heading) * s.speed * dt;
      s.z += Math.cos(s.heading) * s.speed * dt;
      return;
    }
    s.survived += dt;
    if (s.phase === 'gale') {
      s.x = this.gale.x + Math.sin(s.id * 2.4) * 18;
      s.z = this.gale.z + Math.cos(s.id * 1.7) * 18;
      s.alt = this.gale.alt + Math.sin(s.id * 3.1 + this.time) * 3;
      s.heading = Math.atan2(this.gale.bx - this.gale.ax, this.gale.bz - this.gale.az);
      if (inp.drop) this.drop(s);
      return;
    }
    if (s.phase === 'glide') {
      // steer the fall: the sail is a wing
      const want = Math.hypot(inp.steerX, inp.steerZ) > 0.1 ? 28 : 12;
      const tx = inp.steerX * want, tz = inp.steerZ * want;
      const k = Math.min(1, dt * 1.4);
      s.vx += (tx - s.vx) * k;
      s.vz += (tz - s.vz) * k;
      const fall = inp.dive ? 38 : 15;
      s.vy += (-fall - s.vy) * Math.min(1, dt * 2);
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.alt += s.vy * dt;
      const sp = Math.hypot(s.vx, s.vz);
      if (sp > 1) {
        const h = Math.atan2(s.vx, s.vz);
        s.turn = Math.max(-1, Math.min(1, wrap(h - s.heading) * 2));
        s.heading += wrap(h - s.heading) * Math.min(1, dt * 2.5);
      }
      // keep inside the rim
      const d = Math.hypot(s.x, s.z);
      if (d > PLAY_R - 20) { s.x *= (PLAY_R - 20) / d; s.z *= (PLAY_R - 20) / d; }
      // land on open water: near the end, drift toward it
      if (s.alt < 40 && !this.world.nav.open(s.x, s.z)) {
        const [ox, oz] = this.world.nav.nearestOpen(s.x, s.z);
        s.x += (ox - s.x) * Math.min(1, dt * 2.5);
        s.z += (oz - s.z) * Math.min(1, dt * 2.5);
      }
      if (s.alt <= 0) {
        if (!this.world.nav.open(s.x, s.z)) [s.x, s.z] = this.world.nav.nearestOpen(s.x, s.z);
        s.alt = 0;
        s.phase = 'sea';
        s.landT = this.time;
        s.px = s.x; s.pz = s.z;
        this.ink.inkHome(s.id, s.x, s.z);
        s.speed = Math.min(12, sp * 0.5 + 4);
        this.emit({ t: 'splash', ship: s.id, x: s.x, z: s.z });
      }
      return;
    }
    // ------------------------------------------------ at sea
    const mag = Math.min(1, Math.hypot(inp.steerX, inp.steerZ));
    // the gust: a burst of wind and a hop off the water
    s.gustT = Math.max(0, s.gustT - dt);
    if (s.gusts < 2) {
      if (s.gustT <= 0) { s.gusts++; s.gustT = s.gusts < 2 ? GUST_RECHARGE : 0; }
    }
    if (inp.gust && s.gusts > 0 && s.boostT <= 0) {
      s.gusts--;
      if (s.gustT <= 0) s.gustT = GUST_RECHARGE;
      s.boostT = GUST_TIME;
      s.hop = 1;
      this.emit({ t: 'gust', ship: s.id });
    }
    inp.gust = false;
    s.boostT = Math.max(0, s.boostT - dt);
    s.hop = Math.max(0, s.hop - dt * 1.4);
    let target = TOP_SPEED * mag * pointOfSail(Math.abs(wrap(s.heading - this.wind)));
    let diff = 0;
    if (mag > 0.12) {
      const want = Math.atan2(inp.steerX, inp.steerZ);
      diff = wrap(want - s.heading);
      const rate = (0.55 + 0.8 * Math.min(1, s.speed / 8)) * (s.boostT > 0 ? 1.35 : 1);
      s.heading = wrap(s.heading + Math.max(-rate * dt, Math.min(rate * dt, diff)));
      if (Math.abs(diff) > 1.8) target = Math.min(target, 8);
    }
    s.turn += (Math.max(-1, Math.min(1, diff * 1.6)) - s.turn) * Math.min(1, dt * 4);
    if (s.boostT > 0) target += GUST_SPEED;
    // channelling a repair slows her
    if (s.useT > 0) target *= 0.6;
    const acc = s.boostT > 0 ? 28 : target > s.speed ? 6.5 : 4.5;
    s.speed += Math.max(-acc * dt, Math.min(acc * dt, target - s.speed));
    // carving: a little slip sideways in hard turns
    s.drift += (-s.turn * s.speed * 0.12 - s.drift) * Math.min(1, dt * 2);
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    // and the currents carry her along with them
    const [cx, cz] = flowAt(this.world, s.x, s.z, this.flow);
    s.vx = fx * s.speed + fz * s.drift + cx;
    s.vz = fz * s.speed - fx * s.drift + cz;
    const ox = s.x, oz = s.z;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    // out past the storm at the rim, the sea itself runs back toward the islands
    const out = Math.hypot(s.x, s.z) - RIM - 30;
    if (out > 0) { const d = out + RIM + 30, push = Math.min(out, 40) * 0.6 * dt; s.x -= (s.x / d) * push * (1 + out / 20); s.z -= (s.z / d) * push * (1 + out / 20); }
    this.ground(s);
    this.inkSail(s, ox, oz, dt);
    this.aim(s);
    this.stepWeapon(s, dt);
    this.stepPickup(s);
    this.stepGull(s, dt);
    this.stunts(s);
    // the wake churns up glimmer
    s.sailed += Math.hypot(s.x - s.px, s.z - s.pz) * GLIMMER_PER_M;
    while (s.sailed >= 1) { s.sailed -= 1; s.glimmer++; }
    s.px = s.x; s.pz = s.z;
    // the storm bites the hull, not the shield
    const st = this.storm;
    if (st.dmg > 0 && Math.hypot(s.x - st.x, s.z - st.z) > st.r) {
      s.stormAcc += dt;
      if (s.stormAcc >= 1) {
        s.stormAcc -= 1;
        this.damage(s, st.dmg, -1, false, 'storm', s.x, 2, s.z, true);
      }
    }
  }

  /** Shoals and shores: push out along the slope, lose speed, report the scrape. */
  private ground(s: Ship): void {
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const probes: [number, number][] = [[0, 7.6], [0, -8.2], [2.5, 1], [-2.5, 1], [1.6, 5.2], [-1.6, 5.2], [2, -5], [-2, -5]];
    let px = 0, pz = 0, worst = 0;
    for (const [lx, lz] of probes) {
      const x = s.x + fz * lx + fx * lz, z = s.z - fx * lx + fz * lz;
      const h = this.heightAt(x, z);
      const over = h - DRAFT;
      if (over <= 0) continue;
      const e = 1.5;
      const gx = this.heightAt(x + e, z) - this.heightAt(x - e, z), gz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
      const gl = Math.hypot(gx, gz) || 1;
      px -= (gx / gl) * Math.min(over, 2.5);
      pz -= (gz / gl) * Math.min(over, 2.5);
      worst = Math.max(worst, over);
    }
    if (worst <= 0) return;
    const pl = Math.hypot(px, pz) || 1;
    const nx = px / pl, nz = pz / pl;
    s.x += nx * Math.min(worst, 1.2);
    s.z += nz * Math.min(worst, 1.2);
    const into = -(s.vx * nx + s.vz * nz);
    if (into > 0) {
      const lost = Math.min(s.speed, into * 0.9);
      if (lost > 3.5) this.emit({ t: 'scrape', ship: s.id, x: s.x - nx * 6, z: s.z - nz * 6, power: lost / 14 });
      s.speed = Math.max(0, s.speed - lost - 0.4);
    }
  }

  private collideShips(): void {
    const ships = this.ships;
    for (let i = 0; i < ships.length; i++) {
      const a = ships[i];
      if (a.phase !== 'sea' || !a.alive) continue;
      for (let j = i + 1; j < ships.length; j++) {
        const b = ships[j];
        if (b.phase !== 'sea' || !b.alive) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 10;
        if (d >= min || d < 1e-3) continue;
        const nx = dx / d, nz = dz / d, push = (min - d) / 2;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (closing > 7) {
          // a ram: the one driving in takes less
          const pa = Math.max(0, a.vx * nx + a.vz * nz), pb = Math.max(0, -(b.vx * nx + b.vz * nz));
          const dmg = (closing - 5) * 2.2;
          this.emit({ t: 'ram', a: a.id, b: b.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, power: closing / 20 });
          this.damage(b, dmg * (pa >= pb ? 1 : 0.4), a.id, false, 'ram', b.x, 2, b.z);
          this.damage(a, dmg * (pa >= pb ? 0.4 : 1), b.id, false, 'ram', a.x, 2, a.z);
          a.speed *= 0.4; b.speed *= 0.4;
        }
      }
    }
  }

  // ---------------------------------------------------------------- weapons

  weaponOf(s: Ship): Extract<Item, { type: 'weapon' }> | null {
    const it = s.slots[s.sel];
    return it && it.type === 'weapon' ? it : null;
  }

  /** Where the turret sits, in the world. */
  muzzle(s: Ship): [number, number, number] {
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    return [s.x + fx * 2.6, 2.8 + s.hop * 2, s.z + fz * 2.6];
  }

  select(s: Ship, slot: number): void {
    if (slot < 0 || slot >= SLOTS) return;
    const it = s.slots[slot];
    if (!it) return;
    if (it.type === 'use') {
      // a tap on a repair starts it; another tap stops it
      if (s.useSlot === slot) { s.useT = 0; s.useSlot = -1; return; }
      const u = USES[it.kind];
      const full = (u.shield > 0 && s.shield >= Math.min(MAX_SHIELD, u.cap)) || (u.hull > 0 && s.hull >= Math.min(MAX_HULL, u.cap));
      if (full) return;
      s.useSlot = slot;
      s.useT = 0.0001;
      return;
    }
    s.useT = 0;
    s.useSlot = -1;
    if (s.sel !== slot) { s.sel = slot; s.lastWeapon = slot; s.equipT = 0.22; s.reloadT = 0; }
  }

  private stepWeapon(s: Ship, dt: number): void {
    const inp = s.input;
    if (inp.select >= 0) { this.select(s, inp.select); inp.select = -1; }
    s.cooldown = Math.max(0, s.cooldown - dt);
    s.equipT = Math.max(0, s.equipT - dt);
    // channelling a repair
    if (s.useSlot >= 0) {
      const it = s.slots[s.useSlot];
      if (!it || it.type !== 'use') { s.useSlot = -1; s.useT = 0; }
      else {
        const u = USES[it.kind];
        s.useT += dt;
        if (s.useT >= u.time) {
          if (u.shield) s.shield = Math.max(s.shield, Math.min(u.cap, s.shield + u.shield));
          if (u.hull) s.hull = Math.max(s.hull, Math.min(u.cap, s.hull + u.hull));
          this.emit({ t: 'used', ship: s.id, kind: it.kind });
          it.count--;
          if (it.count <= 0) s.slots[s.useSlot] = null;
          s.useT = 0;
          s.useSlot = -1;
        }
        return;
      }
    }
    const w = this.weaponOf(s);
    if (!w) { if (!s.slots[s.sel]) this.autoSelect(s); return; }
    const def = WEAPONS[w.kind];
    if (s.reloadT > 0) {
      s.reloadT -= dt;
      if (s.reloadT <= 0) { w.ammo = def.mag; s.reloadT = 0; }
      return;
    }
    if ((inp.reload && w.ammo < def.mag) || w.ammo <= 0) {
      s.reloadT = def.reload * RARITY[w.rarity].reload * (this.ink.has(s.id, 'arch') ? PERK.arch : 1);
      this.emit({ t: 'reload', ship: s.id, kind: w.kind });
      inp.reload = false;
      return;
    }
    inp.reload = false;
    if (!inp.fire || s.cooldown > 0 || s.equipT > 0) return;
    if (!def.auto) inp.fire = false; // one shot per press
    this.fire(s, w);
  }

  /** Where the turret looks: the bots name a point, the player a ray. */
  private aim(s: Ship): void {
    const inp = s.input, [mx, my, mz] = this.muzzle(s);
    let tx: number, ty: number, tz: number;
    if (inp.aimPoint) [tx, ty, tz] = inp.aimPoint;
    else if (inp.aimOrigin && inp.aimDir) { const k = 140; tx = inp.aimOrigin[0] + inp.aimDir[0] * k; ty = inp.aimOrigin[1] + inp.aimDir[1] * k; tz = inp.aimOrigin[2] + inp.aimDir[2] * k; }
    else { tx = mx + Math.sin(inp.aimYaw) * 100; ty = my; tz = mz + Math.cos(inp.aimYaw) * 100; }
    s.aimX = tx; s.aimY = ty; s.aimZ = tz;
    const w = this.weaponOf(s);
    const h = Math.hypot(tx - mx, tz - mz);
    s.aimYaw = Math.atan2(tx - mx, tz - mz);
    s.aimPitch = w && WEAPONS[w.kind].lob ? 0.35 + Math.min(0.5, h / 500) : Math.max(-0.15, Math.min(0.5, Math.atan2(ty - my, Math.max(h, 1)) + (w ? 0.5 * WEAPONS[w.kind].gravity * h / (WEAPONS[w.kind].speed || 1) ** 2 : 0)));
  }

  private autoSelect(s: Ship): void {
    for (let i = 0; i < SLOTS; i++) { const it = s.slots[i]; if (it && it.type === 'weapon') { s.sel = i; return; } }
  }

  /** Where the crosshair's ray first meets a ship, the land or the sea. */
  rayPoint(o: [number, number, number], d: [number, number, number], max: number, skip: number): [number, number, number] {
    let best = max;
    for (const t of this.ships) {
      if (t.id === skip || !t.alive || t.phase !== 'sea') continue;
      const hit = this.segmentShip(t, o[0], o[1], o[2], o[0] + d[0] * max, o[1] + d[1] * max, o[2] + d[2] * max);
      if (hit && hit.t * max < best) best = hit.t * max;
    }
    // march the land and the sea
    for (let s = 2; s < best; s += 3) {
      const x = o[0] + d[0] * s, y = o[1] + d[1] * s, z = o[2] + d[2] * s;
      if (y < 0 || y < this.heightAt(x, z)) { best = s; break; }
    }
    return [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best];
  }

  private fire(s: Ship, w: Extract<Item, { type: 'weapon' }>): void {
    const def = WEAPONS[w.kind], inp = s.input;
    const [mx, my, mz] = this.muzzle(s);
    // the point the shot should land on
    let tp: [number, number, number];
    if (inp.aimPoint) tp = inp.aimPoint;
    else if (inp.aimOrigin && inp.aimDir) tp = this.rayPoint(inp.aimOrigin, inp.aimDir, def.range + 60, s.id);
    else tp = [mx + Math.sin(s.aimYaw) * 120, 2, mz + Math.cos(s.aimYaw) * 120];
    // a little magnetism toward a hull near the crosshair
    if (!s.bot) tp = this.magnet(s, mx, mz, tp, def.range);
    let dx = tp[0] - mx, dy = tp[1] - my, dz = tp[2] - mz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    w.ammo--;
    s.cooldown = def.interval;
    for (let p = 0; p < def.pellets; p++) {
      let vx: number, vy: number, vz: number;
      if (def.lob) {
        const hd = Math.hypot(dx, dz), rangeHd = Math.min(hd, def.range);
        const T = Math.max(0.9, Math.min(2.8, rangeHd / 70));
        const k = rangeHd / Math.max(hd, 1e-3);
        const tx = dx * k, tz = dz * k, ty = (hd > def.range ? 0 - my : dy);
        vx = tx / T + (this.r() - 0.5) * def.spread * 60;
        vz = tz / T + (this.r() - 0.5) * def.spread * 60;
        vy = (ty + 0.5 * def.gravity * T * T) / T;
      } else {
        // aim up by the drop the shot will suffer on its way
        const T = dist / def.speed;
        const ady = dy + 0.5 * def.gravity * T * T;
        const l = Math.hypot(dx, ady, dz);
        const spread = def.spread * (s.boostT > 0 ? 1.6 : 1) * (s.bot ? 1 + (1 - s.skill) * 1.5 : 1);
        vx = (dx / l + (this.r() - 0.5) * 2 * spread) * def.speed;
        vy = (ady / l + (this.r() - 0.5) * 2 * spread * 0.6) * def.speed;
        vz = (dz / l + (this.r() - 0.5) * 2 * spread) * def.speed;
      }
      this.projectiles.push({
        id: this.nextId++, owner: s.id, kind: w.kind, rarity: w.rarity, x: mx, y: my, z: mz, vx, vy, vz,
        dmg: def.dmg * RARITY[w.rarity].dmg * (this.ink.has(s.id, 'peak') ? PERK.peak : 1), life: 6, gravity: def.gravity, splash: def.splash, crit: def.crit, travelled: 0, range: def.range * (def.lob ? 3 : 1),
      });
    }
    const l = Math.hypot(dx, dy, dz) || 1;
    this.emit({ t: 'fire', ship: s.id, kind: w.kind, rarity: w.rarity, x: mx, y: my, z: mz, dx: dx / l, dy: dy / l, dz: dz / l });
    if (w.ammo <= 0) this.emit({ t: 'empty', ship: s.id });
  }

  private magnet(s: Ship, mx: number, mz: number, tp: [number, number, number], range: number): [number, number, number] {
    const dx = tp[0] - mx, dz = tp[2] - mz, dl = Math.hypot(dx, dz) || 1;
    let best: Ship | null = null, bestA = 0.07;
    for (const t of this.ships) {
      if (t.id === s.id || !t.alive || t.phase !== 'sea') continue;
      const tx = t.x - mx, tz = t.z - mz, tl = Math.hypot(tx, tz);
      if (tl > range * 1.05 || tl < 5) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (tx * dx + tz * dz) / (tl * dl))));
      const allow = 0.07 + 6 / tl; // wider for near ships
      if (ang < Math.min(allow, 0.2) && ang < bestA + 6 / tl) { best = t; bestA = ang; }
    }
    if (!best) return tp;
    // keep the height the player chose (sails are crits), pull the bearing onto the hull
    const T = Math.hypot(best.x - mx, best.z - mz) / 160;
    return [best.x + best.vx * T * 0.6, Math.max(1.5, tp[1]), best.z + best.vz * T * 0.6];
  }

  /** Segment against a ship: the hull and the foot of the sail take plain hits; the head of the sail is the weak spot. */
  segmentShip(t: Ship, ax: number, ay: number, az: number, bx: number, by: number, bz: number): { t: number; crit: boolean } | null {
    const c = Math.cos(t.heading), s = Math.sin(t.heading);
    const loc = (x: number, z: number): [number, number] => { const dx = x - t.x, dz = z - t.z; return [dx * c - dz * s, dx * s + dz * c]; };
    const [alx, alz] = loc(ax, az), [blx, blz] = loc(bx, bz);
    const y0 = t.hop * 2 - t.sink * 6;
    // the hull and its castles, the low rig, and the high rig (a crit)
    const boxes: [number, number, number, number, number, number, boolean][] = [
      [-2.8, 2.8, -1 + y0, 2.6 + y0, -9.4, 9.2, false],
      [-2.4, 2.4, 2.6 + y0, 5.4 + y0, -10, -3.9, false],
      [-2, 2, 2.6 + y0, 4.4 + y0, 5.4, 9, false],
      [-1.8, 1.8, 4.4 + y0, 11 + y0, -8.5, 9.5, false],
      [-1.6, 1.6, 11 + y0, 20 + y0, -9, 7, true],
    ];
    let best: { t: number; crit: boolean } | null = null;
    for (const [x0, x1, yb, yt, z0, z1, crit] of boxes) {
      let t0 = 0, t1 = 1;
      const o = [alx, ay, alz], d = [blx - alx, by - ay, blz - alz], lo = [x0, yb, z0], hi = [x1, yt, z1];
      let ok = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) { ok = false; break; } continue; }
        let ta = (lo[k] - o[k]) / d[k], tb = (hi[k] - o[k]) / d[k];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && (!best || t0 < best.t)) best = { t: t0, crit };
    }
    return best;
  }

  private stepProjectiles(dt: number): void {
    const ps = this.projectiles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      const ox = p.x, oy = p.y, oz = p.z;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.travelled += Math.hypot(p.x - ox, p.y - oy, p.z - oz);
      p.life -= dt;
      let hitT = 2, hitShip: Ship | null = null, crit = false;
      for (const t of this.ships) {
        if (t.id === p.owner || t.phase !== 'sea' || (!t.alive && t.sink > 0.5)) continue;
        if (Math.abs(t.x - p.x) > 30 || Math.abs(t.z - p.z) > 30) continue;
        const h = this.segmentShip(t, ox, oy, oz, p.x, p.y, p.z);
        if (h && h.t < hitT) { hitT = h.t; hitShip = t; crit = h.crit; }
      }
      const at = (k: number): [number, number, number] => [ox + (p.x - ox) * k, oy + (p.y - oy) * k, oz + (p.z - oz) * k];
      if (hitShip) {
        const [x, y, z] = at(hitT);
        if (p.splash > 0) this.explode(p, x, y, z);
        else {
          const fall = this.falloff(p);
          if (hitShip.alive) this.damage(hitShip, p.dmg * fall * (crit ? p.crit : 1), p.owner, crit && p.crit > 1, p.kind, x, y, z);
          this.emit({ t: 'impact', on: 'ship', kind: p.kind, x, y, z, big: p.kind === 'harpoon' ? 1 : 0.3 });
        }
        ps.splice(i, 1);
        continue;
      }
      const ground = this.heightAt(p.x, p.z);
      if (p.y <= Math.max(0, ground)) {
        const on = ground > 0 ? 'land' : 'water';
        if (p.splash > 0) this.explode(p, p.x, Math.max(0, ground), p.z);
        else this.emit({ t: 'impact', on, kind: p.kind, x: p.x, y: Math.max(0, ground), z: p.z, big: p.kind === 'harpoon' ? 0.8 : 0.25 });
        ps.splice(i, 1);
        continue;
      }
      if (p.life <= 0 || p.travelled > p.range) {
        if (p.splash > 0) this.explode(p, p.x, p.y, p.z);
        ps.splice(i, 1);
      }
    }
  }

  private falloff(p: Projectile): number {
    const k = p.travelled / p.range;
    return k < 0.6 ? 1 : 1 - (k - 0.6) * 1.25;
  }

  private explode(p: Projectile, x: number, y: number, z: number): void {
    this.emit({ t: 'impact', on: y > 0.5 ? 'land' : 'water', kind: p.kind, x, y, z, big: 1 });
    for (const t of this.ships) {
      if (!t.alive || t.phase !== 'sea' || t.id === p.owner) continue;
      const d = Math.hypot(t.x - x, t.z - z, (2 - y) * 0.5) - 3;
      if (d > p.splash) continue;
      const k = 1 - Math.max(0, d) / p.splash * 0.6;
      this.damage(t, p.dmg * k, p.owner, false, p.kind, t.x, 3, t.z);
    }
  }

  /** Shield first, then hull. The storm reaches past the shield. */
  damage(t: Ship, amount: number, src: number, crit: boolean, kind: HarmKind, x: number, y: number, z: number, skipShield = false): void {
    if (!t.alive || amount <= 0) return;
    // bots spar more gently with each other, so the sea stays busy into the late storm
    if (src >= 0 && t.bot && this.ships[src].bot) amount *= BOT_VS_BOT;
    else if (src >= 0 && !t.bot && this.ships[src].bot) amount *= LANDING_GRACE + (BOT_VS_PLAYER - LANDING_GRACE) * Math.min(1, Math.max(0, (this.time - t.landT - 8) / 50));
    amount = Math.round(amount);
    let toShield = 0;
    if (!skipShield && t.shield > 0) { toShield = Math.min(t.shield, amount); t.shield -= toShield; }
    const toHull = Math.min(t.hull, amount - toShield);
    t.hull -= toHull;
    const broke = toShield > 0 && t.shield <= 0;
    t.hitFlash = 1;
    if (src >= 0) { t.lastHitBy = src; t.lastHitT = this.time; const a = this.ships[src]; if (a) a.dealt += toShield + toHull; }
    // a repair is broken off by a hit
    if (src >= 0 && t.useSlot >= 0) { t.useT = 0; t.useSlot = -1; }
    this.emit({ t: 'hit', target: t.id, src, dmg: toShield + toHull, crit, shield: toShield, hull: toHull, x, y, z, broke, kind });
    if (t.hull <= 0) this.eliminate(t, src >= 0 ? src : this.time - t.lastHitT < 12 ? t.lastHitBy : -1, kind);
  }

  private eliminate(t: Ship, killer: number, kind: HarmKind): void {
    t.alive = false;
    t.hull = 0;
    t.shield = 0;
    t.place = this.alive + 1;
    t.useSlot = -1;
    t.killer = killer;
    if (killer >= 0 && killer !== t.id) { this.ships[killer].kills++; this.ships[killer].glimmer += 12; }
    this.emit({ t: 'elim', victim: t.id, killer, kind });
    this.ink.founder(t.id, this.inked);
    this.flushInk();
    // everything she carried spills onto the water
    const items = t.slots.filter((it): it is Item => !!it);
    items.forEach((it, i) => {
      const a = (i / Math.max(1, items.length)) * Math.PI * 2 + this.r();
      this.loot.push({ id: this.nextId++, x: t.x, z: t.z, item: it.type === 'weapon' ? { ...it, ammo: WEAPONS[it.kind].mag } : { ...it }, vx: Math.cos(a) * 9, vz: Math.sin(a) * 9, age: 0, from: 'drop' });
    });
    t.slots = [null, null, null, null, null];
  }

  // ---------------------------------------------------------------- loot

  private stepLoot(dt: number): void {
    for (const l of this.loot) {
      if (l.age < 10) {
        l.age += dt;
        l.x += l.vx * dt; l.z += l.vz * dt;
        l.vx *= Math.max(0, 1 - dt * 2.2); l.vz *= Math.max(0, 1 - dt * 2.2);
        if (this.heightAt(l.x, l.z) > -0.5) { const [x, z] = this.world.nav.nearestOpen(l.x, l.z); l.x += (x - l.x) * dt * 3; l.z += (z - l.z) * dt * 3; l.vx = l.vz = 0; }
      }
    }
    for (const c of this.clams) if (c.open) c.openT += dt;
    for (const m of this.motes) if (m.t > 0) m.t -= dt;
  }

  /** Sailing through loot picks it up when there is room; a weapon with no room waits for a swap. */
  private stepPickup(s: Ship): void {
    s.nearLoot = -1;
    for (const c of this.clams) {
      if (c.open || Math.abs(c.x - s.x) > 14 || Math.abs(c.z - s.z) > 14 || Math.hypot(c.x - s.x, c.z - s.z) > 13) continue;
      c.open = true;
      const items = [this.roll(true), this.roll(false)];
      if (this.r() < 0.5) items.push(this.roll(false));
      items.forEach((item, i) => {
        const a = Math.atan2(s.x - c.x, s.z - c.z) + (i - (items.length - 1) / 2) * 0.7;
        this.loot.push({ id: this.nextId++, x: c.x, z: c.z, item, vx: Math.sin(a) * 7, vz: Math.cos(a) * 7, age: 0, from: 'clam' });
      });
      s.glimmer += 4;
      this.emit({ t: 'clam', id: c.id, x: c.x, z: c.z, ship: s.id });
    }
    for (const m of this.motes) {
      if (m.t > 0 || Math.abs(m.x - s.x) > 7 || Math.abs(m.z - s.z) > 7 || Math.hypot(m.x - s.x, m.z - s.z) > 6.5) continue;
      m.t = 45;
      s.glimmer++;
      // a chain: how many of this lane's sparks are already taken
      let chain = 0;
      for (const o of this.motes) if (o.lane === m.lane && o.t > 40) chain++;
      this.emit({ t: 'mote', ship: s.id, chain });
    }
    let nearest = -1, nd = 9.5;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      if (l.age < 0.6) continue;
      const d = Math.hypot(l.x - s.x, l.z - s.z);
      if (d > 9.5) continue;
      if (this.take(s, l.item)) {
        this.emit({ t: 'pickup', ship: s.id, item: l.item });
        this.loot.splice(i, 1);
      } else if (d < nd) { nd = d; nearest = l.id; }
    }
    s.nearLoot = nearest;
    if (s.input.swap && nearest >= 0) {
      s.input.swap = false;
      const i = this.loot.findIndex((l) => l.id === nearest);
      if (i >= 0) {
        const l = this.loot[i];
        const old = s.slots[s.sel];
        s.slots[s.sel] = l.item;
        this.emit({ t: 'pickup', ship: s.id, item: l.item });
        if (old) { l.item = old; l.age = 0; l.vx = Math.sin(s.heading + Math.PI) * 6; l.vz = Math.cos(s.heading + Math.PI) * 6; }
        else this.loot.splice(i, 1);
        s.reloadT = 0;
        s.equipT = 0.25;
        s.nearLoot = -1;
      }
    }
    s.input.swap = false;
  }

  /** Stack, fill an empty slot, or refuse. */
  take(s: Ship, it: Item): boolean {
    if (it.type === 'use') {
      for (const sl of s.slots) {
        if (sl && sl.type === 'use' && sl.kind === it.kind && sl.count < USES[it.kind].stack) {
          const n = Math.min(it.count, USES[it.kind].stack - sl.count);
          sl.count += n;
          it.count -= n;
          if (it.count <= 0) return true;
        }
      }
    }
    // a bot drops a weaker copy of the same weapon for a better one
    if (it.type === 'weapon' && s.bot) {
      const i = s.slots.findIndex((sl) => sl && sl.type === 'weapon' && sl.kind === it.kind);
      if (i >= 0) {
        const sl = s.slots[i] as Extract<Item, { type: 'weapon' }>;
        if (sl.rarity < it.rarity) { s.slots[i] = it; return true; }
        return false;
      }
    }
    const empty = s.slots.findIndex((sl) => !sl);
    if (empty < 0) return false;
    s.slots[empty] = it.type === 'use' ? { ...it } : it;
    if (it.type === 'weapon' && !this.weaponOf(s)) s.sel = empty;
    return true;
  }

  // ---------------------------------------------------------------- the gull, the leviathan, the landmarks

  /** Spend glimmer and the gull flies off, coming back with a parcel dropped just ahead of the bow. */
  private stepGull(s: Ship, dt: number): void {
    const inp = s.input;
    if (inp.hail >= 0 && s.gull === 'home') {
      const p = PARCELS[inp.hail], cost = p ? this.parcelCost(s, inp.hail) : 0;
      if (p && s.glimmer >= cost) {
        s.glimmer -= cost;
        s.gull = 'away';
        s.gullT = GULL_FLIGHT;
        s.gullTier = inp.hail;
        this.emit({ t: 'hail', ship: s.id, tier: inp.hail });
      }
    }
    inp.hail = -1;
    if (s.gull === 'home') return;
    s.gullT -= dt;
    if (s.gullT > 0) return;
    if (s.gull === 'rest') { s.gull = 'home'; return; }
    // the drop: a little ahead, on open water
    let x = s.x + Math.sin(s.heading) * (12 + s.speed * 1.2), z = s.z + Math.cos(s.heading) * (12 + s.speed * 1.2);
    if (!this.world.nav.open(x, z)) [x, z] = [s.x, s.z];
    const items: Item[] = s.gullTier === 0
      ? [{ type: 'use', kind: 'glass', count: 3, rarity: 1 }, { type: 'use', kind: 'drift', count: 4, rarity: 1 }]
      : s.gullTier === 1
        ? [this.roll(false, [0, 0, 60, 30, 10], 1), this.roll(false, [0, 1, 0, 0, 0], 0)]
        : [this.roll(false, [0, 0, 0, 65, 35], 1), { type: 'use', kind: 'pearl', count: 1, rarity: 2 }];
    items.forEach((item, i) => {
      const a = s.heading + (i - (items.length - 1) / 2) * 0.9;
      this.loot.push({ id: this.nextId++, x, z, item, vx: Math.sin(a) * 3, vz: Math.cos(a) * 3, age: 0.3, from: 'gull' });
    });
    this.emit({ t: 'parcel', ship: s.id, x, z, tier: s.gullTier });
    s.gull = 'rest';
    s.gullT = GULL_COOLDOWN;
  }

  private stepLeviathan(dt: number): void {
    const lv = this.leviathan;
    if (lv.state === 'none') return;
    lv.t -= dt;
    if (lv.t > 0) return;
    if (lv.state === 'rising') {
      lv.state = 'breach';
      lv.t = 8;
      this.emit({ t: 'leviathan', state: 'breach', x: lv.x, z: lv.z });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + this.r() * 0.5, v = 9 + this.r() * 6;
        this.loot.push({ id: this.nextId++, x: lv.x, z: lv.z, item: this.roll(false, [0, 0, 25, 45, 30], i < 4 ? 1 : 0), vx: Math.cos(a) * v, vz: Math.sin(a) * v, age: 0, from: 'leviathan' });
      }
      // the breach shoves ships aside
      for (const t of this.ships) {
        const d = Math.hypot(t.x - lv.x, t.z - lv.z);
        if (t.phase === 'sea' && t.alive && d < 30) { t.hop = 1; t.speed *= 0.5; }
      }
    } else lv.state = 'none';
  }

  /** Thread the Moonbow Arch, or sail through the spray under Thunder Falls: once a match each. */
  private stunts(s: Ship): void {
    if (!s.threaded) {
      // crossed the line between the arch's feet, between them
      const ax = ARCH.ax, az = ARCH.az, bx = ARCH.bx, bz = ARCH.bz;
      const side = (x: number, z: number) => (bx - ax) * (z - az) - (bz - az) * (x - ax);
      const s0 = side(s.px, s.pz), s1 = side(s.x, s.z);
      if (s0 * s1 < 0) {
        const L = Math.hypot(bx - ax, bz - az), t = ((s.x - ax) * (bx - ax) + (s.z - az) * (bz - az)) / (L * L);
        if (t > 0.15 && t < 0.85) {
          s.threaded = true;
          s.glimmer += 15;
          this.loot.push({ id: this.nextId++, x: s.x, z: s.z, item: this.roll(false, [0, 0, 40, 40, 20], 1), vx: Math.sin(s.heading) * 10, vz: Math.cos(s.heading) * 10, age: 0.4, from: 'stunt' });
          this.emit({ t: 'stunt', ship: s.id, kind: 'arch', x: s.x, z: s.z });
        }
      }
    }
    if (!s.blessed) {
      const f = this.world.falls, fx = f.x + f.dirx * 12, fz = f.z + f.dirz * 12;
      if (Math.hypot(s.x - fx, s.z - fz) < 18) {
        s.blessed = true;
        s.shield = MAX_SHIELD;
        this.emit({ t: 'stunt', ship: s.id, kind: 'falls', x: s.x, z: s.z });
      }
    }
  }

  // ---------------------------------------------------------------- the ink

  private readonly inked: InkEvent[] = [];
  private swallowT = 0;

  /** What the gull asks of this captain for a parcel: less for whoever holds the lagoon. */
  parcelCost(s: Ship, tier: number): number {
    return Math.round(PARCELS[tier].cost * (this.ink.has(s.id, 'lagoon') ? PERK.lagoon : 1));
  }

  /** Ink laid by a ship's passage; home water mends her; a ship with no water left starts afresh where she is. */
  private inkSail(s: Ship, ox: number, oz: number, dt: number): void {
    const ink = this.ink;
    ink.sail(s.id, ox, oz, s.x, s.z, this.inked);
    this.flushInk();
    if (!s.alive) return;
    const st = this.storm;
    if (ink.held(s.id) === 0 && ink.laid(s.id) === 0 && this.time - s.landT > 2 && Math.hypot(s.x - st.x, s.z - st.z) < st.r - 30) ink.inkHome(s.id, s.x, s.z);
    if (s.hull < MAX_HULL && this.time - s.lastHitT > 4 && ink.atHome(s.id, s.x, s.z)) {
      s.hull = Math.min(MAX_HULL, s.hull + HOME_REPAIR * dt * (ink.has(s.id, 'falls') ? PERK.falls : 1));
    }
  }

  /** Turns the ink's news into damage, glimmer and events. */
  private flushInk(): void {
    if (!this.inked.length) return;
    const list = this.inked.splice(0);
    for (const e of list) {
      if (e.t === 'cut') {
        const by = this.ships[e.by], v = this.ships[e.victim];
        by.glimmer += CUT.glimmer;
        this.emit(e);
        this.damage(v, CUT.dmg, e.by, false, 'ink', v.x, 2, v.z, true);
      } else {
        if (e.t === 'claim') this.ships[e.ship].glimmer += Territory.pay(e.cells);
        this.emit(e);
      }
    }
  }

  private stepInk(dt: number): void {
    this.ink.rent(dt, (id, g) => { if (this.ships[id].alive) this.ships[id].glimmer += g; });
    const st = this.storm;
    this.swallowT -= dt;
    if (st.phase >= 0 && this.swallowT <= 0) {
      this.swallowT = 1;
      this.ink.swallow(st.x, st.z, st.r + 4, this.inked);
      this.flushInk();
    }
  }

  // ---------------------------------------------------------------- the storm

  private stepStorm(dt: number): void {
    const st = this.storm;
    if (this.gale.t < this.gale.dur) return;
    if (st.state === 'idle') { this.nextPhase(); return; }
    st.t -= dt;
    if (st.state === 'shrink') {
      const ph = STORM_PHASES[st.phase];
      const k = 1 - Math.max(0, st.t) / ph.shrink;
      st.x = st.fx + (st.nx - st.fx) * k;
      st.z = st.fz + (st.nz - st.fz) * k;
      st.r = st.fr + (st.nr - st.fr) * k;
    }
    if (st.t > 0) return;
    if (st.state === 'wait') {
      st.state = 'shrink';
      st.t = STORM_PHASES[st.phase].shrink;
      st.dmg = STORM_PHASES[st.phase].dmg;
      this.emit({ t: 'storm', phase: st.phase, state: 'shrink' });
      // treasure glints just inside the storm wall: worth a dash through the weather
      for (let k = 0, n = 0; k < 24 && n < 3; k++) {
        const a = this.r() * Math.PI * 2, d = st.r - 25;
        const x = st.x + Math.cos(a) * d, z = st.z + Math.sin(a) * d;
        if (d < st.nr + 40 || !this.world.nav.open(x, z) || Math.hypot(x, z) > PLAY_R - 15) continue;
        this.loot.push({ id: this.nextId++, x, z, item: this.roll(false, [0, 0, 30, 50, 20], 0.75), vx: 0, vz: 0, age: 99, from: 'storm' });
        n++;
      }
    } else this.nextPhase();
  }

  private nextPhase(): void {
    const st = this.storm;
    if (st.phase >= STORM_PHASES.length - 1) { st.state = 'shrink'; st.t = 1e9; return; }
    st.phase++;
    const ph = STORM_PHASES[st.phase];
    if (st.phase === 0) { st.x = 0; st.z = 0; st.r = RIM; st.dmg = 1; }
    st.fx = st.x; st.fz = st.z; st.fr = st.r;
    // the next circle lies wholly inside this one, centred on water where it can be
    const room = Math.max(0, (st.phase === 0 ? PLAY_R - 40 : st.r) - ph.r);
    for (let k = 0; k < 40; k++) {
      const a = this.r() * Math.PI * 2, d = Math.sqrt(this.r()) * room * 0.85;
      const x = st.x + Math.cos(a) * d, z = st.z + Math.sin(a) * d;
      if (Math.hypot(x, z) > PLAY_R - ph.r * 0.3) continue;
      st.nx = x; st.nz = z;
      if (this.world.nav.open(x, z) || k > 30) break;
    }
    st.nr = ph.r;
    st.state = 'wait';
    st.t = ph.wait;
    // twice a match the leviathan rises inside the coming circle
    if (st.phase === 1 || st.phase === 3) {
      const lv = this.leviathan;
      for (let k = 0; k < 60; k++) {
        const a = this.r() * Math.PI * 2, d = Math.sqrt(this.r()) * st.nr * 0.7;
        const x = st.nx + Math.cos(a) * d, z = st.nz + Math.sin(a) * d;
        if (!this.world.nav.open(x, z) || !this.world.nav.open(x + 20, z) || !this.world.nav.open(x - 20, z) || !this.world.nav.open(x, z + 20) || !this.world.nav.open(x, z - 20)) continue;
        lv.state = 'rising'; lv.x = x; lv.z = z; lv.t = 20; lv.count++;
        this.emit({ t: 'leviathan', state: 'rising', x, z });
        break;
      }
    }
    this.emit({ t: 'storm', phase: st.phase, state: 'wait' });
  }
}


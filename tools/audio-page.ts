// The page side of tools/audio.ts: loaded into headless Chromium by Vite, it renders through the game's own sound
// engine (src/audio/audio.ts createEngine) on an OfflineAudioContext: each sound once, close, through the whole mix;
// a gun heard at three distances; and a 30 s scripted passage of play (her sailing past an island, a gust, three shots
// of hers and others' about her, a ball passing, blows taken, a pickup and its use, a ship going down, a loop closed,
// the storm closing over her). Each comes back as base64 float samples, one string a channel.

import { createEngine } from '../src/audio/audio';
import { CUES, CUE_NAMES, type Cue } from '../src/audio/cues';
import type { Hearing } from '../src/audio/listen';
import type { Deed, Kit, Moment, Status } from '../src/player';
import { lookingAt, type Blast, type BallDraw, type Eye, type SeaChange, type ShipDraw, type Snapshot } from '../src/snapshot';
import { R, add, cross, normalize, scale, type Vec3 } from '../src/world/sphere';

const RATE = 48000;

export interface Rendered { name: string; channels: string[] }

const encode = (x: Float32Array): string => {
  const bytes = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const rendered = async (name: string, ctx: OfflineAudioContext): Promise<Rendered> => {
  const b = await ctx.startRendering();
  return { name, channels: [0, 1].map((c) => encode(b.getChannelData(c))) };
};

const EYE: Eye = { kind: 'air', position: [0, 0, R + 10], orientation: [0, 0, 0, 1], fov: 50 };
const seaFloor = () => -30;

/** Each sound once, heard close (as hers), through the whole mix at full level: one render per sound, by the first cue
 *  that plays it. */
export async function sounds(): Promise<Rendered[]> {
  const seen = new Set<string>(), out: Rendered[] = [];
  for (const cue of CUE_NAMES) {
    const sound = CUES[cue].sound;
    if (seen.has(sound)) continue;
    seen.add(sound);
    out.push(await one(sound, cue, null));
  }
  // a gun of another's, ahead and to her right, near, off and far
  for (const m of [80, 300, 900]) out.push(await one(`fired-${m}m`, 'fired', [m * 0.6, 0, R + 3 - m * 0.8]));
  return out;
}

async function one(name: string, cue: Cue, at: Vec3 | null): Promise<Rendered> {
  const ctx = new OfflineAudioContext(2, RATE * 7, RATE);
  const engine = createEngine(ctx, seaFloor);
  engine.fill(Infinity);
  engine.level(1, 0);
  engine.cue({ cue, at, gain: 1 }, EYE, 0.05);
  return rendered(name, ctx);
}

/** A passage of play: what happens when (seconds), as the game would show it. */
interface Script {
  seconds: number; ownShots: readonly number[]; others: readonly { id: number; at: readonly [number, number] }[];
  otherShots: readonly (readonly [number, number])[]; gust: readonly [number, number]; pickup: number; select: number;
  mend: readonly [number, number]; whistle: number; storm: { from: number; wall: number; closing: number; rate: number };
  trail: readonly [number, number]; sinks: readonly [number, number]; strikes: readonly number[];
  speed: (t: number) => number; isle: boolean;
}

/** The scripted passage. */
const PASSAGE: Script = {
  seconds: 30, strikes: [9.5, 17, 19.5], isle: true, speed: (t) => Math.min(11, 3 + 3 * t),
  ownShots: [5, 13, 21],
  others: [{ id: 1, at: [90, 40] }, { id: 2, at: [-60, 250] }, { id: 3, at: [500, -400] }] as const,
  otherShots: [[1, 3], [2, 7], [1, 11.5], [3, 15], [3, 24]] as const,
  gust: [8, 9.15], pickup: 10, select: 10.6, mend: [10.8, 12.3], whistle: 12.4,
  storm: { from: 16, wall: 600, closing: 18, rate: 47 }, trail: [22, 25], sinks: [2, 20],
};

/** Nothing happening for `seconds`: her at `speed` m/s, the storm's wall `wall` m off, an island near or none. */
const still = (seconds: number, speed: number, wall: number, isle: boolean): Script => ({
  seconds, ownShots: [], others: [], otherShots: [], gust: [-1, -1], pickup: Infinity, select: Infinity, mend: [Infinity, Infinity],
  whistle: -10, storm: { from: 0, wall, closing: Infinity, rate: 0 }, trail: [Infinity, Infinity], sinks: [-1, Infinity], strikes: [],
  speed: () => speed, isle,
});

/** The bed alone, steady: at anchor in the open; under way; slowly past an island; near the storm; inside it. */
export const beds = async (): Promise<Rendered[]> => [
  await passage(1, 'bed-anchor', still(8, 0, 2000, false)),
  await passage(1, 'bed-sailing', still(8, 11, 2000, false)),
  await passage(1, 'bed-shore', still(8, 4, 2000, true)),
  await passage(1, 'bed-nearstorm', still(8, 11, 150, false)),
  await passage(1, 'bed-instorm', still(8, 11, -60, false)),
];

/** Her hull and ward at `t`, by the blows on her: her ward rings, then breaks with her hull hit, then her hull again. */
const harm = (t: number, [a, b, c]: readonly number[]) => ({ shield: !(t >= a) ? 30 : !(t >= b) ? 10 : 0, hull: !(t >= b) ? 100 : !(t >= c) ? 85 : 64 });

/** A passage of play (the scripted one by default), at `level` (the settings' sound). */
export async function passage(level = 0.8, name = 'passage', SCRIPT: Script = PASSAGE): Promise<Rendered> {
  const ctx = new OfflineAudioContext(2, RATE * SCRIPT.seconds, RATE);
  const start = normalize([0.3, 0.2, 0.93]), heading = normalize(cross([0, 0, 1], start));
  // an island 70 m off her starboard bow at the start: she passes it in the first ten seconds
  const isle = normalize(add(scale(start, Math.cos(60 / R)), cross(heading, start), Math.sin(60 / R)));
  const ground = (p: Vec3) => (SCRIPT.isle && p[0] * isle[0] + p[1] * isle[1] + p[2] * isle[2] > Math.cos(55 / R) ? 4 : -25);
  const engine = createEngine(ctx, ground);
  engine.fill(Infinity);

  // what happens on the sea, as the match reports it (player.ts Deed), each told once its moment has come
  type Told = { time: number; deed: (at: Vec3) => Deed };
  const told: Told[] = [];
  const tell = (time: number, deed: (at: Vec3) => Deed) => told.push({ time, deed });
  const [a, b, c] = SCRIPT.strikes;
  for (const s of SCRIPT.ownShots) {
    tell(s, (at) => ({ seq: 0, time: s, at, ship: 0, kind: 'fired' }));
    // her ball home in the ship she was laid on, its flight later
    tell(s + 0.7, () => ({ seq: 0, time: s + 0.7, at: [0, 0, 1], ship: 1, kind: 'struck', by: 0, shield: 0, hull: 12, broke: false, ram: false }));
  }
  for (const [id, s] of SCRIPT.otherShots) {
    tell(s, () => ({ seq: 0, time: s, at: [0, 0, 1], ship: id, kind: 'fired' }));
    tell(s + 0.6, () => ({ seq: 0, time: s + 0.6, at: [0, 0, 1], ship: id, kind: 'fell', land: false }));
  }
  // the blows on her (harm): her ward rings, then breaks with her hull hit, then her hull again
  tell(a, (at) => ({ seq: 0, time: a, at, ship: 0, kind: 'struck', by: 1, shield: 20, hull: 0, broke: false, ram: false }));
  tell(b, (at) => ({ seq: 0, time: b, at, ship: 0, kind: 'struck', by: 1, shield: 10, hull: 15, broke: true, ram: false }));
  tell(c, (at) => ({ seq: 0, time: c, at, ship: 0, kind: 'struck', by: 1, shield: 0, hull: 21, broke: false, ram: false }));
  tell(SCRIPT.sinks[1], () => ({ seq: 0, time: SCRIPT.sinks[1], at: [0, 0, 1], ship: SCRIPT.sinks[0], kind: 'sank', by: 0 }));
  tell(SCRIPT.pickup, (at) => ({ seq: 0, time: SCRIPT.pickup, at, ship: 0, kind: 'took', piece: 'smallShield', rarity: 1, slot: 1 }));
  tell(SCRIPT.mend[1], (at) => ({ seq: 0, time: SCRIPT.mend[1], at, ship: 0, kind: 'mended', piece: 'smallShield' }));
  tell(SCRIPT.gust[0], (at) => ({ seq: 0, time: SCRIPT.gust[0], at, ship: 0, kind: 'gust' }));
  told.sort((x, y) => x.time - y.time);
  let moments: Moment[] = [], seq = 0;

  const speedAt = (t: number) => (t >= SCRIPT.gust[0] && t < SCRIPT.gust[1] ? 16 : SCRIPT.speed(t));
  let run = 0;
  const blasts: Blast[] = [];
  const dt = 1 / 30;
  for (let frame = 0; frame * dt < SCRIPT.seconds - 0.05; frame++) {
    const t = frame * dt;
    run += speedAt(t) * dt;
    const radial = normalize(add(scale(start, Math.cos(run / R)), heading, Math.sin(run / R)));
    const forward = normalize(add(scale(heading, Math.cos(run / R)), start, -Math.sin(run / R)));
    const side = cross(forward, radial);
    const roll = 0.05 * Math.sin((2 * Math.PI * t) / 5.5) + 0.02 * Math.sin((2 * Math.PI * t) / 3.1);
    const heave = 0.6 * Math.sin((2 * Math.PI * t) / 7) + 0.3 * Math.sin((2 * Math.PI * t) / 4.3);
    const position = scale(radial, R + heave);
    const her: ShipDraw = {
      id: 0, pose: { position, forward, up: normalize(add(scale(radial, Math.cos(roll)), side, Math.sin(roll))) },
      look: { paint: [1, 0, 0], sail: [1, 1, 1], band: false }, velocity: scale(forward, speedAt(t)), afloat: true,
    };
    const place = (x: number, z: number): Vec3 => scale(normalize(add(add(radial, side, x / R), forward, z / R)), R + 2);
    const ships: ShipDraw[] = [her, ...SCRIPT.others.map((o): ShipDraw => ({
      ...her, id: o.id, pose: { ...her.pose, position: place(o.at[0], o.at[1]) }, velocity: [0, 0, 0],
      afloat: !(o.id === SCRIPT.sinks[0] && t >= SCRIPT.sinks[1]),
    }))];
    const eyeAt = add(add(position, forward, -22), radial, 9);
    const eye: Eye = { kind: 'air', position: eyeAt, orientation: lookingAt(eyeAt, add(position, forward, 10), radial), fov: 50 };
    const happened = (when: number) => when <= t && when > t - dt;
    // where each deed happened: hers at her, another's at that ship, her ball home in ship 1, a miss short of her
    const where = (d: Deed): Vec3 => {
      if (d.kind === 'fell') return normalize(place(25, 30));
      const o = SCRIPT.others.find((k) => k.id === d.ship);
      return o ? normalize(place(o.at[0], o.at[1])) : radial;
    };
    for (const k of told) if (happened(k.time)) {
      const d = k.deed(radial), m: Moment = { ...d, seq: ++seq, at: where(d), seen: null, bearing: 0, metres: 0 };
      moments = [...moments.filter((x) => x.time > t - 1), m];
    }
    for (const s of SCRIPT.ownShots) if (happened(s)) blasts.push({ kind: 'shot', time: t, from: add(add(position, forward, 3), radial, 2), dir: forward });
    for (const [id, s] of SCRIPT.otherShots) if (happened(s)) {
      const o = SCRIPT.others.find((k) => k.id === id)!;
      blasts.push({ kind: 'shot', time: t, from: place(o.at[0], o.at[1]), dir: forward });
    }
    // a ball passing the eye some 6 m off, at its closest at SCRIPT.whistle
    const balls: BallDraw[] = [];
    if (t > SCRIPT.whistle - 1 && t < SCRIPT.whistle + 0.5) {
      const way = scale(side, -136), closest = add(eyeAt, forward, 6);
      balls.push({ at: add(closest, way, t - SCRIPT.whistle), way });
    }
    const { storm, trail, gust, pickup, select, mend } = SCRIPT;
    const wall = t < storm.from ? storm.wall : storm.wall - (t - storm.from) * storm.rate;
    const changes: SeaChange[] = t >= trail[1] ? [{ seq: 1, time: trail[1], kind: 'claim', ship: 0, cells: [], loop: 0 }] : [];
    const scene: Snapshot = {
      eye, clock: t, storm: { centre: radial, radius: wall / R }, ships, own: 0, balls, loot: [],
      blasts: blasts.filter((b) => b.time <= t && b.time > t - 3),
      sea: {
        generation: 1, owner: [], seq: changes.length, changes, colours: [],
        trails: t >= trail[0] && t < trail[1] ? [{ id: 0, serial: 1, points: [] }] : [],
      },
    };
    const lastShot = Math.max(-10, ...SCRIPT.ownShots.filter((s) => s <= t));
    const mending = t >= mend[0] && t < mend[1];
    const status: Status & Kit = {
      at: radial, heading: forward, facing: forward, arriving: 0, ships: [], ...harm(t, SCRIPT.strikes), hullMax: 100, shieldMax: 50,
      gun: { rarity: 0, ready: Math.min(1, (t - lastShot) / 2), locked: false }, afloat: 4, sunk: false,
      storm: 30, closing: t >= storm.closing, eye: { centre: radial, radius: wall }, next: null, outside: Math.max(0, -wall),
      loot: [], reticle: null, moments,
      items: [t >= pickup && t < mend[1] ? { item: 'item.smallShield', count: 1 } : null, null, null],
      chosen: t >= select ? 1 : 0, using: mending ? (t - mend[0]) / (mend[1] - mend[0]) : null, offer: null,
      gust: 2, gusts: 2, blowing: t >= gust[0] && t < gust[1],
    };
    const hearing: Hearing = { scene, status, screen: 'match', map: false };
    engine.update(hearing, level, t, dt);
  }
  return rendered(name, ctx);
}

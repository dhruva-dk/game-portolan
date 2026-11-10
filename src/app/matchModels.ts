// The interface's view models from the match: what the HUD and the results show, and the fleet's marks
// for the chart, read from the session and the career's changes. Like models.ts, the screens never see the simulation
// itself.
import { Color, SRGBColorSpace } from 'three';
import { cosmetic, levelOf, type Career, type Look, type MatchChanges, type Rank } from '../career/index.ts';
import { ability, type ActiveId } from '../sim/abilities.ts';
import {
  ACTIVES, PHASE, PLAYER, SHIPS, STORM, TICK, USES, WEAPONS, inStorm, newStormView, seen, SEEN, stormView, type MatchState, type Ship, type StormView,
} from '../sim/match.ts';
import { toEdge } from '../sim/storm.ts';
import { seaLevelAt } from '../sim/environment.ts';
import { deckAt, newDeck } from '../sim/seaway.ts';
import { GALE, GUST, LOOT, PARCELS, PARTS } from '../sim/tables.ts';
import { R, TERRITORY, angleTo, apart, cellDir, cellOf, tangentToward } from '../sim/sphere.ts';
import { GULL } from '../sim/state.ts';
import { priceOf } from '../sim/economy.ts';
import { aimedAt } from '../sim/combat.ts';
import { REGIONS, regionAt } from '../sim/world/index.ts';
import { v3, type V3 } from '../sim/math.ts';
import type { ConsumableId, HeldChart, HudModel, LevelView, MapView, Mark, RankView, Rarity, ResultsModel, Slot, WeaponId } from '../ui/model.ts';
import type { MapShip, PlanetMapModel } from '../screens/fullmap.ts';
import { consumableOf, itemKey, weaponOf } from './moments.ts';
import type { Session } from './session.ts';
import { cosmeticsOf } from './views.ts';
import type { CosmeticIds } from '../render/actors/index.ts';

const DEG = 180 / Math.PI;
const SV = newStormView();
const MAP_RANGE = 320;

const rarityOf = (n: number): Rarity => Math.max(0, Math.min(4, Math.round(n))) as Rarity;
const colourOf = (id: string, fallback: string): string => cosmetic(id)?.colour ?? fallback;

/** Iron-gall ink: a captain's charge on its seal. */
const INK = '#1d1a17';

/** A ship's sigil and colours, for the emblem discs and the chart's marks: a captain's charge in ink on its colour,
 *  the player's on its sail colour and hull paint. */
const markOfIds = (c: CosmeticIds): Mark => ({
  emblem: c.emblem ?? 'gull',
  colours: c.colour ? [c.colour, INK] : [colourOf(c.sail ?? '', '#f4ead6'), colourOf(c.hull ?? '', '#5a3423')],
});
export const markOf = (look: Look): Mark => markOfIds(cosmeticsOf(look));

/** The colour a ship's water and trail are inked in: the first of her colours that would read as a dye on the sea. A
 *  near-white sail, a brown hull or the sea's own blue would not, and such a captain sails under a plain vermilion. */
export function waterInk(c: CosmeticIds): string {
  if (c.colour) return c.colour;
  for (const hex of [colourOf(c.sail ?? '', ''), colourOf(c.hull ?? '', '')]) {
    if (!hex) continue;
    const hsl = { h: 0, s: 0, l: 0 };
    new Color(hex).getHSL(hsl, SRGBColorSpace);
    if (hsl.s >= 0.34 && hsl.l >= 0.22 && hsl.l <= 0.72 && (hsl.h < 0.44 || hsl.h > 0.72)) return hex;
  }
  return '#d4501f';
}

/** Ship i's mark, from the look she wears in the match. */
const shipMark = (session: Session, i: number): Mark => markOfIds(session.looks[i] ?? session.looks[0]);

export const levelFrom = (l: { level: number; into: number; need: number }): LevelView => ({ level: l.level, into: l.into, need: l.need });

export const rankFrom = (r: Rank): RankView => ({ index: r.step.index, tier: r.step.tier, step: r.step.step });

/** Latitude and longitude in degrees, the sim's way round: longitude grows east, toward −z. */
function latLon(p: V3): { lat: number; lon: number } {
  return { lat: Math.asin(Math.max(-1, Math.min(1, p.y))) * DEG, lon: Math.atan2(-p.z, p.x) * DEG };
}

/** East and north at p, for laying the sea round a ship flat on the minimap. */
function frame(p: V3): { e: V3; n: V3 } {
  const { lat, lon } = latLon(p), la = lat / DEG, lo = lon / DEG;
  return {
    e: { x: -Math.sin(lo), y: 0, z: -Math.cos(lo) },
    n: { x: -Math.sin(la) * Math.cos(lo), y: Math.cos(la), z: Math.sin(la) * Math.sin(lo) },
  };
}

const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

function slotOf(sh: Ship, k: number): Slot {
  const it = sh.slots[k];
  if (!it || it.kind <= 0 || (it.n <= 0 && !WEAPONS[it.kind])) return { kind: 'empty' };
  const w = WEAPONS[it.kind];
  if (w) {
    const reload = k === sh.sel && sh.reload > 0 ? Math.max(0, Math.min(1, 1 - sh.reload / w.reload)) : 0;
    return { kind: 'weapon', weapon: weaponOf(it.kind) as WeaponId, rarity: rarityOf(it.rarity), ammo: it.n, reload };
  }
  return { kind: 'consumable', item: consumableOf(it.kind) as ConsumableId, count: it.n };
}

const afloat = (s: MatchState): number => s.ships.reduce((n, sh) => n + (sh.phase !== PHASE.sunk ? 1 : 0), 0);

/** The minimap round ship i. */
/** How many samples across the disc's wash of held water. */
const WASH_N = 64;
const WASH_IDS = new Uint8Array(WASH_N * WASH_N);
const SAMPLE = v3();

/** The owners of the water round p, north at the top, for the disc. */
function washAround(owner: Uint8Array, p: V3, e: V3, n: V3): Uint8Array {
  for (let j = 0; j < WASH_N; j++) {
    const y = (1 - ((j + 0.5) / WASH_N) * 2) * MAP_RANGE;
    for (let i = 0; i < WASH_N; i++) {
      const x = (((i + 0.5) / WASH_N) * 2 - 1) * MAP_RANGE, k = j * WASH_N + i;
      if (x * x + y * y > MAP_RANGE * MAP_RANGE * 1.06) { WASH_IDS[k] = 0; continue; }
      SAMPLE.x = p.x + (e.x * x + n.x * y) / R;
      SAMPLE.y = p.y + (e.y * x + n.y * y) / R;
      SAMPLE.z = p.z + (e.z * x + n.z * y) / R;
      const l = Math.hypot(SAMPLE.x, SAMPLE.y, SAMPLE.z);
      SAMPLE.x /= l; SAMPLE.y /= l; SAMPLE.z /= l;
      WASH_IDS[k] = owner[cellOf(TERRITORY, SAMPLE)];
    }
  }
  return WASH_IDS;
}

function mapOf(session: Session, i: number): MapView {
  const s = session.state, sh = s.ships[i], p = sh.pos, { e, n } = frame(p), ll = latLon(p);
  const rel = (q: V3) => {
    const d = { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z };
    return { x: R * dot(d, e), y: R * dot(d, n) };
  };
  stormView(s, SV);
  const formed = SV.calm.r < Math.PI * R * 0.49;
  const circle = (c: { at: V3; r: number }) => ({ ...rel(c.at), r: c.r });
  const ships: MapView['ships'] = [];
  for (let j = 0; j < SHIPS; j++) {
    if (j === i || s.ships[j].phase === PHASE.sunk) continue;
    const v = seen(s, i, j);
    if (!(v & (SEEN.visible | SEEN.map))) continue;
    if (apart(p, s.ships[j].pos) > MAP_RANGE * 1.5) continue;
    const mark = shipMark(session, j);
    ships.push({ ...rel(s.ships[j].pos), emblem: mark.emblem, colour: mark.colours[0], ...(v & SEEN.visible ? {} : { spotted: true }) });
  }
  const marks: MapView['marks'] = [];
  for (const l of s.loot) if (apart(p, l.at) < MAP_RANGE) marks.push(rel(l.at));
  const loop: number[] = [];
  for (const c of sh.laid) {
    const m = rel(cellDir(TERRITORY, c, SAMPLE));
    if (loop.length > 0 || Math.abs(m.x) < MAP_RANGE * 1.4) loop.push(m.x, m.y);
  }
  return {
    lat: ll.lat, lon: ll.lon, heading: Math.atan2(dot(sh.head, e), dot(sh.head, n)), range: MAP_RANGE,
    storm: formed ? circle(SV.calm) : null, next: formed ? circle(SV.next) : null, ships, marks,
    marker: i === PLAYER && session.mark ? rel(session.mark) : null,
    water: { n: WASH_N, ids: washAround(s.owner, p, e, n), inks: session.inks, me: i + 1 },
    loop, loopInk: session.inks[i], place: rel,
  };
}

/** The Gale's disc: a whole hemisphere round her, as far as a chart can show, with the Gale's course dotted across it,
 *  the Storm's first circle, the fleet as marks and my marker, pinned to the rim while it lies on the planet's far side. */
export function galeMap(session: Session): { view: MapView; tide: number } {
  const s = session.state, sh = s.ships[PLAYER], p = sh.pos, { e, n } = frame(p), ll = latLon(p), g = s.gale;
  const rel = (q: V3) => ({ x: R * dot(q, e), y: R * dot(q, n) });
  // what faces her, in runs broken where a line goes round the planet's far side
  const trace = (steps: number, at: (k: number) => V3): number[][] => {
    const runs: number[][] = [];
    let run: number[] | null = null;
    for (let k = 0; k <= steps; k++) {
      const q = at(k);
      if (dot(q, p) <= 0.02) { run = null; continue; }
      const m = rel(q);
      if (!run) runs.push((run = []));
      run.push(m.x, m.y);
    }
    return runs;
  };
  const course = trace(72, (k) => {
    const a = (GALE.arc * k) / 72, c = Math.cos(a), si = Math.sin(a);
    return { x: g.from.x * c + g.dir.x * si, y: g.from.y * c + g.dir.y * si, z: g.from.z * c + g.dir.z * si };
  });
  stormView(s, SV);
  const c = SV.next.at, a = SV.next.r / R, ca = Math.cos(a), sa = Math.sin(a), f = frame(c);
  const first = trace(96, (k) => {
    const th = (k / 96) * Math.PI * 2, u = sa * Math.cos(th), v = sa * Math.sin(th);
    return { x: c.x * ca + f.e.x * u + f.n.x * v, y: c.y * ca + f.e.y * u + f.n.y * v, z: c.z * ca + f.e.z * u + f.n.z * v };
  });
  const ships: MapView['ships'] = [];
  for (let j = 0; j < SHIPS; j++) {
    if (j === PLAYER || s.ships[j].phase === PHASE.sunk || dot(s.ships[j].pos, p) <= 0.02) continue;
    const mark = shipMark(session, j);
    ships.push({ ...rel(s.ships[j].pos), emblem: mark.emblem, colour: mark.colours[0] });
  }
  let marker: MapView['marker'] = null;
  if (session.mark) {
    marker = rel(session.mark);
    if (dot(session.mark, p) < 0.05) {
      const l = Math.hypot(marker.x, marker.y) || 1;
      marker = { x: (marker.x / l) * R * 1.5, y: (marker.y / l) * R * 1.5 };
    }
  }
  const view: MapView = {
    lat: ll.lat, lon: ll.lon, heading: Math.atan2(dot(sh.head, e), dot(sh.head, n)), range: R,
    storm: null, next: null, ships, marks: [], marker, course, first, fleet: true,
  };
  return { view, tide: seaLevelAt(s.tick * TICK) };
}

/** What the full map shows of the match: every ship in range on the planet, the Storm's edge once it has formed and its
 *  next circle, her marker. */
export function planetMap(session: Session): PlanetMapModel {
  const s = session.state, i = session.watch, sh = s.ships[i];
  stormView(s, SV);
  const formed = SV.calm.r < Math.PI * R * 0.49;
  const ships: MapShip[] = [];
  for (let j = 0; j < SHIPS; j++) {
    if (j === i || s.ships[j].phase === PHASE.sunk) continue;
    if (!(seen(s, i, j) & (SEEN.visible | SEEN.map))) continue;
    const mark = shipMark(session, j);
    ships.push({ pos: { ...s.ships[j].pos }, emblem: mark.emblem, colour: mark.colours[0] });
  }
  return {
    me: { ...sh.pos }, ships,
    storm: formed ? { at: { ...SV.calm.at }, r: SV.calm.r } : null,
    next: { at: { ...SV.next.at }, r: SV.next.r },
    marker: session.mark ? { ...session.mark } : null,
  };
}

/** What a take would pick up: the nearest loot in reach. */
function pickupOf(s: MatchState, sh: Ship): string | null {
  let best: string | null = null, bd: number = LOOT.reach;
  for (const l of s.loot) {
    const d = apart(sh.pos, l.at);
    if (d < bd) { bd = d; best = itemKey(l.item.kind); }
  }
  return best;
}

/** Metres into the Storm at which its tint on the screen is deepest. */
const STORM_DEEP = 400;

/** How far the Storm is through its wait or its closing, 0–1. */
function stormProgress(v: StormView): number {
  const p = STORM.phases[Math.min(v.phase, STORM.phases.length - 1)], whole = v.closing ? p.shrink : p.wait;
  return Math.max(0, Math.min(1, 1 - v.left / whole));
}

const DECK = newDeck();
/** How steady the deck is for a shot, or null in water too slight to roll her (seaway.ts). */
function steadyOf(s: MatchState, i: number): number | null {
  const d = deckAt(s, i, DECK);
  return d.sea < 0.2 ? null : 1 - d.unsteady;
}

/** The heavy gun winding up on ship i soonest to fire, as the HUD warns of it: only one it can see. */
function aimedOf(s: MatchState, i: number, aim: V3): HudModel['aimed'] {
  const me = s.ships[i];
  let best: HudModel['aimed'] = null, left = Infinity;
  for (let j = 0; j < s.ships.length; j++) {
    const o = s.ships[j];
    if (j === i || o.windup <= 0 || o.windup >= left || o.phase !== PHASE.sea || !(seen(s, i, j) & SEEN.visible)) continue;
    const w = WEAPONS[o.slots[o.sel].kind];
    if (!w || aimedAt(s, j, w) !== i) continue;
    left = o.windup;
    tangentToward(me.pos, aim, AIM_T);
    tangentToward(me.pos, o.pos, TO_T);
    best = { bearing: angleTo(AIM_T, TO_T, me.pos), wound: 1 - o.windup / w.windup };
  }
  return best;
}
const AIM_T = v3(), TO_T = v3();

export function hudModel(session: Session): HudModel {
  const s = session.state, sh = s.ships[session.watch];
  const id = ACTIVES[sh.active] as ActiveId, cool = ability(id).cooldown;
  stormView(s, SV);
  const use = sh.use >= 0 ? sh.slots[sh.use] : null, r = regionAt(sh.pos);
  return {
    shield: Math.round(sh.shield), shieldMax: 100, hull: Math.round(sh.hull), hullMax: 100,
    parts: {
      sail: sh.torn, mast: sh.fallen > 0 ? 1 : sh.mast, down: Math.max(0, sh.fallen), jury: sh.jury, rudder: sh.rudder,
      flood: sh.flood, sinks: PARTS.sinks, burning: sh.burn > 0, ice: sh.ice,
    },
    slots: sh.slots.map((_, k) => slotOf(sh, k)),
    selected: sh.sel,
    ability: { id, ready: Math.max(0, Math.min(1, 1 - sh.cooldown / cool)), seconds: Math.ceil(Math.max(0, sh.cooldown)) },
    gust: { charges: sh.gusts, max: GUST.charges, recharge: sh.gusts >= GUST.charges ? 1 : Math.min(1, sh.gustT / GUST.recharge) },
    storm: {
      seconds: Math.ceil(SV.left), shrinking: SV.closing, grace: s.tick < s.storm.start, progress: stormProgress(SV),
      outside: inStorm(s, sh.pos), depth: Math.max(0, Math.min(1, -toEdge(s, sh.pos) / STORM_DEEP)),
    },
    ships: afloat(s),
    throttle: session.watch === PLAYER ? session.throttle : 1,
    steady: steadyOf(s, session.watch),
    aimed: aimedOf(s, session.watch, session.aim),
    using: use ? { progress: Math.max(0, Math.min(1, 1 - sh.useT / (USES[use.kind]?.time ?? 1))) } : null,
    regionId: REGIONS[r]?.id ?? null,
    colour: shipMark(session, session.watch).colours[0],
    tide: seaLevelAt(s.tick * TICK),
    pickup: pickupOf(s, sh),
    gull: { coins: sh.coins, best: PARCELS.reduce((b, _p, t) => (sh.coins >= priceOf(sh, t) ? t : b), -1), home: sh.gull.state === GULL.home },
    map: mapOf(session, session.watch),
  };
}

/** The chart of the water in `cells`, centred on it, or null if there is none. */
export function heldChart(cells: readonly number[], ink: string): HeldChart | null {
  if (cells.length === 0) return null;
  const c = v3(), d = v3();
  for (const k of cells) { cellDir(TERRITORY, k, d); c.x += d.x; c.y += d.y; c.z += d.z; }
  const l = Math.hypot(c.x, c.y, c.z) || 1;
  c.x /= l; c.y /= l; c.z /= l;
  const { e, n } = frame(c), pts = new Float32Array(cells.length * 2);
  let far = 40;
  cells.forEach((k, i) => {
    cellDir(TERRITORY, k, d);
    const x = R * (d.x * e.x + d.y * e.y + d.z * e.z), y = R * (d.x * n.x + d.y * n.y + d.z * n.z);
    pts[i * 2] = x; pts[i * 2 + 1] = y;
    far = Math.max(far, Math.hypot(x, y));
  });
  const scale = 1 / (far * 1.12);
  for (let i = 0; i < pts.length; i++) pts[i] *= scale;
  return { pts, half: 2.2 * scale, ink };
}

/** The results, from what the career's applyMatch changed and the match's own numbers. */
export function resultsModel(c: MatchChanges, after: Career, report: { damage: number; survived: number }, held: HeldChart | null): ResultsModel {
  return {
    held, place: c.place, kills: c.kills, damage: report.damage, survived: report.survived,
    level: { before: levelFrom(c.level.before), after: levelFrom(levelOf(after.xp)) },
    rank: { before: rankFrom(c.rank.before), after: rankFrom(c.rank.after) },
  };
}

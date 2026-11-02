// The interface's view models from the match: what the Gale, the HUD, death, spectating, victory and the results show,
// read from the session and the career's changes. Like models.ts, the screens never see the simulation itself.
import {
  ABILITY_LEVEL, CAPTAINS, captainIndex, cosmetic, levelOf, temperament, wornLook, type Career, type Look, type MatchChanges, type Rank,
} from '../career/index.ts';
import { ability, type AbilityId, type ActiveId } from '../sim/abilities.ts';
import { canCall, priceOf } from '../sim/economy.ts';
import {
  ACTIVES, PASSIVES, PHASE, PLAYER, SHIPS, STORM, TICK, USES, WEAPONS, WEATHER_NAMES, inStorm, isNight, newSky, newStormView, seen, SEEN, skyAt,
  stormView, sunDir, type MatchState, type Ship,
} from '../sim/match.ts';
import { seaLevelAt } from '../sim/environment.ts';
import { eventMark, eventTone } from '../sim/regionEvents.ts';
import { EVENT_STATE } from '../sim/state.ts';
import { GALE, GUST, LOOT, PARCELS } from '../sim/tables.ts';
import { GALE_SPEED } from '../sim/opening.ts';
import { R, advance, along, apart, tangentAt } from '../sim/sphere.ts';
import { CENTRES, REGIONS, regionAt } from '../sim/world/index.ts';
import { PI, v3, type V3 } from '../sim/math.ts';
import {
  rarityOf as unlockRarity, type AbilityView, type ConsumableId, type CosmeticView, type DeathModel, type EventView, type GaleModel, type HudModel,
  type Killer, type LevelView, type MapView, type Mark, type RankView, type ResultsModel, type Slot, type SpectateModel, type VictoryModel,
  type WeaponId, type WeatherName,
} from '../ui/model.ts';
import type { Rarity } from '../ui/parts/tokens.ts';
import { causeName, consumableOf, itemKey, weaponOf } from './moments.ts';
import type { Session } from './session.ts';

const DEG = 180 / Math.PI;
const SV = newStormView();
const SUN = v3();
const MAP_RANGE = 320;
const SKY = newSky();
/** How deep into a weather system before the HUD names it, as the tips do. */
const WEATHER_DEEP = 0.4;

const rarityOf = (n: number): Rarity => Math.max(0, Math.min(4, Math.round(n))) as Rarity;
const colourOf = (id: string, fallback: string): string => cosmetic(id)?.colour ?? fallback;

/** A look's sail sigil and colours, for the emblem discs. */
export const markOf = (look: Look): Mark => ({ emblem: look.emblem, colours: [colourOf(look.sailColour, '#f4ead6'), colourOf(look.hullPaint, '#5a3423')] });

export const levelFrom = (l: { level: number; into: number; need: number }): LevelView => ({ level: l.level, into: l.into, need: l.need });

export const rankFrom = (r: Rank): RankView => ({
  index: r.step.index, tier: r.step.tier, step: r.step.step, name: r.step.name, progress: r.progress, floored: r.floored,
});

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
    return { kind: 'weapon', weapon: weaponOf(it.kind) as WeaponId, rarity: rarityOf(it.rarity), ammo: it.n, mag: w.mag, reload };
  }
  return { kind: 'consumable', item: consumableOf(it.kind) as ConsumableId, count: it.n };
}

const afloat = (s: MatchState): number => s.ships.reduce((n, sh) => n + (sh.phase !== PHASE.sunk ? 1 : 0), 0);

/** The minimap round ship i. */
function mapOf(s: MatchState, i: number): MapView {
  const sh = s.ships[i], p = sh.pos, { e, n } = frame(p), ll = latLon(p);
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
    ships.push({ ...rel(s.ships[j].pos), ...(v & SEEN.visible ? {} : { spotted: true }) });
  }
  const marks: MapView['marks'] = [];
  for (const l of s.loot) if (apart(p, l.at) < MAP_RANGE) marks.push({ ...rel(l.at), kind: 'loot' });
  if (sh.gull.state !== 0) marks.push({ ...rel(sh.gull.at), kind: 'gull' });
  const events: MapView['events'] = [];
  for (let ri = 0; ri < s.regionEvents.length; ri++) {
    const st = s.regionEvents[ri].state;
    if (st !== EVENT_STATE.warning && st !== EVENT_STATE.running) continue;
    const r = eventMark(s, ri, MARK);
    if (r > 0 && apart(p, MARK) < MAP_RANGE * 1.5 + r) events.push({ ...rel(MARK), r, tone: eventTone(ri), warning: st === EVENT_STATE.warning });
  }
  return {
    lat: ll.lat, lon: ll.lon, heading: Math.atan2(dot(sh.head, e), dot(sh.head, n)), range: MAP_RANGE,
    storm: formed ? circle(SV.calm) : null, next: formed ? circle(SV.next) : null, ships, marks, events,
  };
}

const MARK = v3(), NEAR_P = v3(), NEAR_T = v3();
/** How far past a region's border its event's banner still shows, m. */
const EVENT_NEAR = 240;

/** Whether region ri's water lies within EVENT_NEAR metres of p: rings of points round p, 16 bearings each. */
function nearRegion(p: V3, ri: number): boolean {
  for (let d = EVENT_NEAR / 3; d <= EVENT_NEAR; d += EVENT_NEAR / 3) {
    for (let k = 0; k < 16; k++) if (regionAt(along(p, tangentAt(p, (k * PI) / 8, NEAR_T), d, NEAR_P)) === ri) return true;
  }
  return false;
}

function eventView(s: MatchState, ri: number): EventView {
  const ev = s.regionEvents[ri], info = REGIONS[ri], warning = ev.state === EVENT_STATE.warning;
  const left = warning ? ev.at - s.tick * TICK : ev.run - ev.t;
  return { region: info.id, name: info.event, tip: info.eventTip, tone: eventTone(ri), warning, seconds: Math.max(0, Math.ceil(left)) };
}

/**
 * The region events the banners show at p, warned or running in the water there or near it: its own region's first,
 * then those running before those warned, so a warning never hides an event already running beside you. At most two.
 */
export function eventsOf(s: MatchState, p: V3): { event: EventView | null; also: EventView | null } {
  const here = regionAt(p), shown: number[] = [];
  const live = (ri: number) => s.regionEvents[ri].state === EVENT_STATE.warning || s.regionEvents[ri].state === EVENT_STATE.running;
  if (here >= 0 && here < s.regionEvents.length && live(here)) shown.push(here);
  for (const st of [EVENT_STATE.running, EVENT_STATE.warning]) {
    for (let ri = 0; ri < s.regionEvents.length && shown.length < 2; ri++) {
      if (ri !== here && s.regionEvents[ri].state === st && nearRegion(p, ri)) shown.push(ri);
    }
  }
  return { event: shown.length ? eventView(s, shown[0]) : null, also: shown.length > 1 ? eventView(s, shown[1]) : null };
}

/** The region event the first banner shows at p. */
export const eventOf = (s: MatchState, p: V3): EventView | null => eventsOf(s, p).event;

/** What a take would pick up: the nearest loot in reach. */
function pickupOf(s: MatchState, sh: Ship): string | null {
  let best: string | null = null, bd: number = LOOT.reach;
  for (const l of s.loot) {
    const d = apart(sh.pos, l.at);
    if (d < bd) { bd = d; best = itemKey(l.item.kind); }
  }
  return best;
}

/** The weather the HUD names at p: the deepest kind you are well inside, or null. */
function weatherAt(s: MatchState, p: V3): WeatherName | null {
  skyAt(s, p, SKY);
  let best: WeatherName | null = null;
  for (const w of WEATHER_NAMES) if (SKY[w] > WEATHER_DEEP && (!best || SKY[w] > SKY[best])) best = w;
  return best;
}

export function hudModel(session: Session): HudModel {
  const s = session.state, sh = s.ships[session.watch];
  const id = ACTIVES[sh.active] as ActiveId, cool = ability(id).cooldown;
  stormView(s, SV);
  const use = sh.use >= 0 ? sh.slots[sh.use] : null, r = regionAt(sh.pos), now = s.tick * TICK, level = seaLevelAt(now);
  return {
    shield: Math.round(sh.shield), shieldMax: 100, hull: Math.round(sh.hull), hullMax: 100,
    slots: sh.slots.map((_, k) => slotOf(sh, k)),
    selected: sh.sel,
    ability: { id, ready: Math.max(0, Math.min(1, 1 - sh.cooldown / cool)), seconds: Math.ceil(Math.max(0, sh.cooldown)) },
    passive: PASSIVES[sh.passive],
    gust: { charges: sh.gusts, max: GUST.charges, recharge: sh.gusts >= GUST.charges ? 1 : Math.min(1, sh.gustT / GUST.recharge) },
    storm: { phase: SV.phase, phases: STORM.phases.length, seconds: Math.ceil(SV.left), shrinking: SV.closing, outside: inStorm(s, sh.pos) },
    ships: afloat(s),
    kills: sh.kills,
    coins: Math.floor(sh.coins),
    gull: {
      price: priceOf(sh, 0), ready: canCall(sh, 0),
      parcels: PARCELS.map((p, t) => ({ name: p.name, price: priceOf(sh, t), ready: canCall(sh, t) })),
    },
    throttle: session.watch === PLAYER ? session.throttle : 1,
    using: use ? { item: consumableOf(use.kind) as ConsumableId, progress: Math.max(0, Math.min(1, 1 - sh.useT / (USES[use.kind]?.time ?? 1))) } : null,
    region: REGIONS[r]?.name ?? 'the open sea',
    perk: sh.perks & (1 << r) ? REGIONS[r].perkName : null,
    perks: REGIONS.filter((_, k) => sh.perks & (1 << k)).map((x) => x.perk),
    weather: weatherAt(s, sh.pos),
    tide: { level, rising: seaLevelAt(now + 1) > level },
    night: isNight(s, sh.pos),
    pickup: pickupOf(s, sh),
    ...eventsOf(s, sh.pos),
    map: mapOf(s, session.watch),
  };
}

/** How far a ship can glide from the Gale before it reaches the sea, m. */
const GLIDE_REACH = (GALE.height / GALE.fall) * GALE.glide;
const ROAD = 24, ROAD_P = v3(), ROAD_H = v3();

export function galeModel(session: Session): GaleModel {
  const s = session.state, g = s.gale, sun = latLon(sunDir(s, SUN));
  const heading = new Array<number>(REGIONS.length).fill(0);
  for (let i = 1; i < SHIPS; i++) {
    const c = s.ships[i].captain;
    if (c.on && c.region >= 0 && c.region < heading.length) heading[c.region]++;
  }
  // the road ahead, and every region with its centre in glide reach of some point on it
  const path: GaleModel['path'] = [], open = new Array<boolean>(REGIONS.length).fill(false);
  for (let k = 0; k <= ROAD; k++) {
    const t = g.t + ((GALE.time - g.t) * k) / ROAD;
    advance(g.from, g.dir, GALE_SPEED * t, ROAD_P, ROAD_H);
    path.push(latLon(ROAD_P));
    for (let r = 0; r < CENTRES.length; r++) if (!open[r] && apart(ROAD_P, CENTRES[r]) < GLIDE_REACH) open[r] = true;
  }
  return {
    seconds: Math.max(0, Math.ceil(GALE.time - g.t)), total: GALE.time, sun,
    at: latLon(s.ships[PLAYER].pos), path,
    regions: REGIONS.map((_, index) => ({ index, open: open[index], heading: heading[index] })),
    pick: session.target, below: regionAt(s.ships[PLAYER].pos), ships: SHIPS,
  };
}

/** A captain as the death and spectate screens name it. */
function killerOf(session: Session, i: number, weapon: number): Killer {
  const e = session.plan.fleet[i - 1], cap = CAPTAINS[captainIndex(e.captain)];
  return {
    ...markOf(cap?.look ?? e.look), name: session.names[i], rank: e.rank, temperament: cap ? temperament(cap.temperament).name : '',
    weapon: weapon >= 1 && weapon <= 6 ? (weaponOf(weapon) as WeaponId) : null, grudge: session.state.ships[i].captain.grudge,
  };
}

export function deathModel(session: Session): DeathModel {
  const s = session.state, me = s.ships[PLAYER], t = session.tally.ships[PLAYER];
  const by = me.by >= 1 && me.by < SHIPS ? me.by : -1, cause = causeName(me.cause);
  return {
    place: me.place || afloat(s) + 1, ships: SHIPS, killer: by > 0 ? killerOf(session, by, me.cause) : null,
    cause: by > 0 ? 'ship' : cause === 'storm' ? 'storm' : 'sea', how: cause,
    kills: me.kills, damage: Math.round(t.damage), survived: Math.round(t.sunkAt >= 0 ? t.sunkAt : session.seconds),
  };
}

export function spectateModel(session: Session, look: Look): SpectateModel {
  const s = session.state, i = session.watch, sh = s.ships[i];
  const e = session.plan.fleet[i - 1], mark = i === PLAYER ? markOf(look) : markOf(CAPTAINS[captainIndex(e.captain)]?.look ?? e.look);
  const rank = i === PLAYER ? session.plan.player.rank : e.rank;
  return { target: { ...mark, name: session.names[i], rank, kills: sh.kills, shield: Math.round(sh.shield), hull: Math.round(sh.hull) }, ships: afloat(s) };
}

export function victoryModel(session: Session): VictoryModel {
  const me = session.me, t = session.tally.ships[PLAYER];
  return { kills: me.kills, damage: Math.round(t.damage), survived: Math.round(session.seconds), ships: SHIPS };
}

function abilityView(id: AbilityId): AbilityView {
  const a = ability(id);
  return { id, kind: a.kind, name: a.name, text: a.text, cooldown: a.cooldown, level: ABILITY_LEVEL[id], unlocked: true, isNew: true };
}

function cosmeticView(id: string): CosmeticView | null {
  const c = cosmetic(id);
  if (!c) return null;
  return { id, kind: c.kind, name: c.name, hint: c.hint, ...(c.colour ? { colour: c.colour } : {}), rarity: unlockRarity(c.unlock), unlock: c.unlock, unlocked: true, isNew: true };
}

/** The results, from what the career's applyMatch changed and the match's own numbers. */
export function resultsModel(c: MatchChanges, after: Career, report: { damage: number; survived: number }): ResultsModel {
  return {
    place: c.place, ships: SHIPS, kills: c.kills, damage: report.damage, survived: report.survived,
    xp: { parts: c.xp.parts.map((p) => ({ ...p })), total: c.xp.total },
    level: { before: levelFrom(c.level.before), after: levelFrom(levelOf(after.xp)) },
    rank: { before: rankFrom(c.rank.before), after: rankFrom(c.rank.after), change: c.rank.change, newTier: c.rank.newTier },
    unlocked: {
      abilities: c.unlocked.abilities.map(abilityView),
      cosmetics: c.unlocked.cosmetics.map(cosmeticView).filter((v): v is CosmeticView => v !== null),
    },
    newRegions: c.newRegions.map((index) => ({ index, name: REGIONS[index]?.name ?? '' })),
    rivals: c.rivals.map((r) => {
      const cap = CAPTAINS[captainIndex(r.captain)];
      return { ...markOf(cap?.look ?? wornLook(after)), id: r.captain, name: cap?.name ?? r.captain, what: r.what };
    }),
  };
}

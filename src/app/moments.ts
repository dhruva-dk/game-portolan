// The simulation's events as the app's moments, and the moments the actors animate. Each tick the session reads
// state.events through momentsOf; the juice, sound, tally and HUD read those moments, and the actors get theirs from
// actorEvent. Positions in moments are metres from the planet's centre.
import type { ActorEvent, LootKind, Rarity } from '../render/actors/index.ts';
import { ACTIVES, CAUSE, EVENT, FLAG, ITEM, type Happening, type MatchState, type Ship } from '../sim/match.ts';
import { R } from '../sim/sphere.ts';
import { REGIONS } from '../sim/world/index.ts';
import type { V3 } from '../sim/math.ts';
import { WEAPON_CLASSES, type ConsumableKind, type Moment, type WeaponClass } from './events.ts';

const isWeapon = (kind: number): boolean => kind >= ITEM.cannon && kind <= ITEM.broadside;

/** An item kind (1–6) as its weapon class. */
export const weaponOf = (kind: number): WeaponClass => WEAPON_CLASSES[Math.max(0, Math.min(5, kind - ITEM.cannon))];

const CONSUMABLE: Record<number, ConsumableKind> = {
  [ITEM.smallShield]: 'smallShield', [ITEM.bigShield]: 'bigShield', [ITEM.repairKit]: 'repairKit', [ITEM.fullRepair]: 'fullRepair',
};
export const consumableOf = (kind: number): ConsumableKind => CONSUMABLE[kind] ?? 'repairKit';

/** An item kind as the actors' loot kind. */
export const lootKind = (kind: number): LootKind => (isWeapon(kind) ? weaponOf(kind) : consumableOf(kind));

/** An item kind's key, such as 'cannon' or 'bigShield'. */
export const itemKey = (kind: number): string => (isWeapon(kind) ? weaponOf(kind) : CONSUMABLE[kind] ?? 'none');

const CAUSES: Record<number, string> = {
  [CAUSE.storm]: 'storm', [CAUSE.ram]: 'ram', [CAUSE.ink]: 'ink', [CAUSE.burn]: 'burn', [CAUSE.ash]: 'ash',
  [CAUSE.lightning]: 'lightning', [CAUSE.mine]: 'mine', [CAUSE.wave]: 'wave', [CAUSE.whale]: 'whale',
};
/** What sank or hurt a ship, by name: a weapon class or one of the causes. */
export const causeName = (cause: number): string => (isWeapon(cause) ? weaponOf(cause) : CAUSES[cause] ?? 'sea');

function hurtBy(kind: number): Extract<Moment, { k: 'hit' }>['weapon'] {
  if (isWeapon(kind)) return weaponOf(kind);
  if (kind === CAUSE.storm) return 'storm';
  if (kind === CAUSE.ram) return 'ram';
  if (kind === CAUSE.burn) return 'fire';
  return 'other';
}

const metres = (at: V3, y = 0): V3 => ({ x: at.x * (R + y), y: at.y * (R + y), z: at.z * (R + y) });

/** The way a ship's guns point: from its position toward its aim, along the ground. */
export function gunDir(s: Ship): V3 {
  const p = s.pos;
  let x = s.aim.x - p.x, y = s.aim.y - p.y, z = s.aim.z - p.z;
  const d = x * p.x + y * p.y + z * p.z;
  x -= p.x * d; y -= p.y * d; z -= p.z * d;
  const l = Math.hypot(x, y, z);
  return l > 1e-6 ? { x: x / l, y: y / l, z: z / l } : { ...s.head };
}

/** One happening as a moment, or null for those nothing outside the simulation reacts to. */
export function momentOf(state: MatchState, e: Happening): Moment | null {
  const pos = metres(e.at, e.y), ship = e.ship;
  switch (e.kind) {
    case EVENT.fire: return { k: 'fire', ship, weapon: weaponOf(e.item), rarity: e.amount, pos, dir: gunDir(state.ships[ship]) };
    case EVENT.impact:
      return { k: 'impact', pos, on: e.flag & FLAG.ship ? 'ship' : e.flag & FLAG.land ? 'land' : 'water', weapon: weaponOf(e.item), ship };
    case EVENT.hit:
      if (e.flag & FLAG.steady && e.item === CAUSE.storm) return { k: 'stormHurt', ship };
      return {
        k: 'hit', ship, by: e.by, shield: e.shield, hull: e.hull, crit: (e.flag & FLAG.crit) !== 0, pos, weapon: hurtBy(e.item),
        ...(e.flag & FLAG.steady ? { steady: true } : {}),
      };
    case EVENT.shieldBreak: return { k: 'shieldBreak', ship, by: e.by, pos };
    case EVENT.sink: return { k: 'sink', ship, by: e.by, cause: causeName(e.item), pos };
    case EVENT.pickup: return { k: 'pickup', ship, item: itemKey(e.item), rarity: e.y, pos: metres(e.at) };
    case EVENT.drop: return { k: 'drop', ship, pos: metres(e.at) };
    case EVENT.gust: return { k: 'gust', ship, pos };
    case EVENT.reload: return e.flag & FLAG.done ? null : { k: 'reload', ship, weapon: weaponOf(e.item) };
    case EVENT.empty: return { k: 'empty', ship };
    case EVENT.useStart: return { k: 'useStart', ship, item: consumableOf(e.item), seconds: e.amount };
    case EVENT.useDone: return { k: 'useDone', ship, item: consumableOf(e.item) };
    case EVENT.useCancel: return { k: 'useCancel', ship, item: consumableOf(e.item) };
    case EVENT.ability: return { k: 'ability', ship, id: ACTIVES[e.item] ?? 'ram', pos };
    case EVENT.stormShrink: return { k: 'stormPhase', phase: e.item, seconds: e.amount };
    case EVENT.galeDive: return { k: 'galeDive', ship, region: e.item, pos };
    case EVENT.landing: return { k: 'landing', ship, pos };
    case EVENT.deliveryCalled: return { k: 'deliveryCalled', ship, pos };
    case EVENT.deliveryArrived: return { k: 'deliveryArrived', ship, pos };
    case EVENT.coins: return { k: 'coins', ship, amount: e.amount, pos };
    case EVENT.whaleBreach: return { k: 'whaleBreach', pos };
    case EVENT.whaleSurface: return { k: 'whaleSurface', pos };
    case EVENT.whaleDive: return { k: 'whaleDive', pos };
    case EVENT.perkGained: case EVENT.perkLost:
      return { k: 'perk', ship, perk: REGIONS[e.item]?.perk ?? '', on: e.kind === EVENT.perkGained };
    case EVENT.lightningWarn: return { k: 'lightning', pos, warning: true };
    case EVENT.lightning: return { k: 'lightning', pos, warning: false };
    case EVENT.scrape: return { k: 'aground', ship, pos };
    case EVENT.ram: return { k: 'ram', ship, by: e.by, pos };
    case EVENT.win: return { k: 'win', ship };
    default: return null;
  }
}

/** This tick's happenings as moments, appended to `out`. */
export function momentsOf(state: MatchState, out: Moment[]): Moment[] {
  for (const e of state.events) {
    const m = momentOf(state, e);
    if (m) out.push(m);
    // a shield item done: the aura shimmers back
    if (e.kind === EVENT.useDone && e.shield > 0) out.push({ k: 'shieldUp', ship: e.ship, pos: metres(state.ships[e.ship].pos) });
  }
  return out;
}

const rarity = (n: number): Rarity => Math.max(0, Math.min(4, Math.round(n))) as Rarity;

/** What a moment shows on the actors, if anything. `whaleHead` turns the breach the way the whale swims. */
export function actorEvent(m: Moment, whaleHead: V3): ActorEvent | null {
  switch (m.k) {
    case 'fire': return { t: 'fire', ship: m.ship, weapon: m.weapon, rarity: rarity(m.rarity) };
    case 'hit':
      if (m.steady) return null;
      if (m.weapon === 'ram') return { t: 'ram', at: m.pos };
      if (m.weapon === 'storm' || m.weapon === 'fire' || m.weapon === 'other') return null;
      return { t: 'hit', ship: m.ship, by: m.by, weapon: m.weapon, at: m.pos, shield: m.shield, hull: m.hull, crit: m.crit };
    case 'impact': return m.on === 'ship' ? null : { t: 'impact', weapon: m.weapon, at: m.pos, on: m.on };
    case 'shieldBreak': return { t: 'shieldBreak', ship: m.ship, at: m.pos };
    case 'shieldUp': return { t: 'shieldRefill', ship: m.ship };
    case 'sink': return { t: 'sink', ship: m.ship };
    case 'gust': return { t: 'gust', ship: m.ship };
    case 'pickup': return { t: 'pickup', ship: m.ship, rarity: rarity(m.rarity) };
    case 'deliveryArrived': return { t: 'delivery', ship: m.ship };
    case 'ram': return { t: 'ram', at: m.pos };
    case 'aground': return { t: 'scrape', at: m.pos };
    case 'whaleBreach': return { t: 'breach', at: m.pos, head: whaleHead };
    default: return null;
  }
}

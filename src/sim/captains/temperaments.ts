// Temperaments (PROMPT.md, The league: "Temperament decides how it sails") and every captain's own signature. A
// temperament is a Style over the skills every captain shares (brain.ts): the size and lean of its loops, its appetite
// for fights, raids and finds, the moment it runs, its daring with the vortex and the Great Current, and the skills
// only some temperaments put first (stalk, edge, guard, commit, bolt, gold):
//   hunters stalk open trails, wounded ships and ships a gull gives away, and patrol beyond the player's loops;
//   expanders draw broad, patient loops and leave them for nothing much; raiders break trails for the purse and run
//   for home with it; turtles hold rich home waters and turn to face an intruder before they strike; opportunists
//   hang off a fight between others and pounce on whoever it weakens; gamblers draw enormous loops, swing their bows
//   round to them visibly before setting out, and chase gold-leaf chests, through the vortex if need be.
// Over its temperament each of the league's thirty captains sails with a signature drawn from its identity
// (Ship.pigment, its CAPTAINS index): how far its loops reach and how long and narrow they are, which way and how far
// they wheel round its home from loop to loop, how far it keeps from a fight, the moment it runs, the margin it keeps
// from the storm and its daring — the same in every match it sails, so a player comes to know it.
import { hash32 } from '../math.ts';
import { KNOW, type Ship } from '../state.ts';
import { FITTING } from '../tables.ts';

type Captain = Ship['captain'];

/** How a captain sails: the parameters of the shared skills, and the temperaments' own. */
export interface Style {
  /** u its loops reach beyond its home's rim, and how far a lobe they stretch to (0 round … 1 long and narrow). */
  loop: number;
  stretch: number;
  /** rad its next loop's bearing wheels round its home from the last (its sign the sense): the rosette its loops draw. */
  wheel: number;
  /** 0 … 1: how readily it fights a rival in sight, and breaks a rival's open trail. */
  fight: number;
  raid: number;
  /** Share of its full hull it runs at with a rival near. */
  run: number;
  /** u it keeps inside the storm's coming calm. */
  margin: number;
  /** 0 … 1: its appetite for chests and finds (below 1 it keeps to a loop it sails for lesser ones), and its daring with hazards (from 0.7 it rides the vortex) and the Great Current (riding on for richer waters). */
  loot: number;
  bold: number;
  /** Share of its guns' range it lies off a rival at. */
  standoff: number;
  /** 0 … 1: how hard it presses a wounded ship, closing on it from beyond its guns' reach; from 0.8 it reads rivals' gulls for laden ships and patrols beyond the player's loops (hunters). */
  stalk: number;
  /** × its guns' range it hangs off a fight between others, waiting for one to weaken (opportunists); 0, it never waits. */
  edge: number;
  /** 0 … 1: how fiercely it turns on a rival in its own waters, facing it before it strikes (turtles). */
  guard: number;
  /** s it swings its bow round to a loop it has drawn before it sets out on it, committed (gamblers); 0, it sets out at once. */
  commit: number;
  /** Whether it runs for home with a purse worth the raid as soon as it has one (raiders). */
  bolt: boolean;
  /** × a gold-leaf chest's appeal, over its tier's (gamblers). */
  gold: number;
}

const BASE = { wheel: 2.4, stalk: 0, edge: 0, guard: 0, commit: 0, bolt: false, gold: 1 };

/** The first voyage's captains (Mind.gentle): slow to fight and slow to chase, never raiding, running early, drawing small loops. */
export const GENTLE: Style = { ...BASE, loop: 15, stretch: 0.2, fight: 0.15, raid: 0, run: 0.6, margin: 18, loot: 0.7, bold: 0, standoff: 1 };

/** The temperaments' Styles, by career/league.ts TEMPERAMENT: hunter, expander, raider, turtle, opportunist, gambler. */
export const STYLES: readonly Style[] = [
  { ...BASE, loop: 11, stretch: 0.75, fight: 0.6, raid: 0.65, run: 0.35, margin: 12, loot: 0.2, bold: 0.5, standoff: 0.6, stalk: 1 },
  { ...BASE, loop: 36, stretch: 0.1, wheel: 1.0, fight: 0.05, raid: 0, run: 0.85, margin: 16, loot: 0, bold: 0.15, standoff: 0.85 },
  { ...BASE, loop: 16, stretch: 0.45, fight: 0.25, raid: 2, run: 0.6, margin: 14, loot: 0.55, bold: 0.8, standoff: 0.95, bolt: true },
  { ...BASE, loop: 7, stretch: 0.1, wheel: 2.1, fight: 0.2, raid: 0.1, run: 0.3, margin: 18, loot: 0.45, bold: 0.05, standoff: 0.75, guard: 0.8 },
  { ...BASE, loop: 12, stretch: 0.35, fight: 0.1, raid: 0.25, run: 0.45, margin: 14, loot: 1, bold: 0.3, standoff: 1, stalk: 0.7, edge: 1.6 },
  { ...BASE, loop: 44, stretch: 0.6, wheel: 2.9, fight: 0.35, raid: 0.15, run: 0.2, margin: 8, loot: 0.8, bold: 0.9, standoff: 0.6, commit: 1.4, gold: 3 },
];

/** Captain identities a signature is drawn for (Ship.pigment: a captain's CAPTAINS index). */
const IDS = 64;
const unit = (x: number): number => Math.max(0, Math.min(1, x));

/** Temperament t as captain `id` sails it: its signature, drawn from its identity alone, over the temperament. */
function signature(t: Style, id: number): Style {
  const u = (k: number): number => (hash32(0x51a7e, id * 16 + k) & 0xffff) / 0xffff;
  return {
    ...t,
    loop: t.loop * (0.8 + 0.4 * u(0)),
    stretch: Math.min(0.9, unit(t.stretch + 0.24 * (u(1) - 0.5))),
    standoff: t.standoff * (0.85 + 0.3 * u(2)),
    edge: t.edge * (0.85 + 0.3 * u(2)),
    run: unit(t.run + 0.14 * (u(3) - 0.5)),
    wheel: t.wheel * (0.8 + 0.4 * u(4)) * (u(5) < 0.5 ? -1 : 1),
    margin: t.margin * (0.8 + 0.4 * u(6)),
    bold: unit(t.bold + 0.2 * (u(7) - 0.5)),
  };
}

/** Fields laid over each temperament's Style (restyle): none outside tests/tools/sweep.ts. */
const OVER: Partial<Style>[] = [];
const signAll = (): Style[] => STYLES.flatMap((t, k) => Array.from({ length: IDS }, (_, id) => signature({ ...t, ...OVER[k] }, id)));
let SIGNED: readonly Style[] = signAll();
/** Tuning hook (tests/tools/sweep.ts): temperament t sailed with the fields `o` laid over its Style, its captains' signatures redrawn. */
export function restyle(t: number, o: Partial<Style>): void {
  OVER[t] = o;
  SIGNED = signAll();
}

/** The Style a captain sails by: GENTLE on the first voyage, else its temperament under its own signature. */
export const styleOf = (ship: Ship): Style => (ship.captain.gentle ? GENTLE : SIGNED[ship.captain.temperament * IDS + (ship.pigment % IDS)]);

/** 0 … 1: how much it guards its trail, knowing the player breaks rivals' trails (Mind.raids, tenths a match: two a match is all). */
export const wary = (c: Captain): number => ((c.knows & KNOW.raids) !== 0 ? unit(c.raids / 20) : 0);

/** u its next loop reaches beyond its home's rim (`rim`): its Style's, beyond the player's loops for a hunter that knows them (Mind.loop), drawn in as it guards its trail. */
export function reachOf(c: Captain, style: Style, rim: number): number {
  const patrol = style.stalk >= 0.8 && (c.knows & KNOW.loop) !== 0 ? 1.15 * c.loop - rim : 0;
  return Math.max(style.loop, patrol) * (1 - 0.3 * wary(c));
}

/** Its standoff from the player, by the fittings the player favours (Mind.fittings, surest first): clear of a ram bow's or swivels' reach, inside long guns' or a mortar's. */
const WARY: Readonly<Record<number, number>> = {
  [FITTING.stemPost]: 0.15, [FITTING.ironRam]: 0.2, [FITTING.cutwater]: 0.1, [FITTING.swivelGuns]: 0.2, [FITTING.longGuns]: -0.2, [FITTING.mortar]: -0.15,
};

/** The share of its guns' range it lies off rival j at: its Style's, against the player shifted by the fittings it favours. */
export function standoff(c: Captain, style: Style, j: number): number {
  let s = style.standoff;
  if (j === 0) for (let k = 0; k < Math.min(2, c.fittings.length); k++) s += WARY[c.fittings[k]] ?? 0;
  return Math.max(0.35, Math.min(1.2, s));
}

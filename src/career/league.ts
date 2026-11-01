// LEGACY: the old game's career (commit 2025e68), kept only because tests/tools/tournament.ts and the sim tests
// that run it still import it. Portolan's career does not use this file: see src/career/index.ts.
// Whoever retires or rewrites the tournament may delete this file, and the other legacy career files with it.
import { startingFittings } from '../sim/items.ts';
import { hash32, rngFloat, rngFrom, type Rng } from '../sim/math.ts';
import { SHIPS, type Outfit } from '../sim/state.ts';
import { FORM, GULL, type FormName } from '../sim/tables.ts';
import { LEAGUE, clampPoints, rankDeltas, tierOf, unlockedForms, type Career, type GullLevels, type Outcome } from './state.ts';

export type Trait = keyof typeof GULL.levels;
export const TRAITS: readonly Trait[] = ['talons', 'wings', 'eye', 'beak', 'dive'];

export const TEMPERAMENT = { hunter: 0, expander: 1, raider: 2, turtle: 3, opportunist: 4, gambler: 5 } as const;
export type TemperamentName = keyof typeof TEMPERAMENT;

export interface Temperament {
  readonly name: TemperamentName;
  readonly luck: number;
  readonly poise: number;
  readonly sea: number;
  readonly hunt: number;
  readonly gull: readonly Trait[];
}

export const TEMPERAMENTS: readonly Temperament[] = [
  { name: 'hunter', luck: 100, poise: 0, sea: 0.8, hunt: 3, gull: ['dive', 'eye'] },
  { name: 'expander', luck: 90, poise: 0, sea: 1.6, hunt: 0.6, gull: ['eye', 'wings'] },
  { name: 'raider', luck: 110, poise: 0, sea: 0.6, hunt: 1.6, gull: ['beak', 'wings'] },
  { name: 'turtle', luck: 70, poise: 4, sea: 1.1, hunt: 1, gull: ['talons', 'beak'] },
  { name: 'opportunist', luck: 90, poise: 8, sea: 0.8, hunt: 1.4, gull: ['eye', 'beak'] },
  { name: 'gambler', luck: 160, poise: -6, sea: 1.4, hunt: 0.8, gull: ['talons', 'wings'] },
];

export interface Captain {
  readonly name: string;
  readonly meaning: string;
  readonly temperament: number;
  readonly form: number;
  readonly pigments: readonly [string, string];
  readonly emblem: string;
}

const captain = (name: string, meaning: string, t: TemperamentName, form: FormName, a: string, b: string, emblem: string): Captain => ({
  name, meaning, temperament: TEMPERAMENT[t], form: FORM[form], pigments: [a, b], emblem,
});

export const CAPTAINS: readonly Captain[] = [
  captain('Saetta', 'Arrow', 'hunter', 'caravel', 'vermilion', 'black', 'arrowhead'),
  captain('Lanza', 'Lance', 'hunter', 'carrack', 'ironGrey', 'gold', 'crossedLances'),
  captain('Astore', 'Goshawk', 'hunter', 'pinnace', 'umber', 'white', 'feather'),
  captain('Fiera', 'Wild beast', 'hunter', 'galleon', 'crimson', 'ochre', 'sunburst'),
  captain('Morsa', 'Vice', 'hunter', 'carrack', 'black', 'verdigris', 'ironKnot'),
  captain('Meridiana', 'Meridian', 'expander', 'galleon', 'ultramarine', 'gold', 'meridianArc'),
  captain('Marea', 'Tide', 'expander', 'carrack', 'teal', 'cream', 'waves'),
  captain('Aurora', 'Dawn', 'expander', 'caravel', 'roseMadder', 'gold', 'risingSun'),
  captain('Lontana', 'Far away', 'expander', 'galleon', 'indigo', 'silver', 'eightPointStar'),
  captain('Rosa dei Venti', 'Wind rose', 'expander', 'carrack', 'ochre', 'ultramarine', 'windRose'),
  captain('Gazza', 'Magpie', 'raider', 'pinnace', 'black', 'white', 'diamond'),
  captain('Volpe', 'Fox', 'raider', 'caravel', 'orange', 'umber', 'crescent'),
  captain('Rapina', 'Plunder', 'raider', 'pinnace', 'vermilion', 'white', 'key'),
  captain('Scheggia', 'Splinter', 'raider', 'caravel', 'ash', 'verdigris', 'lightningStroke'),
  captain('Ladra', 'Thief', 'raider', 'pinnace', 'purple', 'gold', 'coin'),
  captain('Testuggine', 'Tortoise', 'turtle', 'galleon', 'mossGreen', 'ochre', 'hexagon'),
  captain('Rocca', 'Fortress', 'turtle', 'galleon', 'stoneGrey', 'vermilion', 'tower'),
  captain('Ancora', 'Anchor', 'turtle', 'carrack', 'navy', 'white', 'anchor'),
  captain('Bastia', 'Bastion', 'turtle', 'carrack', 'brickRed', 'cream', 'battlement'),
  captain('Quieta', 'The still one', 'turtle', 'galleon', 'sage', 'silver', 'circle'),
  captain('Pazienza', 'Patience', 'opportunist', 'carrack', 'slate', 'ochre', 'hourglass'),
  captain('Ombra', 'Shadow', 'opportunist', 'caravel', 'charcoal', 'indigo', 'eclipse'),
  captain('Gufo', 'Owl', 'opportunist', 'caravel', 'umber', 'cream', 'twoRings'),
  captain('Avvoltoio', 'Vulture', 'opportunist', 'galleon', 'black', 'bone', 'brokenWheel'),
  captain('Sorniona', 'The sly one', 'opportunist', 'pinnace', 'verdigris', 'gold', 'spiral'),
  captain('Fortuna', 'Fortune', 'gambler', 'galleon', 'gold', 'vermilion', 'wheelOfFortune'),
  captain('Azzardo', 'Hazard', 'gambler', 'caravel', 'crimson', 'black', 'die'),
  captain('Tempesta', 'Storm', 'gambler', 'carrack', 'stormBlue', 'white', 'thunderbolt'),
  captain('Cometa', 'Comet', 'gambler', 'pinnace', 'gold', 'indigo', 'comet'),
  captain('Sirocchia', 'Sister', 'gambler', 'caravel', 'saffron', 'teal', 'flame'),
];

export const GUNNERY = [0.35, 0.45, 0.55, 0.62, 0.7, 0.78, 0.86, 0.94];

export const LEAGUE_PLAY = { heat: 7, edge: 0.05, fell: 0.6 };
const ROUND = 0x6c656167;

export const captainForm = (id: number, tier: number): number => Math.min(CAPTAINS[id].form, unlockedForms(tier).length - 1);

export function captainGull(tier: number, temperament: number): GullLevels {
  const base = Math.floor((tier - 1) / 2), first = TEMPERAMENTS[temperament].gull;
  const level = (t: Trait): number => Math.min(GULL.levels[t], base + (first.includes(t) ? 1 : 0));
  return { talons: level('talons'), wings: level('wings'), eye: level('eye'), beak: level('beak'), dive: level('dive') };
}

export function captainOutfit(career: Career, id: number): Outfit {
  const tier = tierOf(career.captains[id].points), { temperament } = CAPTAINS[id];
  return {
    form: captainForm(id, tier), pigment: id, pattern: 1 + temperament, fittings: startingFittings(tier, temperament),
    gull: captainGull(tier, temperament), gunnery: GUNNERY[tier - 1],
  };
}

export function draw(career: Career): number[] {
  const p = career.player.points, far = (i: number): number => Math.abs(career.captains[i].points - p);
  return Array.from({ length: LEAGUE }, (_, i) => i).sort((a, b) => far(a) - far(b) || a - b).slice(0, SHIPS - 1);
}

function heat(rng: Rng, career: Career, ids: readonly number[]): Outcome[] {
  const n = ids.length, hunt = (k: number): number => TEMPERAMENTS[CAPTAINS[ids[k]].temperament].hunt;
  let mean = 0;
  for (const id of ids) mean += career.captains[id].points / n;
  const score = ids.map((id) => {
    const t = TEMPERAMENTS[CAPTAINS[id].temperament];
    return (career.captains[id].points - mean) * LEAGUE_PLAY.edge + t.poise + (rngFloat(rng) - 0.5) * t.luck;
  });
  const order = ids.map((_, k) => k).sort((a, b) => score[b] - score[a] || ids[a] - ids[b]);
  const place: number[] = [];
  order.forEach((k, r) => {
    place[k] = r + 1;
  });
  const out = ids.map((id, k) => ({
    place: place[k], claimed: TEMPERAMENTS[CAPTAINS[id].temperament].sea * (0.5 + rngFloat(rng)) * (n + 1 - place[k]), sank: 0, by: -1,
  }));
  for (let r = 1; r < n; r++) {
    if (rngFloat(rng) >= LEAGUE_PLAY.fell) continue;
    let total = 0;
    for (let q = 0; q < r; q++) total += hunt(order[q]);
    let x = rngFloat(rng) * total, q = 0;
    while (q < r - 1 && x >= hunt(order[q])) x -= hunt(order[q++]);
    out[order[r]].by = order[q];
    out[order[q]].sank++;
  }
  return out;
}

export function leagueRound(next: Career, sailed: readonly number[]): void {
  const rng = rngFrom(hash32(hash32(next.seed, ROUND), next.match)), pts = (i: number): number => next.captains[i].points;
  const rest = Array.from({ length: LEAGUE }, (_, i) => i).filter((i) => !sailed.includes(i)).sort((a, b) => pts(b) - pts(a) || a - b);
  for (let h = 0; h + 1 < rest.length; h += LEAGUE_PLAY.heat) {
    const ids = rest.slice(h, h + LEAGUE_PLAY.heat), d = rankDeltas(heat(rng, next, ids));
    ids.forEach((id, k) => {
      next.captains[id].points = clampPoints(pts(id) + d[k]);
    });
  }
}

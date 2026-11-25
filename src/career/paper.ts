import { OFFSEASON_RACE, pick } from './draw.ts';
import { personOf } from './lookup.ts';
import { standings } from './rules/standing.ts';
import {
  YOURS,
  type CareerState,
  type NewsEvent,
  type NewsKind,
} from './state.ts';
import { PAPER } from './tuning.ts';
import { SPECIAL_WORDING, WORDINGS } from './wordings.ts';

export const SLOTS = [
  'team',
  'team2',
  'person',
  'place',
  'planet',
  'sponsor',
  'gun',
  'line',
  'n',
  'age',
] as const;
export type Slot = (typeof SLOTS)[number];

export type PaperValue = {
  text: string;
  team: number | null;
  person: number | null;
};
export type Values = Partial<Record<Slot, PaperValue>>;
export type Headline = { kind: NewsKind; variant: number; values: Values };
export type EditionKind = 'race' | 'season' | 'special';
export type Edition = { kind: EditionKind; items: Headline[] };

const PLACEHOLDER = /\{(\w+)\}/g;

const OPPONENTS = 'opponents';

const isSlot = (name: string): name is Slot =>
  SLOTS.some((slot) => slot === name);

export const slotsIn = (template: string): Slot[] =>
  [...template.matchAll(PLACEHOLDER)].map((match) => match[1]).filter(isSlot);

export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

const plain = (text: string): PaperValue => ({
  text,
  team: null,
  person: null,
});

const teamValue = (
  state: CareerState,
  team: number,
  links: boolean
): PaperValue => ({
  text: state.teams[team].name,
  team: links ? team : null,
  person: null,
});

function personValue(
  state: CareerState,
  name: string,
  id: number | undefined,
  links: boolean
): PaperValue {
  if (!links || id === undefined) return plain(name);
  const owned = state.teams.findIndex((team) => team.owner?.id === id);
  if (owned >= 0) return { text: name, team: owned, person: id };
  const team = personOf(state, id)?.contract?.team;
  return team === undefined ? plain(name) : { text: name, team, person: id };
}

export function valuesOf(
  state: CareerState,
  event: NewsEvent,
  links: boolean
): Values {
  const values: Values = {};
  if (event.team !== undefined)
    values.team = teamValue(state, event.team, links);
  if (event.team2 !== undefined)
    values.team2 = teamValue(state, event.team2, links);
  if (event.person !== undefined)
    values.person = personValue(state, event.person, event.personId, links);
  if (event.place !== undefined) values.place = plain(ordinal(event.place));
  if (event.planet !== undefined) values.planet = plain(event.planet);
  if (event.sponsor !== undefined) values.sponsor = plain(event.sponsor);
  if (event.gun !== undefined) values.gun = plain(event.gun.toLowerCase());
  if (event.line !== undefined) values.line = plain(event.line.toLowerCase());
  if (event.n !== undefined) values.n = plain(String(event.n));
  if (event.age !== undefined) values.age = plain(String(event.age));
  return values;
}

export const usableVariants = (kind: NewsKind, values: Values): number[] =>
  WORDINGS[kind].flatMap((template, variant) =>
    slotsIn(template).every((slot) => values[slot] !== undefined)
      ? [variant]
      : []
  );

const involvesYou = (event: NewsEvent): boolean =>
  event.team === YOURS || event.team2 === YOURS;

type Rank = { kind: NewsKind; yours?: boolean };

const IMPORTANCE: readonly Rank[] = [
  { kind: 'repossessed', yours: true },
  { kind: 'yourSeason' },
  { kind: 'title' },
  { kind: 'yourFinish' },
  { kind: 'poached', yours: true },
  { kind: 'raceWon' },
  { kind: 'streak' },
  { kind: 'repossessed', yours: false },
  { kind: 'poached', yours: false },
  { kind: 'retired' },
  { kind: 'hired' },
  { kind: 'unlocked' },
  { kind: 'lineLead' },
  { kind: 'sponsorSigned' },
  { kind: 'rookie' },
];

export const importance = (event: NewsEvent): number =>
  IMPORTANCE.findIndex(
    (rank) =>
      rank.kind === event.kind &&
      (rank.yours === undefined || rank.yours === involvesYou(event))
  );

function bestStanding(event: NewsEvent, table: readonly number[]): number {
  const teams = [event.team, event.team2].filter((team) => team !== undefined);
  return Math.min(Infinity, ...teams.map((team) => table[team]));
}

export function inImportance(state: CareerState): NewsEvent[] {
  const table = standings(state);
  return state.news
    .map((event, index) => ({ event, index }))
    .sort(
      (a, b) =>
        importance(a.event) - importance(b.event) ||
        Number(involvesYou(b.event)) - Number(involvesYou(a.event)) ||
        bestStanding(a.event, table) - bestStanding(b.event, table) ||
        a.index - b.index
    )
    .map(({ event }) => event);
}

const yourRepossession = (event: NewsEvent): boolean =>
  event.kind === 'repossessed' && event.team === YOURS;

export function editionKind(state: CareerState): EditionKind {
  if (state.news.some(yourRepossession)) return 'special';
  return state.phase === 'offseason' ? 'season' : 'race';
}

const SEASON_LEAVES_OUT: readonly NewsKind[] = ['yourFinish', 'raceWon'];

export function editionRace(state: CareerState): {
  season: number;
  race: number;
} {
  if (state.phase === 'offseason')
    return { season: state.season, race: OFFSEASON_RACE };
  const { lastRace } = state;
  return lastRace === null
    ? { season: state.season, race: state.race }
    : { season: lastRace.season, race: lastRace.race };
}

export function edition(state: CareerState): Edition {
  const kind = editionKind(state);
  if (kind === 'special')
    return {
      kind,
      items: [
        {
          kind: 'repossessed',
          variant: 0,
          values: { team: plain(state.teams[YOURS].name) },
        },
      ],
    };
  const links = state.seen.includes(OPPONENTS);
  const { season, race } = editionRace(state);
  const chosen = inImportance(state)
    .filter(
      (event) => kind !== 'season' || !SEASON_LEAVES_OUT.includes(event.kind)
    )
    .map((event) => {
      const values = valuesOf(state, event, links);
      return {
        kind: event.kind,
        values,
        usable: usableVariants(event.kind, values),
      };
    })
    .filter(({ usable }) => usable.length > 0)
    .slice(0, PAPER.headlines);
  return {
    kind,
    items: chosen.map(({ kind: news, values, usable }, index) => ({
      kind: news,
      variant: pick(usable, state.seed, 'wording', season, race, index),
      values,
    })),
  };
}

export const templateOf = (kind: EditionKind, headline: Headline): string =>
  kind === 'special'
    ? SPECIAL_WORDING
    : WORDINGS[headline.kind][headline.variant];

export const headlineText = (kind: EditionKind, headline: Headline): string =>
  templateOf(kind, headline).replace(PLACEHOLDER, (whole, name: string) =>
    isSlot(name) ? (headline.values[name]?.text ?? whole) : whole
  );

import { approachRefusal } from '../hiring/talks.ts';
import { isExact, knownStars, knownStats } from '../knowledge/people.ts';
import { reportPrice, reportRefusal } from '../knowledge/report.ts';
import { seatHolder } from '../lookup.ts';
import { standingOrder, standings } from '../rules/standing.ts';
import {
  DRIVER_STATS,
  LINES,
  ROLES,
  YOURS,
  type CareerState,
  type Line,
  type Owner,
  type Range,
  type Role,
} from '../state.ts';
import { SCOUTING } from '../tuning.ts';
import type { GunKind } from '../../sim/kinds.ts';
import type { Livery } from '../../world/livery.ts';
import { exactCard, uncleCard, type CardView } from './card.ts';
import {
  action,
  candidateCard,
  holderOf,
  rivalOf,
  type ActionView,
  type RivalView,
} from './deal.ts';

export type StandingRow = {
  team: number;
  place: number;
  moved: number;
  name: string;
  emblem: number;
  livery: Livery;
  points: number;
  strength: Range;
  yours: boolean;
};

export type OpponentsView = { rows: StandingRow[]; mean: number; open: number };

export type SheetSeat = 'owner' | Role;

export type SheetCard = {
  seat: SheetSeat;
  card: CardView | null;
  helm: boolean;
  exact: boolean;
  pinned: boolean;
  rival: RivalView | null;
  holder: number[] | null;
  report: ActionView | null;
  approach: ActionView | null;
};

export type LineRow = { line: Line; level: Range; yours: number };

export type ShipColumn = { gun: GunKind; lines: LineRow[] };

export type TeamSheetView = {
  team: number;
  name: string;
  emblem: number;
  livery: Livery;
  place: number;
  yours: boolean;
  ships: ShipColumn[];
  cards: SheetCard[];
};

export const SEATS: readonly SheetSeat[] = ['owner', ...ROLES];

const mean = (values: readonly number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;

const exactly = (value: number): Range => ({ lo: value, hi: value });

function knownLevels(state: CareerState, team: number): Range[][] {
  if (team === YOURS)
    return state.teams[YOURS].ships.map((ship) =>
      LINES.map((line) => exactly(ship.fitted[line]))
    );
  return state.knowledge.lines[team].map((ranges) =>
    LINES.map((line) => ranges[line])
  );
}

function strengthOf(state: CareerState, team: number): Range {
  const levels = knownLevels(state, team).flat();
  return {
    lo: mean(levels.map((range) => range.lo)),
    hi: mean(levels.map((range) => range.hi)),
  };
}

export function opponentsView(state: CareerState): OpponentsView {
  const places = standings(state);
  const rows = standingOrder(state).map((team): StandingRow => {
    const held = state.teams[team];
    return {
      team,
      place: places[team],
      moved: state.lastStanding[team] - places[team],
      name: held.name,
      emblem: held.emblem,
      livery: held.livery,
      points: state.points[team],
      strength: strengthOf(state, team),
      yours: team === YOURS,
    };
  });
  return {
    rows,
    mean: strengthOf(state, YOURS).lo,
    open: rows.findIndex((row) => row.yours),
  };
}

const bare = (seat: SheetSeat): SheetCard => ({
  seat,
  card: null,
  helm: false,
  exact: true,
  pinned: false,
  rival: null,
  holder: null,
  report: null,
  approach: null,
});

function ownerCard(state: CareerState, owner: Owner): CardView {
  const stats = knownStats(state, owner.id) ?? [];
  return {
    who: 'person',
    person: owner.id,
    name: owner.name,
    portrait: owner.portrait,
    role: 'owner',
    age: null,
    stars: knownStars(state, owner.id) ?? { lo: 0, hi: 0 },
    stats: DRIVER_STATS.map((stat, i) => ({ stat, value: stats[i] })),
    wage: null,
    racesLeft: null,
  };
}

const report = (state: CareerState, id: number) =>
  action(reportPrice(state, id), reportRefusal(state, YOURS, id));

function yourCard(state: CareerState, seat: SheetSeat): SheetCard {
  if (seat === 'owner') return { ...bare(seat), helm: true };
  const holder = seatHolder(state, YOURS, seat);
  if (holder !== null) return { ...bare(seat), card: exactCard(holder) };
  return { ...bare(seat), card: seat === 'driver' ? uncleCard() : null };
}

function rivalCard(
  state: CareerState,
  team: number,
  seat: SheetSeat
): SheetCard {
  if (seat === 'owner') {
    const owner = state.teams[team].owner;
    if (owner === null) return bare(seat);
    return {
      ...bare(seat),
      card: ownerCard(state, owner),
      exact: isExact(state, owner.id),
      report: report(state, owner.id),
    };
  }
  const person = seatHolder(state, team, seat);
  if (person === null) return bare(seat);
  const holder = holderOf(state, seat);
  return {
    seat,
    card: candidateCard(state, person),
    helm: false,
    exact: isExact(state, person.id),
    pinned: state.teams[YOURS].approached[seat] === person.id,
    rival: rivalOf(state, person),
    holder: holder ? holder.stats.map((s) => s.value.lo) : null,
    report: report(state, person.id),
    approach: action(
      SCOUTING.approach,
      approachRefusal(state, YOURS, person.id)
    ),
  };
}

export function teamSheetView(state: CareerState, team: number): TeamSheetView {
  const held = state.teams[team],
    yours = team === YOURS,
    ours = state.teams[YOURS].ships[0].fitted;
  const levels = knownLevels(state, team);
  return {
    team,
    name: held.name,
    emblem: held.emblem,
    livery: held.livery,
    place: standings(state)[team],
    yours,
    ships: held.ships.map((ship, slot) => ({
      gun: ship.gun,
      lines: LINES.map((line, i) => ({
        line,
        level: levels[slot][i],
        yours: ours[line],
      })),
    })),
    cards: SEATS.map((seat) =>
      yours ? yourCard(state, seat) : rivalCard(state, team, seat)
    ),
  };
}

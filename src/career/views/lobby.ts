import type { Command } from '../commands.ts';
import { healRating, nextRace, planetName, stormRating } from '../fit.ts';
import { seatHolder, seatStat } from '../lookup.ts';
import { buildCost } from '../rules/development.ts';
import { interestOn } from '../rules/money.ts';
import { standings } from '../rules/standing.ts';
import { LINES, ROLES, YOURS, type CareerState } from '../state.ts';
import { DOTS, LEAGUE, LOBBY_BUBBLES } from '../tuning.ts';

export type LobbyButton = 'ship' | 'team' | 'sponsors' | 'opponents';

type LobbyBubble = 'team' | 'ship' | 'sponsors' | 'opponents';

export type LobbyView = {
  seed: string;
  next: { planet: string; storm: number; heals: number };
  money: { balance: number; interest: number | null };
  standing: { place: number; moved: number; opens: boolean };
  race: { race: number; of: number } | null;
  buttons: { id: LobbyButton; dot: boolean }[];
  sail: Command[];
  bubble: LobbyBubble | null;
};

const ORDER: readonly LobbyButton[] = ['ship', 'team', 'sponsors', 'opponents'];

const racesSailed = (state: CareerState): number =>
  state.phase === 'offseason'
    ? state.season * LEAGUE.racesPerSeason
    : (state.season - 1) * LEAGUE.racesPerSeason + state.race - 1;

const hasDesigner = (state: CareerState): boolean =>
  state.teams[YOURS].seats.designer !== null;

function bubbleOf(state: CareerState): LobbyBubble | null {
  const unseen = (id: LobbyBubble) => !state.seen.includes(id);
  const sailed = racesSailed(state);
  if (unseen('team')) return 'team';
  if (unseen('ship') && hasDesigner(state)) return 'ship';
  if (unseen('sponsors') && sailed >= LOBBY_BUBBLES.sponsorsAfter)
    return 'sponsors';
  if (unseen('opponents') && sailed >= LOBBY_BUBBLES.opponentsAfter)
    return 'opponents';
  return null;
}

function teamDot(state: CareerState): boolean {
  const team = state.teams[YOURS];
  const waiting = ROLES.some(
    (role) =>
      team.seats[role] === null &&
      (team.deals[role]?.candidates.length ?? 0) > 0
  );
  const ending = ROLES.some((role) => {
    const contract = seatHolder(state, YOURS, role)?.contract;
    return contract != null && contract.racesLeft <= DOTS.racesLeft;
  });
  return waiting || ending;
}

function shipDot(state: CareerState): boolean {
  const team = state.teams[YOURS];
  if (hasDesigner(state) && team.focus === null) return true;
  const thrift = seatStat(state, YOURS, 'mechanic', 'thrift');
  return team.ships.some((ship) =>
    LINES.some((line) => {
      const design = team.design[line],
        fitted = ship.fitted[line];
      return (
        design - fitted >= DOTS.buildGap &&
        buildCost(design, fitted, thrift) <= team.balance
      );
    })
  );
}

function sponsorsDot(state: CareerState): boolean {
  const team = state.teams[YOURS];
  return team.sponsors.some((s) => s === null) && team.offers.length > 0;
}

const DOT: Record<LobbyButton, (state: CareerState) => boolean> = {
  ship: shipDot,
  team: teamDot,
  sponsors: sponsorsDot,
  opponents: () => false,
};

export function lobbyView(state: CareerState): LobbyView {
  const team = state.teams[YOURS];
  const bubble = bubbleOf(state);
  const present = (id: LobbyButton) =>
    id === 'team' || state.seen.includes(id) || bubble === id;
  const place = standings(state)[YOURS];
  return {
    sail: sailOrders(state),
    seed: state.seed,
    next: {
      planet: planetName(state),
      storm: stormRating(state),
      heals: healRating(state),
    },
    money: {
      balance: team.balance,
      interest: team.balance < 0 ? interestOn(team.balance) : null,
    },
    standing: {
      place,
      moved: state.lastStanding[YOURS] - place,
      opens: present('opponents'),
    },
    race:
      state.phase === 'offseason'
        ? null
        : { race: nextRace(state).race, of: LEAGUE.racesPerSeason },
    buttons: ORDER.filter(present).map((id) => ({ id, dot: DOT[id](state) })),
    bubble,
  };
}

export const sailOrders = (state: CareerState): Command[] => [
  ...(state.phase === 'offseason'
    ? [{ type: 'FinishOffseason', team: YOURS } as const]
    : []),
  { type: 'StartRace', team: YOURS },
];

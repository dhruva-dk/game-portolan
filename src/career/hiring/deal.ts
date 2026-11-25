import { ordered, raceKey } from '../draw.ts';
import { personOf } from '../lookup.ts';
import { eligible } from '../rules/eligible.ts';
import { reputations } from '../rules/reputation.ts';
import { stars } from '../rules/stars.ts';
import {
  perRole,
  type CareerState,
  type Deal,
  type Role,
  type Team,
} from '../state.ts';
import { DEAL } from '../tuning.ts';

type Dealing = {
  state: CareerState;
  team: number;
  reputation: number;
  full: boolean;
};

function approachedFirst(dealing: Dealing, role: Role): number[] {
  const { state, team } = dealing;
  const id = state.teams[team].approached[role];
  if (id === null) return [];
  const person = personOf(state, id);
  return person === null || person.contract?.team === team ? [] : [id];
}

function dealFor(dealing: Dealing, role: Role): Deal | null {
  const { state, team, reputation, full } = dealing;
  const first = approachedFirst(dealing, role);
  if (!full)
    return first.length === 0 ? null : { candidates: first, locked: null };
  const pool = state.people.filter(
    (person) =>
      person.role === role &&
      person.contract === null &&
      !first.includes(person.id) &&
      eligible(stars(person.stats), reputation)
  );
  const order = ordered(
    pool,
    (person) => person.id,
    state.seed,
    'deal',
    state.season,
    raceKey(state),
    team,
    role
  );
  const rest = order.slice(0, DEAL.size - first.length).map((p) => p.id);
  return { candidates: [...first, ...rest], locked: null };
}

function dealTeam(
  state: CareerState,
  team: number,
  reputation: number,
  full: (role: Role) => boolean
): Team {
  return {
    ...state.teams[team],
    deals: perRole((role) =>
      dealFor({ state, team, reputation, full: full(role) }, role)
    ),
    approached: perRole(() => null),
    talks: [],
  };
}

function dealLeague(
  state: CareerState,
  full: (team: Team, role: Role) => boolean
): CareerState {
  const reputation = reputations(state);
  return {
    ...state,
    teams: state.teams.map((team, index) =>
      dealTeam(state, index, reputation[index], (role) => full(team, role))
    ),
  };
}

export const dealAfterRace = (state: CareerState): CareerState =>
  dealLeague(state, (team, role) => role === team.scoutSeat);

export const dealOffseason = (state: CareerState): CareerState =>
  dealLeague(state, () => true);

import type { Command } from '../commands.ts';
import { buildPrice, fitPrice } from '../development/build.ts';
import { sameFocus } from '../development/focus.ts';
import { draw, raceKey } from '../draw.ts';
import { employees, personOf, seatHolder } from '../lookup.ts';
import { focusValue, focusWeight, wantsGun } from '../rules/development.ts';
import { ownerTemperament, stars, type Temperament } from '../rules/person.ts';
import { reputationOf, standings } from '../rules/standing.ts';
import {
  LINES,
  ROLES,
  STATS,
  type CareerState,
  type Focus,
  type Line,
  type Person,
  type Role,
  type Terms,
} from '../state.ts';
import { LEAGUE, POLICY, SCOUTING } from '../tuning.ts';
import { meansOf, purchasable, signableTerms, type Means } from './means.ts';

export function wantedFocus(state: CareerState, team: number): Focus {
  const designer = seatHolder(state, team, 'designer');
  if (designer === null) return null;
  const { design, taste, unlocked } = state.teams[team];
  const locked = taste.filter((kind) => !unlocked.includes(kind));
  if (locked.length > 0 && wantsGun(design.gun, unlocked.length))
    return { gun: locked[0] };
  const mean =
    LINES.reduce((sum, line) => sum + design[line], 0) / LINES.length;
  let best = LINES[0];
  let top = -Infinity;
  for (const line of LINES) {
    const skill = designer.stats[STATS.designer.indexOf(line)];
    const value = focusValue(
      skill,
      design[line],
      focusWeight(design[line], mean)
    );
    if (value > top) {
      top = value;
      best = line;
    }
  }
  return { line: best };
}

export function holderStars(
  state: CareerState,
  team: number,
  role: Role
): number {
  const holder = seatHolder(state, team, role);
  return holder === null ? POLICY.emptySeatStars : stars(holder.stats);
}

export function weakSeat(state: CareerState, team: number): Role {
  let weak = ROLES[0];
  for (const role of ROLES)
    if (holderStars(state, team, role) < holderStars(state, team, weak))
      weak = role;
  return weak;
}

type Choice = { person: Person; terms: Terms };

type Deciding = { state: CareerState; team: number; means: Means };

const present = (person: Person | null): person is Person => person !== null;

function candidates(state: CareerState, team: number, role: Role): Person[] {
  const deal = state.teams[team].deals[role];
  return deal === null
    ? []
    : deal.candidates.map((id) => personOf(state, id)).filter(present);
}

function signable(deciding: Deciding, people: readonly Person[]): Choice[] {
  const { state, team, means } = deciding;
  return people.flatMap((person) => {
    const terms = signableTerms(state, team, person, means);
    return terms === null ? [] : [{ person, terms }];
  });
}

function best(choices: readonly Choice[]): Choice | null {
  let chosen: Choice | null = null;
  for (const choice of choices) {
    if (chosen === null) {
      chosen = choice;
      continue;
    }
    const more = stars(choice.person.stats) - stars(chosen.person.stats);
    if (more > 0 || (more === 0 && choice.person.id < chosen.person.id))
      chosen = choice;
  }
  return chosen;
}

const offer = (team: number, choice: Choice): Command => ({
  type: 'Offer',
  team,
  person: choice.person.id,
  terms: choice.terms,
});

function marker({ state, team }: Deciding): Command | null {
  const role = weakSeat(state, team);
  return state.teams[team].scoutSeat === role
    ? null
    : { type: 'SetScoutSeat', team, role };
}

function renew(deciding: Deciding): Command | null {
  const { state, team } = deciding;
  if (state.phase !== 'offseason') return null;
  const { talks } = state.teams[team];
  for (const person of employees(state, team)) {
    if (person.contract?.racesLeft !== 0) continue;
    if (talks.some((talk) => talk.person === person.id)) continue;
    const own = stars(person.stats);
    const better = signable(
      deciding,
      candidates(state, team, person.role).filter(
        (candidate) => stars(candidate.stats) > own
      )
    );
    if (better.length > 0) continue;
    const renewal = signable(deciding, [person]);
    if (renewal.length > 0) return offer(team, renewal[0]);
  }
  return null;
}

function sign(deciding: Deciding): Command | null {
  const { state, team } = deciding;
  for (const role of ROLES) {
    const deal = state.teams[team].deals[role];
    if (deal === null || deal.locked !== null) continue;
    const least = holderStars(state, team, role) + POLICY.signMargin;
    const choice = best(
      signable(
        deciding,
        candidates(state, team, role).filter(
          (candidate) => stars(candidate.stats) >= least
        )
      )
    );
    if (choice !== null) return offer(team, choice);
  }
  return null;
}

const approachDraw = (state: CareerState, team: number): number =>
  draw(state.seed, 'approach', state.season, raceKey(state), team);

function approach(deciding: Deciding): Command | null {
  const { state, team, means } = deciding;
  if (reputationOf(state, team) > POLICY.approachReputation) return null;
  const role = weakSeat(state, team);
  if (state.teams[team].approached[role] !== null) return null;
  if (approachDraw(state, team) >= POLICY.approachChance) return null;
  const table = standings(state);
  const least = holderStars(state, team, role) + POLICY.approachMargin;
  const targets = state.people.filter(
    (person) =>
      person.role === role &&
      person.contract !== null &&
      person.contract.team !== team &&
      table[person.contract.team] > table[team] &&
      stars(person.stats) >= least
  );
  const choice = best(signable(deciding, targets));
  if (choice === null || !purchasable(state, team, SCOUTING.approach, means))
    return null;
  return { type: 'Approach', team, person: choice.person.id };
}

function focus({ state, team }: Deciding): Command | null {
  const wanted = wantedFocus(state, team);
  return sameFocus(state.teams[team].focus, wanted)
    ? null
    : { type: 'SetFocus', team, focus: wanted };
}

const SLOTS = Array.from({ length: LEAGUE.shipsPerTeam }, (_, slot) => slot);

function fit({ state, team, means }: Deciding): Command | null {
  const { taste, unlocked, ships } = state.teams[team];
  const kind = taste.find((k) => unlocked.includes(k));
  if (kind === undefined) return null;
  for (const slot of SLOTS)
    if (
      ships[slot].gun !== kind &&
      purchasable(state, team, fitPrice(state, team, slot), means)
    )
      return { type: 'FitGun', team, slot, kind };
  return null;
}

function build({ state, team, means }: Deciding): Command | null {
  const { design, ships } = state.teams[team];
  let chosen: { slot: number; line: Line; gap: number } | null = null;
  for (const slot of SLOTS)
    for (const line of LINES) {
      const gap = design[line] - ships[slot].fitted[line];
      if (gap < means.build || (chosen !== null && gap <= chosen.gap)) continue;
      if (purchasable(state, team, buildPrice(state, team, slot, line), means))
        chosen = { slot, line, gap };
    }
  return chosen === null
    ? null
    : { type: 'Build', team, slot: chosen.slot, line: chosen.line };
}

function sponsor({ state, team }: Deciding): Command | null {
  const { sponsors, offers } = state.teams[team];
  const slot = sponsors.findIndex((held) => held === null);
  if (slot < 0 || offers.length === 0) return null;
  const worth = (index: number): number =>
    offers[index].fee + POLICY.sponsorBonusWeight * offers[index].bonus;
  let chosen = 0;
  offers.forEach((_, index) => {
    if (worth(index) > worth(chosen)) chosen = index;
  });
  return { type: 'SignSponsor', team, offer: chosen, slot };
}

const STEPS = [marker, renew, sign, approach, focus, fit, build, sponsor];

const temperamentOfTeam = (state: CareerState, team: number): Temperament =>
  ownerTemperament(state.teams[team].owner);

export function policy(
  state: CareerState,
  team: number,
  temperament: Temperament = temperamentOfTeam(state, team)
): Command | null {
  const deciding: Deciding = { state, team, means: meansOf(temperament) };
  for (const step of STEPS) {
    const command = step(deciding);
    if (command !== null) return command;
  }
  return null;
}

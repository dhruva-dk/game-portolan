import { announce, named, updateTeam, vacate } from '../change.ts';
import type { Reason } from '../commands.ts';
import { ownerOf, personOf } from '../lookup.ts';
import { racesLeftOnSigning, renewedRacesLeft } from '../rules/hiring.ts';
import type {
  CareerState,
  Contract,
  NewsEvent,
  Person,
  Role,
  Talk,
  Team,
  Terms,
} from '../state.ts';
import {
  clauseOwed,
  costToSign,
  isRenewal,
  outgoing,
  releaseCostOf,
} from './cost.ts';

export const talkWith = (team: Team, person: number): Talk =>
  team.talks.find((talk) => talk.person === person) ?? {
    person,
    attempts: 0,
    answer: null,
    counter: null,
  };

export const withTalk = (team: Team, talk: Talk): Team => ({
  ...team,
  talks: team.talks.some((t) => t.person === talk.person)
    ? team.talks.map((t) => (t.person === talk.person ? talk : t))
    : [...team.talks, talk],
});

const signedWith = (team: Team, person: number): Team =>
  withTalk(team, {
    ...talkWith(team, person),
    answer: 'signed',
    counter: null,
  });

const withContract = (
  people: readonly Person[],
  id: number,
  contract: Contract | null
): Person[] => people.map((p) => (p.id === id ? { ...p, contract } : p));

function renew(
  state: CareerState,
  team: number,
  person: Person,
  terms: Terms
): CareerState {
  const contract: Contract = {
    team,
    wage: terms.wage,
    clause: terms.clause,
    racesLeft: renewedRacesLeft(person.contract?.racesLeft ?? 0, terms.seasons),
  };
  const signed = updateTeam(state, team, (t) => ({
    ...signedWith(t, person.id),
    balance: t.balance - terms.fee,
  }));
  return { ...signed, people: withContract(state.people, person.id, contract) };
}

const signingNews = (
  team: number,
  person: Person,
  from: number | null
): NewsEvent =>
  from === null
    ? { kind: 'hired', team, ...named(person) }
    : { kind: 'poached', team, team2: from, ...named(person) };

function signNew(
  state: CareerState,
  team: number,
  person: Person,
  terms: Terms
): CareerState {
  const holder = outgoing(state, team, person);
  const cost = costToSign(state, team, person, terms);
  const clause = clauseOwed(person, team);
  const from = person.contract?.team ?? null;
  const { role } = person;
  const contract: Contract = {
    team,
    wage: terms.wage,
    clause: terms.clause,
    racesLeft: racesLeftOnSigning(
      terms.seasons,
      state.race,
      state.phase === 'offseason'
    ),
  };
  const teams = vacate(state.teams, new Set([person.id])).map((t, index) => {
    if (index === team)
      return {
        ...signedWith(t, person.id),
        balance: t.balance - cost,
        seats: { ...t.seats, [role]: person.id },
        deals: { ...t.deals, [role]: null },
        approached: { ...t.approached, [role]: null },
      };
    return index === from ? { ...t, balance: t.balance + clause } : t;
  });
  const released =
    holder === null
      ? state.people
      : withContract(state.people, holder.id, null);
  return announce(
    { ...state, teams, people: withContract(released, person.id, contract) },
    signingNews(team, person, from)
  );
}

export const sign = (
  state: CareerState,
  team: number,
  person: Person,
  terms: Terms
): CareerState =>
  isRenewal(person, team)
    ? renew(state, team, person, terms)
    : signNew(state, team, person, terms);

export function releaseRefusal(
  state: CareerState,
  team: number,
  id: number
): Reason | null {
  if (ownerOf(state, id) !== null) return 'fixed';
  return personOf(state, id)?.contract?.team === team ? null : 'seat';
}

export function release(
  state: CareerState,
  team: number,
  id: number
): CareerState {
  const person = personOf(state, id);
  if (person === null) return state;
  const cost = releaseCostOf(person);
  const paid = updateTeam(state, team, (t) => ({
    ...t,
    balance: t.balance - cost,
  }));
  return {
    ...paid,
    teams: vacate(paid.teams, new Set([id])),
    people: state.people.map((p) =>
      p.id === id ? { ...p, contract: null } : p
    ),
  };
}

export const scoutRefusal = (
  state: CareerState,
  team: number,
  role: Role
): Reason | null => (state.teams[team].scoutSeat === role ? 'same' : null);

export const setScoutSeat = (
  state: CareerState,
  team: number,
  role: Role
): CareerState => updateTeam(state, team, (t) => ({ ...t, scoutSeat: role }));

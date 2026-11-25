import { announce, named } from '../announce.ts';
import { racesLeftOnSigning, renewedRacesLeft } from '../rules/hiring.ts';
import type {
  CareerState,
  Contract,
  NewsEvent,
  Person,
  Team,
  Terms,
} from '../state.ts';
import { updateTeam } from '../teams.ts';
import { vacate } from '../vacate.ts';
import { clauseOwed, costToSign, isRenewal, outgoing } from './cost.ts';
import { talkWith, withTalk } from './talks.ts';

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

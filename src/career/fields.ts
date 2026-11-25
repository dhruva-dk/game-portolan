import { KINDS } from '../sim/kinds.ts';
import { DYES, EMBLEMS, PATTERNS } from '../world/livery.ts';
import type { Command } from './commands.ts';
import { LINES, ROLES, type CareerState } from './state.ts';
import { LEAGUE, NEGOTIATION, RACE_MONEY, SPONSORS } from './tuning.ts';

type Stepped = { least: number; most: number; step: number };

const isNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

export const isInteger = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n);

export const isIndex = (n: unknown, count: number): n is number =>
  isInteger(n) && n >= 0 && n < count;

const isCount = (n: unknown): boolean => isInteger(n) && n >= 0;

const isAmount = (n: unknown): boolean => isNumber(n) && n >= 0;

const isFraction = (n: unknown): boolean => isNumber(n) && n >= 0 && n <= 1;

const oneOf = (items: readonly unknown[], value: unknown): boolean =>
  items.some((item) => item === value);

const stepped = (n: unknown, { least, most, step }: Stepped): boolean =>
  isInteger(n) && n >= least && n <= most && (n - least) % step === 0;

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;

const keyCount = (value: unknown): number =>
  typeof value === 'object' && value !== null ? Object.keys(value).length : -1;

const shipSlot = (n: unknown): boolean => isIndex(n, LEAGUE.shipsPerTeam);

function focus(value: unknown): boolean {
  if (value === null) return true;
  if (keyCount(value) !== 1) return false;
  return (
    oneOf(LINES, field(value, 'line')) || oneOf(KINDS, field(value, 'gun'))
  );
}

const livery = (value: unknown): boolean =>
  keyCount(value) === 2 &&
  isIndex(field(value, 'dye'), DYES.length) &&
  isIndex(field(value, 'pattern'), PATTERNS.length);

const terms = (value: unknown): boolean =>
  keyCount(value) === 4 &&
  stepped(field(value, 'wage'), NEGOTIATION.wage) &&
  stepped(field(value, 'seasons'), { ...NEGOTIATION.seasons, step: 1 }) &&
  stepped(field(value, 'fee'), NEGOTIATION.fee) &&
  stepped(field(value, 'clause'), NEGOTIATION.clause);

function shipResult(value: unknown, ships: number): boolean {
  const sunkAt = field(value, 'sunkAt');
  const sunkBy = field(value, 'sunkBy');
  return (
    isInteger(field(value, 'place')) &&
    (sunkAt === null || isAmount(sunkAt)) &&
    (sunkBy === null || isIndex(sunkBy, ships)) &&
    isCount(field(value, 'sinkings')) &&
    isCount(field(value, 'shotsFired')) &&
    isCount(field(value, 'shotsLanded')) &&
    isAmount(field(value, 'damageDealt')) &&
    isAmount(field(value, 'damageTaken')) &&
    typeof field(value, 'afloatAtPhaseFour') === 'boolean'
  );
}

function places(ships: readonly unknown[]): boolean {
  const seen = new Set<unknown>();
  for (const ship of ships) {
    const place = field(ship, 'place');
    if (!isIndex(place, ships.length + 1) || place === 0 || seen.has(place))
      return false;
    seen.add(place);
  }
  return true;
}

const samples = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === RACE_MONEY.seaSamples &&
  value.every(isFraction);

function result(value: unknown, teams: number): boolean {
  const ships = field(value, 'ships');
  const sea = field(value, 'sea');
  const count = teams * LEAGUE.shipsPerTeam;
  return (
    isAmount(field(value, 'seconds')) &&
    typeof field(value, 'hash') === 'string' &&
    Array.isArray(ships) &&
    ships.length === count &&
    ships.every((ship) => shipResult(ship, count)) &&
    places(ships) &&
    Array.isArray(sea) &&
    sea.length === teams &&
    sea.every(samples)
  );
}

export function fieldsValid(state: CareerState, command: Command): boolean {
  switch (command.type) {
    case 'StartRace':
    case 'FinishOffseason':
    case 'MarkRead':
      return true;
    case 'RecordRace':
      return result(command.result, state.teams.length);
    case 'MarkSeen':
      return typeof command.id === 'string';
    case 'SetFocus':
      return focus(command.focus);
    case 'Build':
      return shipSlot(command.slot) && oneOf(LINES, command.line);
    case 'FitGun':
      return shipSlot(command.slot) && oneOf(KINDS, command.kind);
    case 'Repaint':
      return livery(command.livery) && isIndex(command.emblem, EMBLEMS);
    case 'SetScoutSeat':
      return oneOf(ROLES, command.role);
    case 'BuyReport':
    case 'Approach':
    case 'AcceptCounter':
    case 'Release':
      return isInteger(command.person);
    case 'Offer':
      return isInteger(command.person) && terms(command.terms);
    case 'SignSponsor':
      return isCount(command.offer) && isIndex(command.slot, SPONSORS.slots);
  }
}

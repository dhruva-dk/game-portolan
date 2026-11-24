import type { MatchResult } from '../sim/result.ts';
import {
  COMMANDS,
  VALID_IN,
  YOURS_ONLY,
  type Command,
  type Reason,
} from './commands.ts';
import { fieldsValid, isIndex } from './fields.ts';
import { known } from './lookup.ts';
import { enterPhase, nextRaceLobby, seasonOver } from './record/advance.ts';
import { countDownContracts } from './record/contracts.ts';
import { publishNews } from './record/news.ts';
import { payRace, raceMoney } from './record/pay.ts';
import { fileReport, raceReport } from './record/report.ts';
import { scoreRace } from './record/score.ts';
import type { CareerState } from './state.ts';

export { newCareer, type CareerOptions } from './start.ts';

export type Applied =
  | { ok: true; state: CareerState }
  | { ok: false; reason: Reason };

export function apply(state: CareerState, command: Command): Applied {
  const reason = refusal(state, command);
  return reason === null ? effect(state, command) : { ok: false, reason };
}

function refusal(state: CareerState, command: Command): Reason | null {
  if (typeof command !== 'object' || command === null) return 'invalid';
  if (!COMMANDS.includes(command.type)) return 'invalid';
  if (!isIndex(command.team, state.teams.length)) return 'team';
  if (command.team !== 0 && YOURS_ONLY.includes(command.type)) return 'team';
  if (!VALID_IN[command.type].includes(state.phase)) return 'phase';
  if (!fieldsValid(state, command)) return 'invalid';
  if (!known(state, command)) return 'unknown';
  return null;
}

const notYet = (state: CareerState): Applied => ({ ok: true, state });

const seam = (state: CareerState): CareerState => state;

type Repossession = { state: CareerState; teams: readonly number[] };

const runPolicies = seam;
const repossess = (state: CareerState): Repossession => ({ state, teams: [] });
const develop = seam;
const countDownSponsors = seam;
const narrowRanges = seam;
const raceEvents = seam;
const dealAfterRace = seam;
const offerSponsors = seam;

const YOURS = 0;

const accepted = (state: CareerState): Applied => ({ ok: true, state });

const startRace = (state: CareerState): Applied =>
  accepted(enterPhase(runPolicies(state), 'racing'));

function recordRace(state: CareerState, result: MatchResult): Applied {
  const scored = scoreRace(state, result);
  const money = raceMoney(scored, result);
  const paid = payRace(scored, money);
  const repossession = repossess(paid);
  const developed = develop(repossession.state);
  const counted = countDownSponsors(countDownContracts(developed));
  const narrowed = narrowRanges(counted);
  const told = raceEvents(narrowed);
  const filed = fileReport(
    told,
    raceReport({
      before: state,
      paid,
      after: told,
      result,
      money: money[YOURS],
      repossessed: repossession.teams,
    })
  );
  const advanced = seasonOver(filed)
    ? enterOffseason(filed)
    : offerSponsors(dealAfterRace(nextRaceLobby(filed)));
  return accepted(publishNews(advanced));
}

const enterOffseason = (state: CareerState): CareerState =>
  enterPhase(state, 'offseason');

const markRead = (state: CareerState): Applied =>
  accepted({ ...state, unread: false });

function effect(state: CareerState, command: Command): Applied {
  switch (command.type) {
    case 'StartRace':
      return startRace(state);
    case 'RecordRace':
      return recordRace(state, command.result);
    case 'FinishOffseason':
      return notYet(state);
    case 'MarkRead':
      return markRead(state);
    case 'MarkSeen':
      return markSeen(state, command.id);
    case 'SetFocus':
      return notYet(state);
    case 'Build':
      return notYet(state);
    case 'FitGun':
      return notYet(state);
    case 'Repaint':
      return notYet(state);
    case 'SetScoutSeat':
      return notYet(state);
    case 'BuyReport':
      return notYet(state);
    case 'Approach':
      return notYet(state);
    case 'Offer':
      return notYet(state);
    case 'AcceptCounter':
      return notYet(state);
    case 'Release':
      return notYet(state);
    case 'SignSponsor':
      return notYet(state);
  }
}

const markSeen = (state: CareerState, id: string): Applied => ({
  ok: true,
  state: state.seen.includes(id)
    ? state
    : { ...state, seen: [...state.seen, id] },
});

import type { MatchResult } from '../sim/result.ts';
import {
  COMMANDS,
  VALID_IN,
  YOURS_ONLY,
  type Command,
  type Reason,
} from './commands.ts';
import {
  build,
  buildRefusal,
  fitGun,
  fitRefusal,
} from './development/build.ts';
import { focusRefusal, setFocus } from './development/focus.ts';
import { fieldsValid, isIndex } from './fields.ts';
import { approach, approachRefusal } from './hiring/approach.ts';
import { acceptCounter, counterRefusal } from './hiring/counter.ts';
import { dealAfterRace, dealOffseason } from './hiring/deal.ts';
import { offer, offerRefusal } from './hiring/offer.ts';
import { release, releaseRefusal } from './hiring/release.ts';
import { scoutRefusal, setScoutSeat } from './hiring/scout.ts';
import { known } from './lookup.ts';
import { releaseExpired, turnSeason } from './offseason/finish.ts';
import { ageLeague } from './offseason/people.ts';
import { payPrizes } from './offseason/prize.ts';
import { fileOffseasonReport, offseasonReport } from './offseason/report.ts';
import { winter } from './offseason/winter.ts';
import { enterPhase, nextRaceLobby, seasonOver } from './record/advance.ts';
import { countDownContracts } from './record/contracts.ts';
import { develop } from './record/develop.ts';
import { countDownSponsors } from './record/sponsors.ts';
import { publishNews } from './record/news.ts';
import { payRace, raceMoney } from './record/pay.ts';
import { fileReport, raceReport } from './record/report.ts';
import { scoreRace } from './record/score.ts';
import { dealOffers } from './sponsors/offers.ts';
import { signRefusal, signSponsor } from './sponsors/sign.ts';
import { YOURS, type CareerState } from './state.ts';

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
const narrowRanges = seam;
const raceEvents = seam;
const seasonEvents = seam;
const redrawKnowledge = seam;

const accepted = (state: CareerState): Applied => ({ ok: true, state });

const unless = (reason: Reason | null, run: () => CareerState): Applied =>
  reason === null ? accepted(run()) : { ok: false, reason };

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
    : dealOffers(dealAfterRace(nextRaceLobby(filed)));
  return accepted(publishNews(advanced));
}

function enterOffseason(state: CareerState): CareerState {
  const stopped = enterPhase(state, 'offseason');
  const prized = payPrizes(stopped);
  const wintered = winter(prized);
  const aged = ageLeague(wintered);
  const redrawn = redrawKnowledge(aged);
  const dealt = dealOffers(dealOffseason(redrawn));
  const told = seasonEvents(dealt);
  return fileOffseasonReport(told, offseasonReport(stopped, told));
}

const finishOffseason = (state: CareerState): Applied =>
  accepted(enterPhase(turnSeason(releaseExpired(runPolicies(state))), 'lobby'));

const markRead = (state: CareerState): Applied =>
  accepted({ ...state, unread: false });

function effect(state: CareerState, command: Command): Applied {
  switch (command.type) {
    case 'StartRace':
      return startRace(state);
    case 'RecordRace':
      return recordRace(state, command.result);
    case 'FinishOffseason':
      return finishOffseason(state);
    case 'MarkRead':
      return markRead(state);
    case 'MarkSeen':
      return markSeen(state, command.id);
    case 'SetFocus':
      return unless(focusRefusal(state, command.team, command.focus), () =>
        setFocus(state, command.team, command.focus)
      );
    case 'Build':
      return unless(
        buildRefusal(state, command.team, command.slot, command.line),
        () => build(state, command.team, command.slot, command.line)
      );
    case 'FitGun':
      return unless(
        fitRefusal(state, command.team, command.slot, command.kind),
        () => fitGun(state, command.team, command.slot, command.kind)
      );
    case 'Repaint':
      return notYet(state);
    case 'SetScoutSeat':
      return unless(scoutRefusal(state, command.team, command.role), () =>
        setScoutSeat(state, command.team, command.role)
      );
    case 'BuyReport':
      return notYet(state);
    case 'Approach':
      return unless(approachRefusal(state, command.team, command.person), () =>
        approach(state, command.team, command.person)
      );
    case 'Offer':
      return unless(
        offerRefusal(state, command.team, command.person, command.terms),
        () => offer(state, command.team, command.person, command.terms)
      );
    case 'AcceptCounter':
      return unless(counterRefusal(state, command.team, command.person), () =>
        acceptCounter(state, command.team, command.person)
      );
    case 'Release':
      return unless(releaseRefusal(state, command.team, command.person), () =>
        release(state, command.team, command.person)
      );
    case 'SignSponsor':
      return unless(signRefusal(state, command.team, command.slot), () =>
        signSponsor(state, command.team, command.offer, command.slot)
      );
  }
}

const markSeen = (state: CareerState, id: string): Applied => ({
  ok: true,
  state: state.seen.includes(id)
    ? state
    : { ...state, seen: [...state.seen, id] },
});

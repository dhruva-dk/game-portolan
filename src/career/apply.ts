import type { MatchResult } from '../sim/result.ts';
import {
  COMMANDS,
  VALID_IN,
  YOURS_ONLY,
  type Command,
  type Reason,
  type Refusal,
} from './commands.ts';
import {
  build,
  buildRefusal,
  fitGun,
  fitRefusal,
  focusRefusal,
  setFocus,
} from './development.ts';
import { fieldsValid, isIndex } from './fields.ts';
import {
  acceptCounter,
  approach,
  approachRefusal,
  counterRefusal,
  offer,
  offerRefusal,
} from './hiring/talks.ts';
import { dealAfterRace, dealOffseason } from './hiring/deal.ts';
import {
  release,
  releaseRefusal,
  scoutRefusal,
  setScoutSeat,
} from './hiring/sign.ts';
import { buyReport, reportRefusal } from './knowledge/report.ts';
import {
  narrowShipLines,
  redrawBuilt,
  redrawKnowledge,
} from './knowledge/ships.ts';
import { known } from './lookup.ts';
import {
  ageLeague,
  fileOffseasonReport,
  offseasonReport,
  payPrizes,
  releaseExpired,
  seasonEvents,
  turnSeason,
  winter,
} from './offseason.ts';
import {
  develop,
  enterPhase,
  nextRaceLobby,
  publishNews,
  scoreRace,
  seasonOver,
} from './record/race.ts';
import {
  countDownContracts,
  countDownSponsors,
  payRace,
  raceMoney,
  repossess,
} from './record/pay.ts';
import { raceEvents } from './record/events.ts';
import { runLeague, runTeam, type PolicyRun } from './policy/run.ts';
import { fileReport, raceReport } from './record/report.ts';
import { repaint, repaintRefusal } from './repaint.ts';
import { dealOffers, signRefusal, signSponsor } from './sponsors.ts';
import { YOURS, type CareerState } from './state.ts';

export { newCareer, type CareerOptions } from './start.ts';

export type Applied =
  | { ok: true; state: CareerState; refused: Refusal[] }
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

const accepted = (state: CareerState): Applied => ({
  ok: true,
  state,
  refused: [],
});

export const runPolicy = (
  state: CareerState,
  team: number,
  nerve?: number
): PolicyRun => runTeam(state, team, apply, nerve);

export const runPolicies = (state: CareerState): PolicyRun =>
  runLeague(state, apply);

function afterPolicies(
  state: CareerState,
  then: (state: CareerState) => CareerState
): Applied {
  const run = runPolicies(state);
  return { ok: true, state: then(run.state), refused: run.refused };
}

const unless = (reason: Reason | null, run: () => CareerState): Applied =>
  reason === null ? accepted(run()) : { ok: false, reason };

const startRace = (state: CareerState): Applied =>
  afterPolicies(state, (ran) => enterPhase(ran, 'racing'));

function recordRace(
  state: CareerState,
  result: MatchResult,
  forfeited: boolean
): Applied {
  const scored = scoreRace(state, result);
  const money = raceMoney(scored, result);
  const paid = payRace(scored, money);
  const repossession = repossess(paid);
  const developed = develop(repossession.state);
  const counted = countDownSponsors(countDownContracts(developed));
  const narrowed = narrowShipLines(counted);
  const told = raceEvents(narrowed, state, result);
  const filed = fileReport(
    told,
    raceReport({
      before: state,
      paid,
      after: told,
      result,
      money: money[YOURS],
      repossessed: repossession.teams,
      forfeited,
    })
  );
  const advanced = seasonOver(filed)
    ? enterOffseason(filed)
    : dealOffers(dealAfterRace(nextRaceLobby(filed)));
  return accepted(publishNews(advanced));
}

function enterOffseason(state: CareerState): CareerState {
  const stopped = seasonEvents(enterPhase(state, 'offseason'));
  const prized = payPrizes(stopped);
  const wintered = winter(prized);
  const aged = ageLeague(wintered);
  const redrawn = redrawKnowledge(aged);
  const dealt = dealOffers(dealOffseason(redrawn));
  return fileOffseasonReport(dealt, offseasonReport(stopped, dealt));
}

const finishOffseason = (state: CareerState): Applied =>
  afterPolicies(state, (ran) =>
    enterPhase(turnSeason(releaseExpired(ran)), 'lobby')
  );

const markRead = (state: CareerState): Applied =>
  accepted({ ...state, unread: false });

function effect(state: CareerState, command: Command): Applied {
  switch (command.type) {
    case 'StartRace':
      return startRace(state);
    case 'RecordRace':
      return recordRace(state, command.result, command.forfeited === true);
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
        () =>
          redrawBuilt(
            build(state, command.team, command.slot, command.line),
            command.team,
            command.slot,
            command.line
          )
      );
    case 'FitGun':
      return unless(
        fitRefusal(state, command.team, command.slot, command.kind),
        () =>
          redrawBuilt(
            fitGun(state, command.team, command.slot, command.kind),
            command.team,
            command.slot,
            'gun'
          )
      );
    case 'Repaint':
      return unless(
        repaintRefusal(state, command.team, command.livery, command.emblem),
        () => repaint(state, command.team, command.livery, command.emblem)
      );
    case 'SetScoutSeat':
      return unless(scoutRefusal(state, command.team, command.role), () =>
        setScoutSeat(state, command.team, command.role)
      );
    case 'BuyReport':
      return unless(reportRefusal(state, command.team, command.person), () =>
        buyReport(state, command.team, command.person)
      );
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

const markSeen = (state: CareerState, id: string): Applied =>
  accepted(
    state.seen.includes(id) ? state : { ...state, seen: [...state.seen, id] }
  );

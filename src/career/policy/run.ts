import type { Command, Reason, Refusal } from '../commands.ts';
import { standingOrder } from '../rules/standing.ts';
import type { Temperament } from '../rules/temperament.ts';
import { YOURS, type CareerState } from '../state.ts';
import { POLICY } from '../tuning.ts';
import { policy } from './policy.ts';

export type Sent =
  | { ok: true; state: CareerState }
  | { ok: false; reason: Reason };

export type Send = (state: CareerState, command: Command) => Sent;

export type PolicyRun = {
  state: CareerState;
  sent: Command[];
  refused: Refusal[];
};

export function runTeam(
  state: CareerState,
  team: number,
  send: Send,
  temperament?: Temperament
): PolicyRun {
  let current = state;
  const sent: Command[] = [];
  for (let n = 0; n < POLICY.most; n++) {
    const command = policy(current, team, temperament);
    if (command === null) break;
    const applied = send(current, command);
    if (!applied.ok)
      return {
        state: current,
        sent,
        refused: [{ command, reason: applied.reason }],
      };
    sent.push(command);
    current = applied.state;
  }
  return { state: current, sent, refused: [] };
}

export const worstFirst = (state: CareerState): number[] =>
  standingOrder(state)
    .filter((team) => team !== YOURS)
    .reverse();

export function runLeague(state: CareerState, send: Send): PolicyRun {
  let current = state;
  const sent: Command[] = [];
  const refused: Refusal[] = [];
  for (const team of worstFirst(state)) {
    const run = runTeam(current, team, send);
    current = run.state;
    sent.push(...run.sent);
    refused.push(...run.refused);
  }
  return { state: current, sent, refused };
}

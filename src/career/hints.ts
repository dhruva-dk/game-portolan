// What each answer of a dilemma comes to, in words: whom it pleases or angers, and
// roughly what it costs. One sentence an answer, filled from the letter's slots and
// the rule's own numbers (career/events.ts), so a hint says what the answer does,
// including what shows only later (a guest aboard on race day, a pit crew pushed).
// Read-side.

import { askWage } from './asks.ts';
import { PARTS } from './office.ts';
import { moneyText } from './names.ts';
import type { CareerState, Mail } from './state.ts';
import { TUNING } from './tuning.ts';
import { nameOf } from './views.ts';

const D = TUNING.dilemmas;
type Slots = Mail['slots'];

/** How much a change of mood is, in words. */
const much = (by: number) => {
  const n = Math.abs(by);
  return n <= 5 ? ' a little' : n >= 15 ? ' greatly' : '';
};

/** Each answer's hint, by dilemma, in the order of its options. */
const HINTS: Readonly<
  Record<string, (s: CareerState, slots: Slots) => readonly string[]>
> = {
  riseAsk: (s, k) => {
    const g = s.people[Number(k.person)],
      who = g ? nameOf(g) : 'They',
      wage = g?.contract?.wage ?? 0;
    return [
      `Pleases ${who}${much(D.riseMorale)}. Their wage rises by ${moneyText(Math.round(wage * D.rise))} a race.`,
      `Angers ${who}${much(D.refuse)}. Costs nothing.`,
      `Pleases ${who}${much(D.promiseMorale)}. A bonus of ${moneyText(Math.round(wage * D.promise))}, paid only on a podium.`,
    ];
  },
  shipsArgue: (s, k) => {
    const who = name(s, k.person),
      part = PARTS[String(k.type)] ?? 'part';
    return [
      `Pleases ${who}${much(D.argue)}. The new ${part} goes to their ship.`,
      `Angers ${who}${much(D.argueLost)}. The new ${part} stays where it is.`,
    ];
  },
  bondFallOut: (s, k) => {
    const who = name(s, k.person),
      mechanic = name(s, k.mechanic);
    return [
      `${mechanic} changes ships with the next ship’s mechanic. Both pairs start their bond again.`,
      `Costs ${moneyText(D.dinner)}. Mends ${who} and ${mechanic}’s bond a little.`,
      `Costs nothing. Their bond stays as it is.`,
    ];
  },
  greyComponent: (_s, k) => {
    const part = PARTS[String(k.type)] ?? 'part';
    return [
      `The ${part} on the drawing board gains pace, and is likelier to fail.`,
      `Nothing changes.`,
      `Pleases the press: your drivers’ marketability rises a little.`,
    ];
  },
  sponsorGuest: (_s, k) => [
    `Pleases ${String(k.name)}: ${moneyText(Number(k.balance))} paid. Your second ship’s driver is less consistent next race.`,
    `Angers ${String(k.name)}: their contract runs a race shorter.`,
  ],
  pitWorn: (s, k) => {
    const who = name(s, k.person);
    return [
      `${who} rests: fresh next race, but slower in the stops.`,
      `${who} works on, tired: likelier to slip in the stops next race.`,
      `Costs ${moneyText(D.cover)}. ${who} works fresh next race.`,
    ];
  },
  partSwap: (s, k) => {
    const team = s.teams[Number(k.team)]?.name ?? 'Their team',
      give = PARTS[String(k.give)] ?? 'part',
      take = PARTS[String(k.take)] ?? 'part';
    return [
      `Your first ship gets ${team}’s better ${give}, and they get your better ${take}.`,
      `Nothing changes.`,
    ];
  },
  pressChairman: () => [
    `Pleases your chairman${much(D.press)}. Your marketability falls a little.`,
    `Angers your chairman${much(D.press)}. Your marketability rises a little.`,
    `Nothing changes.`,
  ],
  youngTrial: (s, k) => {
    const g = s.people[Number(k.person)],
      who = g ? nameOf(g) : 'They',
      tier = s.player ? (s.teams[s.player.team]?.tier ?? 0) : 0,
      wage = g ? Math.round(askWage(g, tier) * D.trialWage) : 0;
    return [
      `Signs ${who} as your reserve for two seasons, at ${moneyText(wage)} a race.`,
      `Costs nothing. You learn ${who}’s true stars and potential.`,
      `Nothing changes.`,
    ];
  },
  stormDamage: (_s, k) => [
    `Costs ${moneyText(Number(k.balance))}. The factory is mended at once.`,
    `Costs nothing. The factory works at half pace for ${D.slowDays} days.`,
  ],
  unfitWantsSail: (s, k) => {
    const who = name(s, k.person);
    return [
      `Pleases ${who}: they sail next race, with less stamina, and may be out longer after.`,
      `${who} rests until fit.`,
    ];
  },
  testingExemption: () => [
    `Your works improve faster for ${D.exemptDays} days. Your drivers’ marketability falls a little.`,
    `Nothing changes.`,
  ],
};

/** A person named by a slot. */
function name(s: CareerState, id: Slots[string]): string {
  const g = s.people[Number(id)];
  return g ? nameOf(g) : 'They';
}

/** The hints of a dilemma's answers ('' each, for a dilemma with none). */
export function hints(
  s: CareerState,
  id: string,
  slots: Slots,
  options: number
): string[] {
  const said = HINTS[id]?.(s, slots) ?? [];
  return Array.from({ length: options }, (_, i) => said[i] ?? '');
}

// A trait as the profile reads it: its name, what it does in words (read off its modifier, so the words never drift
// from what it does), when it holds, and whether it helps the team that has the person or hinders it. Pure.

import type { TraitLine } from '../office/people.ts';
import { trait } from './traits.ts';
import { TUNING } from './tuning.ts';
import { WANT_NAMES, statName } from './views-person.ts';

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
const share = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** The trait `id` as its line: what it does, when, and to whose good. */
export function traitLine(id: string): TraitLine {
  const t = trait(id),
    m = t.mod;
  const does: string[] = [];
  let good = 0;
  for (const [k, n] of Object.entries(m.stats ?? {})) {
    does.push(`${signed(n)} ${statName(k)}`);
    good += n;
  }
  if (m.all) {
    does.push(`${signed(m.all)} every stat`);
    good += m.all;
  }
  if (m.morale) {
    does.push(`${signed(m.morale)} morale a race`);
    good += sign(m.morale);
  }
  if (m.marketability) {
    does.push(`${signed(m.marketability)} marketability`);
    good += sign(m.marketability);
  }
  if (m.wage) {
    does.push(`asks ${share(m.wage)} ${m.wage > 0 ? 'more' : 'less'}`);
    good -= sign(m.wage);
  }
  if (m.balance) {
    does.push('brings money each race, by marketability');
    good += sign(m.balance);
  }
  if (m.growth) {
    does.push(
      `drivers under ${TUNING.growth.mentorAge} grow ${share(m.growth)} faster`
    );
    good += sign(m.growth);
  }
  if (m.wants) does.push(`wants ${WANT_NAMES[m.wants].toLowerCase()} first`);
  const effect = does.join(', ');
  return {
    name: t.name,
    effect: effect.charAt(0).toUpperCase() + effect.slice(1),
    lasts: t.lasts ?? 'Always',
    sense: sign(good),
  };
}

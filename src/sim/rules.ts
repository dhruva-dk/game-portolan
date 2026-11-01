// Rotating rule changes, picked by the date so they work offline and the match stays deterministic.
// The date comes in through the setup; the simulation never reads a clock.

export const RULE = { none: 0, nightOnly: 1, harpoonsOnly: 2, doubleStorm: 3, fullShields: 4 } as const;
export type RuleId = keyof typeof RULE;
export const RULE_NAMES: readonly string[] = ['Standard', 'Night Only', 'Harpoons Only', 'Double-Speed Storm', 'Full Shields'];
export const RULE_TEXT: readonly string[] = [
  'The usual rules.',
  'The sun never rises: the whole planet sails by lantern and moonlight.',
  'Every weapon on the water is a harpoon, and every ship starts with one.',
  'The Storm closes twice as fast.',
  'Every ship starts with a full shield.',
];

/** One rule a day, in a fixed rotation: plain days between the special ones. */
const ROTATION: readonly number[] = [RULE.none, RULE.nightOnly, RULE.none, RULE.harpoonsOnly, RULE.none, RULE.doubleStorm, RULE.fullShields];

/** Days since 1970-01-01 for a 'YYYY-MM-DD' date, in whole-number arithmetic. */
export function dayNumber(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`dayNumber: ${date} is not YYYY-MM-DD`);
  let y = Number(m[1]);
  const mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new RangeError(`dayNumber: ${date} is not a date`);
  y -= mo <= 2 ? 1 : 0;
  const era = Math.floor(y / 400), yoe = y - era * 400, mp = (mo + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1, doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The rule in force on a given day. */
export function ruleFor(date: string | undefined): number {
  if (date === undefined) return RULE.none;
  const day = dayNumber(date);
  return ROTATION[((day % ROTATION.length) + ROTATION.length) % ROTATION.length];
}

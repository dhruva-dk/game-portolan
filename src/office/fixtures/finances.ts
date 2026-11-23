// The fixture's finances: a season begun on 1 March 1716, five races sailed by
// 10 May, each paying and costing as the last, and the season's one-off sums
// between them; the balance where the shell has it.

import type { FinancesPaper } from '../papers.ts';

/** The months the season runs through, and their days. */
const MONTHS = [
  ['Mar', 31],
  ['Apr', 30],
  ['May', 31],
  ['Jun', 30],
  ['Jul', 31],
  ['Aug', 31],
  ['Sep', 30],
  ['Oct', 31],
] as const;

/** A day of the season (0: 1 March) as the office dates it. */
function dated(day: number) {
  let d = day;
  for (const [month, days] of MONTHS) {
    if (d < days) return `${d + 1} ${month} 1716`;
    d -= days;
  }
  return `${d + 1} Nov 1716`;
}

/** What a race brings and costs. */
const RACE = [
  ['Sponsors', 42000],
  ['Fish market', 5500],
  ['Pay drivers', 3000],
  ['Wages', -51000],
  ['Headquarters upkeep', -12500],
] as const;

/** The season's lines, oldest first: a race's every fortnight from day 6, and the one-off sums. */
const LINES: readonly {
  day: number;
  kind: string;
  what: string;
  amount: number;
}[] = [
  ...[6, 20, 34, 48, 62].flatMap((day) =>
    RACE.map(([kind, amount]) => ({ day, kind, what: kind, amount }))
  ),
  { day: 12, kind: 'Designs', what: 'Design: Keel, Mark II', amount: -18000 },
  { day: 27, kind: 'Buildings', what: 'Building: Sail loft', amount: -30000 },
  {
    day: 40,
    kind: 'Signing fees',
    what: 'Signing fee: J. Penrose',
    amount: -12000,
  },
  { day: 55, kind: 'Bonuses', what: 'Podium bonus: Holt', amount: -4000 },
  { day: 63, kind: 'Prize money', what: 'Prize: Gorse, 3rd', amount: 9000 },
].sort((a, b) => a.day - b.day);

const NOW = 211000,
  OPENING = NOW - LINES.reduce((t, l) => t + l.amount, 0);

/** The lines with the balance each left. */
const RUN = LINES.reduce<
  { day: number; kind: string; what: string; amount: number; balance: number }[]
>(
  (run, l) => [
    ...run,
    { ...l, balance: (run.at(-1)?.balance ?? OPENING) + l.amount },
  ],
  []
);

const season = new Map<string, number>();
for (const l of RUN) season.set(l.kind, (season.get(l.kind) ?? 0) + l.amount);

const NET = RACE.reduce((t, [, amount]) => t + amount, 0),
  AHEAD = 9;

export const FINANCES: FinancesPaper = {
  balance: NOW,
  floor: -60000,
  race: RACE.map(([label, amount]) => ({ label, amount })),
  net: NET,
  projection: {
    races: AHEAD,
    place: 4,
    prize: 60000,
    end: NOW + AHEAD * NET + 60000,
  },
  season: [...season]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount),
  chart: {
    from: dated(0),
    to: dated(244),
    start: 0,
    today: 70,
    end: 244,
    points: [
      { day: 0, balance: OPENING },
      ...RUN.map((l) => ({ day: l.day, balance: l.balance })),
    ],
  },
  ledger: [...RUN]
    .reverse()
    .map((l) => ({
      date: dated(l.day),
      what: l.what,
      amount: l.amount,
      balance: l.balance,
    })),
};

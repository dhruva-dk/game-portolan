// The fixture's calendar: the season of 2026 as the shell has it on 10 May
// (day 70), two rounds sailed, Brindle the third in 16 days; the Admiralty's
// proposals put twelve days before rounds 4 and 8 and voted on them; the
// contracts' closing days sixty before the season's end. Dates as the career
// writes them; planet names as long as a career's.

import type { CalendarPaper } from '../papers.ts';

/** Today, the season's day. */
const TODAY = 70;

/** Each round's day, date, planet and storm pace. */
const ROUNDS = [
  [48, '18 April 2026', 'Ulmoreth', 1.1],
  [62, '2 May 2026', 'Tharvenna', 0.85],
  [86, '26 May 2026', 'Brindle', 1],
  [100, '9 June 2026', 'Coldharrow', 1.25],
  [114, '23 June 2026', 'Isk', 0.9],
  [128, '7 July 2026', 'Vantermere', 1.05],
  [142, '21 July 2026', 'Pellosandra', 0.8],
  [156, '4 August 2026', 'Orrin', 1.15],
  [170, '18 August 2026', 'Saltmarrow', 0.95],
  [184, '1 September 2026', 'Quenhallow', 1.2],
] as const;

export const CALENDAR: CalendarPaper = {
  championship: 'Third Championship',
  season: 2026,
  chosen: 2,
  races: ROUNDS.map(([day, date, name, storm], i) => ({
    round: i + 1,
    name,
    date,
    when: day < TODAY ? 'sailed' : 'ahead',
    days: day - TODAY,
    storm,
    vote: i === 3 || i === 7,
  })),
  dates: [
    { date: '28 May 2026', what: 'The Admiralty puts a proposal' },
    { date: '9 June 2026', what: 'The Admiralty votes' },
    { date: '3 July 2026', what: 'Contracts ending may be approached' },
    { date: '23 July 2026', what: 'The Admiralty puts a proposal' },
    { date: '4 August 2026', what: 'The Admiralty votes' },
    { date: '1 September 2026', what: 'The season ends' },
    { date: '15 March 2027', what: 'Next season’s first race' },
  ],
};

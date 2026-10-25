// WP27: the results page's lines as plain text (what the page letters), for tests and the progress log.
import type { ResultsModel } from '../../src/ui/results.ts';

export const cardLines = (m: ResultsModel): string[] => [
  `${m.place} of ten: ${m.ending}`, `claimed ${m.claimed}, sank ${m.sank}, banked ${m.bank}, home ${m.treasure}`,
  ...m.timeline.map((l) => `${l.clock} ${l.text}`), ...m.fates.map((f) => `${f.place}. ${f.name}: ${f.fate}`),
  `${m.rank.wind}: ${m.rank.before} to ${m.rank.after}${m.rank.promoted ? ' (raised)' : ''}`,
];

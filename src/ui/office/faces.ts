// People as the office's pages draw them: the jacket a face wears (their team's
// dye, or none), who they are as the kit's person takes them, and how content
// they are as a gauge.

import type { Face } from '../../office/career.ts';
import type { Dyed } from '../../office/papers.ts';
import type { Range } from '../../office/people.ts';
import { gauge, meter } from '../chartroom/data.ts';
import type { Who } from '../chartroom/person.ts';
import { TONE } from '../chartroom/tokens.ts';
import type { Glyph } from '../glyphs.ts';
import type { Jacket } from '../gull.ts';
import { el, type Kid } from '../kit/part.ts';

type Dyes = Dyed<unknown>['dyes'];

/** A free agent's jacket: no team's. */
const PLAIN: Jacket = [TONE.label, TONE.sunk];

/** The jacket a face wears: their team's dye as the page shows it. */
export const jacketOf = (face: Face | null, dyes: Dyes): Jacket =>
  (face?.colours && dyes[face.colours.dye % Math.max(1, dyes.length)]) || PLAIN;

/** A person of a view, as the kit's person takes them. */
export const whoOf = (
  p: {
    face: Face | null;
    title: string;
    stars?: Range | null;
    potential?: Range | null;
  },
  dyes: Dyes,
  said?: Kid,
  badge?: Glyph | null
): Who => ({
  jacket: jacketOf(p.face, dyes),
  name: p.title.replace(' (you)', ''),
  said,
  stars: p.stars ?? null,
  potential: p.potential ?? null,
  badge,
});

/** Below this they will ask to leave. */
const UNHAPPY = 25;

/** How content, as the wash its meter is filled in: unhappy harm, middling warn. */
const moraleWash = (m: number) =>
  m < UNHAPPY ? 'harm' : m < 50 ? 'warn' : 'good';

/** Morale (0…100) as a gauge; unhappy in the harm ink. */
export const morale = (m: number | null) =>
  m === null
    ? null
    : gauge('Morale', String(m), meter(m / 100, moraleWash(m)), m < UNHAPPY);

/** Morale as a table's cell: unhappy in the harm ink. */
export const moraleCell = (m: number | null) =>
  m === null ? '' : el('span', m < UNHAPPY ? 'cr-harm' : '', String(m));

// Writes the fixture desk's headquarters and ship (src/office/fixtures/yard.ts)
// from a founded career, its design centre's next level under way, so the
// debug page's ?screen=hq and ?screen=ship show what a career's would.
//   node tools/fixture-yard.ts

import { writeFileSync } from 'node:fs';
import { apply, start } from '../src/career/career.ts';
import { hqPaper, shipPaper } from '../src/career/papers.ts';
import { FOUND } from '../tests/career-kit.ts';

const r = apply(start(), FOUND);
if (!r.ok) throw new Error(r.reason.sentence);
let s = r.state;
const built = apply(s, { kind: 'Build', building: 'designCentre' });
if (built.ok) s = built.state;

const file = 'src/office/fixtures/yard.ts';
writeFileSync(
  file,
  `// The headquarters and the ship as a founded career has them (written by tools/fixture-yard.ts).

import type { HqPaper, ShipPaper } from '../papers.ts';

export const HQ: HqPaper = ${JSON.stringify(hqPaper(s), null, 2)};

export const SHIP: ShipPaper = ${JSON.stringify(shipPaper(s, 'sails', []), null, 2)};
`
);
console.log('wrote', file);

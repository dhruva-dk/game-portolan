// Who holds the sea round her, for the minimap: sampled only over the disc (a SIDE × SIDE grid round her, not the
// planet's 393 216 cells), taken afresh only when the sea's holders have changed or she has sailed a sample's width,
// at most a few times a second; between samplings the grid is laid onto the disc where she now is (disc.ts laid).
// Each sample is read the surface's way out from her (disc.ts outInto).
//
// Each holder's water as the sea shows it (water/claims.ts): a flat tint in her colour, hers the deeper, inside a hard
// line of it along its edge.

import { linearToSrgb } from '../colour';
import type { Sea } from '../snapshot';
import { cellOf } from '../world/cells';
import { distance } from '../world/sphere';
import { outInto, type Lay, type LayOnto, type Mutable } from './disc';

/** Samples across the grid. */
const SIDE = 176;
/** How far the edge is looked for round a sample, in samples, and in how many directions. */
const REACH = 2, DIRS = 8;
const OFFSETS = Array.from({ length: DIRS }, (_, i) => {
  const a = (i * Math.PI * 2) / DIRS + 0.4;
  return [Math.round(Math.cos(a) * REACH), Math.round(Math.sin(a) * REACH)] as const;
});
/** The tint's strength for hers and another's, and the line's. */
const STRENGTH = { mine: 0.5, theirs: 0.32, line: 1 } as const;
const BLACK = [0, 0, 0];
/** Least seconds between samplings. */
const EVERY = 0.25;

/** A linear colour channel as sRGB, 0…255. */
const srgb = (v: number) => Math.round(255 * linearToSrgb(v));

/** The held water's plate, `span` metres from her to its edge. */
export function createHeld(span: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIDE;
  const g = canvas.getContext('2d')!;
  const image = g.createImageData(SIDE, SIDE);
  const ids = new Uint8Array(SIDE * SIDE);
  /** Where the grid was sampled, and its way right and up there. */
  const at: Mutable = [0, 0, 1], right: Mutable = [1, 0, 0], ahead: Mutable = [0, 1, 0], spot = { at, right, ahead };
  let sampled = false, seq = -1, since = Infinity, any = false;
  const stats = { samplings: 0, ms: 0 };

  /** The holders' inks as sRGB, for the colours they were made from. */
  let inks: number[][] = [], from: Sea['colours'] | null = null;
  const q: Mutable = [0, 0, 0];

  function sample(l: Lay, sea: Sea, me: number) {
    const t0 = performance.now();
    for (let m = 0; m < 3; m++) {
      at[m] = l.at[m];
      right[m] = l.right[m];
      ahead[m] = l.ahead[m];
    }
    sampled = true;
    if (sea.colours !== from) [inks, from] = [sea.colours.map((c) => c.map(srgb)), sea.colours];
    const owner = sea.owner, reach = span * span;
    any = false;
    for (let j = 0; j < SIDE; j++) {
      const y = (1 - ((j + 0.5) / SIDE) * 2) * span;
      for (let i = 0; i < SIDE; i++) {
        const x = (((i + 0.5) / SIDE) * 2 - 1) * span, k = j * SIDE + i, rr = x * x + y * y;
        // the corners past the disc's reach are never shown
        if (rr > reach) {
          ids[k] = 0;
          continue;
        }
        ids[k] = owner[cellOf(outInto(q, spot, x, y))];
        any ||= ids[k] !== 0;
      }
    }
    if (any) paint(me);
    stats.samplings++;
    stats.ms += performance.now() - t0;
  }

  /** The tint and lines from the holders sampled: a sample is on the line if any round it is another's. */
  function paint(me: number) {
    const d = image.data;
    for (let j = 0; j < SIDE; j++) {
      for (let i = 0; i < SIDE; i++) {
        const k = j * SIDE + i, a = k * 4, id = ids[k];
        if (id === 0) {
          d[a + 3] = 0;
          continue;
        }
        let edge = false;
        for (let o = 0; o < DIRS && !edge; o++) {
          const u = i + OFFSETS[o][0], v = j + OFFSETS[o][1];
          // past the grid's edge counts as more of the same, or its rim would read as a border
          edge = u >= 0 && v >= 0 && u < SIDE && v < SIDE && ids[v * SIDE + u] !== id;
        }
        const ink = inks[id - 1] ?? BLACK;
        d[a] = ink[0]; d[a + 1] = ink[1]; d[a + 2] = ink[2];
        d[a + 3] = 255 * (edge ? STRENGTH.line : id === me ? STRENGTH.mine : STRENGTH.theirs);
      }
    }
    g.putImageData(image, 0, 0);
  }

  return {
    stats,
    /** Lays the held water round her onto `ctx` (the disc as `l` lays it), sampled afresh if it is due; `dt` seconds
     *  since the last; `me` her holder's number (her id + 1). */
    draw(ctx: CanvasRenderingContext2D, l: Lay, sea: Sea, me: number, dt: number, transform: LayOnto) {
      since += dt;
      const last = sea.changes.length ? sea.changes[sea.changes.length - 1].seq : seq;
      if (since >= EVERY && (last !== seq || !sampled || distance(at, l.at) > span / SIDE)) {
        sample(l, sea, me);
        seq = last;
        since = 0;
      }
      if (!any) return;
      ctx.save();
      transform(at, right, ahead, SIDE, SIDE, (2 * span) / SIDE);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    },
  };
}

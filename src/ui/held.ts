// Who holds the sea round her, for the minimap: sampled only over the disc (a SIDE × SIDE grid round her, not the
// planet's 393 216 cells), taken afresh only when the sea's holders have changed or she has sailed a sample's width,
// at most a few times a second; between samplings the grid is laid onto the disc where she now is (disc.ts laid).
//
// Each holder's water a wash in her colour, hers the deeper, the pigment pooled where the wash dried at its edge and a
// faint bleed past it, granulated by the cell under it so the grain stays on the sea as she sails (0117's
// screens/wash.ts, the first Portolan's chart wash).

import type { Sea } from '../snapshot';
import { cellOf } from '../world/cells';
import { R, type Vec3 } from '../world/sphere';
import { out, type Lay } from './disc';

/** Samples across the grid. */
const SIDE = 112;
/** How far the edge is looked for round a sample, in samples, and in how many directions. */
const REACH = 2, DIRS = 8;
const OFFSETS = Array.from({ length: DIRS }, (_, i) => {
  const a = (i * Math.PI * 2) / DIRS + 0.4;
  return [Math.round(Math.cos(a) * REACH), Math.round(Math.sin(a) * REACH)] as const;
});
/** The wash's strength for hers and another's, how much the edge deepens it, and how far the bleed reaches. */
const STRENGTH = { mine: 0.6, theirs: 0.36, pooled: 1.4, bleed: 0.3 } as const;
/** Least seconds between samplings. */
const EVERY = 0.25;

/** A linear colour channel as sRGB, 0…255. */
const srgb = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));

/** A steady grain, 0.82…1.18, for a cell. */
const grainOf = (c: number) => {
  const s = Math.sin(c * 12.9898) * 43758.5453;
  return 0.82 + 0.36 * (s - Math.floor(s));
};

/** The held water's plate, `span` metres from her to its edge. */
export function createHeld(span: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIDE;
  const g = canvas.getContext('2d')!;
  const image = g.createImageData(SIDE, SIDE);
  const ids = new Uint8Array(SIDE * SIDE), cells = new Int32Array(SIDE * SIDE);
  let at: Vec3 | null = null, e: Vec3 = [1, 0, 0], n: Vec3 = [0, 1, 0], seq = -1, since = Infinity, any = false;
  const stats = { samplings: 0, ms: 0 };

  function sample(l: Lay, sea: Sea, me: number) {
    const t0 = performance.now();
    [at, e, n] = [l.at, l.right, l.ahead];
    const owner = sea.owner, inks = sea.colours.map((c) => c.map(srgb));
    any = false;
    for (let j = 0; j < SIDE; j++) {
      const y = (1 - ((j + 0.5) / SIDE) * 2) * span;
      for (let i = 0; i < SIDE; i++) {
        const x = (((i + 0.5) / SIDE) * 2 - 1) * span, k = j * SIDE + i;
        const c = cellOf(out(at, e, n, x, y));
        cells[k] = c;
        ids[k] = owner[c];
        any ||= ids[k] !== 0;
      }
    }
    const d = image.data;
    for (let j = 0; j < SIDE; j++) {
      for (let i = 0; i < SIDE; i++) {
        const k = j * SIDE + i, a = k * 4, id = ids[k];
        let same = 0, near = 0, r = 0, gr = 0, b = 0;
        for (const [dx, dy] of OFFSETS) {
          const u = i + dx, v = j + dy;
          // past the grid's edge counts as more of the same, or its rim would read as a border
          const o = u < 0 || v < 0 || u >= SIDE || v >= SIDE ? id : ids[v * SIDE + u];
          if (o === id) same++;
          if (o !== 0 && id === 0) {
            const ink = inks[o - 1] ?? [0, 0, 0];
            r += ink[0]; gr += ink[1]; b += ink[2];
            near++;
          }
        }
        if (id !== 0) {
          const ink = inks[id - 1] ?? [0, 0, 0], edge = Math.pow(1 - same / DIRS, 1.4);
          [d[a], d[a + 1], d[a + 2]] = ink;
          d[a + 3] = 255 * Math.min(1, (id === me ? STRENGTH.mine : STRENGTH.theirs) * (1 + STRENGTH.pooled * edge) * grainOf(cells[k]));
        } else if (near > 0) {
          [d[a], d[a + 1], d[a + 2]] = [r / near, gr / near, b / near];
          d[a + 3] = 255 * Math.min(1, ((STRENGTH.bleed * near) / DIRS) * grainOf(cells[k]));
        } else d[a + 3] = 0;
      }
    }
    g.putImageData(image, 0, 0);
    stats.samplings++;
    stats.ms += performance.now() - t0;
  }

  return {
    stats,
    /** Lays the held water round her onto `ctx` (the disc as `l` lays it), sampled afresh if it is due; `dt` seconds
     *  since the last; `me` her holder's number (her id + 1). */
    draw(ctx: CanvasRenderingContext2D, l: Lay, sea: Sea, me: number, dt: number, transform: (o: Vec3, e: Vec3, n: Vec3, w: number, h: number, m: number) => void) {
      since += dt;
      const last = sea.changes.length ? sea.changes[sea.changes.length - 1].seq : seq;
      const moved = at ? Math.acos(Math.min(1, at[0] * l.at[0] + at[1] * l.at[1] + at[2] * l.at[2])) * R : Infinity;
      if (since >= EVERY && (last !== seq || moved > span / SIDE || !at)) {
        sample(l, sea, me);
        seq = last;
        since = 0;
      }
      if (!any || !at) return;
      ctx.save();
      transform(at, e, n, SIDE, SIDE, (2 * span) / SIDE);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    },
  };
}

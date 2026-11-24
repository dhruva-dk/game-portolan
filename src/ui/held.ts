import { linearToSrgb } from '../color.ts';
import type { Sea } from '../snapshot.ts';
import { cellOf } from '../world/cells.ts';
import { distance } from '../world/sphere.ts';
import { outInto, type Lay, type LayOnto, type Mutable } from './disc.ts';

const SIDE = 176;
const REACH = 2,
  DIRS = 8;
const OFFSETS = Array.from({ length: DIRS }, (_, i) => {
  const a = (i * Math.PI * 2) / DIRS + 0.4;
  return [
    Math.round(Math.cos(a) * REACH),
    Math.round(Math.sin(a) * REACH),
  ] as const;
});
const STRENGTH = { mine: 0.5, theirs: 0.32, line: 1 } as const;
const BLACK = [0, 0, 0];
const EVERY = 0.25;

const srgb = (v: number) => Math.round(255 * linearToSrgb(v));

export function createHeld(span: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIDE;
  const g = canvas.getContext('2d')!;
  const image = g.createImageData(SIDE, SIDE);
  const ids = new Uint8Array(SIDE * SIDE);
  const at: Mutable = [0, 0, 1],
    right: Mutable = [1, 0, 0],
    ahead: Mutable = [0, 1, 0],
    spot = { at, right, ahead };
  let sampled = false,
    seq = -1,
    since = Infinity,
    any = false;
  const stats = { samplings: 0, ms: 0 };

  let inks: number[][] = [],
    from: Sea['colors'] | null = null;
  const q: Mutable = [0, 0, 0];

  function sample(l: Lay, sea: Sea, me: number) {
    const t0 = performance.now();
    for (let m = 0; m < 3; m++) {
      at[m] = l.at[m];
      right[m] = l.right[m];
      ahead[m] = l.ahead[m];
    }
    sampled = true;
    if (sea.colors !== from)
      [inks, from] = [sea.colors.map((c) => c.map(srgb)), sea.colors];
    const owner = sea.owner,
      reach = span * span;
    any = false;
    for (let j = 0; j < SIDE; j++) {
      const y = (1 - ((j + 0.5) / SIDE) * 2) * span;
      for (let i = 0; i < SIDE; i++) {
        const x = (((i + 0.5) / SIDE) * 2 - 1) * span,
          k = j * SIDE + i,
          rr = x * x + y * y;
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

  function paint(me: number) {
    const d = image.data;
    for (let j = 0; j < SIDE; j++) {
      for (let i = 0; i < SIDE; i++) {
        const k = j * SIDE + i,
          a = k * 4,
          id = ids[k];
        if (id === 0) {
          d[a + 3] = 0;
          continue;
        }
        let edge = false;
        for (let o = 0; o < DIRS && !edge; o++) {
          const u = i + OFFSETS[o][0],
            v = j + OFFSETS[o][1];
          edge =
            u >= 0 &&
            v >= 0 &&
            u < SIDE &&
            v < SIDE &&
            ids[v * SIDE + u] !== id;
        }
        const ink = inks[id - 1] ?? BLACK;
        d[a] = ink[0];
        d[a + 1] = ink[1];
        d[a + 2] = ink[2];
        d[a + 3] =
          255 *
          (edge ? STRENGTH.line : id === me ? STRENGTH.mine : STRENGTH.theirs);
      }
    }
    g.putImageData(image, 0, 0);
  }

  return {
    stats,
    draw(
      ctx: CanvasRenderingContext2D,
      l: Lay,
      sea: Sea,
      me: number,
      dt: number,
      transform: LayOnto
    ) {
      since += dt;
      const last = sea.changes.length
        ? sea.changes[sea.changes.length - 1].seq
        : seq;
      if (
        since >= EVERY &&
        (last !== seq || !sampled || distance(at, l.at) > span / SIDE)
      ) {
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

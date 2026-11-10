// Held water as a watercolour wash, as the first Portolan's chart laid it: granulated, with the pigment pooled where the
// wash dried at its edge, and a faint bleed out across the fibres of the paper. Works on a small grid that is then
// stretched soft over the chart.
import { rng } from '../chart/noise.ts';

export type Rgb = readonly [number, number, number];

/** How far round a texel it looks for its edge, in texels, and in how many directions. */
const REACH = 2, DIRS = 8;
const OFFSETS = Array.from({ length: DIRS }, (_, i) => {
  const a = (i * Math.PI * 2) / DIRS + 0.4;
  return [Math.round(Math.cos(a) * REACH), Math.round(Math.sin(a) * REACH)] as const;
});
/** The wash's strength for one's own water and another's, how much the edge deepens it, and how far the bleed reaches. */
const WASH = { mine: 0.62, theirs: 0.4, pooled: 1.35, bleed: 0.34 } as const;

/** Paper's grain for a grid: the same each time, so a wash does not crawl as it is redrawn. */
function grainOf(n: number): Float32Array {
  const r = rng(0x5ea + n), g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = 0.78 + 0.44 * r();
  return g;
}

const GRAINS = new Map<number, Float32Array>();

/** Fills `out` (RGBA, n × n) from `ids` (0 for nothing, else 1 + a captain), with `colour` a captain's pigment. */
export function paintWash(out: Uint8ClampedArray, ids: Uint8Array, n: number, me: number, colour: (id: number) => Rgb): void {
  let grain = GRAINS.get(n);
  if (!grain) GRAINS.set(n, grain = grainOf(n));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x, a = i * 4, id = ids[i];
      let same = 0, near = 0, r = 0, g = 0, b = 0;
      for (const [dx, dy] of OFFSETS) {
        const u = x + dx, v = y + dy;
        // past the grid's edge counts as more of the same, or the rim of the chart would read as a shore
        const o = u < 0 || v < 0 || u >= n || v >= n ? id : ids[v * n + u];
        if (o === id) same++;
        if (o !== 0 && id === 0) {
          const c = colour(o);
          r += c[0]; g += c[1]; b += c[2];
          near++;
        }
      }
      if (id !== 0) {
        const c = colour(id), edge = Math.pow(1 - same / DIRS, 1.4);
        out[a] = c[0]; out[a + 1] = c[1]; out[a + 2] = c[2];
        out[a + 3] = 255 * Math.min(1, (id === me ? WASH.mine : WASH.theirs) * (1 + WASH.pooled * edge) * grain[i]);
      } else if (near > 0) {
        out[a] = r / near; out[a + 1] = g / near; out[a + 2] = b / near;
        out[a + 3] = 255 * Math.min(1, (WASH.bleed * near / DIRS) * grain[i]);
      } else {
        out[a + 3] = 0;
      }
    }
  }
}

/** Marks in `ids` (n × n, y up) the squares of half-width `half` round the points `pts` (x, y in -1…1), as `id`. */
export function rasterHeld(ids: Uint8Array, n: number, pts: ArrayLike<number>, half: number, id: number): void {
  ids.fill(0);
  // a whole texel over the square's own half-width, so squares laid edge to edge leave no seam
  const reach = half * 0.5 * (n - 1) + 1;
  for (let i = 0; i < pts.length; i += 2) {
    const cx = (pts[i] + 1) * 0.5 * (n - 1), cy = (1 - (pts[i + 1] + 1) * 0.5) * (n - 1);
    const y1 = Math.min(n - 1, Math.ceil(cy + reach)), x1 = Math.min(n - 1, Math.ceil(cx + reach));
    for (let y = Math.max(0, Math.floor(cy - reach)); y <= y1; y++) {
      for (let x = Math.max(0, Math.floor(cx - reach)); x <= x1; x++) ids[y * n + x] = id;
    }
  }
}

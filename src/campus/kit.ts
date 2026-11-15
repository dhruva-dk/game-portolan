// The parts a building is put together from (buildings.ts), in its own metres: x along the coast, y up from its
// terrace, z out to sea. Each part is flat-faced (every face its own normal, as the toon light wants: sky/light.ts) and
// of one tone (material.ts TONE); a building is the list of its parts' triangles, and where its flags fly and its smoke
// rises.

/** The tones a part can be (material.ts holds their colours, in this order). */
export const TONE = {
  stone: 0, plaster: 1, timber: 2, deck: 3, tile: 4, slate: 5, brick: 6, copper: 7, iron: 8, glass: 9, tank: 10,
  canvas: 11, cream: 12, door: 13, first: 14, second: 15, gilt: 16,
} as const;
export type Tone = (typeof TONE)[keyof typeof TONE];

type P = readonly [number, number, number];

/** A building's form: its triangles (positions and face normals, xyz each, and a tone each vertex), where flags fly
 *  (each the top of its pole) and where smoke rises from, all in its own metres; and how tall it stands. */
export interface Form {
  position: number[]; normal: number[]; tone: number[];
  flags: P[]; smoke: P[];
  top: number;
}

export function createKit() {
  const f: Form = { position: [], normal: [], tone: [], flags: [], smoke: [], top: 0 };
  const tri = (a: P, b: P, c: P, tone: Tone) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    for (const p of [a, b, c]) {
      f.position.push(...p);
      f.normal.push(n[0] / l, n[1] / l, n[2] / l);
      f.tone.push(tone);
      f.top = Math.max(f.top, p[1]);
    }
  };
  /** A flat quad, its corners counter-clockwise seen from the side it faces. */
  const quad = (a: P, b: P, c: P, d: P, tone: Tone) => {
    tri(a, b, c, tone);
    tri(a, c, d, tone);
  };
  const kit = {
    tri, quad, form: f,
    /** A box from corner to corner, its bottom left open (it stands on something). */
    box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tone: Tone, bottom = false) {
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], tone);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], tone);
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], tone);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], tone);
      quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], tone);
      if (bottom) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], tone);
    },
    /** A pitched roof over x0…x1 by z0…z1, its eaves at `eaves` and its ridge at `ridge`, the ridge running along x
     *  (or along z), `over` past the walls all round; its gable ends in `ends`. */
    gable(x0: number, z0: number, x1: number, z1: number, eaves: number, ridge: number, tone: Tone, ends: Tone, along: 'x' | 'z' = 'x', over = 0.5) {
      const [a0, a1, b0, b1] = [x0 - over, x1 + over, z0 - over, z1 + over];
      if (along === 'x') {
        const m = (z0 + z1) / 2, drop = ((eaves - ridge) * over) / ((z1 - z0) / 2);
        quad([a0, eaves + drop, b1], [a1, eaves + drop, b1], [a1, ridge, m], [a0, ridge, m], tone);
        quad([a1, eaves + drop, b0], [a0, eaves + drop, b0], [a0, ridge, m], [a1, ridge, m], tone);
        tri([x0, eaves, z1], [x0, ridge, m], [x0, eaves, z0], ends);
        tri([x1, eaves, z0], [x1, ridge, m], [x1, eaves, z1], ends);
      } else {
        const m = (x0 + x1) / 2, drop = ((eaves - ridge) * over) / ((x1 - x0) / 2);
        quad([a1, eaves + drop, b1], [a1, eaves + drop, b0], [m, ridge, b0], [m, ridge, b1], tone);
        quad([a0, eaves + drop, b0], [a0, eaves + drop, b1], [m, ridge, b1], [m, ridge, b0], tone);
        tri([x0, eaves, z1], [x1, eaves, z1], [m, ridge, z1], ends);
        tri([x1, eaves, z0], [x0, eaves, z0], [m, ridge, z0], ends);
      }
    },
    /** A hipped roof over x0…x1 by z0…z1 rising from `eaves` to `peak` (a pyramid on a square), `over` past the walls. */
    hip(x0: number, z0: number, x1: number, z1: number, eaves: number, peak: number, tone: Tone, over = 0.5) {
      const [a0, a1, b0, b1] = [x0 - over, x1 + over, z0 - over, z1 + over];
      const w = a1 - a0, d = b1 - b0, r = Math.min(w, d) / 2, mx = (a0 + a1) / 2, mz = (b0 + b1) / 2;
      const e = eaves - ((peak - eaves) * over) / Math.max(r - over, 0.1);
      const p0: P = w >= d ? [a0 + r, peak, mz] : [mx, peak, b0 + r], p1: P = w >= d ? [a1 - r, peak, mz] : [mx, peak, b1 - r];
      quad([a0, e, b1], [a1, e, b1], p1, w >= d ? p0 : p1, tone);
      if (w >= d) {
        quad([a1, e, b0], [a0, e, b0], p0, p1, tone);
        tri([a1, e, b1], [a1, e, b0], p1, tone);
        tri([a0, e, b0], [a0, e, b1], p0, tone);
      } else {
        tri([a1, e, b0], [a0, e, b0], p0, tone);
        quad([a1, e, b1], [a1, e, b0], p0, p1, tone);
        quad([a0, e, b0], [a0, e, b1], p1, p0, tone);
      }
    },
    /** An upright drum round (cx, cz), radius r (to r1 at its top), from y0 to y1, closed on top. */
    drum(cx: number, cz: number, r: number, y0: number, y1: number, tone: Tone, sides = 12, r1 = r) {
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * 2 * Math.PI, b = ((i + 1) / sides) * 2 * Math.PI;
        const [ca, sa, cb, sb] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)];
        quad([cx + ca * r, y0, cz + sa * r], [cx + ca * r1, y1, cz + sa * r1], [cx + cb * r1, y1, cz + sb * r1], [cx + cb * r, y0, cz + sb * r], tone);
        tri([cx, y1, cz], [cx + cb * r1, y1, cz + sb * r1], [cx + ca * r1, y1, cz + sa * r1], tone);
      }
    },
    /** A cone round (cx, cz), radius r at y0, to its point at y1. */
    cone(cx: number, cz: number, r: number, y0: number, y1: number, tone: Tone, sides = 12) {
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * 2 * Math.PI, b = ((i + 1) / sides) * 2 * Math.PI;
        tri([cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r], [cx, y1, cz], [cx + Math.cos(b) * r, y0, cz + Math.sin(b) * r], tone);
      }
    },
    /** A dome round (cx, cz), radius r, its foot at y0, as tall as `rise` (r: a half sphere). */
    dome(cx: number, cz: number, r: number, y0: number, tone: Tone, rise = r, sides = 12) {
      const rings = 4;
      for (let j = 0; j < rings; j++) {
        const t0 = (j / rings) * (Math.PI / 2), t1 = ((j + 1) / rings) * (Math.PI / 2);
        kit.drum(cx, cz, r * Math.cos(t0), y0 + rise * Math.sin(t0), y0 + rise * Math.sin(t1), tone, sides, r * Math.cos(t1));
      }
    },
    /** A row of `n` panes (or doors) on the wall facing +z (side 1) or −z (−1) at z, spread over x0…x1, each w wide
     *  from y0 to y1, standing a little proud of the wall. */
    panesX(x0: number, x1: number, z: number, side: 1 | -1, y0: number, y1: number, n: number, w: number, tone: Tone = TONE.glass) {
      for (let i = 0; i < n; i++) {
        const c = x0 + ((i + 0.5) * (x1 - x0)) / n;
        kit.box(c - w / 2, y0, side > 0 ? z : z - 0.08, c + w / 2, y1, side > 0 ? z + 0.08 : z, tone);
      }
    },
    /** The same on the wall facing +x (side 1) or −x (−1) at x, spread over z0…z1. */
    panesZ(z0: number, z1: number, x: number, side: 1 | -1, y0: number, y1: number, n: number, w: number, tone: Tone = TONE.glass) {
      for (let i = 0; i < n; i++) {
        const c = z0 + ((i + 0.5) * (z1 - z0)) / n;
        kit.box(side > 0 ? x : x - 0.08, y0, c - w / 2, side > 0 ? x + 0.08 : x, y1, c + w / 2, tone);
      }
    },
    /** A pole from y0 to y1 at (x, z), `w` thick. */
    pole(x: number, z: number, y0: number, y1: number, tone: Tone = TONE.timber, w = 0.25) {
      kit.box(x - w / 2, y0, z - w / 2, x + w / 2, y1, z + w / 2, tone);
    },
    /** A flagpole standing on y0 at (x, z), as tall as `h`, the crew's flag flying from its top (flags.ts), a gilt knob
     *  over it. */
    flag(x: number, z: number, y0: number, h: number) {
      kit.pole(x, z, y0, y0 + h, TONE.iron, 0.18);
      kit.box(x - 0.2, y0 + h, z - 0.2, x + 0.2, y0 + h + 0.4, z + 0.2, TONE.gilt);
      f.flags.push([x, y0 + h - 0.1, z]);
    },
    /** Where smoke rises from: a chimney's mouth. */
    smoke(x: number, y: number, z: number) {
      f.smoke.push([x, y, z]);
    },
    /** A railing round x0…x1 by z0…z1 on a floor at y: posts and a rail, open on the sides `open` lists. */
    rail(x0: number, z0: number, x1: number, z1: number, y: number, tone: Tone = TONE.timber, open: readonly ('x0' | 'x1' | 'z0' | 'z1')[] = []) {
      const h = 1, t = 0.12;
      const run = (a: P, b: P) => {
        const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 2.5));
        for (let i = 0; i <= n; i++) {
          const x = a[0] + ((b[0] - a[0]) * i) / n, z = a[2] + ((b[2] - a[2]) * i) / n;
          kit.pole(x, z, y, y + h, tone, t);
        }
        kit.box(Math.min(a[0], b[0]) - t, y + h - t, Math.min(a[2], b[2]) - t, Math.max(a[0], b[0]) + t, y + h, Math.max(a[2], b[2]) + t, tone);
      };
      if (!open.includes('z1')) run([x0, y, z1], [x1, y, z1]);
      if (!open.includes('z0')) run([x0, y, z0], [x1, y, z0]);
      if (!open.includes('x0')) run([x0, y, z0], [x0, y, z1]);
      if (!open.includes('x1')) run([x1, y, z0], [x1, y, z1]);
    },
  };
  return kit;
}

export type Kit = ReturnType<typeof createKit>;

/** The bounds of a form's triangles: least and most x, y, z. */
export function boundsOf(f: Form): { min: P; max: P } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < f.position.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], f.position[i + k]);
    max[k] = Math.max(max[k], f.position[i + k]);
  }
  return { min, max };
}

// The chart's ships: a small inked silhouette of each form seen from above (bow up, so a sprite turned to the ship's
// heading shows which way it sails) and from abeam, bow to the right (for the lookout marks and the results timeline),
// drawn from the shipwright's own hull lines and rig at one scale (a galleon stays bigger than a pinnace) and
// rasterised once into one atlas. Channels as the emblems': r = hull (the captain's first pigment), g = canvas (the
// second), b = ink, a = coverage. Columns are FORM_NAMES; row 0 (bottom) the plan, row 1 the profile.
import * as THREE from 'three';
import { FORM_NAMES, type FormName } from './forms.ts';
import { Rig } from './rig.ts';
import { atlasTexture, circle, cover, edge, path, poly, seg, union, type SDF } from './emblems.ts';

export type SilhouetteView = 'plan' | 'profile';
export const SILHOUETTE_VIEWS: readonly SilhouetteView[] = ['plan', 'profile'];
export const SILHOUETTE_CELL = 128;
const N = 40, CULL = 0.4;

interface Drawing { hull: SDF; canvas: SDF; lines: SDF; box: readonly number[] }

function drawing(form: FormName, view: SilhouetteView): Drawing {
  const rig = new Rig(form), f = rig.hull, s = f.s, hull: number[] = [], lines: SDF[] = [], canvas: SDF[] = [], ext: number[] = [];
  const us = Array.from({ length: N + 1 }, (_, i) => i / N), o = new THREE.Vector3(), M = new THREE.Matrix4();
  const P = view === 'plan' ? (p: THREE.Vector3) => [p.x, p.z] : (p: THREE.Vector3) => [p.z, p.y];
  if (view === 'plan') {
    // the stern squared off as on the old charts, against the pointed bow, so the heading reads at a glance
    const st = rig.state('plain', 2.2, 0.8), wide = 0.6 * Math.max(...us.map((u) => f.half(u, Math.min(s.maxY, f.rail(u)))));
    const at = (u: number, side: number) => { const y = Math.min(s.maxY, f.rail(u)); return [side * Math.max(f.half(u, y), wide * Math.min(1, Math.max(0, (0.25 - u) / 0.15))), f.z(u, y)]; };
    for (const u of us) hull.push(...at(u, 1));
    for (const u of [...us].reverse()) hull.push(...at(u, -1));
    // the castles' breaks across the deck, the masts, the yards as braced and the sails' belly
    for (const d of s.decks) for (const u of [d.from, d.to]) if (u > 0.01 && u < 0.99) { const [x, z] = at(u, 1); lines.push(seg(-x, z, x, z, 0.03)); }
    for (const m of rig.masts) lines.push(circle(m.foot.x, m.foot.z + m.sections[0].zOff, Math.max(0.08, m.spec.r * 1.5)));
    rig.yards.forEach((y, k) => {
      rig.yardMatrix(st, k, M);
      const a = new THREE.Vector3(y.a, 0, 0).applyMatrix4(M), b = new THREE.Vector3(y.b, 0, 0).applyMatrix4(M);
      lines.push(seg(a.x, a.z, b.x, b.z, 0.04));
      ext.push(a.x, a.z, b.x, b.z);
    });
    rig.sails.forEach((_, i) => canvas.push(path(us.filter((_, k) => k % 5 === 0).flatMap((u) => P(rig.sailPoint(st, i, u, 0.55, 0, o))), 0.1)));
  } else {
    const st = rig.state('plain', Math.PI, 0.5);
    for (const u of us) hull.push(f.z(u, f.rail(u)), f.rail(u));
    for (let k = 0; k <= 12; k++) { const y = f.railFwd + ((f.yk - f.railFwd) * k) / 12; hull.push(f.zFwd(y), y); }
    for (let k = 0; k <= 12; k++) { const y = f.yk + ((f.railAft - f.yk) * k) / 12; hull.push(f.zAft(y), y); }
    const wale = s.wales[s.wales.length - 1];
    lines.push(path(us.filter((u) => u > 0.02 && u < 0.98).flatMap((u) => { const y = f.strakeY(u, wale); return [f.z(u, y), y]; }), 0.025));
    for (const m of rig.masts) for (const sec of m.sections) {
      const a = m.foot.clone().addScaledVector(m.axis, (sec.from - m.foot.y) / m.axis.y).addScaledVector(m.fwd, sec.zOff);
      const b = m.foot.clone().addScaledVector(m.axis, (sec.to - m.foot.y) / m.axis.y).addScaledVector(m.fwd, sec.zOff);
      lines.push(seg(a.z, a.y, b.z, b.y, Math.max(0.04, sec.r0), Math.max(0.03, sec.r1)));
      ext.push(b.z, b.y);
    }
    rig.sails.forEach((sl, i) => {
      // square sails turned about their masts to face the viewer, foreshortened as a draughtsman draws them; lateens as they hang
      const square = rig.yards[sl.yard].kind !== 'lateen', Mi = rig.yardMatrix(st, sl.yard, M).clone().invert(), c = new THREE.Vector3().setFromMatrixPosition(M);
      const pt = (u: number, v: number) => { const p = rig.sailPoint(st, i, u, v, 0, o); if (!square) return P(p); p.applyMatrix4(Mi); return [c.z + 0.55 * p.x, c.y + p.y]; };
      const rim: number[] = [];
      for (const [u0, v0, u1, v1] of [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]]) for (let k = 0; k < 6; k++) rim.push(...pt(u0 + ((u1 - u0) * k) / 6, v0 + ((v1 - v0) * k) / 6));
      canvas.push(poly(rim, CULL));
    });
  }
  if (rig.sprit) {
    const a = P(rig.sprit.heel), b = P(rig.sprit.heel.clone().addScaledVector(rig.sprit.dir, rig.sprit.len));
    lines.push(seg(a[0], a[1], b[0], b[1], 0.045, 0.03));
    ext.push(...a, ...b);
  }
  ext.push(...hull);
  const xs = ext.filter((_, i) => i % 2 === 0), ys = ext.filter((_, i) => i % 2 === 1), body = poly(hull, CULL);
  // from abeam, only what floats: the hull is cut off just below the waterline
  return {
    hull: view === 'plan' ? body : (x, y) => Math.max(body(x, y), -0.15 - y),
    canvas: union(...canvas), lines: union(...lines),
    box: [Math.min(...xs), view === 'plan' ? Math.min(...ys) : -0.2, Math.max(...xs), Math.max(...ys)],
  };
}

/** The atlas: forms × views cells of `cell` px, RGBA, bottom row first in memory. */
export function silhouetteAtlas(cell = SILHOUETTE_CELL): Uint8Array {
  const W = FORM_NAMES.length * cell, out = new Uint8Array(4 * W * SILHOUETTE_VIEWS.length * cell);
  SILHOUETTE_VIEWS.forEach((view, row) => {
    const ds = FORM_NAMES.map((f) => drawing(f, view));
    const px = Math.max(...ds.map((d) => Math.max(d.box[2] - d.box[0], d.box[3] - d.box[1]))) / (cell * 0.9);
    ds.forEach((d, col) => {
      const cx = (d.box[0] + d.box[2]) / 2, cy = (d.box[1] + d.box[3]) / 2;
      for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) {
        const x = cx + (i + 0.5 - cell / 2) * px, y = cy + (j + 0.5 - cell / 2) * px, h = d.hull(x, y), c = d.canvas(x, y);
        const g = cover(c, px), r = cover(h, px), b = Math.max(edge(h, px, 0.6 * px), edge(c, px, 0.5 * px), cover(d.lines(x, y) - 0.4 * px, px));
        const k = 4 * ((row * cell + j) * W + col * cell + i);
        out[k] = Math.round(255 * r);
        out[k + 1] = Math.round(255 * g);
        out[k + 2] = Math.round(255 * b);
        out[k + 3] = Math.round(255 * Math.max(r, g, b));
      }
    });
  });
  return out;
}
/** A form's cell in the atlas texture: (u0, v0, du, dv). */
export function silhouetteRect(form: FormName, view: SilhouetteView): THREE.Vector4 {
  const n = FORM_NAMES.length, m = SILHOUETTE_VIEWS.length;
  return new THREE.Vector4(FORM_NAMES.indexOf(form) / n, SILHOUETTE_VIEWS.indexOf(view) / m, 1 / n, 1 / m);
}
let texture: THREE.DataTexture | null = null;
/** The atlas as one mipmapped texture, made on first use. */
export function silhouetteTexture(): THREE.DataTexture {
  if (!texture) texture = atlasTexture(silhouetteAtlas(), FORM_NAMES.length * SILHOUETTE_CELL, SILHOUETTE_VIEWS.length * SILHOUETTE_CELL);
  return texture;
}

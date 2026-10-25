// The Weeping Isle, WP16 part E. One towering cloud-forest mountain, cascades falling into the sea all round it: the
// largest island in the world, whose enclosure doubles a territory's income. The WP15 terrain gives a dome girt by a
// continuous 18 u cliff (S-004: it read as a drum); this package breaks that drum. Every sim cascade and some forty
// weeping streaks leave the rim in free-fall arcs (fjords.ts's fall kit: lead-white strands on a verdigris body,
// rivers draped upstream of the great ones), so the wall reads as a weeping face all the way round; rock buttresses
// stand out of the band between the falls (strata ledges stepping in and out, fissures, moss on every shelf, weed and
// wet rock at their feet), some rising above the rim as crags, some stepping down as benches, so the skyline is
// ragged; the summit is a spire with four shoulder peaks and pinnacles along both ridges, standing out of a cloud cap
// over a girdle of cloud at the forest's height (veils of paper left unpainted, thickest at dawn and in rain); talus
// fans under the cliffs, hanging gardens of moss and fern on the faces, tree ferns in the hollows and by the falls
// (flora plants the cloud forest itself); surf lines along the cliff foot, broken foam rings at every plunge pool
// and the guard rocks' stacks, milky fresh-water plumes fanning out from the great falls. Nothing stands where the
// sim lets a hull pass (tested). Hooks: roosts and pools (WP23), voices (WP28), wet (WP21's weather).
import * as THREE from 'three';
import { illustratedMaterial, inkMaterial, linearVec, transmittanceVec, type Style } from '../../style/glsl.ts';
import { PIGMENTS } from '../../style/palette.ts';
import { R } from '../../sim/sphere.ts';
import { heightAt } from '../../sim/world/geography.ts';
import { DRAFT, REGIONS } from '../../sim/world/regions.ts';
import { seas } from '../sea.ts';
import type { Swell } from '../swell.ts';
import { terrains, type Surface, type TerrainField } from '../terrain.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { addPuff, addStrip, arcOf, Batch, fallRows, FALL_FRAG, FALL_VERT, sideOf, toward, VEIL_FRAG, VEIL_VERT } from './fjords.ts';
import { chartDir, Draw, Kit, lift, pose, regionSeen, seeded, vec, washOf, type V, type Wash } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'weepingIsle');
const REGION = REGIONS[RI];
const TAU = 2 * Math.PI;
/** Streaks beside the sim's cascades; spire height over the summit (u); buttress slots round the rim; caps on the
 *  dressing; cloud puffs in the girdle and the summit cap. */
export const WEEP = { near: 80, streaks: 40, spire: 22, buttresses: 32, boulders: 460, clumps: 900, ferns: 380, girdle: 56, cap: 12 } as const;

const W = {
  rock: washOf(PIGMENTS.umber, 0.45), dark: washOf(PIGMENTS.sepia, 0.62), fissure: washOf(PIGMENTS.sepia, 1.05),
  moss: washOf(PIGMENTS.malachite, 0.75), wet: washOf(PIGMENTS.sepia, 0.9), weed: washOf(PIGMENTS.verdigris, 0.95),
  fern: washOf(PIGMENTS.malachite, 0.95), frond: washOf(PIGMENTS.verdigris, 0.8), trunk: washOf(PIGMENTS.sepia, 0.75),
  foam: washOf(PIGMENTS.leadWhite, 1.1), plume: washOf(PIGMENTS.leadWhite, 0.4),
};

const S: Surface = { height: 0, normal: vec(), up: 1, ground: 0, region: 0 };
const at = (x: number, y: number): V => chartDir(RI, x, y);
const groundOf = (field: TerrainField, p: V): number => field.surface(p, -10, S).height;
const angDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** Harbour and lights the dressing keeps clear of (chart x, y, radius). */
const KEEP_CLEAR = [[-33, -31, 10], [41, 39, 6], [-46, -31, 6]] as const;
const clear = (x: number, y: number, d: number): boolean => KEEP_CLEAR.every(([cx, cy, cr]) => Math.hypot(x - cx, y - cy) > cr + d);
/** The guard rocks round the loop (regions.ts strokes). */
const GUARDS = [[52, -28], [-54, 20], [6, 56]] as const;
const PRINT = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] as const;
const T1 = vec(), T2 = vec(), T3 = vec(), FWD = vec(0, 1, 0);

const ringAt = (k: number, y: (j: number) => number, r: (j: number) => number): V[] =>
  Array.from({ length: k }, (_, j) => {
    const a = (j / k) * TAU;
    return vec(r(j) * Math.cos(a), y(j), r(j) * Math.sin(a));
  });

/** A kit-local part painted by `pick`, each facet's normal turned outward from (0, mid, 0). */
function localKit(mid: number, pick: (n: V, c: V) => Wash): Kit {
  return new Kit((c, n) => pick(T2.copy(n).multiplyScalar(n.dot(T3.set(c.x, c.y - mid, c.z)) < 0 ? -1 : 1), c));
}

function boulderKit(seed: number): THREE.BufferGeometry {
  const rng = seeded(seed), k = 6, jit = Array.from({ length: 3 * k }, () => 0.72 + 0.5 * rng());
  const kit = localKit(0.2, (n, c) => (c.y < -0.1 ? W.wet : n.y > 0.55 ? W.rock : W.dark));
  kit.loft(([[-0.35, 0.8], [0.25, 1], [0.75, 0.5]] as const).map(([y, r], i) => ringAt(k, (j) => y + 0.14 * (jit[i * k + j] - 1), (j) => r * jit[i * k + j])));
  return kit.build();
}

/** A hanging garden's pad of moss and fern, its top toward +y (the face's normal). */
function clumpKit(): THREE.BufferGeometry {
  const rng = seeded(612), k = 5, j1 = Array.from({ length: 2 * k }, () => 0.7 + 0.6 * rng());
  const kit = localKit(0.15, (n) => (n.y > 0.5 ? W.moss : W.frond));
  kit.loft([ringAt(k, () => -0.1, (j) => j1[j]), ringAt(k, (j) => 0.3 + 0.18 * j1[k + j], (j) => 0.5 * j1[k + j])]);
  return kit.build();
}

/** A tree fern: a slim dark trunk under seven arching fronds. */
function fernKit(): THREE.BufferGeometry {
  const H = 2.2, kit = new Kit((c) => (c.y < H - 0.3 ? W.trunk : c.y > H + 0.22 ? W.fern : W.frond));
  kit.loft([ringAt(3, () => -0.3, () => 0.14), ringAt(3, () => H, () => 0.09)]);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3 * Math.sin(i * 2.3), ca = Math.cos(a), sa = Math.sin(a), w = 0.32;
    const b = vec(0, H, 0), m = vec(0.85 * ca, H + 0.4, 0.85 * sa), t = vec(1.7 * ca, H - 0.25, 1.7 * sa), p = vec(-sa * w, 0, ca * w);
    kit.tri(b, m.clone().add(p), m.clone().sub(p));
    kit.tri(m.clone().add(p), t, m.clone().sub(p));
  }
  return kit.build();
}

function flatKit(w: Wash, lay: (k: Kit) => void): THREE.BufferGeometry {
  const kit = new Kit(() => w);
  lay(kit);
  return kit.build();
}
/** A surf dash along the shore (x along it). */
const dashKit = () => flatKit(W.foam, (k) => {
  const a = vec(-1, 0, 0), b = vec(0, 0, -0.22), c = vec(1, 0, 0), d = vec(0.1, 0, 0.18);
  k.tri(a, b, c);
  k.tri(a, c, d);
});
/** A broken foam ring (radius 1). */
const ringKit = () => flatKit(W.foam, (k) => {
  const rng = seeded(77), n = 14, o = Array.from({ length: n }, (_, j) => {
    const a = (j / n) * TAU, r = 1 + 0.2 * (rng() - 0.5);
    return [vec(r * Math.cos(a), 0, r * Math.sin(a)), vec(0.72 * Math.cos(a), 0, 0.72 * Math.sin(a))];
  });
  for (let j = 0; j < n; j++) {
    if (j % 5 === 4) continue;
    const [a1, b1] = o[j], [a2, b2] = o[(j + 1) % n];
    k.tri(a1, a2, b1);
    k.tri(b1, a2, b2);
  }
});
/** A milky fresh-water plume fanning out along +z. */
const plumeKit = () => flatKit(W.plume, (k) => {
  const s = [[0, 0], [0.35, 0.8], [0.8, 2], [0.5, 3], [0, 3.3], [-0.5, 3], [-0.8, 2], [-0.35, 0.8]].map(([x, z]) => vec(x, 0, z)), c = vec(0, 0, 1.6);
  for (let i = 0; i < s.length; i++) k.tri(c, s[i], s[(i + 1) % s.length]);
});

export interface Fall { readonly lip: V; readonly foot: V; readonly f: V; readonly rows: V[][]; readonly width: number; readonly seed: number; readonly bearing: number; readonly sim: boolean }
export interface Crag { readonly foot: V; readonly base: number; readonly ground: number; readonly top: number; readonly radius: number; readonly kind: 'spire' | 'peak' | 'pinnacle' | 'crag' | 'buttress' | 'stack'; readonly footprint: V[] }
export interface Spot { readonly m: THREE.Matrix4; readonly at: V; readonly ground: number }
export interface Afloat { readonly dir: V; readonly f: V; readonly yaw: number; readonly sx: number; readonly sz: number }
export interface Puff { readonly p: V; readonly w: number; readonly h: number; readonly seed: number; readonly spray: number }
export interface WeepingPlan {
  readonly falls: Fall[]; readonly crags: Crag[]; readonly rocks: THREE.BufferGeometry;
  readonly boulders: Spot[]; readonly clumps: Spot[]; readonly ferns: Spot[];
  readonly dashes: Afloat[]; readonly rings: Afloat[]; readonly plumes: Afloat[]; readonly puffs: Puff[];
}
interface Coast { shore: number; top: number; topH: number; sea: number }

/** Along compass bearing b from the island's heart: its outer shore (r, chart u), the rim above it and the water. */
function coastAlong(gp: (r: number, b: number) => number, b: number): Coast | null {
  let r = 76;
  for (; r > 18; r -= 0.5) {
    if (gp(r, b) <= 0.8) continue;
    let peak = 0;
    for (let d = 0; d <= 10; d++) peak = Math.max(peak, gp(r - d, b));
    if (peak >= 8) break;
    while (r > 18 && gp(r, b) > 0.8) r -= 0.5; // an outlying rock: march past it
  }
  if (r <= 18) return null;
  let top = r, topH = gp(r, b);
  for (let q = r - 0.5; q > r - 16; q -= 0.5) {
    const h = gp(q, b);
    if (h - topH < 0.3 && topH > 4) break;
    top = q;
    topH = Math.max(topH, h);
  }
  let sea = r;
  while (sea < r + 8 && gp(sea, b) > -0.1) sea += 0.25;
  return { shore: r, top, topH, sea };
}

const pick = <T>(a: T[], n: number, rng: () => number): T[] => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};

export function planWeeping(field: TerrainField): WeepingPlan {
  const geo = field.geo, rng = seeded(616);
  const g = (x: number, y: number) => groundOf(field, at(x, y)), gp = (r: number, b: number) => g(r * Math.sin(b), r * Math.cos(b));
  const N = 720, coasts = Array.from({ length: N }, (_, i) => coastAlong(gp, (i / N) * TAU));
  const coastAt = (b: number) => coasts[((Math.round((b / TAU) * N) % N) + N) % N];

  // the falls: the sim's cascades first, then streaks down the rest of the rim (clear of the buttresses)
  const falls: Fall[] = [];
  const lay = (site: V, f: V, width: number, seed: number, b: number, sim: boolean): boolean => {
    const arc = arcOf(field, site, f, width);
    if (!arc) return false;
    const s = sideOf(site, f), foot = arc.find((q) => q.y < 0.2) ?? arc[arc.length - 1];
    falls.push({ lip: toward(site, f, s, arc[0].d, 0), foot: toward(site, f, s, foot.d + 0.4, 0), f, rows: fallRows(field, site, f, width, arc, sim ? 4 : 0), width, seed, bearing: b, sim });
    return true;
  };
  /** A fall on bearing b0: at the sim's own site if it has one, else down the rim (great falls swung up to 4° or narrowed to find a drop). */
  const tryFall = (b0: number, sim: boolean, given?: { site: V; f: V }): boolean => {
    const width = sim ? 1.5 + 0.9 * rng() : 0.28 + 0.4 * rng(), seed = rng();
    if (given && lay(given.site, given.f, width, seed, b0, sim)) return true;
    for (const db of sim ? [0, 0.025, -0.025, 0.05, -0.05, 0.075, -0.075] : [0]) {
      const b = b0 + db, c = coastAt(b);
      if (!c) continue;
      for (const back of [0.5, 2, 3.5, 5]) {
        const r = c.top - back, x = r * Math.sin(b), y = r * Math.cos(b);
        if (!clear(x, y, 2)) return false;
        const site = at(x, y), f = at((r + 1) * Math.sin(b), (r + 1) * Math.cos(b)).sub(site).normalize();
        for (const w of sim ? [width, 0.7 * width] : [width]) if (lay(site, f, w, seed, b, sim)) return true;
      }
    }
    return false;
  };
  const simB = REGION.cascades.map((c) => (c.facing * Math.PI) / 180);
  const given = geo.cascades.filter((c) => c.region === RI).map((c) => ({ site: vec(c.pos.x, c.pos.y, c.pos.z), f: vec(c.facing.x, c.facing.y, c.facing.z) }));
  for (const b of simB) {
    const probe = at(44 * Math.sin(b), 44 * Math.cos(b));
    const near = given.length ? given.reduce((x, c) => (c.site.angleTo(probe) < x.site.angleTo(probe) ? c : x)) : undefined;
    tryFall(b, true, near && near.site.angleTo(probe) * R < 12 ? near : undefined);
  }

  // the rock: one merged kit, every facet painted by its height (strata), tilt (moss shelves) and chance (fissures)
  const crags: Crag[] = [];
  let mid = vec();
  const rockKit = new Kit((c, n) => {
    const up = T1.copy(c).normalize(), h = c.length() - R, tip = (n.dot(T2.copy(c).sub(mid)) < 0 ? -1 : 1) * n.dot(up);
    if (h < 0.9) return tip > 0.4 ? W.weed : W.wet;
    if (h > 14 && tip > 0.35) return rng() < 0.55 ? W.moss : rng() < 0.8 ? W.fern : W.rock; // the cloud forest's mossy flanks
    if (tip > 0.6) return rng() < 0.75 ? W.moss : W.rock;
    if (rng() < 0.08) return W.fissure;
    return Math.floor(h / 1.3 + 0.4 * Math.sin(c.x * 0.7 + c.z * 0.5)) % 2 ? W.rock : W.dark;
  });
  const raise = (x: number, y: number, kind: Crag['kind'], top: number, radius: number, o: { k?: number; sx?: number; sz?: number; lean?: number; taper?: number; b?: number } = {}): Crag | null => {
    const foot = at(x, y), b = o.b ?? Math.atan2(x, y), k = o.k ?? 7, sx = o.sx ?? 1, sz = o.sz ?? 1;
    const f = at(x + Math.sin(b), y + Math.cos(b)).sub(foot).normalize(), s = vec().crossVectors(foot, f).normalize();
    const footprint: V[] = [];
    let ground = Infinity;
    for (const [u, w] of PRINT) {
      const p = foot.clone().multiplyScalar(R).addScaledVector(s, u * radius * sx).addScaledVector(f, w * radius * sz).normalize();
      if (heightAt(geo, p) < -DRAFT + 0.1) return null; // a rock the sim does not know would stand in a hull's water
      footprint.push(p);
      ground = Math.min(ground, groundOf(field, p));
    }
    const base = ground - 1.2 - 0.15 * radius, total = Math.max(top - base, 2.5), n = Math.min(14, Math.max(4, Math.round(total / 1.7)));
    const m = pose(new THREE.Matrix4(), lift(foot, base), foot, f, 0, o.lean ?? 0, 1);
    const jit = Array.from({ length: k }, () => 0.72 + 0.5 * rng()), taper = o.taper ?? 0.8, rings: V[][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, ledge = i > 0 && i < n ? (i % 2 ? 0.9 : 1.05) : 1, shrink = (1 - taper * t ** 1.5) * ledge;
      const y = (j: number) => total * t + (i === n ? (rng() - 0.25) * radius * 0.7 * (1 - 0.5 * taper) : i ? (rng() - 0.5) * 0.5 : 0) + 0 * j;
      rings.push(ringAt(k, y, (j) => radius * shrink * jit[j] * (0.88 + 0.24 * rng())).map((p) => p.set(p.x * sx, p.y, p.z * sz).applyMatrix4(m)));
    }
    mid = lift(foot, base + total * 0.4);
    rockKit.loft(rings);
    const c: Crag = { foot, base, ground, top: base + total, radius, kind, footprint };
    crags.push(c);
    return c;
  };
  // the summit: a spire over its shoulders, pinnacles along both ridges, crags on the upper slopes
  let sx0 = 0, sy0 = 0, sh = -1;
  for (let x = -14; x <= 14; x += 2) for (let y = -14; y <= 14; y += 2) {
    const h = g(x, y);
    if (h > sh) [sh, sx0, sy0] = [h, x, y];
  }
  // the mountain itself: a cloud-forest massif heaved up off the plateau along its ridges, the spire and shoulders on it
  raise(sx0, sy0, 'peak', sh + 12, 17, { k: 14, sx: 0.85, sz: 1.2, taper: 0.78, b: Math.PI / 2 });
  raise(sx0, sy0, 'spire', sh + WEEP.spire, 7.5, { k: 9, taper: 0.86 });
  for (const [dx, dy, dh, r] of [[6, 3, 10, 4], [-5, 4, 8, 3.4], [2, -7, 11, 4.2], [-7, -4, 6, 3]]) raise(sx0 + dx, sy0 + dy, 'peak', g(sx0 + dx, sy0 + dy) + dh, r, { k: 8, taper: 0.8 });
  for (const line of [[[-18, 14], [0, 22], [18, 14]], [[20, -14], [0, -22], [-20, -14]]]) {
    for (let i = 0; i + 1 < line.length; i++) for (let t = 0.12; t < 1; t += 0.3) {
      const x = line[i][0] + (line[i + 1][0] - line[i][0]) * t + (rng() - 0.5) * 3, y = line[i][1] + (line[i + 1][1] - line[i][1]) * t + (rng() - 0.5) * 3;
      raise(x, y, 'pinnacle', g(x, y) + 3 + 5 * rng(), 1.6 + 1.4 * rng(), { k: 6, taper: 0.7, lean: (rng() - 0.5) * 0.2 });
    }
  }
  for (let tries = 0, n = 0; tries < 200 && n < 18; tries++) {
    const a = rng() * TAU, r = 10 + 30 * rng(), x = r * Math.cos(a), y = r * Math.sin(a), p = at(x, y);
    field.surface(p, -10, S);
    if (S.height < 10 || S.up > 0.88 || falls.some((f) => f.lip.angleTo(p) * R < 8)) continue;
    if (raise(x, y, 'crag', S.height + 2 + 3 * rng(), 1.2 + 1.5 * rng(), { k: 6, taper: 0.6, lean: (rng() - 0.5) * 0.3 })) n++;
  }
  // buttresses out of the cliff band between the great falls: some crags above the rim, some benches below it
  const butt: { b: number; half: number }[] = [];
  for (let k = 0; k < WEEP.buttresses; k++) {
    const b = ((k + 0.25 + 0.5 * rng()) / WEEP.buttresses) * TAU, c = coastAt(b);
    if (!c || c.topH < 4) continue;
    const sx = 1.1 + 0.4 * rng(), sz = 0.9, top = c.topH + (rng() < 0.4 ? 3 + 6 * rng() : -3 + 3 * rng());
    let radius = 2.6 + 1.6 * rng();
    if (falls.some((f) => Math.abs(angDiff(f.bearing, b)) * c.shore < radius * sx + f.width / 2 + 1.2)) continue;
    for (let tries = 0; tries < 7; tries++, radius *= 0.88) {
      const r = c.shore - 1 - 1.5 * tries - radius * sz, x = r * Math.sin(b), y = r * Math.cos(b);
      if (!clear(x, y, radius * sx + 2)) break;
      if (raise(x, y, 'buttress', Math.max(top, g(x, y) + 3), radius, { k: 8, sx, sz, taper: 0.45, lean: -0.06, b })) {
        butt.push({ b, half: (radius * sx + 1) / c.shore });
        break;
      }
    }
  }
  for (let k = 0, made = 0; k < 120 && made < WEEP.streaks; k++) {
    const b = ((k + 0.6 * rng()) / 120) * TAU;
    if (simB.some((s) => Math.abs(angDiff(b, s)) < 0.08) || butt.some((x) => Math.abs(angDiff(b, x.b)) < x.half + 0.02)) continue;
    if (tryFall(b, false)) made++;
  }
  // the guard rocks: a leaning stack and its broken teeth on each
  for (const [x, y] of GUARDS) {
    raise(x, y, 'stack', g(x, y) + 5 + 4 * rng(), 1.7, { k: 6, taper: 0.55, lean: (rng() - 0.5) * 0.25 });
    for (let i = 0; i < 3; i++) {
      const a = rng() * TAU, d = 1.4 + 0.6 * rng(), px = x + d * Math.cos(a), py = y + d * Math.sin(a);
      raise(px, py, 'stack', g(px, py) + 1.5 + 2.5 * rng(), 0.6 + 0.5 * rng(), { k: 5, taper: 0.5 });
    }
  }

  // talus under the cliffs, hanging gardens on the faces, tree ferns in the hollows and by the falls
  const spot = (p: V, h: number, up: V, yaw: number, tilt: number, sc: number, sink: number): Spot => {
    const u = up.clone().normalize();
    return { m: pose(new THREE.Matrix4(), lift(p, h - sink), u, u.dot(p) > 0.9 ? FWD : p, yaw, tilt, sc), at: lift(p, h), ground: h };
  };
  const boulders: Spot[] = [], clumps: Spot[] = [], ferns: Spot[] = [];
  for (let x = -62; x <= 62; x += 1.1) for (let y = -62; y <= 62; y += 1.1) {
    const px = x + (rng() - 0.5) * 0.9, py = y + (rng() - 0.5) * 0.9, p = at(px, py);
    field.surface(p, -10, S);
    if (S.region !== RI) continue;
    const h = S.height, upv = S.up, n = S.normal.clone();
    if (h < 0.25 || heightAt(geo, p) < -DRAFT + 0.1 || !clear(px, py, 1)) continue;
    if (h < 4.5 && upv > 0.5) {
      const above = Math.max(g(px * 0.94, py * 0.94), g(px * 0.9, py * 0.9));
      if (above > h + 6 && rng() < 0.85) {
        const sc = 0.35 + 1.1 * rng() ** 2 * (above > h + 12 ? 1.5 : 1);
        boulders.push(spot(p, h, p, rng() * TAU, (rng() - 0.5) * 0.4, sc, 0.25 * sc));
      }
    }
    if (h > 2 && h < 28 && upv < 0.72 && upv > 0.08) clumps.push(spot(p, h, n, rng() * TAU, 0, 0.45 + 0.8 * rng(), 0.1));
    else if (h > 1.5 && h < 26 && upv > 0.72) {
      const hollow = (g(px + 2.5, py) + g(px - 2.5, py) + g(px, py + 2.5) + g(px, py - 2.5)) / 4 - h;
      if (hollow > 0.2 || falls.some((f) => f.lip.angleTo(p) * R < 6)) ferns.push(spot(p, h, p, rng() * TAU, (rng() - 0.5) * 0.25, 0.6 + 0.5 * rng(), 0.3));
    }
  }

  // the water: surf along the cliff foot, foam rings at the plunge pools and guard rocks, plumes off the great falls
  const dashes: Afloat[] = [], rings: Afloat[] = [], plumes: Afloat[] = [];
  for (let i = 0; i < N; i++) {
    const b = (i / N) * TAU, c = coasts[i];
    if (!c || rng() < 0.3) continue;
    for (const [d0, dd, p] of [[0.2, 1.2, 1], [1.6, 2, 0.3]] as const) {
      if (rng() > p) continue;
      const r = c.sea + d0 + dd * rng(), x = r * Math.sin(b), y = r * Math.cos(b), dir = at(x, y);
      if (!clear(x, y, 0)) continue;
      dashes.push({ dir, f: at(x + Math.sin(b), y + Math.cos(b)).sub(dir).normalize(), yaw: (rng() - 0.5) * 0.3, sx: 1.1 + 1.3 * rng(), sz: 0.8 + 0.6 * rng() });
    }
  }
  for (const [x, y] of GUARDS) for (const s of [3.8, 5.2]) rings.push({ dir: at(x, y), f: at(x + 1, y).sub(at(x, y)).normalize(), yaw: rng() * TAU, sx: s + 0.4 * rng(), sz: s + 0.4 * rng() });
  for (const f of falls) {
    rings.push({ dir: f.foot, f: f.f, yaw: rng() * TAU, sx: 0.9 + 1.2 * f.width, sz: 0.9 + 1.2 * f.width });
    plumes.push({ dir: f.foot, f: f.f, yaw: (rng() - 0.5) * 0.4, sx: 0.8 + 0.6 * f.width, sz: f.sim ? 1.6 + 1.2 * rng() : 0.6 });
  }

  // veils: spray at every foot, a girdle of cloud at the forest's height, a cap the spire stands out of
  const puffs: Puff[] = [];
  for (const f of falls) {
    if (!f.sim) puffs.push({ p: lift(f.foot, 0.6), w: 0.6 + 1.2 * f.width, h: 0.6 + f.width, seed: rng(), spray: 1 });
    else {
      for (let k = 0; k < 3; k++) puffs.push({ p: lift(f.foot, 0.8 + rng()), w: 1.6 + 1.6 * rng(), h: 1.2 + rng(), seed: rng(), spray: 1 });
      puffs.push({ p: lift(f.foot, 3.5), w: 3.5, h: 3, seed: rng(), spray: 1 });
    }
  }
  for (let k = 0; k < WEEP.girdle; k++) {
    const b = (k / WEEP.girdle) * TAU + 0.1 * rng(), r = 14 + 20 * rng(), x = r * Math.sin(b), y = r * Math.cos(b);
    puffs.push({ p: lift(at(x, y), Math.max(g(x, y) + 4 + 4 * rng(), 22 + 8 * rng())), w: 7 + 6 * rng(), h: 2.6 + 2 * rng(), seed: rng(), spray: 0 });
  }
  for (let k = 0; k < WEEP.cap; k++) {
    const a = rng() * TAU, r = 12 * Math.sqrt(rng());
    puffs.push({ p: lift(at(sx0 + r * Math.cos(a), sy0 + r * Math.sin(a)), sh + 13 + 6 * rng()), w: 9 + 6 * rng(), h: 3 + 2 * rng(), seed: rng(), spray: 0 });
  }

  return {
    falls, crags, rocks: rockKit.build(), boulders: pick(boulders, WEEP.boulders, rng), clumps: pick(clumps, WEEP.clumps, rng),
    ferns: pick(ferns, WEEP.ferns, rng), dashes, rings, plumes, puffs,
  };
}

export class WeepingIsle {
  readonly group = new THREE.Group();
  readonly plan: WeepingPlan;
  /** WP23: where the island's birds roost and wheel (world points): the great falls' lips, the spire, the stacks. */
  readonly roosts: readonly V[];
  /** WP23: the plunge pools at the great falls' feet (unit directions). */
  readonly pools: readonly V[];
  /** WP28: every fall's roar, at its foot (world point), loudness 0–1 by width. */
  readonly voices: readonly { readonly at: V; readonly loud: number }[];
  /** WP21: 0 dry … 1 a squall (the cloud thickens, comes down the mountain). */
  wet = 0;
  private readonly style: Style;
  private readonly swell: Swell;
  private readonly mist = { value: 0.5 };
  private readonly materials: THREE.Material[];
  private readonly draws: Draw[];
  private readonly afloats: [Draw, Afloat[]][];
  /** The dressing drawn only within WEEP.near of the eye (beyond it, below the ink's grain and the budget's). */
  private readonly near: [Draw, Spot[]][];
  private readonly seen = vec(1e9, 0, 0);
  private readonly fixed: number;
  private readonly m = new THREE.Matrix4();
  private level = NaN;

  constructor(style: Style, field: TerrainField, swell: Swell) {
    const plan = (this.plan = planWeeping(field));
    this.style = style;
    this.swell = swell;
    this.roosts = [...plan.falls.filter((f) => f.sim).map((f) => lift(f.lip, 2)), ...plan.crags.filter((c) => c.kind === 'spire' || c.kind === 'stack').map((c) => lift(c.foot, c.top))];
    this.pools = plan.falls.filter((f) => f.sim).map((f) => f.foot);
    this.voices = plan.falls.map((f) => ({ at: lift(f.foot, 0.5), loud: Math.min(1, f.width / 2.4) }));
    const stone = illustratedMaterial(style, { pigment: PIGMENTS.umber, painted: true, anchor: 'object', side: THREE.DoubleSide });
    const foam = { value: linearVec(PIGMENTS.leadWhite) };
    const water = inkMaterial(style, { vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, side: THREE.DoubleSide,
      uniforms: { uFoam: foam, uBody: { value: transmittanceVec(PIGMENTS.verdigris) } } });
    const veil = inkMaterial(style, { vertexShader: VEIL_VERT, fragmentShader: VEIL_FRAG, veil: true, side: THREE.DoubleSide, uniforms: { uFoam: foam, uMist: this.mist } });
    const strips = new Batch({ position: 3, aFall: 4, aSeed: 1 }), puffs = new Batch({ position: 3, aCorner: 2, aPuff: 4 });
    for (const f of plan.falls) addStrip(strips, f.rows, f.width, f.seed);
    for (const p of plan.puffs) addPuff(puffs, p.p, p.w, p.h, p.seed, p.spray);
    const sg = strips.build();
    sg.computeVertexNormals();
    const meshes = [new THREE.Mesh(sg, water), new THREE.Mesh(puffs.build(), veil)];
    for (const m of meshes) m.frustumCulled = false;
    this.fixed = strips.index.length / 3 + puffs.index.length / 3;
    this.near = [[new Draw(boulderKit(61), stone, plan.boulders.length), plan.boulders], [new Draw(clumpKit(), stone, plan.clumps.length), plan.clumps], [new Draw(fernKit(), stone, plan.ferns.length), plan.ferns]];
    this.draws = [new Draw(plan.rocks, stone, 1).fill([new THREE.Matrix4()]), ...this.near.map(([d]) => d)];
    this.afloats = [[new Draw(dashKit(), stone, plan.dashes.length), plan.dashes], [new Draw(ringKit(), stone, plan.rings.length), plan.rings], [new Draw(plumeKit(), stone, plan.plumes.length), plan.plumes]];
    this.group.add(...meshes, ...this.draws.map((d) => d.mesh), ...this.afloats.map(([d]) => d.mesh));
    this.materials = [stone, water, veil];
  }

  /** Shown when the region can be in view; the cloud thickest at dawn, by night and in rain; foam at the tide. */
  update(eye: V): void {
    this.group.visible = regionSeen(RI, eye, 90);
    if (!this.group.visible) return;
    const { hour, night } = this.style.palette, sm = THREE.MathUtils.smoothstep;
    this.mist.value = Math.min(1, 0.3 + 0.4 * sm(hour, 4.5, 6) * (1 - sm(hour, 8.5, 11)) + 0.2 * night + 0.35 * this.wet);
    if (eye.distanceToSquared(this.seen) > 2.25) {
      this.seen.copy(eye);
      const r2 = WEEP.near ** 2;
      for (const [d, list] of this.near) {
        d.begin();
        for (const sp of list) if (eye.distanceToSquared(sp.at) < r2) d.add(sp.m);
        d.end();
      }
    }
    const level = this.swell.uniforms.uSeaLevel.value as number;
    if (Math.abs(level - this.level) <= 0.01) return;
    this.level = level;
    for (const [d, list] of this.afloats) {
      d.begin();
      for (const a of list) d.add(pose(this.m, lift(a.dir, level + 0.05), a.dir, a.f, a.yaw, 0, a.sx, 1, a.sz));
      d.end();
    }
  }

  get triangles(): number {
    return this.group.visible ? this.fixed + [...this.draws, ...this.afloats.map(([d]) => d)].reduce((s, d) => s + d.triangles, 0) : 0;
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

/** The composition root's Weeping Isle (MODULES). */
export function createWeepingIsle(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene), terrain = terrains.get(ctx.scene);
  if (!sea || !terrain) throw new Error('createWeepingIsle: the sea and terrain are built first (MODULES order)');
  const isle = new WeepingIsle(ctx.pipeline.style, terrain.field, sea.swell);
  ctx.scene.add(isle.group);
  return {
    frame() {
      isle.update(ctx.camera.position);
    },
    dispose() {
      ctx.scene.remove(isle.group);
      isle.dispose();
    },
  };
}

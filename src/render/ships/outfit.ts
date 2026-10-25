// WP19 part B — what a ship carries and what it has suffered, built into its hull. Outfit reads the sim's six fitting
// slots (bow, broadside, stern, rig, hull, lookout: FITTING in tables.ts) and the ship's wounds (shot holes ringed with
// splinters, rails stove in, scorching after fire, fresh planks nailed over holes once repaired) and builds them with
// the shipwright's own mesher in its wood zones, merged into the hero and mid levels' wood so they draw in the ship's
// own hatching and pigments at no extra draw call; rebuilt only when the fittings or the wounds change. Hero ships
// also carry a few crew and coils of rope in ink.
import * as THREE from 'three';
import { box, lathe } from '../craft.ts';
import { FITTING } from '../../sim/tables.ts';
import { along, frame, ShipMesher, V, ZONE } from './mesher.ts';
import type { MastLayout, Rig } from './rig.ts';

/** A wound on the hull: where along it (u, stern 0 to bow 1), which side (+1 port), how high between waterline and rail (h 0–1), its WOUND kind, size and seed. */
export interface Wound { u: number; side: number; h: number; kind: number; size: number; seed: number }
export const WOUND = { hole: 0, rail: 1, scorch: 2, patch: 3 } as const;
/** Holes and stove-in rails a hull shows when all but gone (max·lost^0.85 of them), scorch marks a fire leaves at most, the cap on all wounds, seconds between rebuilds. */
export const WOUNDS = { max: 14, scorch: 4, cap: 24, rebuild: 0.25 } as const;
export interface Fit { readonly kind: number; readonly tier: number }
/** Where the outfit smokes and spouts: the shot furnace's chimney top, the pumps' spouts (ship frame). */
export interface Dressed { chimney: THREE.Vector3 | null; spouts: THREE.Vector3[] }

const hash = (n: number): number => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 2 ** 32;
};
const M4 = () => new THREE.Matrix4();
const UP = V(0, 1, 0), AHEAD = V(0, 0, 1);
type Pt = readonly [number, number];

class Dresser {
  readonly m: ShipMesher;
  readonly rig: Rig;
  readonly fine: boolean;
  readonly f: Rig['hull'];
  readonly k: number;
  readonly seg: number;
  readonly out: Dressed = { chimney: null, spouts: [] };

  constructor(m: ShipMesher, rig: Rig, fine: boolean) {
    this.m = m;
    this.rig = rig;
    this.fine = fine;
    this.f = rig.hull;
    this.k = this.f.L / 5;
    this.seg = fine ? 9 : 5;
  }

  side(u: number, y: number, s: number): { p: THREE.Vector3; n: THREE.Vector3 } {
    const p = this.f.at(u, y, V()), n = this.f.normal(u, y, V());
    p.x *= s;
    n.x *= s;
    return { p, n };
  }
  deckAt(u: number, x: number, lift = 0): THREE.Vector3 {
    const y = this.f.deck(u);
    return V(x, y + lift, this.f.at(u, y, V()).z);
  }
  /** A turned solid from p along `axis`, profile [radius, distance along]. */
  turn(p: THREE.Vector3, axis: THREE.Vector3, prof: number[][], zone: number, seg = this.seg): void {
    this.m.zone = zone;
    this.m.xf = along(p, axis);
    lathe(this.m, prof, seg);
    this.m.xf = null;
  }
  block(xf: THREE.Matrix4, sx: number, sy: number, sz: number, zone: number): void {
    this.m.zone = zone;
    this.m.xf = xf;
    box(this.m, sx, sy, sz);
    this.m.xf = null;
  }
  at(p: THREE.Vector3): THREE.Matrix4 {
    return M4().makeTranslation(p.x, p.y, p.z);
  }
  /** A flat shape laid on a surface (frame xf, +z out of it), lifted off it. */
  fan(xf: THREE.Matrix4, pts: readonly Pt[], zone: number, lift: number): void {
    const m = this.m, nz = V(0, 0, 1);
    m.zone = zone;
    m.xf = xf;
    const c = m.vert(V(0, 0, lift), nz, 0, 0), ids = pts.map(([x, y]) => m.vert(V(x, y, lift), nz, x, y));
    ids.forEach((id, j) => m.tri(c, id, ids[(j + 1) % ids.length]));
    m.xf = null;
  }
  rect(xf: THREE.Matrix4, w: number, h: number, zone: number, lift: number, rot = 0): void {
    const c = Math.cos(rot), s = Math.sin(rot);
    this.fan(xf, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [c * x - s * y, s * x + c * y] as const), zone, lift);
  }
  ragged(seed: number, n: number, r: number, jag: number): Pt[] {
    return Array.from({ length: n }, (_, j) => {
      const a = (j / n) * 2 * Math.PI, q = r * (1 - jag + jag * hash(seed * 31 + j) * (j % 2 ? 0.6 : 1.4));
      return [q * Math.cos(a), q * Math.sin(a)] as const;
    });
  }
  gun(p: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, r1: number, zone: number = ZONE.IRON): void {
    this.turn(p, dir, [[0, 0], [r0, 0], [r0 * 1.06, 0.12 * len], [r1, 0.88 * len], [r1 * 1.3, 0.9 * len], [r1 * 1.25, len], [0, len]], zone);
  }
  cask(p: THREE.Vector3, r: number, h: number, zone: number = ZONE.HULL): void {
    this.turn(p, UP, [[0, 0], [r * 0.85, 0], [r, h * 0.5], [r * 0.85, h], [0, h]], zone);
    for (const t of [0.18, 0.76]) this.turn(V(p.x, p.y + t * h, p.z), UP, [[r * 0.9, 0], [r * 1.03, 0], [r * 1.03, 0.07 * h], [r * 0.9, 0.07 * h]], ZONE.IRON);
  }
  ball(p: THREE.Vector3, r: number, zone: number = ZONE.IRON): void {
    this.turn(V(p.x, p.y - r, p.z), UP, [[0, 0], [0.7 * r, 0.3 * r], [r, r], [0.7 * r, 1.7 * r], [0, 2 * r]], zone, 6);
  }
  /** A hand in ink: coat and head. */
  figure(p: THREE.Vector3, h: number): void {
    this.turn(p, UP, [[0, 0], [0.2 * h, 0], [0.24 * h, 0.45 * h], [0.17 * h, 0.78 * h], [0.06 * h, 0.82 * h], [0, 0.82 * h]], ZONE.DARK, 6);
    this.turn(V(p.x, p.y + 0.8 * h, p.z), UP, [[0, 0], [0.07 * h, 0.03 * h], [0.09 * h, 0.1 * h], [0.07 * h, 0.17 * h], [0, 0.19 * h]], ZONE.HULL, 6);
  }
  main(): MastLayout {
    const top = (m: MastLayout) => m.sections[m.sections.length - 1].to;
    return this.rig.masts.reduce((a, b) => (top(b) > top(a) ? b : a));
  }
  /** A point up mast m at height y (the sections' heights). */
  aloft(m: MastLayout, y: number): THREE.Vector3 {
    const rel = m.sections[0].to <= m.foot.y + 0.01;
    return m.foot.clone().addScaledVector(m.axis, (rel ? y : y - m.foot.y) / Math.max(m.axis.y, 0.5));
  }
  strip(s: number, n: number, u0: number, u1: number, ys: (u: number) => [number, number], lift: number, zone: number): void {
    const m = this.m;
    let prev: number[] | null = null;
    for (let j = 0; j <= n; j++) {
      const u = u0 + ((u1 - u0) * j) / n, ids = ys(u).map((y) => {
        const { p, n: nn } = this.side(u, y, s);
        m.zone = zone;
        return m.vert(p.addScaledVector(nn, lift), nn, u, y);
      });
      if (prev) { m.tri(prev[0], ids[0], ids[1]); m.tri(prev[0], ids[1], prev[1]); }
      prev = ids;
    }
  }

  fitting(kind: number, tier: number): void {
    const { f, k } = this, F = FITTING, gilt = tier >= 3 ? ZONE.GILT : ZONE.IRON;
    switch (kind) {
      case F.stemPost: // a heavy stem, iron-banded
        for (let j = 0; j <= 5; j++) { const y = (j / 5) * f.railFwd * 0.9; this.block(this.at(V(0, y, f.zFwd(y) + 0.03 * k)), 0.1 * k, f.railFwd * 0.2, 0.06 * k, ZONE.TAR); }
        for (const t of [0.12, 0.4, 0.68]) { const y = t * f.railFwd; this.block(this.at(V(0, y, f.zFwd(y) + 0.05 * k)), 0.14 * k, 0.05 * k, 0.07 * k, gilt); }
        break;
      case F.ironRam: { // an iron beak at the waterline, a gilt collar
        const p = V(0, 0.04 * k, f.zFwd(0.04 * k) - 0.04 * k), len = 0.8 * k;
        this.turn(p, AHEAD, [[0, 0], [0.12 * k, 0], [0.13 * k, 0.12 * len], [0.05 * k, 0.8 * len], [0.015 * k, len], [0, len]], ZONE.IRON);
        this.turn(p, AHEAD, [[0, 0], [0.145 * k, 0], [0.145 * k, 0.06 * k], [0, 0.06 * k]], ZONE.GILT);
        break;
      }
      case F.cutwater: // a knife of a forefoot, edged in gilt
        for (let j = 0; j < 5; j++) { const y = (j - 1) * 0.12 * k; this.block(this.at(V(0, y, f.zFwd(Math.max(y, 0)) + (0.16 - 0.02 * j) * k)), 0.025 * k, 0.13 * k, (0.34 - 0.04 * j) * k, ZONE.TRIM); }
        this.block(this.at(V(0, 0.12 * k, f.zFwd(0.12 * k) + 0.33 * k)), 0.03 * k, 0.6 * k, 0.025 * k, ZONE.GILT);
        break;
      case F.lightGuns: case F.chainShot: case F.heatedShot: {
        for (const s of [1, -1]) for (const u of [0.36, 0.5, 0.64]) {
          const y = f.rail(u) - 0.04 * k, h = f.half(u, y), z = f.at(u, y, V()).z;
          this.gun(V(s * (h - 0.2 * k), y, z), V(s, 0.06, 0), 0.38 * k, 0.034 * k, 0.026 * k);
          this.block(this.at(V(s * (h - 0.24 * k), f.deck(u) + 0.05 * k, z)), 0.14 * k, 0.1 * k, 0.12 * k, ZONE.DARK);
        }
        if (kind === F.chainShot) for (let j = 0; j < 3; j++) { // racks of bar and chain shot
          const p = this.deckAt(0.43 + 0.07 * j, 0, 0.03 * k);
          for (const sx of [-1, 1]) this.ball(V(sx * 0.07 * k, p.y, p.z), 0.03 * k);
          this.block(this.at(p), 0.12 * k, 0.012 * k, 0.012 * k, ZONE.IRON);
        }
        if (kind === F.heatedShot) { // the shot furnace amidships, its mouth glowing
          const p = this.deckAt(0.5, 0, 0.09 * k), top = V(0, p.y + 0.09 * k, p.z);
          this.block(this.at(p), 0.26 * k, 0.18 * k, 0.22 * k, ZONE.DARK);
          this.block(this.at(V(0, p.y - 0.02 * k, p.z + 0.115 * k)), 0.12 * k, 0.07 * k, 0.012 * k, ZONE.GILT);
          this.turn(top, UP, [[0, 0], [0.04 * k, 0], [0.035 * k, 0.3 * k], [0, 0.3 * k]], ZONE.IRON);
          this.out.chimney = V(0, top.y + 0.32 * k, top.z);
        }
        break;
      }
      case F.longGuns: // long barrels run out of every port
        for (const s of [1, -1]) for (const u of [0.28, 0.4, 0.52, 0.64, 0.76]) {
          const { p, n } = this.side(u, 0.62 * f.deck(u), s);
          this.rect(frame(p, n), 0.15 * k, 0.14 * k, ZONE.DARK, 0.006);
          this.gun(p.clone().addScaledVector(n, -0.12 * k), n, 0.5 * k, 0.05 * k, 0.034 * k);
        }
        break;
      case F.swivelGuns: // swivels on posts along the rails
        for (const s of [1, -1]) for (const u of [0.18, 0.42, 0.66, 0.86]) {
          const { p, n } = this.side(u, f.rail(u), s), pivot = p.clone().addScaledVector(UP, 0.11 * k);
          this.block(this.at(p.clone().addScaledVector(UP, 0.05 * k)), 0.03 * k, 0.11 * k, 0.03 * k, ZONE.IRON);
          this.gun(pivot.clone().addScaledVector(n, -0.1 * k), n.clone().addScaledVector(UP, 0.15), 0.26 * k, 0.022 * k, 0.017 * k);
          this.ball(pivot, 0.025 * k, gilt);
        }
        break;
      case F.sternChasers: { // a pair run out through the transom
        const y = 0.55 * f.railAft;
        for (const s of [1, -1]) {
          const x = s * Math.min(0.24 * k, 0.45 * f.half(0.01, y)), z = Math.min(f.zAft(y), f.at(0, y, V()).z);
          this.rect(frame(V(x, y, z - 0.05), V(0, 0, -1)), 0.15 * k, 0.14 * k, ZONE.DARK, 0.006);
          this.gun(V(x, y, z + 0.12 * k), V(0, 0.03, -1), 0.5 * k, 0.045 * k, 0.032 * k);
        }
        break;
      }
      case F.powderKegs: { // kegs stacked on the quarterdeck under a painted cloth
        const c = this.deckAt(0.13, 0);
        this.rect(frame(V(c.x, c.y, c.z), UP, AHEAD), 0.36 * k, 0.36 * k, ZONE.PAINT, 0.004);
        for (const [dx, dz, dy] of [[-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 1, 0], [0, 0, 1]]) this.cask(V(c.x + dx * 0.075 * k, c.y + dy * 0.15 * k, c.z + dz * 0.075 * k), 0.07 * k, 0.15 * k);
        break;
      }
      case F.mortar: { // a squat mortar on its bed, cocked aft
        const c = this.deckAt(0.22, 0);
        this.block(this.at(V(c.x, c.y + 0.05 * k, c.z)), 0.3 * k, 0.1 * k, 0.3 * k, ZONE.DARK);
        this.turn(V(c.x, c.y + 0.1 * k, c.z), V(0, 1, -0.35), [[0, 0], [0.13 * k, 0], [0.15 * k, 0.1 * k], [0.12 * k, 0.24 * k], [0.14 * k, 0.27 * k], [0.13 * k, 0.32 * k], [0.08 * k, 0.32 * k], [0.08 * k, 0.12 * k], [0, 0.12 * k]], ZONE.IRON);
        break;
      }
      case F.spareCanvas: // bolts of canvas lashed amidships
        for (let j = 0; j < 3; j++) {
          const p = this.deckAt(0.56, (j - 1) * 0.12 * k, 0.05 * k);
          p.z -= 0.25 * k;
          this.turn(p, AHEAD, [[0, 0], [0.05 * k, 0], [0.056 * k, 0.25 * k], [0.05 * k, 0.5 * k], [0, 0.5 * k]], ZONE.DECK);
          for (const t of [0.12, 0.36]) this.turn(V(p.x, p.y, p.z + t * k), AHEAD, [[0.05 * k, 0], [0.062 * k, 0], [0.062 * k, 0.02 * k], [0.05 * k, 0.02 * k]], ZONE.TAR);
        }
        break;
      case F.lateenMizzen: { // a long lateen yard on the aftmost mast, its sail furled along it
        const m = this.rig.masts.reduce((a, b) => (b.foot.z < a.foot.z ? b : a)), aside = V().crossVectors(m.axis, m.fwd).normalize();
        const a = m.foot.clone().addScaledVector(m.axis, 0.9 * k).addScaledVector(m.fwd, 0.9 * k).addScaledVector(aside, 0.07 * k);
        const d = m.foot.clone().addScaledVector(m.axis, 3.4 * k).addScaledVector(m.fwd, -1.2 * k).addScaledVector(aside, 0.07 * k).sub(a), len = d.length();
        this.turn(a, d, [[0, 0], [0.022 * k, 0], [0.03 * k, 0.5 * len], [0.018 * k, len], [0, len]], ZONE.SPAR);
        const dl = 0.72 * len;
        this.turn(a.clone().addScaledVector(d, 0.12).addScaledVector(UP, -0.05 * k), d, [[0, 0], [0.04 * k, 0.02 * dl], [0.06 * k, 0.5 * dl], [0.035 * k, 0.98 * dl], [0, dl]], ZONE.DECK);
        break;
      }
      case F.stormSails: { // storm canvas, tarred and furled, at the bowsprit heel and the mainmast
        const bundle = [[0, 0], [0.05 * k, 0], [0.062 * k, 0.25 * k], [0.04 * k, 0.5 * k], [0, 0.5 * k]];
        this.turn(V(0, f.railFwd + 0.06 * k, f.zFwd(f.railFwd) - 0.55 * k), V(0, 0.25, 1), bundle, ZONE.TAR);
        const m = this.main(), q = m.foot.clone().addScaledVector(m.axis, 0.1 * k).addScaledVector(m.fwd, -0.14 * k);
        q.x -= 0.25 * k;
        this.turn(q, V(1, 0, 0), bundle, ZONE.TAR);
        break;
      }
      case F.copperSheathing: // copper glinting along the waterline
        for (const s of [1, -1]) this.strip(s, this.fine ? 28 : 12, 0.03, 0.97, () => [-0.06 * k, 0.1 * k], 0.008, ZONE.GILT);
        break;
      case F.doubledPlanking: // a doubled band of strakes, iron-bolted
        for (const s of [1, -1]) {
          this.strip(s, this.fine ? 20 : 8, 0.1, 0.9, (u) => [0.34 * f.deck(u), 0.56 * f.deck(u)], 0.025 * k, ZONE.TRIM);
          if (this.fine) for (let j = 0; j <= 10; j++) for (const t of [0.38, 0.52]) {
            const u = 0.1 + 0.08 * j, { p, n } = this.side(u, t * f.deck(u), s);
            this.block(frame(p.addScaledVector(n, 0.03 * k), n), 0.025 * k, 0.025 * k, 0.012 * k, ZONE.IRON);
          }
        }
        break;
      case F.pumps: // chain pumps amidships, spouting at the scuppers
        for (const s of [1, -1]) {
          const p = this.deckAt(0.46, s * 0.16 * k, 0.12 * k), { p: q, n } = this.side(0.46, f.deck(0.46) + 0.02 * k, s);
          this.block(this.at(p), 0.09 * k, 0.24 * k, 0.09 * k, ZONE.DARK);
          this.block(this.at(V(p.x, p.y + 0.13 * k, p.z)), 0.05 * k, 0.02 * k, 0.4 * k, ZONE.IRON);
          this.block(frame(q, n), 0.07 * k, 0.04 * k, 0.1 * k, ZONE.TRIM);
          this.out.spouts.push(q.clone().addScaledVector(n, 0.06 * k));
        }
        break;
      case F.sternGlass: { // stern windows in gilt frames, quarter lights
        const y = 0.72 * f.railAft, z = Math.min(f.zAft(y), f.at(0, y, V()).z) - 0.055, half = 0.8 * f.half(0.01, y), n = Math.max(2, Math.min(5, Math.floor((2 * half) / (0.13 * k))));
        for (let j = 0; j < n; j++) {
          const xf = frame(V((j - (n - 1) / 2) * 0.13 * k, y, z), V(0, 0, -1));
          this.rect(xf, 0.11 * k, 0.14 * k, ZONE.GILT, 0.004);
          this.rect(xf, 0.085 * k, 0.11 * k, ZONE.GLASS, 0.008);
        }
        for (const s of [1, -1]) {
          const { p, n: nn } = this.side(0.05, 0.85 * f.rail(0.05), s), xf = frame(p, nn);
          this.rect(xf, 0.12 * k, 0.12 * k, ZONE.GILT, 0.006);
          this.rect(xf, 0.09 * k, 0.09 * k, ZONE.GLASS, 0.01);
        }
        break;
      }
      case F.crowsNest: { // a cask up the main topmast, a hand in it
        const m = this.main(), s1 = m.sections[1] ?? m.sections[0], p = this.aloft(m, s1.from + 0.55 * (s1.to - s1.from));
        this.cask(p, 0.13 * k, 0.2 * k);
        this.figure(p.clone().addScaledVector(m.fwd, 0.07 * k).addScaledVector(UP, 0.05 * k), 0.26 * k);
        break;
      }
      case F.lookout: { // a lookout in the foretop with a gilt glass
        const m = this.rig.masts.reduce((a, b) => (b.foot.z > a.foot.z ? b : a)), q = this.aloft(m, m.sections[0].to).addScaledVector(m.fwd, 0.12 * k).addScaledVector(UP, 0.02 * k);
        this.figure(q, 0.27 * k);
        this.gun(q.clone().add(V(0.03 * k, 0.21 * k, 0)), V(0, 0.08, 1), 0.14 * k, 0.012 * k, 0.016 * k, ZONE.GILT);
        break;
      }
    }
  }

  /** Hands at the helm, in the waist and forward; coils of rope by the masts. */
  crew(seed: number): void {
    const k = this.k;
    for (const [u, x] of [[0.1, 0], [0.47, 0.28], [0.53, -0.3], [0.84, 0.12]] as const) this.figure(this.deckAt(u, x * k * (hash(seed + u * 100) < 0.5 ? 1 : -1)), 0.27 * k);
    for (const m of this.rig.masts) this.turn(m.foot.clone().add(V(0.15 * k, 0.005, 0.12 * k)), UP, [[0.03 * k, 0], [0.065 * k, 0], [0.065 * k, 0.02 * k], [0.03 * k, 0.02 * k]], ZONE.TAR, 8);
  }

  wound(w: Wound): void {
    const { f, k } = this, r = (j: number) => hash(w.seed + j * 7919);
    if (w.kind === WOUND.scorch) { // fire's scorching, up the side and across the deck
      const { p, n } = this.side(w.u, f.rail(w.u) - 0.14 * k, w.side);
      this.fan(frame(p, n), this.ragged(w.seed, 11, 0.17 * k * w.size, 0.45), ZONE.TAR, 0.005);
      this.fan(frame(this.deckAt(w.u, w.side * 0.15 * k), UP, AHEAD), this.ragged(w.seed + 1, 11, 0.2 * k * w.size, 0.5), ZONE.TAR, 0.006);
      return;
    }
    if (w.kind === WOUND.rail) { // the rail stove in, splinters standing
      const { p, n } = this.side(w.u, f.rail(w.u) - 0.035 * k, w.side), xf = frame(p, n);
      this.fan(xf, this.ragged(w.seed, 8, 0.075 * k * w.size, 0.5).map(([x, y]) => [x * 1.4, y * 0.6] as const), ZONE.DARK, 0.007);
      if (this.fine) for (let j = 0; j < 4; j++) {
        const t = xf.clone().multiply(M4().makeTranslation((r(j) - 0.5) * 0.15 * k, 0.04 * k, 0.01)).multiply(M4().makeRotationZ((r(j + 9) - 0.5) * 1.2)).multiply(M4().makeTranslation(0, 0.035 * k, 0));
        this.block(t, 0.012 * k, 0.07 * k * (0.6 + 0.6 * r(j + 3)), 0.012 * k, ZONE.HULL);
      }
      return;
    }
    const { p, n } = this.side(w.u, 0.12 * k + w.h * Math.max(f.rail(w.u) - 0.3 * k, 0.05), w.side), xf = frame(p, n);
    if (w.kind === WOUND.patch) { // fresh planks nailed over the hole
      const rot = (r(1) - 0.5) * 0.3, s = w.size, turned = xf.clone().multiply(M4().makeRotationZ(rot));
      this.rect(xf, 0.19 * k * s, 0.13 * k * s, ZONE.DECK, 0.008, rot);
      for (const dy of [-0.022, 0.022]) this.rect(turned.clone().multiply(M4().makeTranslation(0, dy * k * s, 0)), 0.19 * k * s, 0.006 * k, ZONE.DARK, 0.01);
      if (this.fine) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.rect(turned.clone().multiply(M4().makeTranslation(sx * 0.08 * k * s, sy * 0.05 * k * s, 0)), 0.014 * k, 0.014 * k, ZONE.IRON, 0.012);
      return;
    }
    // a shot hole, ragged and black, splinters sprung outward round it
    this.fan(xf, this.ragged(w.seed, 9, 0.07 * k * w.size, 0.45), ZONE.DARK, 0.007);
    if (this.fine) for (let j = 0; j < 5; j++) {
      const a = (j / 5) * 2 * Math.PI + r(j), rr = 0.07 * k * w.size;
      const t = xf.clone().multiply(M4().makeTranslation(Math.cos(a) * rr, Math.sin(a) * rr, 0.01)).multiply(M4().makeRotationZ(a - Math.PI / 2)).multiply(M4().makeRotationX(0.7)).multiply(M4().makeTranslation(0, 0.03 * k, 0));
      this.block(t, 0.014 * k, 0.06 * k * (0.6 + 0.8 * r(j + 5)), 0.008 * k, ZONE.HULL);
    }
  }
}

/** Builds a ship's fittings (by FITTING kind) and wounds into mesher m; fine adds splinters and bolts, crew the hands and coils (hero level). */
export function dressHull(m: ShipMesher, rig: Rig, fittings: readonly Fit[], wounds: readonly Wound[], fine: boolean, seed = 0, crew = fine): Dressed {
  const d = new Dresser(m, rig, fine);
  for (const fit of fittings) if (fit.kind !== FITTING.none) d.fitting(fit.kind, fit.tier);
  for (const w of wounds) d.wound(w);
  if (crew) d.crew(seed);
  return d.out;
}

function merge(base: THREE.BufferGeometry, extra: THREE.BufferGeometry): THREE.BufferGeometry {
  const bi = base.index, ei = extra.index;
  if (!bi || !ei || ei.count === 0) return base;
  const n = base.getAttribute('position').count, en = extra.getAttribute('position').count, g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(base.attributes)) {
    const a = attr as THREE.BufferAttribute, b = extra.getAttribute(name) as THREE.BufferAttribute | undefined, size = a.itemSize, out = new Float32Array((n + en) * size);
    out.set(a.array as ArrayLike<number>);
    if (b && b.itemSize === size) out.set(b.array as ArrayLike<number>, n * size);
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  const idx = new Uint32Array(bi.count + ei.count);
  idx.set(bi.array as ArrayLike<number>);
  for (let i = 0; i < ei.count; i++) idx[bi.count + i] = (ei.array[i] as number) + n;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  if (!base.boundingSphere) base.computeBoundingSphere();
  g.boundingSphere = base.boundingSphere!.clone();
  g.boundingSphere.radius *= 1.1;
  return g;
}

/** A ship's fittings and wounds merged into its hero and mid wood (no extra draw call), rebuilt when either changes. */
export class Outfit {
  /** Where it smokes and spouts (ship frame), from the hero level's build. */
  chimney: THREE.Vector3 | null = null;
  spouts: THREE.Vector3[] = [];
  private readonly woods: { mesh: THREE.Mesh; base: THREE.BufferGeometry; fine: boolean; extra: number }[];
  private readonly rig: Rig;
  private key = '';

  constructor(ship: THREE.Object3D, rig: Rig) {
    this.rig = rig;
    const ws: THREE.Mesh[] = [];
    ship.traverse((o) => {
      const m = o as THREE.Mesh, g = m.geometry as THREE.BufferGeometry | undefined;
      if (m.isMesh && g?.index && g.getAttribute('aInfo')?.itemSize === 2 && (m.material as THREE.ShaderMaterial).uniforms?.uLantern) ws.push(m);
    });
    ws.sort((a, b) => b.geometry.index!.count - a.geometry.index!.count);
    this.woods = ws.slice(0, ws.length >= 3 ? 2 : 1).map((mesh, i) => ({ mesh, base: mesh.geometry, fine: i === 0, extra: 0 }));
  }

  /** Triangles the outfit adds at a level. */
  extra(lod: string): number {
    return lod === 'hero' ? (this.woods[0]?.extra ?? 0) : lod === 'mid' ? (this.woods[1]?.extra ?? 0) : 0;
  }
  /** Triangles it adds at the finest level. */
  get triangles(): number {
    return this.woods[0]?.extra ?? 0;
  }

  /** Rebuilds the outfit if the fittings or the wounds changed; whether it did. */
  dress(fittings: readonly Fit[], wounds: readonly Wound[], seed: number): boolean {
    const key = fittings.map((f) => `${f.kind}.${f.tier}`).join() + '|' + wounds.map((w) => `${w.kind}${w.seed}`).join();
    if (key === this.key) return false;
    this.key = key;
    for (const w of this.woods) {
      const m = new ShipMesher(), out = dressHull(m, this.rig, fittings, wounds, w.fine, seed);
      if (w.fine) { this.chimney = out.chimney; this.spouts = out.spouts; }
      const extra = m.build(), g = merge(w.base, extra);
      extra.dispose();
      if (w.mesh.geometry !== w.base) w.mesh.geometry.dispose();
      w.mesh.geometry = g;
      w.extra = m.triangles / 3;
    }
    return true;
  }

  dispose(): void {
    for (const w of this.woods) if (w.mesh.geometry !== w.base) w.base.dispose();
  }
}

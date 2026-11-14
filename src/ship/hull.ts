// The galleon's hull and what is fixed to it, ported from the galleon branch: the planked skin and flat transom,
// the wales and the painted strakes over them (the captain's colour), the solid bulwarks with their cap rail, the
// decks and the bulkheads where they step, the transom's framing (gilt rails, dark stiles, panels of upright
// planking, a frieze in her colour) and crest, the rudder, the beakhead (bare: no figure), the catheads and anchors,
// gratings, and the plinth amidships that a gun will stand on.
//
// Left out, by the owner's rule that nothing on her shows that anyone was ever aboard: windows, the stern lantern,
// quarter galleries, doors, ladders, the ship's boat, the capstan, the whipstaff's hood and the gunports.
//
// Design metres (lines.ts). `D` says how finely (detail.ts).

import { Vector3 } from 'three/webgpu';
import type { Detail } from './detail.ts';
import { Acc, KIND, V, along, beam, box, fan, lathe, lerp, range, rod, sheet, sm, trs, tube } from './kit.ts';
import {
  LEN, LEVELS, MOUNT_S, PLINTH, deckAt, halfAt, inside, keel, levelDeck, mainDeck, onSkin, sideTop, zAt, zOf,
} from './lines.ts';

/** The planks' texture repeats every this many design metres. */
const PLANK_TILE = 3.4;
/** The decks' runs across: the inboard faces see less of the sky. */
const DECK_AO = 0.75, INBOARD_AO = 0.8;
/** How far over the main deck the band in the captain's colour along her topsides reaches. */
const TOPSIDE = 0.5;

export function buildHull(body: Acc, D: Detail): void {
  skin(body, D);
  transom(body, D);
  strakes(body, D);
  if (D.inboard) bulwarks(body, D);
  decks(body, D);
  if (D.inboard) bulkheads(body, D);
  if (D.run) frieze(body);
  if (D.fittings) stern(body);
  if (D.head) { rudder(body, D); beakhead(body, D); }
  plinth(body, D);
  if (D.fittings) fittings(body);
}

// ---------------------------------------------------------------- the skin

/** Stations from transom to stem, closer together at either end where the lines turn fastest. */
const stations = (n: number) => Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1)));
/** Heights up a station from keel to the side's top, closer together round the bilge. */
const heightAt = (s: number, t: number) => { const k = keel(s); return k + (sideTop(s) - k) * (t < 0.5 ? 0.5 * (2 * t) ** 1.25 : t); };

function skin(acc: Acc, D: Detail): void {
  const S = stations(D.stations);
  acc.with({ kind: KIND.planks }, () => {
    for (const side of [1, -1]) {
      const grid: Vector3[][] = [], uvs: [number, number][][] = [];
      for (const s of S) {
        const row: Vector3[] = [], ruv: [number, number][] = [];
        let arc = 0, prev: Vector3 | null = null;
        for (let j = 0; j <= D.rows; j++) {
          const p = onSkin(s, heightAt(s, j / D.rows), side);
          if (prev) arc += p.distanceTo(prev);
          prev = p;
          row.push(p);
          ruv.push([p.z / PLANK_TILE, (arc - 3.3) / PLANK_TILE]);
        }
        grid.push(row);
        uvs.push(ruv);
      }
      sheet(acc, grid, uvs, V(side, 0, 0));
    }
  });
  if (!D.head) return;
  acc.with({ kind: KIND.dark }, () => {
    // the keel's flat underside between the two garboards
    const kg: Vector3[][] = S.map((s) => [onSkin(s, keel(s), -1), onSkin(s, keel(s), 1)]);
    sheet(acc, kg, kg.map((r) => r.map((p): [number, number] => [p.z / 3, p.x / 3])), V(0, -1, 0));
    // the keel timber and the stem, one curve from the sternpost's foot round the forefoot to the head
    const n = Math.max(6, D.stations >> 1), path: Vector3[] = [];
    for (let i = 0; i <= n; i++) { const s = 0.02 + 0.98 * (i / n); path.push(V(0, keel(s) - 0.12, zOf(s, keel(s)))); }
    for (let i = 1; i <= n >> 1; i++) { const y = lerp(keel(1), sideTop(1) - 0.2, i / (n >> 1)); path.push(V(0, y, zOf(1, y) + 0.08)); }
    tube(acc, path, 0.2, Math.max(3, D.waleSides), { vScale: 2 });
  });
}

function transom(acc: Acc, D: Detail): void {
  const grid: Vector3[][] = [], uvs: [number, number][][] = [];
  for (let j = 0; j <= D.rows; j++) {
    const y = heightAt(0, j / D.rows), h = halfAt(0, y), z = zOf(0, y);
    const row: Vector3[] = [], ruv: [number, number][] = [];
    for (const x of range(-h, h, Math.max(1, D.deck[1] * 2))) { row.push(V(x, y, z)); ruv.push([x / PLANK_TILE, y / PLANK_TILE]); }
    grid.push(row);
    uvs.push(ruv);
  }
  acc.with({ kind: KIND.planks }, () => sheet(acc, grid, uvs, V(0, 0, -1)));
}

// ---------------------------------------------------------------- wales and strakes

/** A rounded wale standing proud of the skin along a height line y(s), over stations a..b. */
function wale(acc: Acc, D: Detail, y: (s: number) => number, a: number, b: number, r: number): void {
  for (const side of [1, -1]) {
    const pts = range(a, b, D.run).map((s) => { const p = onSkin(s, y(s), side); p.x += side * (0.05 + r * 0.3); return p; });
    tube(acc, pts, r, D.waleSides, { vScale: 3 });
  }
}

/** A painted band laid on the skin between two height lines. */
function strake(acc: Acc, D: Detail, y0: (s: number) => number, y1: (s: number) => number, a: number, b: number): void {
  for (const side of [1, -1]) {
    const grid = range(a, b, D.run).map((s) => [y0(s), y1(s)].map((y) => { const p = onSkin(s, y, side); p.x += side * 0.025; return p; }));
    sheet(acc, grid, grid.map((row) => row.map((p): [number, number] => [p.z / PLANK_TILE, p.y / PLANK_TILE])), V(side, 0, 0));
  }
}

function strakes(acc: Acc, D: Detail): void {
  if (D.run === 0) return;
  const md = mainDeck;
  // the main wale at the waist deck, a lower wale over the waterline, and one along each castle
  if (D.waleSides) acc.with({ kind: KIND.dark }, () => {
    wale(acc, D, (s) => md(s) - 0.35, 0.0, 0.985, 0.13);
    wale(acc, D, (s) => md(s) - 1.35, 0.0, 0.97, 0.12);
    wale(acc, D, (s) => 0.55 + 0.25 * (s - 0.5) ** 2, 0.02, 0.95, 0.1);
    wale(acc, D, (s) => md(s) + 2.15 - 0.3, 0.0, 0.36, 0.09);
    wale(acc, D, (s) => md(s) + 2.25 - 0.25 + 0.4 * sm(0.8, 1, s), 0.81, 0.975, 0.08);
    wale(acc, D, (s) => md(s) + 4.3 - 0.3, 0.0, 0.13, 0.08);
  });
  // the painted strakes just over each wale, the main wale's a broad band along her topsides that reads from afar,
  // as the painting has it: the captain's colour. Twice the drawings' height where there is no wale to show them.
  const k = D.waleSides ? 1 : 2;
  acc.with({ kind: KIND.paint }, () => {
    strake(acc, D, (s) => md(s) - 0.2, (s) => md(s) + TOPSIDE, 0.0, 0.975);
    strake(acc, D, (s) => md(s) - 1.22, (s) => md(s) - 1.22 + 0.1 * k, 0.0, 0.96);
    strake(acc, D, (s) => md(s) + 2.0, (s) => md(s) + 2.0 + 0.1 * k, 0.0, 0.37);
    strake(acc, D, (s) => md(s) + 2.45 + 0.4 * sm(0.8, 1, s), (s) => md(s) + 2.45 + 0.1 * k + 0.4 * sm(0.8, 1, s), 0.81, 0.97);
    strake(acc, D, (s) => md(s) + 4.45, (s) => md(s) + 4.45 + 0.1 * k, 0.0, 0.14);
  });
}

// ---------------------------------------------------------------- bulwarks and the rail's cap

function bulwarks(acc: Acc, D: Detail): void {
  acc.with({ kind: KIND.planks, ao: INBOARD_AO }, () => {
    for (const l of LEVELS) for (const side of [1, -1]) {
      const grid = range(Math.max(0.002, l.a), Math.min(0.992, l.b), Math.max(2, D.run >> 2)).map((s) => {
        const d = levelDeck(l, s), top = sideTop(s);
        return range(d - 0.05, top, Math.max(1, D.rows >> 3)).map((y) => V(side * inside(s, y), y, zOf(s, y)));
      });
      sheet(acc, grid, grid.map((row) => row.map((p): [number, number] => [p.z / PLANK_TILE, p.y / PLANK_TILE])), V(-side, 0, 0));
    }
  });
  // the cap rail over the side's top, outer edge to inner, from the stern to the stem: gilt, as the transom's rails
  acc.with({ kind: KIND.gilt }, () => {
    for (const side of [1, -1]) {
      const grid = range(0.0, 0.992, D.run * 2).map((s) => {
        const y = sideTop(s), o = onSkin(s, y, side);
        o.x += side * 0.06;
        const i = V(side * (inside(s, y) - 0.04), y, o.z);
        return [V(o.x, y - 0.12, o.z), V(o.x, y + 0.06, o.z), V(i.x, y + 0.06, i.z)];
      });
      sheet(acc, grid, grid.map((row, k) => row.map((_, j): [number, number] => [(k / grid.length) * LEN / 2, j * 0.06])), V(side, 1, 0));
    }
    const y = sideTop(0), h = halfAt(0, y), z = zOf(0, y);
    beam(acc, V(-h - 0.05, y, z + 0.05), V(h + 0.05, y, z + 0.05), 0.22, 0.32, V(0, 1, 0));
  });
}

// ---------------------------------------------------------------- decks and bulkheads

function decks(acc: Acc, D: Detail): void {
  acc.with({ kind: KIND.deck, ao: D.inboard ? DECK_AO : 1 }, () => {
    for (const l of LEVELS) {
      const grid = range(l.a, l.b, D.deck[0]).map((s) => {
        const y = levelDeck(l, s), w = inside(s, y);
        return range(-w, w, D.deck[1]).map((x) => V(x, y, zOf(s, y)));
      });
      sheet(acc, grid, grid.map((r) => r.map((p): [number, number] => [p.z / 3.2, p.x / 3.2])), V(0, 1, 0));
    }
  });
}

/** A plain planked bulkhead across her at station s, from the lower deck to the upper, facing `dir` (+1 forward). */
function bulkhead(acc: Acc, D: Detail, s: number, lower: number, upper: number, dir: number): void {
  const y0 = levelDeck(LEVELS[lower], s) - 0.05, y1 = levelDeck(LEVELS[upper], s) + 0.02;
  const grid = range(y0, y1, 2).map((y) => { const w = inside(s, y); return range(-w, w, 2).map((x) => V(x, y, zOf(s, y) + dir * 0.02)); });
  acc.with({ kind: KIND.planks, ao: INBOARD_AO }, () =>
    sheet(acc, grid, grid.map((r) => r.map((p): [number, number] => [p.x / PLANK_TILE + 0.3, p.y / PLANK_TILE])), V(0, 0, dir)));
  // the beam under the upper deck's edge
  if (!D.fittings) return;
  const zf = zOf(s, y1) + dir * 0.08, w = inside(s, y1);
  acc.with({ kind: KIND.spar }, () => beam(acc, V(-w, y1 - 0.12, zf), V(w, y1 - 0.12, zf), 0.25, 0.18, V(0, 1, 0)));
}

function bulkheads(acc: Acc, D: Detail): void {
  const [poop, quarter, , fore] = LEVELS;
  bulkhead(acc, D, poop.b, 1, 0, 1);
  bulkhead(acc, D, quarter.b, 2, 1, 1);
  bulkhead(acc, D, fore.a, 2, 3, -1);
}

// ---------------------------------------------------------------- the stern

/** The transom's face at height y, a hair aft of its planking; and the way it faces (aft, and down as it rakes). */
const zT = (y: number) => zOf(0, y) - 0.04;
const AFT = V(0, -0.2, -1).normalize();
/** The transom's rails, bottom to top: the counter's, under and over the quarterdeck, under the poop, the taffrail. */
const railsAt = () => {
  const qd = levelDeck(LEVELS[1], 0), pd = levelDeck(LEVELS[0], 0);
  return [mainDeck(0) - 0.4, qd - 0.15, qd + 0.45, pd - 0.25, sideTop(0) - 0.05];
};
/** Panels across each tier between two rails; one is a frieze in the captain's colour. */
const TIERS = [2, 1, 3, 3], FRIEZE = 1;

/** A flat panel on the transom between heights y0 and y1, from fraction a to b of its breadth, `out` proud of it. */
function panel(acc: Acc, y0: number, y1: number, a: number, b: number, inset: number, out: number, upright: boolean): void {
  const grid = [y0 + inset, y1 - inset].map((y) => {
    const h = halfAt(0, y) - 0.06;
    return [lerp(-h, h, a) + inset, lerp(-h, h, b) - inset].map((x) => V(x, y, zT(y) - out));
  });
  // upright: its planks run up and down, across the transom's own
  const uv = (p: Vector3): [number, number] => (upright ? [p.y / PLANK_TILE, p.x / PLANK_TILE + 0.2] : [p.x / PLANK_TILE, p.y / PLANK_TILE]);
  sheet(acc, grid, grid.map((r) => r.map(uv)), AFT);
}

/** The frieze in the captain's colour between the quarterdeck's rails, the one part of the stern every level shows. */
function frieze(acc: Acc): void {
  const rails = railsAt();
  acc.with({ kind: KIND.paint }, () => panel(acc, rails[FRIEZE], rails[FRIEZE + 1], 0, 1, 0.06, 0.02, false));
}

/**
 * The transom framed: gilt rails across her at each deck and the counter, dark stiles between them, and between
 * those plain panels of upright planking, the frieze in her colour; the fashion pieces up either edge; a carved crest
 * over the taffrail.
 */
function stern(acc: Acc): void {
  const rails = railsAt();
  acc.with({ kind: KIND.gilt }, () => {
    for (const y of rails) {
      const h = halfAt(0, y);
      tube(acc, [V(-h, y, zT(y) - 0.02), V(h, y, zT(y) - 0.02)], 0.07, 5, { caps: true });
    }
  });
  TIERS.forEach((n, i) => {
    const y0 = rails[i], y1 = rails[i + 1];
    acc.with({ kind: KIND.dark }, () => {
      for (let k = 1; k < n; k++) {
        const x = (y: number) => lerp(-(halfAt(0, y) - 0.06), halfAt(0, y) - 0.06, k / n);
        beam(acc, V(x(y0), y0, zT(y0) - 0.03), V(x(y1), y1, zT(y1) - 0.03), 0.16, 0.08, V(0, 0, 1));
      }
    });
    if (i === FRIEZE) return;
    acc.with({ kind: KIND.planks }, () => { for (let k = 0; k < n; k++) panel(acc, y0, y1, k / n, (k + 1) / n, 0.14, 0.015, true); });
  });
  // the fashion pieces: where the transom meets her sides, from the counter's foot to the taffrail
  acc.with({ kind: KIND.dark }, () => {
    for (const side of [1, -1]) {
      const pts = range(0.5, sideTop(0) - 0.05, 10).map((y) => V(side * (halfAt(0, y) - 0.05), y, zT(y) - 0.02));
      tube(acc, pts, 0.11, 5, { caps: true });
    }
  });
  acc.with({ kind: KIND.gilt }, () => {
    const top = sideTop(0) + 0.06, ht = halfAt(0, sideTop(0)) - 0.15, zc = zT(top) + 0.1;
    const arch = range(-1, 1, 12).map((t) => V(t * ht, top + 0.7 * Math.cos((t * Math.PI) / 2) ** 0.8, zc));
    tube(acc, arch, 0.08, 5, { caps: true });
    const crest = [V(-ht, top - 0.05, zc + 0.05), ...arch.map((p) => p.clone().add(V(0, -0.03, 0.05))), V(ht, top - 0.05, zc + 0.05)];
    acc.with({ kind: KIND.spar }, () => {
      fan(acc, crest, V(0, 0.2, 1).normalize(), 1);
      fan(acc, crest.map((p) => p.clone().add(V(0, 0, -0.03))), V(0, 0.2, -1).normalize(), 1);
    });
  });
}

// ---------------------------------------------------------------- the rudder

/** The rudder hung on the sternpost, tapering from 1.5 m at its foot to 0.55 at its head, capped; at the finest level
 * its iron straps (the pintles' and gudgeons', as the galleon branch has them). */
function rudder(acc: Acc, D: Detail): void {
  const y0 = keel(0) + 0.1, y1 = mainDeck(0) + 0.9;
  const width = (y: number) => lerp(1.5, 0.55, (y - y0) / (y1 - y0));
  const pts = range(y0, y1, 4).map((y) => { const z = zOf(0, y) - 0.12; return [V(0, y, z), V(0, y, z - width(y))]; });
  acc.with({ kind: KIND.dark }, () => {
    for (const side of [1, -1]) {
      const grid = pts.map((r) => r.map((p) => V(side * 0.16, p.y, p.z)));
      sheet(acc, grid, grid.map((r) => r.map((p): [number, number] => [p.z / 2, p.y / 2])), V(side, 0, 0));
    }
    const edge = pts.map((r) => [V(-0.16, r[1].y, r[1].z), V(0.16, r[1].y, r[1].z)]);
    sheet(acc, edge, edge.map((r) => r.map((p): [number, number] => [p.x, p.y / 2])), V(0, 0, -1));
    const [fore, aft] = pts[pts.length - 1];
    fan(acc, [V(0.16, y1, fore.z), V(-0.16, y1, fore.z), V(-0.16, y1, aft.z), V(0.16, y1, aft.z)], V(0, 1, 0), 1);
  });
  if (!D.fittings) return;
  acc.with({ kind: KIND.iron }, () => {
    for (const y of range(y0 + 0.5, y1 - 0.4, 4)) {
      const w = width(y);
      box(acc, trs(V(0, y, zOf(0, y) - 0.12 - w * 0.45)), 0.36, 0.12, w * 0.9 + 0.3);
    }
  });
}

// ---------------------------------------------------------------- the beakhead

function beakhead(acc: Acc, D: Detail): void {
  const stem = (y: number) => V(0, y, zOf(1, y) + 0.1);
  const tip = V(0, 3.75, zOf(1, 3.5) + 4.8);
  const n = D.fittings ? 10 : 5;
  // the knee of the head: a deep timber from the cutwater sweeping forward and up to the beak's tip, planked and oiled
  // as the hull is (in pitch it stood off her bow as a black boat of its own)
  const bez = (t: number) => {
    const p0 = stem(1.9), p1 = V(0, 2.5, tip.z - 1.4), p2 = tip.clone().add(V(0, -0.25, 0));
    return p0.clone().multiplyScalar((1 - t) ** 2).addScaledVector(p1, 2 * t * (1 - t)).addScaledVector(p2, t * t);
  };
  acc.with({ kind: KIND.planks }, () => {
    for (const side of [1, -1]) {
      const grid = range(0, 1, n).map((t) => {
        const o = bez(t), i = stem(lerp(1.9, 3.5, t)), th = lerp(0.18, 0.09, t);
        return [V(side * th, i.y, i.z), V(side * th, o.y, o.z)];
      });
      sheet(acc, grid, grid.map((r) => r.map((p): [number, number] => [p.z / PLANK_TILE, p.y / PLANK_TILE])), V(side, 0, 0));
    }
  });
  acc.with({ kind: KIND.paint }, () => tube(acc, range(0, 1, n).map(bez), 0.1, Math.max(3, D.waleSides), { caps: true }));
  // the beak's platform, narrowing to the tip
  const yb = 3.6, z0 = zOf(1, yb) - 0.4;
  const plat = [V(-1.15, yb, z0), V(1.15, yb, z0), V(0.25, tip.y, tip.z - 0.3), V(-0.25, tip.y, tip.z - 0.3)];
  acc.with({ kind: KIND.deck }, () => fan(acc, plat, V(0, 1, 0), 1.5));
  if (!D.fittings) return;
  acc.with({ kind: KIND.spar }, () => {
    for (let k = 0; k < 7; k++) {
      const t = (k + 0.5) / 7;
      beam(acc, plat[0].clone().lerp(plat[3], t).add(V(0, 0.04, 0)), plat[1].clone().lerp(plat[2], t).add(V(0, 0.04, 0)), 0.06, 0.06, V(0, 1, 0));
    }
  });
  // head rails: three a side, sweeping from the tip up and aft onto the bow
  for (const side of [1, -1]) {
    for (let r = 0; r < 3; r++) {
      const end = onSkin(0.955, 4.0 + r * 0.55, side); end.x += side * 0.08;
      const mid = V(side * (1.25 - r * 0.12), 4.15 + r * 0.4, lerp(end.z, tip.z, 0.32));
      const st = tip.clone().add(V(side * 0.12, 0.05 + r * 0.05, -0.2 - r * 0.25));
      const pts = range(0, 1, 8).map((t) => st.clone().multiplyScalar((1 - t) ** 2).addScaledVector(mid, 2 * t * (1 - t)).addScaledVector(end, t * t));
      acc.with({ kind: r === 1 ? KIND.gilt : KIND.paint }, () => tube(acc, pts, 0.065, 6, { caps: true }));
    }
    // the cathead, and the anchor hanging from it
    const ch = onSkin(0.91, deckAt(0.91) + 0.25, side), end = ch.clone().add(V(side * 1.3, 0.35, 0.55));
    acc.with({ kind: KIND.spar }, () => beam(acc, ch, end, 0.3, 0.3, V(0, 1, 0)));
    anchor(acc, end.clone().add(V(side * 0.05, -0.35, 0)), side);
  }
}

/** A great anchor: shank, curved arms with flukes, a wooden stock. */
function anchor(acc: Acc, top: Vector3, side: number): void {
  const down = V(side * 0.15, -1, 0.35).normalize();
  const crown = top.clone().addScaledVector(down, 3.0);
  const across = V(0, 0, 1).cross(down).normalize();
  acc.with({ kind: KIND.iron }, () => {
    rod(acc, top, crown, 0.09, 0.11, 5);
    for (const sgn of [1, -1]) {
      const arm = range(0, 1, 4).map((t) => crown.clone().addScaledVector(across, sgn * 0.85 * Math.sin(t * 1.4)).addScaledVector(down, -1.05 * t * t));
      tube(acc, arm, 0.08, 4, { caps: true });
      const f = arm[arm.length - 1];
      box(acc, along(f.clone().addScaledVector(down, 0.12), down.clone().multiplyScalar(-1).addScaledVector(across, sgn * 0.6), V(side, 0, 0)), 0.42, 0.55, 0.05);
    }
  });
  const s = top.clone().addScaledVector(down, 0.3), stock = V(side, 0, 0).cross(down).normalize();
  acc.with({ kind: KIND.dark }, () => beam(acc, s.clone().addScaledVector(stock, -1.4), s.clone().addScaledVector(stock, 1.4), 0.17, 0.17, down));
}

// ---------------------------------------------------------------- the gun's plinth and the gratings

/** The gun's mount: a turned plinth on the waist's centreline, its flat top the mount point (mount.ts: GUN_MOUNT). */
function plinth(acc: Acc, D: Detail): void {
  const y = levelDeck(LEVELS[2], MOUNT_S), z = zAt(MOUNT_S), { height: h, radius: r } = PLINTH;
  if (D.topSides === 0) return;
  acc.with({ kind: KIND.dark }, () => lathe(acc, [[r * 1.15, -0.05], [r * 1.15, 0.12], [r * 0.85, 0.25], [r * 0.8, h - 0.12], [r, h - 0.06], [r, h], [0, h]],
    Math.max(6, D.topSides - 2), trs(V(0, y, z))));
}

function fittings(acc: Acc): void {
  // gratings on the forecastle and the poop
  for (const [l, s] of [[LEVELS[3], 0.86], [LEVELS[0], 0.06]] as const) {
    const y = levelDeck(l, s), z = zAt(s);
    acc.with({ kind: KIND.spar }, () => box(acc, trs(V(0, y + 0.1, z)), 1.5, 0.2, 1.6));
    acc.with({ kind: KIND.dark }, () => { for (let i = 0; i < 6; i++) box(acc, trs(V(lerp(-0.6, 0.6, i / 5), y + 0.21, z)), 0.05, 0.03, 1.4); });
  }
}

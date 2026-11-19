// The galleon's rig, ported from the galleon branch: three masts — the fore and main with lower masts, plain tops,
// topmasts, crosstrees and topgallant poles, the mizzen with a pole topmast — a plain bowsprit, the yards, and the
// ropes: shrouds set up with deadeyes on channels (no ratlines), stays forward, and the running lines (ties, lifts,
// clewlines, sheets, tacks, braces). The sails themselves are sails.ts's.
//
// The square yards and everything on them carry their mast as a pivot (kit.ts) so the shader can brace them; a rope
// from a yard to something fixed swings fully at the yard and not at all at its other end.
//
// Design metres (lines.ts). Spars go into the body, ropes into their own draw.

import { Vector3 } from 'three/webgpu';
import type { Detail } from './detail.ts';
import { Acc, KIND, PIVOT, V, along, beam, box, lathe, range, rod, rope, trs, tube } from './kit.ts';
import { BOWSPRIT, LEN, MASTS, deckAt, halfAt, mastFoot, mastZ, poleZ, sideTop, sprit, topmastZ, zAt, type MastName } from './lines.ts';
import { LATEEN, YARDS, arm, lateenClew, lateenCross, lateenPeak, lateenTack, squarePoint, type Yard } from './sails.ts';

/** Each top's radius, and how many shrouds a side each mast has. */
const TOP_R: Record<MastName, number> = { main: 2.0, fore: 1.75, mizzen: 1.15 };
const SHROUDS: Record<MastName, number> = { main: 6, fore: 5, mizzen: 4 };
const NAMES = Object.keys(MASTS) as MastName[];

export function buildRig(body: Acc, ropes: Acc, D: Detail): void {
  body.with({ kind: KIND.spar }, () => {
    for (const m of NAMES) mast(body, D, m);
    bowsprit(body, D);
    lateenYard(body, D);
  });
  for (const Y of YARDS) yard(body, ropes, D, Y);
  if (D.ropes === 'none') return;
  for (const m of NAMES) shrouds(body, ropes, D, m);
  stays(ropes, D);
  if (D.ropes === 'running') lateenLines(ropes, D);
}

// ---------------------------------------------------------------- masts

/** A round cap at a mast's tip (no finial): where the pennant flies. */
const truckCap = (acc: Acc, at: Vector3, sides: number) => lathe(acc, [[0, -0.08], [0.16, -0.06], [0.16, 0.06], [0, 0.08]], sides, trs(at));

function mast(acc: Acc, D: Detail, name: MastName): void {
  const m = MASTS[name], z = mastZ(name), foot = mastFoot(name), r = m.r;
  const small = D.topSides > 0;
  // the lower mast, from the deck to its head over the top, bound with wooldings near
  rod(acc, foot.clone().add(V(0, -0.2, 0)), V(0, m.top + 1.3, z), r, r * 0.78, D.mastSides, small, 3);
  if (D.fittings) acc.with({ kind: KIND.dark }, () => {
    const woolding: [number, number][] = [[r * 1.03, -0.09], [r * 1.09, 0], [r * 1.03, 0.09]];
    for (let y = foot.y + 1.6; y < m.top - 2.2; y += 1.25) lathe(acc, woolding, D.mastSides, trs(V(0, y, z)));
    lathe(acc, [[r * 1.8, 0], [r * 1.6, 0.35], [r * 1.1, 0.45]], D.mastSides, trs(foot.clone().add(V(0, -0.02, 0))));
  });
  if (small) top(acc, D, name, m.top, z, r * 0.8);
  // the topmast stands forward of the lower masthead, held by the cap
  const tr = r * 0.55, tz = topmastZ(name);
  rod(acc, V(0, m.top - 1.0, tz), V(0, m.cross ? m.cross + 0.9 : m.tip, tz), tr, tr * 0.72, Math.max(3, D.mastSides - 2), small, 3);
  if (small) box(acc, trs(V(0, m.top + 1.2, (z + tz) / 2)), r * 1.9, 0.28, tz - z + r * 1.9);
  if (!m.cross) { if (small) truckCap(acc, V(0, m.tip + 0.08, tz), D.mastSides); return; }
  // crosstrees at the topmast's head, the topgallant pole forward of it
  const pr = tr * 0.55, pz = poleZ(name);
  if (small) {
    for (const x of [-tr - 0.06, tr + 0.06]) box(acc, trs(V(x, m.cross, tz)), 0.1, 0.14, 1.3);
    for (const dz of [-0.35, 0.35]) box(acc, trs(V(0, m.cross + 0.1, tz + dz)), 2.4, 0.1, 0.1);
    box(acc, trs(V(0, m.cross + 0.82, (tz + pz) / 2)), tr * 2.2, 0.2, pz - tz + tr * 2);
    truckCap(acc, V(0, m.tip + 0.08, pz), D.mastSides);
  }
  rod(acc, V(0, m.cross - 0.7, pz), V(0, m.tip, pz), pr, pr * 0.55, Math.max(3, D.mastSides - 2), small, 3);
}

/** A top: a plain round platform on its trestles and crosstrees, dished up to its rim. */
function top(acc: Acc, D: Detail, name: MastName, y: number, z: number, r: number): void {
  const R = TOP_R[name];
  for (const x of [-0.35, 0.35]) box(acc, trs(V(x, y - 0.12, z)), 0.18, 0.24, R * 1.7);
  if (D.fittings) {
    for (const dz of [-0.7, 0.3, 0.9]) box(acc, trs(V(0, y - 0.3, z + dz * R * 0.6)), R * 1.8, 0.16, 0.16);
    for (const sx of [1, -1]) beam(acc, V(sx * r, y - 2.4, z), V(sx * (r + 0.12), y - 0.35, z), 0.2, 0.5, V(0, 0, 1));
  }
  const platform: [number, number][] = [[r + 0.05, -0.05], [R * 0.95, -0.05], [R, 0.0], [R, 0.22], [R * 0.95, 0.22], [r + 0.05, 0.12]];
  const under: [number, number][] = [[R * 0.7, -0.35], [R * 0.95, -0.05], [R * 0.95, -0.03], [R * 0.7, -0.33]];
  lathe(acc, platform, D.topSides, trs(V(0, y, z)), 1);
  acc.with({ kind: KIND.dark }, () => lathe(acc, under, D.topSides, trs(V(0, y, z)), 1));
}

/** The bowsprit: a plain spar, lashed down to the knee of the head. */
function bowsprit(acc: Acc, D: Detail): void {
  rod(acc, BOWSPRIT.heel, sprit(1), 0.33, 0.13, D.mastSides, D.topSides > 0, 3);
  if (D.fittings) acc.with({ kind: KIND.dark }, () => {
    for (let i = 0; i < 4; i++) {
      const p = sprit(0.17 + i * 0.022);
      lathe(acc, [[0.36, -0.05], [0.4, 0], [0.36, 0.05]], D.mastSides, along(p, BOWSPRIT.dir));
    }
  });
}

/** The lateen's yard, slung across the mizzen to port of it, raked up aft. */
function lateenYard(acc: Acc, D: Detail): void {
  const n = D.yardSegs, pts = range(0, 1, n).map((t) => lateenTack().lerp(lateenPeak(), t));
  const radii = pts.map((_, i) => LATEEN.r * (0.45 + 0.55 * Math.sin((Math.PI * Math.min(n, i + n / 5)) / (n * 1.2)) ** 0.6));
  tube(acc, pts, radii, D.sparSides, { vScale: 3, caps: D.topSides > 0 });
}

// ---------------------------------------------------------------- square yards and their lines

function yard(body: Acc, ropes: Acc, D: Detail, Y: Yard): void {
  const pivot = PIVOT[Y.mast], m = MASTS[Y.mast], z = mastZ(Y.mast);
  body.with({ kind: KIND.spar, pivot, swing: 1 }, () => {
    // thick in its slings, tapering to the arms
    const n = D.yardSegs, pts = range(-Y.len / 2, Y.len / 2, n).map((x) => arm(Y, x));
    const radii = pts.map((_, i) => Y.r * (0.42 + 0.58 * Math.sin((Math.PI * i) / n) ** 0.6));
    tube(body, pts, radii, D.sparSides, { vScale: 3, caps: D.topSides > 0 });
    // the parrel holding it to the mast
    const parrel: [number, number][] = [[m.r * 1.15, -0.15], [m.r * 1.3, 0], [m.r * 1.15, 0.15]];
    if (D.fittings) body.with({ kind: KIND.dark }, () => lathe(body, parrel, D.mastSides, trs(V(0, Y.y, z))));
  });
  if (D.ropes !== 'running') return;
  const lower = Y.y < m.top, mh = lower ? m.top + 1.0 : m.cross - 0.2;
  const line = (a: Vector3, b: Vector3, r: number, sag: number, swing: [number, number]) => rope(ropes, a, b, r, sag, D.sag, swing);
  ropes.with({ pivot }, () => {
    // the ties up to the masthead, and the lifts from the yardarms
    for (const sx of [1, -1]) {
      line(arm(Y, sx * 0.25), V(0, mh, z + 0.4), 0.05, 0, [1, 1]);
      line(arm(Y, sx * (Y.len / 2 - 0.3)), V(sx * 0.3, mh + 0.2, z), 0.025, 0.05, [1, 1]);
      const clew = squarePoint(Y, sx > 0 ? 0 : 1, 1);
      line(clew, arm(Y, sx * 1.5), 0.018, 0.05, [1, 1]);
      if (lower) {
        // the sheet aft to the side, the tack forward, the brace from the yardarm aft and down to the quarter
        const s = m.s, aft = s - 0.13, fwd = Math.min(0.97, s + 0.12), bs = Y.mast === 'main' ? 0.17 : 0.45;
        line(clew, V(sx * (halfAt(aft, sideTop(aft)) + 0.1), sideTop(aft) + 0.2, zAt(aft)), 0.035, 0.25, [1, 0]);
        line(clew, V(sx * (halfAt(fwd, sideTop(fwd)) + 0.05), sideTop(fwd) + 0.2, zAt(fwd)), 0.03, 0.3, [1, 0]);
        line(arm(Y, sx * Y.len / 2), V(sx * (halfAt(bs, sideTop(bs)) + 0.05), sideTop(bs) + 0.6, zAt(bs)), 0.025, 0.35, [1, 0]);
      } else {
        // the topsail's sheets to the course's yardarms below; its braces aft to the next mast's top
        const below = YARDS.find((y) => y.mast === Y.mast && y.y < Y.y)!;
        line(clew, arm(below, sx * (below.len / 2 - 0.4)), 0.022, 0.05, [1, 1]);
        const next: MastName = Y.mast === 'fore' ? 'main' : 'mizzen';
        line(arm(Y, sx * Y.len / 2), V(sx * 0.4, MASTS[next].top + 0.5, mastZ(next)), 0.02, 0.4, [1, 0]);
      }
    }
  });
}

function lateenLines(ropes: Acc, D: Detail): void {
  const z = mastZ('mizzen'), m = MASTS.mizzen;
  rope(ropes, lateenCross(), V(0, m.top + 1.0, z), 0.05, 0, 1);
  rope(ropes, lateenPeak(), V(0, m.tip - 0.2, topmastZ('mizzen')), 0.022, 0.2, D.sag);
  rope(ropes, lateenTack(), V(0, deckAt(m.s + 0.12) + 0.3, zAt(m.s + 0.12)), 0.03, 0, 1);
  rope(ropes, lateenClew(), V(0.6, sideTop(0.01) + 0.4, zAt(0.0) - 0.8), 0.03, 0.2, D.sag);
}

// ---------------------------------------------------------------- shrouds and stays

/** A deadeye: a round block of dark wood, turned to face out of the shroud's plane. */
function deadeye(acc: Acc, at: Vector3, dir: Vector3, side: number): void {
  acc.with({ kind: KIND.dark }, () => lathe(acc, [[0, -0.06], [0.18, -0.03], [0.18, 0.03], [0, 0.06]], 5, along(at, V(side, 0, 0), dir)));
}

function shrouds(body: Acc, ropes: Acc, D: Detail, name: MastName): void {
  const m = MASTS[name], z = mastZ(name), n = SHROUDS[name], R = TOP_R[name];
  const hy = m.top - 0.35;
  const sAtZ = (zz: number) => zz / LEN + 0.5;
  for (const side of [1, -1]) {
    // the channel: a broad plank bolted to the side, the shrouds set up along its edge
    const zs = range(0, 1, n - 1).map((t) => z + 0.4 - t * (n - 1) * 0.78);
    const ch = zs.map((zz) => { const s = sAtZ(zz), y = sideTop(s) - 0.1; return V(side * (halfAt(s, y) + 0.62), y, zz); });
    if (D.inboard) {
      const c0 = ch[0].clone().add(V(0, 0, 0.4)), c1 = ch[n - 1].clone().add(V(0, 0, -0.4));
      const cIn = (p: Vector3) => V(side * halfAt(sAtZ(p.z), p.y), p.y, p.z);
      const fore = c0.clone().lerp(cIn(c0), 0.5), aft = c1.clone().lerp(cIn(c1), 0.5);
      body.with({ kind: KIND.spar }, () => beam(body, fore, aft, 0.12, 0.7, V(side, 0, 0)));
    }
    const masthead = V(side * 0.3, hy, z);
    zs.forEach((zz, i) => {
      const lo = ch[i].clone().add(V(0, 0.32, 0)), head = masthead.clone().add(V(0, -i * 0.06, 0.12 - i * 0.04));
      if (!D.fittings) { rope(ropes, lo, head, 0.04, 0, 1); return; }
      // a pair of deadeyes and the lanyard between, the chainplate down the side, the shroud above
      const dir = masthead.clone().sub(lo).normalize(), hi = lo.clone().addScaledVector(dir, 0.95);
      deadeye(body, lo, dir, side);
      deadeye(body, hi, dir, side);
      rope(ropes, lo, hi, 0.03, 0, 1);
      const bolt = V(side * (halfAt(sAtZ(zz), lo.y - 1.6) + 0.06), lo.y - 1.6, zz + 0.12);
      body.with({ kind: KIND.iron }, () => rod(body, lo.clone().addScaledVector(dir, -0.2), bolt, 0.03, 0.03, 3, false));
      rope(ropes, hi.clone().addScaledVector(dir, 0.18), head, 0.04, 0, 1);
    });
    // a backstay from the topmast head down past the channel's after end
    if (m.cross) rope(ropes, V(side * 0.25, m.cross - 0.1, topmastZ(name)), ch[n - 1].clone().add(V(side * 0.05, 0.3, -0.9)), 0.035, 0, 1);
    if (D.topSides === 0) continue;
    // the topmast's shrouds from the top's rim to the crosstrees or the pole's head, with futtocks under the rim
    const thead = V(side * 0.22, (m.cross || m.tip) - 0.3, topmastZ(name));
    range(0, 1, name === 'mizzen' ? 1 : 2).map((t) => V(side * R * 0.92, m.top + 0.15, z + 0.4 - t * R * 0.9)).forEach((p, i) => {
      rope(ropes, p, thead.clone().add(V(0, -i * 0.05, 0)), 0.03, 0, 1);
      if (D.fittings) rope(ropes, p.clone().add(V(0, -0.05, 0)), V(side * m.r * 1.1, m.top - 2.0, z), 0.025, 0, 1);
    });
  }
}

function stays(ropes: Acc, D: Detail): void {
  const top = (m: MastName) => V(0, MASTS[m].top + 0.6, mastZ(m) + 0.2);
  const tTop = (m: MastName) => V(0, MASTS[m].cross - 0.1, mastZ(m) + MASTS[m].r * 1.35 + 0.1);
  const stay = (a: Vector3, b: Vector3, r: number) => rope(ropes, a, b, r, (0.06 * a.distanceTo(b)) / 10, D.sag);
  // the main stay to the knee of the head beside the foremast, its topmast stay to the fore top
  stay(top('main'), V(0, sideTop(0.96) + 0.3, zAt(0.965)), 0.075);
  stay(tTop('main'), V(0, MASTS.fore.top + 0.4, mastZ('fore') - 0.2), 0.04);
  // the fore stay and fore topmast stay to the bowsprit, the topgallant stays to its end and to the fore crosstrees
  stay(top('fore'), sprit(0.42), 0.065);
  stay(tTop('fore'), sprit(0.92), 0.04);
  stay(V(0, MASTS.fore.tip - 0.2, poleZ('fore')), sprit(1), 0.025);
  stay(V(0, MASTS.main.tip - 0.2, poleZ('main')), V(0, MASTS.fore.cross + 0.2, mastZ('fore') + 0.5), 0.025);
  // the mizzen's stays forward to the mainmast
  stay(top('mizzen'), V(0, 7.0, mastZ('main') - 0.4), 0.045);
  stay(V(0, MASTS.mizzen.tip - 0.3, topmastZ('mizzen')), V(0, MASTS.main.top + 0.2, mastZ('main') - 0.6), 0.025);
  // the bowsprit's shrouds out to the bows
  if (D.ropes !== 'running') return;
  for (const side of [1, -1]) rope(ropes, sprit(0.55), V(side * (halfAt(0.94, 4.2) + 0.1), 4.2, zAt(0.94) + 1.6), 0.03, 0, 1);
}

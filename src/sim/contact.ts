import { clamp } from '../world/scalar.ts';
import {
  R,
  add,
  dot,
  frameAt,
  length,
  normalize,
  scale,
  transport,
  type Vec3,
} from '../world/sphere.ts';
import { RAM, SHIP, SPEC, type Handling } from './handling.ts';
import { step, type Helm, type ShipState } from './ship.ts';
import { hullAt, moved, under, type Depth } from './shoal.ts';

export interface Vessel {
  id: number;
  ship: ShipState;
  shove: Vec3;
  engaged: readonly number[];
}

type Part = 'bow' | 'side' | 'stern';

interface Hit {
  id: number;
  part: Part;
  damage: number;
}

export interface Blow {
  striker: Hit;
  struck: Hit;
  closing: number;
  at: Vec3;
}

export const afloat = (id: number, ship: ShipState): Vessel => ({
  id,
  ship,
  shove: [0, 0, 0],
  engaged: [],
});

export const RADIUS = SHIP.beam / 2;
export const KEEL = SHIP.length / 2 - RADIUS;
const PASSES = 8;

type P = readonly [number, number];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const dot2 = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const cross2 = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const along2 = (a: P, b: P, k: number): P => [a[0] + b[0] * k, a[1] + b[1] * k];
const scale2 = (a: P, k: number): P => [a[0] * k, a[1] * k];

function nearest(p0: P, p1: P, q0: P, q1: P): [s: number, t: number] {
  const d1 = sub(p1, p0),
    d2 = sub(q1, q0),
    r = sub(p0, q0);
  const a = dot2(d1, d1),
    e = dot2(d2, d2),
    b = dot2(d1, d2),
    c = dot2(d1, r),
    f = dot2(d2, r);
  const denom = a * e - b * b;
  let s: number;
  if (denom > 1e-9 * a * e) s = clamp((b * f - c * e) / denom);
  else {
    const u0 = clamp(-c / a),
      u1 = clamp((b - c) / a);
    s = (u0 + u1) / 2;
  }
  let t = (b * s + f) / e;
  if (t < 0) [t, s] = [0, clamp(-c / a)];
  else if (t > 1) [t, s] = [1, clamp((b - c) / a)];
  return [s, t];
}

interface Laid {
  centre: P;
  ahead: P;
  stern: P;
  stem: P;
}

interface Meeting {
  gap: number;
  n: P;
  c: P;
  a: Laid;
  b: Laid;
  east: Vec3;
  north: Vec3;
  middle: Vec3;
}

const flat = (p: Vec3, east: Vec3, north: Vec3): P => [
  R * dot(p, east),
  R * dot(p, north),
];

function lay(s: ShipState, east: Vec3, north: Vec3): Laid {
  const x = dot(s.heading, east),
    y = dot(s.heading, north),
    l = Math.hypot(x, y);
  const stern = flat(hullAt(s.at, s.heading, [-KEEL, 0]), east, north),
    stem = flat(hullAt(s.at, s.heading, [KEEL, 0]), east, north);
  return {
    centre: flat(s.at, east, north),
    ahead: [x / l, y / l],
    stern,
    stem,
  };
}

function meet(a: ShipState, b: ShipState): Meeting | null {
  const dx = a.at[0] - b.at[0],
    dy = a.at[1] - b.at[1],
    dz = a.at[2] - b.at[2];
  const reach = SHIP.length + RAM.rearm + 1;
  if ((dx * dx + dy * dy + dz * dz) * R * R > reach * reach) return null;
  const middle = normalize(add(a.at, b.at));
  const { east, north } = frameAt(middle);
  const la = lay(a, east, north),
    lb = lay(b, east, north);
  const [s, t] = nearest(la.stern, la.stem, lb.stern, lb.stem);
  const p = along2(la.stern, sub(la.stem, la.stern), s),
    q = along2(lb.stern, sub(lb.stem, lb.stern), t);
  const d = sub(q, p),
    apart = Math.hypot(d[0], d[1]);
  let n: P;
  if (apart > 1e-9) n = [d[0] / apart, d[1] / apart];
  else {
    const m = sub(lb.centre, la.centre),
      l = Math.hypot(m[0], m[1]);
    n = l > 1e-9 ? [m[0] / l, m[1] / l] : [la.ahead[1], -la.ahead[0]];
  }
  return {
    gap: apart - 2 * RADIUS,
    n,
    c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2],
    a: la,
    b: lb,
    east,
    north,
    middle,
  };
}

export const gap = (a: ShipState, b: ShipState) => meet(a, b)?.gap ?? Infinity;

const yields = (l: Laid, u: P) => {
  const ahead = dot2(l.ahead, u),
    across = cross2(l.ahead, u);
  return ahead * ahead + (across * across) / RAM.sway;
};

const given = (l: Laid, j: P): P => {
  const ahead = dot2(l.ahead, j),
    across = cross2(l.ahead, j) / RAM.sway;
  return [
    l.ahead[0] * ahead - l.ahead[1] * across,
    l.ahead[1] * ahead + l.ahead[0] * across,
  ];
};

function part(l: Laid, out: P): Part {
  const c = dot2(out, l.ahead),
    stem = Math.cos(RAM.stem);
  return c > stem ? 'bow' : c < -stem ? 'stern' : 'side';
}

interface Working {
  id: number;
  ship: ShipState;
  shove: Vec3;
  engaged: number[];
  jolt: Vec3;
}

function velocity(w: Working, m: Meeting, r: P): P {
  const v = add(scale(w.ship.heading, w.ship.speed), w.shove);
  return [
    dot(v, m.east) - w.ship.turn * r[1],
    dot(v, m.north) + w.ship.turn * r[0],
  ];
}

function jolted(w: Working, m: Meeting, dv: P, turn: number): void {
  let d = add(scale(m.east, dv[0]), m.north, dv[1]);
  d = add(d, w.ship.at, -dot(d, w.ship.at));
  const ahead = dot(d, w.ship.heading);
  let speed = w.ship.speed + ahead,
    rest = add(d, w.ship.heading, -ahead);
  if (speed < 0) [rest, speed] = [add(rest, w.ship.heading, speed), 0];
  w.ship = { ...w.ship, speed, turn: w.ship.turn + turn };
  w.shove = add(w.shove, rest);
  w.jolt = add(w.jolt, d);
}

function strike(a: Working, b: Working, m: Meeting): Blow | null {
  const ra = sub(m.c, m.a.centre),
    rb = sub(m.c, m.b.centre);
  const va = velocity(a, m, ra),
    vb = velocity(b, m, rb);
  const rel = sub(vb, va),
    closing = -dot2(rel, m.n);
  if (!(closing > 0)) return null;
  const k2 = RAM.gyration * RAM.gyration;
  const heft = (u: P) =>
    yields(m.a, u) +
    yields(m.b, u) +
    cross2(ra, u) ** 2 / k2 +
    cross2(rb, u) ** 2 / k2;
  const jn = ((1 + RAM.bounce) * closing) / heft(m.n);
  const slide = along2(rel, m.n, closing),
    sliding = Math.hypot(slide[0], slide[1]);
  let j: P = scale2(m.n, jn);
  if (sliding > 1e-9) {
    const t: P = [slide[0] / sliding, slide[1] / sliding];
    j = along2(j, t, -Math.min(RAM.grip * jn, sliding / heft(t)));
  }
  jolted(a, m, scale2(given(m.a, j), -1), -cross2(ra, j) / k2);
  jolted(b, m, given(m.b, j), cross2(rb, j) / k2);
  if (closing <= RAM.least || a.engaged.includes(b.id)) return null;
  a.engaged.push(b.id);
  b.engaged.push(a.id);
  const fa = Math.max(0, dot2(va, m.n)),
    fb = Math.max(0, -dot2(vb, m.n)),
    sum = fa + fb;
  const share = sum > 1e-9 ? fa / sum : 0.5;
  const whole = RAM.damage * (closing - RAM.past);
  const hit = (w: Working, l: Laid, out: P, theirs: number): Hit => {
    const where = part(l, out);
    return {
      id: w.id,
      part: where,
      damage: Math.min(
        RAM.most,
        whole * (RAM.bear + (1 - RAM.bear) * theirs) * RAM[where]
      ),
    };
  };
  const ha = hit(a, m.a, m.n, 1 - share),
    hb = hit(b, m.b, scale2(m.n, -1), share);
  const at = normalize(
    add(m.middle, add(scale(m.east, m.c[0]), m.north, m.c[1]), 1 / R)
  );
  return fa >= fb
    ? { striker: ha, struck: hb, closing, at }
    : { striker: hb, struck: ha, closing, at };
}

function pushed(
  s: ShipState,
  m: Meeting,
  u: P,
  metres: number,
  depth: Depth
): ShipState | null {
  if (metres === 0) return s;
  let d = add(scale(m.east, u[0]), m.north, u[1]);
  d = normalize(add(d, s.at, -dot(d, s.at)));
  const to = moved(s.at, s.heading, scale(d, metres));
  const c = under(to.at, to.heading, depth);
  return c >= 0 || c >= under(s.at, s.heading, depth) ? { ...s, ...to } : null;
}

function heldApart(a: Working, b: Working, m: Meeting, depth: Depth): void {
  const want = RAM.skin - m.gap;
  const wa = yields(m.a, m.n),
    wb = yields(m.b, m.n);
  const sa = pushed(a.ship, m, m.n, -want * (wa / (wa + wb)), depth);
  const sb = pushed(b.ship, m, m.n, want * (wb / (wa + wb)), depth);
  if (sa && sb) [a.ship, b.ship] = [sa, sb];
  else if (sb) {
    const all = pushed(b.ship, m, m.n, want, depth);
    if (all) b.ship = all;
  } else if (sa) {
    const all = pushed(a.ship, m, m.n, -want, depth);
    if (all) a.ship = all;
  }
}

function sailed(
  v: Vessel,
  helm: Helm,
  dt: number,
  depth: Depth,
  fit: Handling
): Working {
  let ship = step(v.ship, helm, dt, depth, fit);
  let shove = transport(v.shove, v.ship.at, ship.at);
  const metres = length(shove) * dt;
  if (metres > 0) {
    const to = moved(ship.at, ship.heading, scale(shove, dt));
    const c = under(to.at, to.heading, depth);
    if (c >= 0 || c >= under(ship.at, ship.heading, depth)) {
      shove = transport(shove, ship.at, to.at);
      ship = { ...ship, ...to };
    } else shove = [0, 0, 0];
  }
  shove = scale(shove, Math.exp(-RAM.ease * dt));
  if (length(shove) < RAM.still) shove = [0, 0, 0];
  return { id: v.id, ship, shove, engaged: [...v.engaged], jolt: [0, 0, 0] };
}

export function stepFleet(
  fleet: readonly Vessel[],
  helms: readonly Helm[],
  dt: number,
  depth: Depth,
  fits: readonly Handling[] = []
): { fleet: Vessel[]; blows: Blow[]; jolts: Vec3[] } {
  const order = fleet
    .map((_, i) => i)
    .sort((i, j) => fleet[i].id - fleet[j].id);
  const ws = order.map((i) =>
    sailed(fleet[i], helms[i], dt, depth, fits[i] ?? SPEC)
  );
  const pairs = (each: (a: Working, b: Working) => void) => {
    for (let i = 0; i < ws.length; i++)
      for (let j = i + 1; j < ws.length; j++) each(ws[i], ws[j]);
  };
  const blows: Blow[] = [];
  pairs((a, b) => {
    const m = meet(a.ship, b.ship);
    const blow = m && m.gap < RAM.skin ? strike(a, b, m) : null;
    if (blow) blows.push(blow);
  });
  for (let pass = 0, again = true; pass < PASSES && again; pass++) {
    again = false;
    pairs((a, b) => {
      const m = meet(a.ship, b.ship);
      if (!m || m.gap >= 0) return;
      heldApart(a, b, m, depth);
      again = true;
    });
  }
  const was = new Map(fleet.map((v) => [v.id, v]));
  const back = new Set<number>();
  for (let again = true; again; ) {
    again = false;
    pairs((a, b) => {
      if ((back.has(a.id) && back.has(b.id)) || gap(a.ship, b.ship) >= 0)
        return;
      for (const w of [a, b])
        if (!back.has(w.id)) {
          back.add(w.id);
          w.ship = { ...was.get(w.id)!.ship, speed: 0, turn: 0 };
          w.shove = [0, 0, 0];
          again = true;
        }
    });
  }
  const byId = new Map(ws.map((w) => [w.id, w]));
  for (const w of ws)
    w.engaged = w.engaged.filter(
      (id) => byId.has(id) && gap(w.ship, byId.get(id)!.ship) <= RAM.rearm
    );
  const result = fleet.map((v) => byId.get(v.id)!);
  return {
    fleet: result.map(({ id, ship, shove, engaged }) => ({
      id,
      ship,
      shove,
      engaged,
    })),
    blows,
    jolts: result.map((w) => w.jolt),
  };
}

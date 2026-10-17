// The 20 rival captains. Each reads the simulation and answers with the same rudder input a player sends.
// A captain takes territory in rectangular bites (out, across, back), keeps weighing how soon any rival could
// reach its open trail against how soon it can be home, and cuts rivals' trails it can reach before they close.
// The five strategies differ in bite size, nerve, what they hunt and where they idle; every captain also draws a
// seeded temperament (boldness, reaction time, steadiness, judgement, nerve) so no two sail alike.
// Deterministic like the sim: per-captain seeded Rng, d* math only, fixed order, state read only from the Sim.
import {
  R, PI, GRID, HN, HANDLING, HOME_RADIUS, RESPAWN_TICKS, PLANET_AREA, TRAIL_STEP, Rng, type Sim, type Ship, type V3,
  v3, dot, cross, normalize, copy, chord, mix, cellOf, dsin, dcos, datan2,
} from './sim.ts';

export const STRATEGIES = ['cautious', 'greedy', 'hunter', 'defender', 'opportunist'] as const;
export type Strategy = (typeof STRATEGIES)[number];

interface Style {
  depth: [number, number]; // reach of a bite beyond the border, world units, timid … bold
  width: [number, number]; // breadth of a bite along the border
  margin: [number, number]; // head start (s) over the quickest rival it insists on while out, timid … bold
  dwell: [number, number]; // ticks spent inside between bites
  strike: number; // how far it goes out of its way to cut an open trail, world units
  guard: number; // how far it goes for any trail laid across its own waters
  fear: number; // a rival closer than this keeps it from setting out, world units
  shy: number; // how strongly bites avoid rivals (negative: seeks them)
  enemy: number; // appetite for rivals' territory inside a bite
}

const STYLES: Record<Strategy, Style> = {
  // small, frequent bites close to home, away from everyone; runs for home as soon as anyone could come near
  cautious: {
    depth: [7, 13], width: [15, 20], margin: [8, 4], dwell: [15, 60],
    strike: 10, guard: 0, fear: 45, shy: 3, enemy: -0.5,
  },
  // huge loops far out into open sea; only turns back for a rival already bearing down on its trail
  greedy: {
    depth: [55, 100], width: [45, 85], margin: [0, -4], dwell: [30, 90],
    strike: 14, guard: 0, fear: 12, shy: 1.5, enemy: 0.3,
  },
  // lurks at the edge of its waters nearest a rival and runs down any open trail it can reach in time
  hunter: {
    depth: [16, 28], width: [16, 24], margin: [3, 0], dwell: [90, 200],
    strike: 140, guard: 0, fear: 0, shy: -1, enemy: 0.5,
  },
  // circles just inside its border, cuts any trail laid across its waters, now and then a broad modest bite
  defender: {
    depth: [16, 26], width: [24, 34], margin: [5, 2], dwell: [200, 420],
    strike: 22, guard: 90, fear: 35, shy: 1, enemy: 0.3,
  },
  // raids the home waters of neighbours whose captains are away, bites big while rivals are busy elsewhere
  opportunist: {
    depth: [20, 34], width: [22, 32], margin: [3, 1], dwell: [40, 120],
    strike: 32, guard: 0, fear: 25, shy: 0.5, enemy: 2,
  },
};

type Mode = 'home' | 'sortie' | 'bite' | 'chase' | 'return';

const PLAN = 6; // ticks between a captain's plan updates (staggered by id)
const LOOK = 2; // ticks between look-ahead steering updates
const HORIZON = 30; // look-ahead along each candidate course, world units of path
const STEP = 3; // spacing of look-ahead samples
const LAND_CLEAR = 2.5; // keep the hull centre this far inside navigable water
const FRESH = 10; // newest own-trail points (under the stern) left out of the look-ahead; the sim forgives them too
const MAP = 96; // own-trail raster around the hull: MAP × MAP cells of 1 u centred on the ship
const HOME_SHARE = (PI * HOME_RADIUS * HOME_RADIUS) / PLANET_AREA;
// Candidate course changes (rad, + = port); ±170° rather than 180° so a U-turn keeps its side.
const TURNS = [0, 0.26, -0.26, 0.7, -0.7, 1.22, -1.22, 1.83, -1.83, 2.53, -2.53, 2.97, -2.97];
// Twelve bearings round the hull for territory probes.
const RC = new Float64Array(12), RS = new Float64Array(12);
for (let k = 0; k < 12; k++) {
  RC[k] = dcos((k * PI) / 6);
  RS[k] = dsin((k * PI) / 6);
}
const PATROL_RINGS = [12, 24, 40];
// Probes across a planned bite (share of depth, share of width): far corners, middles of the long sides, centre last.
const BITE_PROBES = [1, 0, 0.5, 0, 1, 1, 0.5, 1, 0.5, 0.5];
const LANDFALL_RINGS = [6, 14, 28, 50];

// Raster of the own trail, stamped instead of cleared; DISC marks everything within ~2 u of a trail point.
const raster = new Uint16Array(MAP * MAP);
let stamp = 0;
const DISC: number[] = [];
for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) DISC.push(y * MAP + x);
const HULLS = new Float64Array(4 * 32); // nearby hulls: local x, y and velocity
let TX = new Float64Array(512), TY = new Float64Array(512); // own trail in the local frame, for landfall checks

// Frame of the ship being steered: position P, heading F, port L (= P × F, the sim's turning axis).
const P = v3(), F = v3(), L = v3(), Q = v3(), A = v3(), B = v3(), C = v3();

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const wrap = (a: number) => (a > PI ? a - 2 * PI : a < -PI ? a + 2 * PI : a);
/** The point `d` world units from p along unit tangent `dir`, on the great circle. */
function along(p: V3, dir: V3, d: number, out: V3): V3 {
  const c = dcos(d / R), s = dsin(d / R);
  const x = p.x * c + dir.x * s, y = p.y * c + dir.y * s, z = p.z * c + dir.z * s;
  out.x = x; out.y = y; out.z = z;
  return normalize(out);
}
/** Unit tangent at p pointing at q. */
function toward(p: V3, q: V3, out: V3): V3 {
  const k = dot(p, q);
  out.x = q.x - k * p.x; out.y = q.y - k * p.y; out.z = q.z - k * p.z;
  return normalize(out);
}
function frame(s: Ship): void {
  copy(P, s.pos);
  copy(F, s.fwd);
  cross(P, F, L);
}
/** Rudder that brings a ship's bow round to `bearing` (rad, + = port); the yaw-rate term keeps it from overshooting. */
export const steer = (bearing: number, s: Ship) => bearing * 2.2 - s.turn * 0.4;
/** Bearing of point or tangent q from the frame, rad, + = port. */
const bearing = (q: V3) => datan2(dot(q, L), dot(q, F));
/** Unit direction at a local offset from the frame (x ahead, y to port, world units). */
function local(x: number, y: number, out: V3): V3 {
  out.x = P.x * R + F.x * x + L.x * y; out.y = P.y * R + F.y * x + L.y * y; out.z = P.z * R + F.z * x + L.z * y;
  return normalize(out);
}
/** Does the segment from the frame origin to (x, y) cross the projected own trail (n points)? */
function crossesTrail(x: number, y: number, n: number): boolean {
  for (let k = 1; k < n; k++) {
    const ax = TX[k - 1], ay = TY[k - 1], bx = TX[k], by = TY[k];
    const d1 = x * ay - y * ax, d2 = x * by - y * bx;
    if ((d1 > 0) === (d2 > 0)) continue;
    const e1 = (by - ay) * ax - (bx - ax) * ay, e2 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if ((e1 > 0) !== (e2 > 0)) return true;
  }
  return false;
}

class Captain {
  readonly ship: Ship;
  private readonly strategy: Strategy;
  private readonly style: Style;
  private readonly rng: Rng;
  private readonly radius: number; // turning circle actually sailed, world units
  // temperament
  private readonly risk: number; // 0 timid … 1 bold
  private readonly delay: number; // ticks between seeing danger and acting on it
  private readonly wobble: number; // helm unsteadiness, rudder units
  private readonly judgement: number; // spread of its estimates of rivals' reach
  private readonly nerve: number; // danger (s) past which it panics
  private readonly patience: number; // dwell multiplier
  private readonly margin: number; // head start (s) it insists on while out
  private readonly side: number; // which way it circles its border, +1 = border to starboard
  // plan
  private mode: Mode = 'home';
  private raid = false; // the next bite is aimed to enclose `goal`
  private readonly goal = v3();
  private depth = 0;
  private width = 0;
  private flank = 1; // side the bite opens to, +1 port of the outbound leg
  private readonly legs = [v3(), v3(), v3()]; // out, across, back into own territory
  private leg = 0;
  private readonly haven = v3(); // where it would run right now to close its trail
  private readonly target = v3(); // steering goal
  private readonly course = v3(); // heading chosen at the last look-ahead
  private wait = 0; // tick of the next bite
  private alarm = -1; // tick danger was first seen, -1 when none
  private panic = 0; // tick the panic ends
  private jolt = 0; // panicked helm kick
  private drift = 0; // helm wobble
  private bias = 0; // current misjudgement of rivals' reach, fractional
  private readonly anchors: V3[] = []; // recent positions inside own territory
  private anchorNext = 0;
  private sunk = -1; // sinkTick last seen, to notice a respawn
  private best = 0; // landfall search: cheapest haven so far
  private closest = Infinity; // nearest it has come to the current target
  private since = 0; // tick it last got closer
  private rest = 0; // tick until which it does not go hunting again

  constructor(ship: Ship, strategy: Strategy, seed: number) {
    this.ship = ship;
    this.strategy = strategy;
    this.style = STYLES[strategy];
    this.rng = new Rng(seed);
    const r = this.rng;
    this.radius = HANDLING[ship.cls].radius * 1.15;
    this.risk = r.next();
    this.delay = 3 + r.int(24);
    this.wobble = 0.03 + 0.12 * r.next();
    this.judgement = 0.1 + 0.35 * r.next();
    this.nerve = 1 + 4 * r.next();
    this.patience = 0.6 + 0.8 * r.next();
    this.margin = mix(this.style.margin[0], this.style.margin[1], this.risk);
    this.side = r.next() < 0.5 ? 1 : -1;
    copy(this.course, ship.fwd);
    copy(this.target, ship.pos);
  }

  /** Rudder for this tick. */
  update(sim: Sim): number {
    const s = this.ship, t = sim.tick;
    if (!s.alive) return 0;
    if (s.sinkTick !== this.sunk) {
      // back from the deep: forget the old waters
      this.sunk = s.sinkTick;
      this.mode = 'home';
      this.alarm = -1;
      this.panic = 0;
      this.anchors.length = 0;
      this.wait = t + this.dwell();
    }
    frame(s);
    // the trail settles the mode first: leaving home starts the bite, coming home ends any sortie
    if (s.trail.length) {
      if (this.mode === 'sortie') this.startBite(sim);
      else if (this.mode === 'home') this.mode = 'return';
    } else if (this.mode === 'bite' || this.mode === 'return') {
      this.mode = 'home';
      this.wait = t + this.dwell();
    }
    if ((t + s.id) % PLAN === 0) this.plan(sim);
    if (this.mode === 'bite') this.followLegs(t);
    else if (this.mode === 'chase' && this.stalled(t)) {
      // the prey's trail lies out of reach: give it up for a while
      this.rest = t + 150;
      this.mode = s.trail.length ? 'return' : 'home';
    }
    if ((t + s.id) % LOOK === 0) this.look(sim);
    return this.helm(t);
  }

  /** Ticks to spend inside before the next bite. */
  private dwell(): number {
    const d = this.style.dwell;
    return Math.round(mix(d[0], d[1], this.rng.next()) * this.patience);
  }

  private plan(sim: Sim): void {
    const s = this.ship, t = sim.tick, out = s.trail.length > 0;
    this.bias += (this.rng.range(-1, 1) * this.judgement - this.bias) * 0.3;
    if (!out) this.remember();
    else if (this.mode !== 'bite') this.landfall(sim);
    const danger = out ? this.exposure(sim) : -Infinity;
    if (danger > -this.margin) {
      if (this.alarm < 0) this.alarm = t;
    } else this.alarm = -1;
    const scared = this.alarm >= 0 && t - this.alarm >= this.delay;
    if (scared) {
      if (danger > this.nerve && t >= this.panic + 300) this.panic = t + 20 + this.rng.int(40);
      this.abort();
    } else if (t >= this.rest && this.hunt(sim)) {
      if (this.mode !== 'chase') this.closest = Infinity;
      this.mode = 'chase';
      return;
    }
    if (this.mode === 'chase') this.mode = out ? 'return' : 'home';
    if (this.mode === 'home') this.idle(sim);
    else if (this.mode === 'sortie') {
      // a rival near: it hesitates at the border and turns back (as it does when it never found the border)
      if (this.nearestRival(sim) > this.style.fear * (1 - 0.4 * this.risk) && chord(P, this.target) > 5) return;
      this.mode = 'home';
      this.wait = t + 20 + this.rng.int(50);
    } else if (this.mode === 'return') copy(this.target, this.haven);
  }

  /** Run home now: from the outbound leg turn back alongside it, from later legs head straight in. */
  private abort(): void {
    if (this.mode === 'bite') {
      if (this.leg === 0) copy(this.legs[2], this.haven);
      this.leg = 2;
      this.closest = Infinity;
    } else if (this.mode === 'chase') this.mode = 'return';
  }

  /** Now and then note where it sails inside its own waters: candidate landfalls for later. */
  private remember(): void {
    if (this.anchorNext-- > 0) return;
    this.anchorNext = 4;
    if (this.anchors.length < 8) this.anchors.push(copy(v3(), P));
    else copy(this.anchors[this.rng.int(8)], P);
  }

  private nearestRival(sim: Sim): number {
    let near = Infinity;
    for (const o of sim.ships) if (o !== this.ship && o.alive) near = Math.min(near, chord(P, o.pos));
    return near;
  }

  // -------------------------------------------------------------------------------------------
  // Judging danger and prey

  /** Seconds by which the quickest rival could reach the open trail before this ship is home (> 0: too late). */
  private exposure(sim: Sim): number {
    const s = this.ship, tr = s.trail, speed = Math.max(s.speed, 6), span = tr.length * TRAIL_STEP;
    const home = (chord(P, this.haven) + Math.abs(bearing(this.haven)) * this.radius) / speed;
    const wary = this.strategy !== 'greedy'; // greedy captains only fear rivals already heading their way
    let foe = Infinity;
    for (const o of sim.ships) {
      if (o === s || !o.alive) continue;
      const os = Math.max(o.speed, 6);
      if ((chord(P, o.pos) - span) / os > foe) continue;
      let best = chord(o.pos, P), bk = -1;
      for (let k = 0; k < tr.length; k += 4) {
        const d = chord(o.pos, tr[k]);
        if (d < best) {
          best = d;
          bk = k;
        }
      }
      const facing = dot(o.fwd, toward(o.pos, bk < 0 ? P : tr[bk], A));
      if (!wary && facing < 0.3) continue;
      foe = Math.min(foe, best / os + (1 - facing) * 1.2);
    }
    return home - foe * (1 + this.bias);
  }

  /** Pick the open-trail point it can reach soonest before its owner gets home; sets the target. */
  private hunt(sim: Sim): boolean {
    const s = this.ship, me = s.id + 1, guard = this.style.guard;
    const reach = this.style.strike * (0.8 + 0.4 * this.risk), speed = Math.max(s.speed, 6);
    let best = Infinity;
    for (const o of sim.ships) {
      if (o === s || !o.alive || o.trail.length < 6) continue;
      const tr = o.trail;
      if (chord(P, o.pos) - tr.length * TRAIL_STEP > Math.max(reach, guard)) continue;
      // seconds before it can be home, as this captain reads it
      const left = (chord(o.pos, tr[0]) / Math.max(o.speed, 6)) * (0.7 + 0.8 * this.risk) + 0.5;
      for (let k = 0; k < tr.length; k += 3) {
        const q = tr[k], d = chord(P, q);
        // beyond its usual reach only a trail laid across its own waters tempts it (within `guard`)
        if (d > reach && !(d < guard && sim.owner[cellOf(q, GRID)] === me)) continue;
        const eta = (d + Math.abs(bearing(q)) * this.radius) / speed;
        if (eta > left || eta >= best) continue;
        best = eta;
        copy(this.target, q);
      }
    }
    return best < Infinity;
  }

  // -------------------------------------------------------------------------------------------
  // Plans

  private idle(sim: Sim): void {
    // too little water to idle in without spilling out of it: expand first
    if (this.ship.share < 4 * HOME_SHARE) this.wait = Math.min(this.wait, sim.tick + 15);
    if (sim.tick >= this.wait && this.chooseBite(sim)) {
      this.mode = 'sortie';
      return;
    }
    if (this.strategy === 'hunter' && this.lurk(sim)) return;
    this.patrol(sim);
  }

  /** Distance from the ship to the edge of its territory along tangent `dir` (capped at `max`). */
  private border(sim: Sim, dir: V3, max: number): number {
    const me = this.ship.id + 1;
    for (let d = 2; d < max; d += 3) if (sim.owner[cellOf(along(P, dir, d, Q), GRID)] !== me) return d;
    return max;
  }

  /** Circle just inside the border, keeping it on one side. */
  private patrol(sim: Sim): void {
    const me = this.ship.id + 1;
    let nx = 0, ny = 0, outside = 0, r = 0;
    for (r of PATROL_RINGS) {
      for (let k = 0; k < 12; k++) {
        if (sim.owner[cellOf(local(RC[k] * r, RS[k] * r, Q), GRID)] === me) continue;
        nx += RC[k];
        ny += RS[k];
        outside++;
      }
      if (outside) break;
    }
    let hx = 1, hy = 0;
    const l = Math.sqrt(nx * nx + ny * ny);
    if (outside && l < 0.25 * outside) {
      // a small disc all round: just circle
      hx = 0.5;
      hy = this.side;
    } else if (outside && r > PATROL_RINGS[0]) {
      hx = nx / l;
      hy = ny / l;
    } else if (outside) {
      // follow the border, leaning in or out to hold it about 7 u off (≈ 30% of the ring outside)
      const lean = (outside / 12 - 0.3) * 3;
      nx /= l;
      ny /= l;
      hx = -ny * this.side - nx * lean;
      hy = nx * this.side - ny * lean;
    }
    const k = 15 / (Math.sqrt(hx * hx + hy * hy) || 1);
    local(hx * k, hy * k, this.target);
  }

  /** Hunters wait at the edge of their territory nearest the closest rival. */
  private lurk(sim: Sim): boolean {
    let near = 160, prey: Ship | null = null;
    for (const o of sim.ships) {
      if (o === this.ship || !o.alive) continue;
      const d = chord(P, o.pos);
      if (d < near) {
        near = d;
        prey = o;
      }
    }
    if (!prey) return false;
    toward(P, prey.pos, A);
    const edge = this.border(sim, A, 60);
    if (edge < 9) return false;
    along(P, A, edge - 5, this.target);
    return true;
  }

  /** Choose where and how far to bite next; false when it hesitates. */
  private chooseBite(sim: Sim): boolean {
    const s = this.ship, me = s.id + 1, st = this.style, rng = this.rng, w = sim.world;
    if (this.nearestRival(sim) < st.fear * (1.2 - 0.4 * this.risk)) {
      this.wait = sim.tick + 20 + rng.int(40);
      return false;
    }
    let size = 1;
    this.raid = false;
    let goal: V3 | null = null;
    if (this.strategy === 'opportunist') {
      goal = this.victim(sim);
      if (!goal && this.distracted(sim)) size = 1.6; // rivals busy elsewhere: take more
    } else if (this.strategy === 'hunter') {
      let near = 160;
      for (const o of sim.ships) {
        if (o === s || !o.alive || chord(P, o.pos) > near) continue;
        near = chord(P, o.pos);
        goal = copy(this.goal, o.pos);
      }
    }
    const stretch = mix(0.6 * this.risk, 1, rng.next() * 0.4);
    this.depth = mix(st.depth[0], st.depth[1], stretch) * size;
    this.width = Math.max(2 * this.radius + 4, mix(st.width[0], st.width[1], stretch) * size);
    let top = -Infinity;
    const turn0 = rng.range(0, 0.785);
    for (let k = 0; k < 8; k++) {
      const b = turn0 + k * 0.785, cb = dcos(b), sb = dsin(b);
      A.x = F.x * cb + L.x * sb; A.y = F.y * cb + L.y * sb; A.z = F.z * cb + L.z * sb;
      const edge = this.border(sim, A, 90);
      for (let flank = -1; flank <= 1; flank += 2) {
        cross(P, A, B);
        B.x *= flank; B.y *= flank; B.z *= flank;
        let score = (-0.5 * Math.abs(wrap(b))) / PI - edge / 40 + rng.range(0, 0.8);
        for (let i = 0; i < BITE_PROBES.length; i += 2) {
          along(along(P, A, edge + this.depth * BITE_PROBES[i], Q), B, this.width * BITE_PROBES[i + 1], Q);
          const o = sim.owner[cellOf(Q, GRID)];
          score += o === me ? -1 : o ? st.enemy : 1;
          if (w && w.coast[cellOf(Q, HN)] < 4) score -= 2.5;
          if (i === BITE_PROBES.length - 2) {
            for (const r of sim.ships) {
              if (r !== s && r.alive) score -= st.shy * Math.max(0, 1 - chord(r.pos, Q) / (60 + this.depth));
            }
            if (goal) score -= chord(Q, goal) / 40;
          }
        }
        if (score > top) {
          top = score;
          this.flank = flank;
          along(P, A, edge + 15, this.target);
        }
      }
    }
    if (goal && this.strategy === 'opportunist') {
      // a raid: a strip wide enough to swallow a home disc, steered so it is centred on the victim's home waters
      this.raid = true;
      this.flank = rng.next() < 0.5 ? 1 : -1;
      this.width = 2 * HOME_RADIUS + 20;
      toward(P, goal, A);
      cross(P, A, B);
      along(goal, B, (-this.flank * this.width) / 2, C);
      toward(P, C, A);
      along(P, A, this.border(sim, A, 90) + 15, this.target);
    }
    return true;
  }

  /** Home waters of a neighbour whose captain is away from them, best if small or freshly respawned. */
  private victim(sim: Sim): V3 | null {
    let top = -Infinity, found: V3 | null = null;
    for (const o of sim.ships) {
      if (o === this.ship || !o.alive || sim.owner[cellOf(o.home, GRID)] !== o.id + 1) continue;
      const d = chord(P, o.home);
      if (d > 80 || chord(o.pos, o.home) < 35) continue;
      const weak = (o.share < 3 * HOME_SHARE ? 1 : 0) + (sim.tick - o.sinkTick < RESPAWN_TICKS + 900 ? 1 : 0);
      if (weak - d / 60 <= top) continue;
      top = weak - d / 60;
      found = copy(this.goal, o.home);
    }
    return found;
  }

  /** Every rival within reach is out on its own trail. */
  private distracted(sim: Sim): boolean {
    for (const o of sim.ships) if (o !== this.ship && o.alive && !o.trail.length && chord(P, o.pos) < 80) return false;
    return true;
  }

  /** The trail just opened: lay out the rectangle from the exit point. */
  private startBite(sim: Sim): void {
    const s = this.ship, o = s.trail[0], [out, across, back] = this.legs;
    if (this.raid) {
      toward(o, this.goal, A);
      this.depth = chord(o, this.goal) + HOME_RADIUS + 10;
      cross(o, A, B);
      along(this.goal, B, (-this.flank * this.width) / 2, C);
      toward(o, C, A);
    } else toward(o, along(o, s.fwd, 1, A), A);
    cross(o, A, B);
    B.x *= this.flank; B.y *= this.flank; B.z *= this.flank;
    along(o, A, this.depth, out);
    along(out, B, this.width, across);
    this.inland(sim, o, this.width, back);
    this.inland(sim, o, Math.min(this.width, 2 * this.radius + 5), this.haven);
    this.leg = 0;
    this.closest = Infinity;
    this.mode = 'bite';
  }

  /**
   * Landfall `aside` units along the border from exit point o (bite axes A out, B across): the first own water
   * behind that border point, plus a little; just behind the exit when the border runs away there.
   */
  private inland(sim: Sim, o: V3, aside: number, out: V3): void {
    along(o, B, aside, C);
    for (let d = 0; d < 30; d += 3) {
      if (sim.owner[cellOf(along(C, A, -d, out), GRID)] !== this.ship.id + 1) continue;
      along(C, A, -d - 5, out);
      return;
    }
    along(o, A, -5, out);
  }

  /** Next leg when this one's corner is reached, passed or out of reach; a lost landfall makes it look for another. */
  private followLegs(t: number): void {
    const w = this.legs[this.leg], d = chord(P, w), stuck = this.stalled(t);
    if (this.leg < 2 && (d < 6 || (d < 16 && dot(w, F) < 0) || stuck)) {
      this.leg++;
      this.closest = Infinity;
      copy(this.haven, this.legs[2]);
    } else if (this.leg === 2 && (d < 8 || stuck)) this.mode = 'return';
    copy(this.target, this.legs[this.leg]);
  }

  /** No closer to the target for five seconds: it lies behind land, its own trail or a crowd of hulls. */
  private stalled(t: number): boolean {
    const d = chord(P, this.target);
    if (d < this.closest - 2) {
      this.closest = d;
      this.since = t;
    }
    return t - this.since > 150;
  }

  /** Nearest own water it can reach without crossing its own trail; sets the haven. */
  private landfall(sim: Sim): void {
    const s = this.ship, me = s.id + 1, tr = s.trail;
    let n = 0;
    if (TX.length < tr.length) {
      TX = new Float64Array(tr.length * 2);
      TY = new Float64Array(tr.length * 2);
    }
    for (let k = 0; k < tr.length - FRESH; k += 3) {
      TX[n] = dot(tr[k], F) * R;
      TY[n++] = dot(tr[k], L) * R;
    }
    this.best = Infinity;
    const coast = sim.world ? sim.world.coast : null;
    for (const a of this.anchors) if (sim.owner[cellOf(a, GRID)] === me) this.offer(coast, a, n);
    for (let k = 0; k < 12; k++) {
      for (const r of LANDFALL_RINGS) {
        if (sim.owner[cellOf(local(RC[k] * r, RS[k] * r, Q), GRID)] !== me) continue;
        this.offer(coast, Q, n);
        break;
      }
    }
    if (this.best === Infinity) copy(this.haven, s.home);
  }

  /** Take own-water point q as the haven if it is the cheapest so far to reach, round the trail and land. */
  private offer(coast: Float32Array | null, q: V3, n: number): void {
    const d = chord(P, q) + Math.abs(bearing(q)) * this.radius;
    if (dot(q, P) < 0.5 || d >= this.best) return;
    const x = dot(q, F) * R, y = dot(q, L) * R;
    let cost = d + (crossesTrail(x, y, n) ? 400 : 0);
    if (coast) {
      // land in the way, probed every 6 u beyond the open water round the ship
      for (let f = coast[cellOf(P, HN)] / d; f < 1 && cost < this.best; f += 6 / d) {
        if (coast[cellOf(local(x * f, y * f, A), HN)] < 0) cost += 200;
      }
    }
    if (cost >= this.best) return;
    this.best = cost;
    copy(this.haven, q);
  }

  // -------------------------------------------------------------------------------------------
  // Helm

  /** Score candidate courses against land, the own trail and nearby hulls; keep the best. */
  private look(sim: Sim): void {
    const s = this.ship, tr = s.trail, w = sim.world, want = bearing(this.target);
    if (++stamp === 65536) {
      raster.fill(0);
      stamp = 1;
    }
    let marked = false;
    for (let k = tr.length - 1 - FRESH; k >= 0; k -= 2) {
      const q = tr[k], x = dot(q, F) * R, y = dot(q, L) * R;
      if (x < -45 || x > 45 || y < -45 || y > 45 || dot(q, P) < 0.5) continue;
      const c = (Math.floor(y) + MAP / 2) * MAP + Math.floor(x) + MAP / 2;
      for (const o of DISC) raster[c + o] = stamp;
      marked = true;
    }
    let hulls = 0;
    for (const o of sim.ships) {
      if (o === s || !o.alive || chord(P, o.pos) > 40 || hulls === HULLS.length) continue;
      HULLS[hulls++] = dot(o.pos, F) * R;
      HULLS[hulls++] = dot(o.pos, L) * R;
      HULLS[hulls++] = dot(o.fwd, F) * o.speed;
      HULLS[hulls++] = dot(o.fwd, L) * o.speed;
    }
    const coast = w && w.coast[cellOf(P, HN)] < HORIZON + 6 ? w.coast : null;
    const ram = this.mode === 'chase', keep = this.mode === 'home' ? s.id + 1 : 0; // idling: stay in own waters
    let top = Infinity, pick = 0;
    for (let i = 0; i <= TURNS.length; i++) {
      // the path: a full-rudder arc onto the new course, then straight on
      const turn = i < TURNS.length ? TURNS[i] : want, r = this.radius, sg = turn < 0 ? -1 : 1;
      const arc = Math.abs(turn) * r, ex = r * dsin(Math.abs(turn)), ey = sg * r * (1 - dcos(turn));
      const cx = dcos(turn), cy = dsin(turn);
      let free = HORIZON + STEP, kind = 0, hit = false, spill = HORIZON + STEP;
      for (let l = STEP; l <= HORIZON; l += STEP) {
        let x: number, y: number;
        if (l < arc) {
          x = r * dsin(l / r);
          y = sg * r * (1 - dcos(l / r));
        } else {
          x = ex + (l - arc) * cx;
          y = ey + (l - arc) * cy;
        }
        if (marked && raster[(Math.floor(y) + MAP / 2) * MAP + Math.floor(x) + MAP / 2] === stamp) {
          free = l;
          kind = 2;
          break;
        }
        if (coast || keep) local(x, y, Q);
        if (coast && coast[cellOf(Q, HN)] < LAND_CLEAR) {
          free = l;
          kind = 1;
          break;
        }
        if (keep && spill > HORIZON && l % (2 * STEP) === 0 && sim.owner[cellOf(Q, GRID)] !== keep) spill = l;
        const t = l / Math.max(s.speed, 3);
        for (let h = 0; h < hulls && !hit && !ram; h += 4) {
          const dx = HULLS[h] + HULLS[h + 2] * t - x, dy = HULLS[h + 1] + HULLS[h + 3] * t - y;
          hit = dx * dx + dy * dy < 25;
        }
      }
      let cost = Math.abs(wrap(turn - want)) * 8 + Math.abs(turn) * 0.5 + (hit ? 15 : 0);
      cost += (HORIZON + STEP - spill) * 3;
      if (kind === 2) cost += 100 + (HORIZON - free) * 10;
      else if (kind === 1) cost += (HORIZON + STEP - free) * 4;
      if (cost < top) {
        top = cost;
        pick = turn;
      }
    }
    const c = dcos(pick), sn = dsin(pick);
    this.course.x = F.x * c + L.x * sn; this.course.y = F.y * c + L.y * sn; this.course.z = F.z * c + L.z * sn;
  }

  /** Steer for the chosen course with an unsteady hand, erratically while panicking. */
  private helm(t: number): number {
    const b = bearing(this.course);
    this.drift += (this.rng.range(-1, 1) * this.wobble - this.drift) * 0.1;
    if (t < this.panic) {
      if (t % 7 === 0) this.jolt = this.rng.range(-0.9, 0.9);
    } else this.jolt = 0;
    return clamp(steer(b, this.ship) + this.drift + this.jolt, -1, 1);
  }
}

export class Bots {
  /** Strategy per ship id; the player's slot 0 is empty. */
  readonly strategy: Strategy[] = [];
  private readonly captains: Captain[] = [];

  constructor(sim: Sim) {
    const rng = new Rng(sim.seed ^ 0xb075);
    // Every run of five consecutive ids holds each strategy once, shuffled per seed, so the rivals that start
    // near the player are a mix and every strategy sails every hull class across seeds.
    const order = [...STRATEGIES];
    for (let id = 1; id < sim.ships.length; id++) {
      if ((id - 1) % 5 === 0) {
        for (let k = order.length - 1; k > 0; k--) {
          const j = rng.int(k + 1);
          [order[k], order[j]] = [order[j], order[k]];
        }
      }
      this.strategy[id] = order[(id - 1) % 5];
      this.captains.push(new Captain(sim.ships[id], this.strategy[id], rng.u32()));
    }
  }

  /** Fill inputs[id] for every bot (ids ≥ 1). Called once per tick before sim.step(). */
  decide(sim: Sim, inputs: Float32Array): void {
    for (const c of this.captains) inputs[c.ship.id] = c.update(sim);
  }
}

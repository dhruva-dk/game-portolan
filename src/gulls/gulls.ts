// The flight drawn as gulls (snapshot.ts FlightDraw): when a ship calls her flight, four gulls (gull.ts) fly to her
// from the edge of her side's water nearest her, arriving as the sim's flight does (`coming`); on her deck they work at
// a place by the job in hand (STATIONS), each with a small loop of motion of its own: hammering at the rail for a mend,
// fanning her canvas from the poop for a gust, a chain hopping over the hatch for stores, clinging to the mainmast for a
// part. A botch shows as the first gull tumbling head over tail, and righting itself. When the stop ends (or she
// sinks), they fly off home, climbing, and are gone.
//
// Every gull of every flight is one instanced draw, placed in the vertex stage from a buffer of its place, frame,
// wingbeat and colours, written in place each frame (gull motion is a few dozen birds: worked out here, from the
// snapshot's clock); its wings fold and flap about their shoulders in the shader (no render hook). The sim knows
// nothing of them: they read the stop and the ship's pose.

import { DynamicDrawUsage, InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { Fn, abs, attribute, cos, cross, float, normalize, select, sin, uniform, varying, vec3 } from 'three/tsl';
import { release } from '../gpu';
import { BEAK, DYE_SHADE, FEATHER, GLINT, SHADES, WING } from '../palette';
import type { Light } from '../sky/light';
import type { FlightDraw, ShipDraw } from '../snapshot';
import type { Vec3Node } from '../tsl';
import { add, cross as crossOf, dot, frameAt, length, normalize as unit, place, scale, type Vec3 } from '../world/sphere';
import { FEET, PART, SHOULDER, gullGeometry } from './gull';
import { stationOf } from './stations';

/** Gulls a flight; the most drawn at once. */
export const GULLS = 4;
const MOST = 128;
/** A gull's size (its model is about a metre long): big enough to read from the chase. */
const SIZE = 2.1;
/** Where the flight sets out from: metres over the sea, and metres between its gulls there. */
const SET_OUT = 30, SPREAD = 4;
/** How high the flight arcs over its way, metres; how far behind each other its gulls come (of the way). */
const ARC = 10, BEHIND = 0.06;
/** Flying off: seconds until gone, metres a second away and up, and the last seconds it shrinks into the distance. */
const OFF = 5, AWAY = 11, CLIMB = 4, FADE = 1.5;
/** Wingbeats flying (rad/s); a tumble's turn (rad/s). */
const BEAT = 11, TUMBLE = 9;
/** How quickly a gull moves to a new place on deck (1/s), and how far off it must be to fly there, metres. */
const SETTLE = 5, HOP = 0.2;

/** The buffer: per gull a vec4 of its place (metres) and phase, of ahead and its wings' spread (0 folded … 1 flying),
 *  of up and its wingbeat (rad/s), of its crew's paint and its size, of her sail's colour. */
const STRIDE = 20;

/** A gull as it was last drawn: its place, ahead and up (world), and where on deck it stands (her frame, metres). */
interface Gull { at: Vec3; ahead: Vec3; up: Vec3; deck: Vec3 | null }
/** A flight as it is drawn: its stop as last seen, her colours, when it ended (null: under way), its gulls, and its
 *  first gull's tumble (rad turned). */
interface Bird { flight: FlightDraw; paint: Vec3; sail: Vec3; gone: number | null; gulls: Gull[]; roll: number }

/** Her frame from her pose: port, up and ahead. */
const frameOf = (ship: ShipDraw) => ({ port: crossOf(ship.pose.up, ship.pose.forward), up: ship.pose.up, ahead: ship.pose.forward, at: ship.pose.position });
type ShipFrame = ReturnType<typeof frameOf>;
/** A vector of her frame (port, up, ahead) in the world. */
const world = (f: ShipFrame, v: Vec3): Vec3 => add(add(scale(f.port, v[0]), f.up, v[1]), f.ahead, v[2]);
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => add(scale(a, 1 - t), b, t);
const ease = (t: number) => t * t * (3 - 2 * t);
/** `v` with its part along unit `n` taken out, made unit (or `or`, if nothing is left). */
const across = (v: Vec3, n: Vec3, or: Vec3): Vec3 => {
  const t = add(v, n, -dot(v, n));
  return length(t) > 1e-6 ? unit(t) : or;
};

export function createGulls(light: Light) {
  const now = uniform(0);
  const buffer = new InstancedInterleavedBuffer(new Float32Array(MOST * STRIDE), STRIDE).setUsage(DynamicDrawUsage);
  const shape = gullGeometry(), geometry = new InstancedBufferGeometry();
  for (const name of ['position', 'normal', 'part', 'wing']) geometry.setAttribute(name, shape.getAttribute(name));
  geometry.setAttribute('gullAt', new InterleavedBufferAttribute(buffer, 4, 0));
  geometry.setAttribute('gullAhead', new InterleavedBufferAttribute(buffer, 4, 4));
  geometry.setAttribute('gullUp', new InterleavedBufferAttribute(buffer, 4, 8));
  geometry.setAttribute('gullPaint', new InterleavedBufferAttribute(buffer, 4, 12));
  geometry.setAttribute('gullSail', new InterleavedBufferAttribute(buffer, 4, 16));
  geometry.instanceCount = 0;

  // its frame, and its wings folded back along it (spread 0) or out and beating (1), each about its shoulder
  const at = attribute('gullAt', 'vec4'), ahead = attribute('gullAhead', 'vec4'), up = attribute('gullUp', 'vec4');
  const paint = attribute('gullPaint', 'vec4'), sail = attribute('gullSail', 'vec4');
  const local = attribute('position', 'vec3'), normal = attribute('normal', 'vec3'), w = attribute('wing', 'float');
  const spread = ahead.w, fold = float(1).sub(spread);
  const sweep = w.mul(fold).mul(1.35), lift = sin(now.mul(up.w).add(at.w)).mul(0.85).add(0.2).mul(spread).sub(fold.mul(0.12));
  const beat = w.mul(lift);
  const shoulder = vec3(w.mul(SHOULDER.x), SHOULDER.y, SHOULDER.z);
  const turn = (v: Vec3Node) => {
    const cs = cos(sweep), ss = sin(sweep), cb = cos(beat), sb = sin(beat);
    const x = v.x.mul(cs).add(v.z.mul(ss)), z = v.x.negate().mul(ss).add(v.z.mul(cs));
    return vec3(x.mul(cb).sub(v.y.mul(sb)), x.mul(sb).add(v.y.mul(cb)), z);
  };
  const isWing = abs(w).greaterThan(0.5);
  const shaped = select(isWing, shoulder.add(turn(local.sub(shoulder))), local), bent = select(isWing, turn(normal), normal);
  const fore = normalize(ahead.xyz), over = normalize(up.xyz), port = cross(over, fore);
  const inWorld = (v: Vec3Node) => port.mul(v.x).add(over.mul(v.y)).add(fore.mul(v.z));
  const placed = at.xyz.add(inWorld(shaped).mul(paint.w));

  const material = new MeshBasicNodeMaterial();
  material.positionNode = placed;
  const p = varying(placed), n = varying(inWorld(bent)), part = varying(attribute('part', 'float')), dye = varying(paint.rgb), cloth = varying(sail.rgb);
  material.colorNode = Fn(() => {
    const nn = normalize(n), is = (k: number) => abs(part.sub(k)).lessThan(0.5);
    const pick = (f: (t: { lit: Vec3Node; shadow: Vec3Node }) => Vec3Node) => {
      const t = (c: { lit: readonly number[]; shadow: readonly number[] }) => ({ lit: vec3(...(c.lit as [number, number, number])), shadow: vec3(...(c.shadow as [number, number, number])) });
      const dyed = (c: Vec3Node) => ({ lit: c, shadow: c.mul(vec3(...DYE_SHADE)) });
      return select(is(PART.wing), f(t(WING)), select(is(PART.tip), f(dyed(dye)), select(is(PART.beak), f(t(BEAK)), select(is(PART.scarf), f(dyed(cloth)), f(t(FEATHER))))));
    };
    const glasses = light.polished(p, nn, vec3(...SHADES.lit), vec3(...SHADES.shadow), vec3(...GLINT));
    return select(is(PART.shades), glasses, pick((t) => light.toon(p, nn, t.lit, t.shadow)));
  })();
  const mesh = new Mesh(geometry, material);
  // (the gulls fly all over the planet, placed in the shader)
  mesh.frustumCulled = false;
  mesh.name = 'gulls';

  const birds = new Map<number, Bird>();
  let last = -Infinity;

  /** A gull flying: at `at`, heading along `ahead` (world), wings beating. */
  const flying = (g: Gull, at: Vec3, ahead: Vec3) => {
    const up = unit(at);
    g.at = at;
    g.ahead = across(ahead, up, g.ahead);
    g.up = up;
  };

  /** Moves `bird`, the flight of `ship` (undefined: she is gone), on by `dt` s to `clock`, and hands each of its gulls
   *  to `out` with its wings' spread and beat and its size. */
  function fly(bird: Bird, ship: ShipDraw | undefined, clock: number, dt: number, out: (g: Gull, spread: number, beat: number, size: number) => void) {
    const f = bird.flight, hers = ship ? frameOf(ship) : null;
    if (f.botched && bird.gone === null) bird.roll += dt * TUMBLE;
    else if (bird.roll > 0) {
      const upright = Math.ceil(bird.roll / (2 * Math.PI)) * 2 * Math.PI;
      bird.roll = bird.roll + dt * TUMBLE >= upright ? 0 : bird.roll + dt * TUMBLE;
    }
    bird.gulls.forEach((g, k) => {
      if (bird.gone !== null || !hers) {
        // off home: away toward where they came from, climbing, shrinking into the distance at the last
        const t = clock - (bird.gone ?? clock), home = place(f.from, SET_OUT);
        const way = across(add(home, g.at, -1), unit(g.at), g.ahead);
        flying(g, add(add(g.at, way, AWAY * dt), unit(g.at), CLIMB * dt), way);
        g.deck = null;
        out(g, 1, BEAT, SIZE * Math.min(1, (OFF - t) / FADE));
        return;
      }
      const s = stationOf(f.job, k, clock), there = add(hers.at, world(hers, s.at));
      const e = ease(Math.min(1, Math.max(0, f.coming * (1 + BEHIND * (GULLS - 1)) - k * BEHIND)));
      if (e < 1) {
        // on the way: from the edge of her water, over an arc, onto her deck
        const { east } = frameAt(f.from), start = add(place(f.from, SET_OUT), east, (k - (GULLS - 1) / 2) * SPREAD);
        const dir = unit(mix(unit(start), unit(there), e)), high = length(start) * (1 - e) + length(there) * e + Math.sin(Math.PI * e) * ARC;
        flying(g, scale(dir, high), add(unit(there), unit(start), -1));
        if (e > 0.85) g.ahead = across(mix(g.ahead, world(hers, s.ahead), (e - 0.85) / 0.15), g.up, g.ahead);
        g.deck = null;
        out(g, 1, BEAT, SIZE);
        return;
      }
      // on deck: to its station, hopping there if it is far off; the first tumbling while a botch holds the flight
      const from = g.deck ?? s.at, k1 = 1 - Math.exp(-SETTLE * dt), deck = mix(from, s.at, k1);
      const moving = length(add(deck, from, -1)) / Math.max(dt, 1e-3) > HOP;
      g.deck = deck;
      let ahead = world(hers, s.ahead), up = world(hers, s.up);
      const roll = k === 0 ? bird.roll : 0;
      if (roll > 0) {
        // head over tail about its across, a little off the deck as it goes
        const c = Math.cos(roll), sn = Math.sin(roll);
        [ahead, up] = [add(scale(ahead, c), up, -sn), add(scale(up, c), ahead, sn)];
      }
      const lifted = add(deck, [0, FEET * SIZE + (roll > 0 ? 0.6 * Math.abs(Math.sin(roll / 2)) : 0), 0]);
      g.at = add(hers.at, world(hers, lifted));
      g.ahead = ahead;
      g.up = up;
      out(g, Math.max(s.spread, moving || roll > 0 ? 0.9 : 0), s.beat || BEAT, SIZE);
    });
  }

  return {
    meshes: [mesh],
    dispose: () => release(mesh),
    /** Each frame: the world's clock (s), the flights under way, and the ships drawn. */
    draw(clock: number, flights: readonly FlightDraw[], ships: readonly ShipDraw[]) {
      now.value = clock;
      const dt = Math.min(0.1, Math.max(0, clock - last));
      last = clock;
      const byId = new Map(ships.map((s) => [s.id, s]));
      for (const f of flights) {
        const ship = byId.get(f.id), bird = birds.get(f.id);
        if (bird && bird.gone === null) {
          bird.flight = f;
          continue;
        }
        if (!ship) continue;
        const start = place(f.from, SET_OUT);
        birds.set(f.id, {
          flight: f, paint: ship.look.paint, sail: ship.look.sail, gone: null, roll: 0,
          gulls: Array.from({ length: GULLS }, () => ({ at: start, ahead: unit(add(ship.pose.position, start, -1)), up: unit(start), deck: null })),
        });
      }
      const under = new Set(flights.map((f) => f.id));
      for (const [id, bird] of birds) {
        if (bird.gone === null && (!under.has(id) || !byId.has(id))) bird.gone = clock;
        if (bird.gone !== null && clock - bird.gone > OFF) birds.delete(id);
      }
      const array = buffer.array as Float32Array;
      let n = 0;
      for (const [id, bird] of birds) {
        fly(bird, bird.gone === null ? byId.get(id) : undefined, clock, dt, (g, spread, beat, size) => {
          if (n >= MOST) return;
          const o = n * STRIDE;
          array.set([...g.at, (n * 1.7) % 6.283, ...g.ahead, spread, ...g.up, beat, ...bird.paint, size, ...bird.sail, 0], o);
          n++;
        });
      }
      if (n > 0) {
        buffer.clearUpdateRanges();
        buffer.addUpdateRange(0, n * STRIDE);
        buffer.needsUpdate = true;
      }
      geometry.instanceCount = n;
    },
  };
}

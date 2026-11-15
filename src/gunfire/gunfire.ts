// The guns' work as it is seen: the balls in flight, the marks where the mortars' shells will fall, and the puffs where
// they go off and come down. Four draws for all of it, each a single instanced mesh; no targets of their own, nothing
// to compute.
//
// Balls: 0117's (render/actors/projectiles.ts), one instance each, placed each frame where the battle has them and
// drawn out along its flight, at least a few pixels across so it is seen at the far end of its range: a dark iron core
// with a hot rim, so it reads dark against the bright sky and bright against the sea; behind it a warm tracer, glowing
// (the bloom takes it) and tapering back over its kind's share of its flight; and behind that a ribbon of thin grey
// smoke (puffs laid along the way it came since the frame before), thickening and fading over a second and a half.
// Each kind's its own (SHOT): the cannon's ball; the scatter's pellets, small and many, short-tailed; the repeater's
// slim rounds with long hot tracers, no smoke; the harpoon's bolt, a long dark shaft and no fire behind it; the
// mortar's shell, big, smoking heavily as it lobs.
//
// Fall marks: where each mortar shell will come down, a ring of its splash's size laid on the water, tightening and
// brightening as the shell nears it, for her to steer out of (and to see her own will land).
//
// Puffs: soft round sprites facing the eye, each written once into a ring of instances when the battle reports what
// made it, and moved from then on wholly in the vertex stage: carried off at its velocity with its drag (exponential)
// and under its pull (gravity, or a lift for warm smoke), growing, then fading. Each event lays a few kinds:
//   a gun fired    a flash at the muzzle (light it gives, added), and a bank of white powder smoke blown down the bore
//   a ball in sea  a column of spray thrown up and falling back, and mist off it; on land, dust
//   a ball home    a flash, splinters thrown out of her side and falling, and dark smoke
//   a ram          splinters
// Smoke and spray are flat shapes in two tones (palette.ts: powder smoke cream, rose beneath; spray the foam's
// white), as bright as the place and the hour (sky/light.ts level), and blended premultiplied: a flash is all added
// light, smoke and spray cover what is behind them.

import {
  AddEquation, BufferAttribute, CustomBlending, DoubleSide, DynamicDrawUsage, IcosahedronGeometry, InstancedBufferGeometry,
  InstancedInterleavedBuffer, InterleavedBufferAttribute, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor,
} from 'three/webgpu';
import {
  Fn, abs, atan, attribute, cameraPosition, cos, cross, exp, float, max, mix, normalize, pow, select, sin, smoothstep, uniform, varying, vec3,
} from 'three/tsl';
import { release } from '../gpu';
import { KINDS, gunOrder, type GunKind } from '../kinds';
import { DUST, FOAM, SMOKE, SOOT, TIMBER } from '../palette';
import type { Light } from '../sky/light';
import type { BallDraw } from '../snapshot';
import type { Eye } from '../view/view';
import { random } from '../world/random';
import { R, add, dot as vdot, normalize as vnormalize, scale, type Vec3 } from '../world/sphere';
import type { FloatNode, Vec2Node } from '../tsl';

/** The most balls in flight, fall marks, and puffs alive, at once. */
const BALLS = 512, MARKS = 64, PUFFS = 4096;
/** Floats a puff: at+born, way+life, size+grow+drag+pull, ink+glow, opacity+seed+softness+fade-in; each a vec4. */
const STRIDE = 20;
/**
 * Each kind's ball:
 *   size    its radius, m (the cannon's 0117's)
 *   pixels  the fewest pixels it is drawn across
 *   long    its least half-length along its flight, m (the harpoon's bolt a shaft)
 *   hot     how much its rim glows (0: none, a dark shape)
 *   tracer  seconds of its flight its tracer trails over (0: none), and its glow
 *   trail   metres between its smoke's puffs (0: none), and their size
 */
interface Shot { size: number; pixels: number; long: number; hot: number; tracer: number; glow: number; trail: number; puff: number }
const SHOT: Record<GunKind, Shot> = {
  cannon: { size: 0.16, pixels: 6, long: 0, hot: 1, tracer: 0.09, glow: 1, trail: 3, puff: 0.3 },
  scatter: { size: 0.07, pixels: 3, long: 0, hot: 1.3, tracer: 0.035, glow: 0.8, trail: 0, puff: 0 },
  repeater: { size: 0.07, pixels: 3, long: 0, hot: 1.5, tracer: 0.2, glow: 1.8, trail: 0, puff: 0 },
  harpoon: { size: 0.05, pixels: 3, long: 0.8, hot: 0, tracer: 0, glow: 0, trail: 0, puff: 0 },
  mortar: { size: 0.26, pixels: 8, long: 0, hot: 0.7, tracer: 0.06, glow: 0.7, trail: 2, puff: 0.55 },
};
/** A ball's streak (seconds of its flight it is drawn out along); its core's iron and its rim's glow (radiance per unit
 *  sun), the rim from where the surface turns this far from the eye (the cosine). */
const STREAK = 0.02, CORE: Vec3 = [0.015, 0.013, 0.012], SPARK: Vec3 = [6, 3, 0.9], RIM = 0.55;
/** Its tracer: its width at the ball (m, and the fewest pixels), and its glow (radiance per unit sun) there, dying to
 *  nothing at its tail. */
const TRACER_WIDE = 0.22, TRACER_PIXELS = 3, TRACER_GLOW: Vec3 = [5, 2.2, 0.6];
/** Its trail (0117's smoke ribbon): its puffs' growth (m/s), life (s), ink and opacity. */
const TRAIL_GROW = 1.4, TRAIL_LIFE = 1.6, TRAIL_INK: Vec3 = SMOKE.lit, TRAIL_OPACITY = 0.26;
/** Each kind's firing: its flashes, their size, its puffs of smoke, how wide they spread, and how dense. */
const FIRING: Record<GunKind, readonly [number, number, number, number, number]> = {
  cannon: [3, 0.9, 12, 1.2, 0.5], scatter: [4, 1.2, 14, 3, 0.5], repeater: [1, 0.55, 2, 0.6, 0.35],
  harpoon: [0, 0, 5, 1.5, 0.22], mortar: [3, 1.3, 18, 2, 0.6],
};
/** A fall mark: its radius (the mortar's splash, sim/handling.ts GUNS; tests/guns.test.ts holds them equal), the
 *  fewest pixels its line is wide, and its glow (radiance per unit sun). */
const MARK = 11, MARK_PIXELS = 2, MARK_GLOW: Vec3 = [3.2, 0.9, 0.35];
/** Seconds of a shell's flight its mark counts down over (about its longest lob). */
const FLIGHT = 5;

/** A node taking each kind's value of `f`, by the kind's index `k` (its place in KINDS: gunOrder, as a ball carries
 *  it to its shader). */
const byKind = (k: FloatNode, f: (s: Shot) => number): FloatNode =>
  KINDS.slice(0, -1).reduceRight<FloatNode>((rest, kind, i) => select(k.lessThan(i + 0.5), float(f(SHOT[kind])), rest), float(f(SHOT[KINDS[KINDS.length - 1]])));

/** A puff's flat shape: its edge's radius on its sprite and half that edge's width; how far its lobes scallop it; how
 *  far below its middle its shadow tone begins; and how many times its opacity it covers until it thins away. */
const SHAPE = 0.86, CRISP = 0.04, SCALLOP = 0.2, UNDER = -0.18, SOLID = 2.5;
/** A puff's shadow tone, of its ink: as powder smoke's cream goes to its rose (palette.ts SMOKE). */
const SHADE: Vec3 = [SMOKE.shadow[0] / SMOKE.lit[0], SMOKE.shadow[1] / SMOKE.lit[1], SMOKE.shadow[2] / SMOKE.lit[2]];

/** One puff as it is laid: where it starts (metres) and its velocity (m/s), its size (m, radius) and how fast it grows
 * (m/s), its drag (per second) and pull (m/s² down; negative rises), life (s), colour (linear; a glow's is radiance
 * per unit of sun), glow, opacity (0 for a glow), softness (0 a hard drop, 1 a soft cloud) and share of its life fading in. */
interface Puff {
  at: Vec3; way: Vec3; size: number; grow: number; drag: number; pull: number; life: number;
  ink: Vec3; glow: number; opacity: number; soft: number; fadeIn: number;
}

function ballMesh(pixel: FloatNode) {
  const ico = new IcosahedronGeometry(1, 1);
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', ico.getAttribute('position'));
  // where each is, and its velocity
  const buffer = new InstancedInterleavedBuffer(new Float32Array(BALLS * 8), 8).setUsage(DynamicDrawUsage);
  g.setAttribute('ballAt', new InterleavedBufferAttribute(buffer, 4, 0));
  g.setAttribute('ballWay', new InterleavedBufferAttribute(buffer, 4, 4));
  g.instanceCount = 0;
  const m = new MeshBasicNodeMaterial();
  const ballAt = attribute('ballAt', 'vec4'), at = ballAt.xyz, kind = ballAt.w;
  const way = attribute('ballWay', 'vec4').xyz, local = attribute('position', 'vec3');
  const far = cameraPosition.sub(at).length(), radius = max(byKind(kind, (s) => s.size), far.mul(pixel).mul(byKind(kind, (s) => s.pixels / 2)));
  // drawn out along its flight: its half-length the streak's, its kind's least, or its radius, whichever the most
  const speed = way.length().max(1e-3), along = way.div(speed);
  const stretch = max(max(radius, speed.mul(STREAK / 2)), byKind(kind, (s) => s.long)).div(radius);
  m.positionNode = at.add(local.add(along.mul(local.dot(along).mul(stretch.sub(1)))).mul(radius));
  // the iron where it faces the eye, the rim's glow where it turns away (none on the harpoon's bolt)
  const facing = varying(abs(normalize(local).dot(normalize(cameraPosition.sub(at))))), hot = varying(byKind(kind, (s) => s.hot));
  m.colorNode = mix(vec3(...SPARK).mul(hot), vec3(...CORE), smoothstep(RIM - 0.12, RIM + 0.12, facing).max(float(1).sub(hot.min(1))));
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;

  // the tracer: a ribbon facing the eye, from the ball back along its way, x across it (−1…1) and y back (0…1)
  const t = new InstancedBufferGeometry();
  t.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
  t.setIndex([0, 1, 2, 0, 2, 3]);
  t.setAttribute('ballAt', new InterleavedBufferAttribute(buffer, 4, 0));
  t.setAttribute('ballWay', new InterleavedBufferAttribute(buffer, 4, 4));
  t.instanceCount = 0;
  const tm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
  tm.blending = CustomBlending;
  tm.blendEquation = AddEquation;
  tm.blendSrc = OneFactor;
  tm.blendDst = OneFactor;
  const wide = max(float(TRACER_WIDE), far.mul(pixel).mul(TRACER_PIXELS)).mul(0.5);
  const across = normalize(cross(along, cameraPosition.sub(at)));
  const back = local.y, taper = float(1).sub(back.mul(0.75)), trails = byKind(kind, (s) => s.tracer);
  tm.positionNode = at.sub(along.mul(back.mul(speed).mul(trails))).add(across.mul(local.x.mul(wide).mul(taper))).mul(select(trails.greaterThan(0), float(1), float(0)));
  const y = varying(back), x = varying(local.x), glow = varying(byKind(kind, (s) => s.glow));
  tm.colorNode = vec3(...TRACER_GLOW).mul(glow).mul(pow(float(1).sub(y), 2)).mul(smoothstep(1, 0.4, abs(x)));
  const tracer = new Mesh(t, tm);
  tracer.frustumCulled = false;
  tracer.renderOrder = 3;
  return { mesh, tracer, buffer, geometry: g, trail: t };
}

/** The fall marks: a square on the water about each (−1…1 across), a ring drawn at its edge and a second closing in
 *  on its middle as the shell nears, brighter the nearer. */
function markMesh(pixel: FloatNode, now: FloatNode) {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  // where it falls (world metres, on the water) and how near the shell is to it (0 just fired … 1 falling)
  const buffer = new InstancedInterleavedBuffer(new Float32Array(MARKS * 4), 4).setUsage(DynamicDrawUsage);
  g.setAttribute('markAt', new InterleavedBufferAttribute(buffer, 4, 0));
  g.instanceCount = 0;
  const mark = attribute('markAt', 'vec4'), at = mark.xyz, up = normalize(at), local = attribute('position', 'vec3');
  const ref = select(abs(up.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0)), e1 = normalize(cross(ref, up)), e2 = cross(up, e1);
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = OneFactor;
  m.blendDst = OneFactor;
  m.positionNode = at.add(e1.mul(local.x.mul(MARK))).add(e2.mul(local.y.mul(MARK)));
  const far = cameraPosition.sub(at).length(), line = varying(max(float(0.35), far.mul(pixel).mul(MARK_PIXELS)).div(MARK));
  const uv = varying(local.xy), near = varying(mark.w);
  m.colorNode = Fn(() => {
    const r = uv.length(), ring = (at: FloatNode) => smoothstep(line, line.mul(0.4), abs(r.sub(at)));
    const pulse = sin(now.mul(9)).mul(0.2).add(0.8);
    const inner = float(1).sub(near).mul(0.92).add(0.04);
    return vec3(...MARK_GLOW).mul(ring(float(0.97)).add(ring(inner).mul(0.7))).mul(near.mul(0.7).add(0.3)).mul(pulse);
  })();
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return { mesh, buffer, geometry: g };
}

function puffMesh(light: Light, now: FloatNode) {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const buffer = new InstancedInterleavedBuffer(new Float32Array(PUFFS * STRIDE), STRIDE).setUsage(DynamicDrawUsage);
  ['puffAt', 'puffWay', 'puffForm', 'puffInk', 'puffLook'].forEach((name, i) => g.setAttribute(name, new InterleavedBufferAttribute(buffer, 4, i * 4)));
  g.instanceCount = 0;

  const o = attribute('puffAt', 'vec4'), w = attribute('puffWay', 'vec4'), f = attribute('puffForm', 'vec4');
  const ink = attribute('puffInk', 'vec4'), look = attribute('puffLook', 'vec4');
  const age = now.sub(o.w), t = age.div(w.w);
  const alive = age.greaterThanEqual(0).and(t.lessThan(1));
  const up = normalize(o.xyz), k = max(f.z, 1e-3);
  // carried off against its drag, and pulled down (or lifted)
  const centre = o.xyz.add(w.xyz.mul(float(1).sub(exp(k.negate().mul(age))).div(k))).sub(up.mul(f.w.mul(0.5).mul(age).mul(age)));
  const size = select(alive, f.x.add(f.y.mul(age)), float(0));
  const eye = normalize(cameraPosition.sub(centre));
  const right = normalize(cross(up, eye)), upward = cross(eye, right);
  const local = attribute('position', 'vec3');
  // each turned its own way, so a bank of them doesn't read as a grid
  const a = look.y.mul(6.283), c = cos(a), s = sin(a);
  const turned = vec3(local.x.mul(c).sub(local.y.mul(s)), local.x.mul(s).add(local.y.mul(c)), 0);
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.positionNode = centre.add(right.mul(turned.x).add(upward.mul(turned.y)).mul(size));
  // (its place on the sprite as the eye sees it, y up the world: its underside is its shadow's)
  const uv = varying(local.xy), upright = varying(turned.y), mid = varying(centre);
  const tv = varying(t);
  // a flat shape with a crisp edge: a drop's disc, or a cloud's, scalloped round its edge by a few lobes (its own, by
  // its seed); a glow's stays soft, as light is
  const lobes = (uvv: Vec2Node) => sin(atan(uvv.y, uvv.x).mul(5).add(look.y.mul(40))).mul(0.5).add(sin(atan(uvv.y, uvv.x).mul(3).sub(look.y.mul(17))).mul(0.5));
  const billowed = (r: FloatNode): FloatNode => r.mul(float(1).sub(lobes(uv).mul(look.z).mul(SCALLOP)));
  const shapeOf = (r: FloatNode): FloatNode => smoothstep(SHAPE, SHAPE - CRISP, billowed(r));
  const glowOf = (r: FloatNode): FloatNode => exp(r.mul(r).mul(-2.5)).mul(smoothstep(1, 0.55, r));
  const fade = (tt: FloatNode) => smoothstep(0, max(look.w, 1e-3), tt).mul(pow(float(1).sub(tt).max(0), 1.5));
  // it thins only at the end of its life: until then the shape is whole, as painted
  const alpha = Fn(() => shapeOf(uv.length()).mul(look.x.mul(fade(tv)).mul(SOLID).min(1)))();
  m.colorNode = Fn(() => {
    const r = uv.length();
    // two tones: its ink, and on its underside its shadow's (a cloud's rose: palette.ts SMOKE)
    const under = smoothstep(UNDER + CRISP, UNDER - CRISP, upright.add(lobes(uv).mul(0.12)));
    const tone = ink.rgb.mul(mix(vec3(1), vec3(...SHADE), under));
    return tone.mul(light.level(mid)).mul(alpha).add(ink.rgb.mul(ink.w).mul(glowOf(r)).mul(fade(tv)));
  })();
  m.opacityNode = alpha;
  // premultiplied: a glow adds its light, smoke covers what is behind
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  // after the sea, which reads what was drawn before it
  mesh.renderOrder = 2;
  return { mesh, buffer, geometry: g };
}

/** light: how the world is lit (sky/light.ts): the puffs; the sparks glow of themselves. */
/** A gun's fire, and a shield's light (0117's shield azure, #4fc3ff). */
const FIRE: Vec3 = [1, 0.55, 0.2], AZURE: Vec3 = [0.31, 0.76, 1];

export function createGunfire(light: Light) {
  const now = uniform(0), pixel = uniform(0.0026);
  const balls = ballMesh(pixel), marks = markMesh(pixel, now);
  /** The world's clock when the balls were last drawn. */
  let drawn = -Infinity;
  const puffs = puffMesh(light, now);
  const array = puffs.buffer.array as Float32Array;
  /** The ring's next slot, how many hold a puff, and how many were laid since the last were sent (only those go up). */
  let head = 0, laid = 0, fresh = 0;
  const draw = random(0x6a11);
  const u = (lo: number, hi: number) => lo + (hi - lo) * draw();
  /** A random unit vector. */
  const any = (): Vec3 => {
    const z = u(-1, 1), a = u(0, 2 * Math.PI), s = Math.sqrt(1 - z * z);
    return [s * Math.cos(a), s * Math.sin(a), z];
  };
  /** A random unit tangent at `up`. */
  const across = (up: Vec3): Vec3 => vnormalize(add(any(), up, -vdot(any(), up)));

  function lay(born: number, p: Puff) {
    array.set([...p.at, born, ...p.way, p.life, p.size, p.grow, p.drag, p.pull, ...p.ink, p.glow, p.opacity, draw(), p.soft, p.fadeIn], head * STRIDE);
    head = (head + 1) % PUFFS;
    laid = Math.min(PUFFS, laid + 1);
    fresh++;
  }
  /** The puffs laid since the last were sent, as the ring's ranges to send (one, or two where it wraps). */
  function send() {
    if (fresh === 0) return;
    const b = puffs.buffer, n = Math.min(fresh, PUFFS), from = (head - n + PUFFS) % PUFFS;
    fresh = 0;
    b.clearUpdateRanges();
    if (from + n <= PUFFS) b.addUpdateRange(from * STRIDE, n * STRIDE);
    else {
      b.addUpdateRange(from * STRIDE, (PUFFS - from) * STRIDE);
      b.addUpdateRange(0, (from + n - PUFFS) * STRIDE);
    }
    b.needsUpdate = true;
  }

  const smoke = (at: Vec3, way: Vec3, ink: Vec3, opacity: number, life: number, size = 0.8): Puff =>
    ({ at, way, size, grow: 1.6, drag: 2.2, pull: -0.5, life, ink, glow: 0, opacity, soft: 1, fadeIn: 0.05 });
  const flash = (at: Vec3, way: Vec3, size: number, ink: Vec3 = FIRE): Puff =>
    ({ at, way, size, grow: 12, drag: 8, pull: 0, life: u(0.08, 0.14), ink, glow: 6, opacity: 0, soft: 1, fadeIn: 0 });
  /** A mote of a shield's light thrown off it: a small hard azure spark, falling slowly. */
  const shard = (at: Vec3, speed: number): Puff =>
    ({ at, way: scale(any(), u(speed / 2, speed)), size: u(0.18, 0.34), grow: 0, drag: 1.6, pull: 2, life: u(0.35, 0.7), ink: AZURE, glow: 4, opacity: 0, soft: 0.2, fadeIn: 0 });
  const splinter = (at: Vec3, up: Vec3): Puff => {
    const d = vnormalize(add(any(), up, 1.2));
    return { at, way: scale(d, u(4, 13)), size: u(0.12, 0.22), grow: 0, drag: 0.4, pull: 9.8, life: u(1, 1.8), ink: TIMBER.shadow, glow: 0, opacity: 1, soft: 0, fadeIn: 0 };
  };

  return {
    meshes: [balls.mesh, balls.tracer, marks.mesh, puffs.mesh],
    dispose: () => release(balls.mesh, balls.tracer, marks.mesh, puffs.mesh),
    /** A gun of `gun` fired at `time` (the world's clock, s) from `from` (metres, from the centre) along `dir` (unit):
     *  the cannon's flash and bank of smoke; the scatter's wide burst; the repeater's small quick flash and a wisp; the
     *  harpoon's no fire, a kick of dust off its stock; the mortar's flash and a great bank thrown up. */
    shot(time: number, from: Vec3, dir: Vec3, gun: GunKind) {
      const [flashes, size, puffs, spread, ink] = FIRING[gun];
      for (let i = 0; i < flashes; i++) lay(time, flash(add(add(from, dir, 0.6 + 0.5 * i), any(), gun === 'scatter' ? 0.5 : 0), scale(dir, u(3, 9)), size + 0.3 * i));
      for (let i = 0; i < puffs; i++) {
        lay(time, smoke(add(from, dir, 0.8), add(scale(dir, u(2, 16)), any(), spread), SMOKE.lit, ink, u(2.5, 4.5), gun === 'mortar' ? 1.2 : 0.8));
      }
    },
    /** A ball of `gun` come down at `at` (a unit vector), in the sea or on the land: a scatter's pellet or a repeater's
     *  round a small spout; a mortar's shell bursting, its flash, its spray over its splash's breadth. */
    splash(time: number, at: Vec3, land: boolean, gun: GunKind) {
      const p = scale(at, R), [k, wide] = gun === 'mortar' ? [2.5, MARK / 2] : gun === 'scatter' || gun === 'repeater' ? [0.25, 0.3] : [1, 0.8];
      if (gun === 'mortar') for (let i = 0; i < 3; i++) lay(time, flash(add(p, at, 1), scale(any(), 4), 5));
      if (land) {
        for (let i = 0; i < 10 * k; i++) lay(time, smoke(add(p, across(at), u(0, wide)), add(scale(at, u(1, 5)), across(at), u(0.5, 2.5)), DUST, 0.55, u(1.5, 3), 0.6));
        return;
      }
      for (let i = 0; i < 40 * k; i++) {
        lay(time, {
          at: add(p, across(at), u(0, wide)), way: add(scale(at, u(6, 16)), across(at), u(0.3, 3)), size: u(0.4, 0.8), grow: 0.5,
          drag: 0.15, pull: 9.8, life: u(1.4, 2.6), ink: FOAM, glow: 0, opacity: 0.9, soft: 0.3, fadeIn: 0,
        });
      }
      for (let i = 0; i < 12 * k; i++) {
        lay(time, { ...smoke(add(p, across(at), u(0, wide)), add(scale(at, u(1, 6)), across(at), u(0.5, 2.5)), FOAM, 0.35, u(1.8, 3), 1.4), grow: 2.6, pull: -0.1, drag: 1.2 });
      }
    },
    /** A ball home in a hull at `at` (a unit vector), or a ram; whether her shield took all of it (a glint of azure
     *  and no splinters), and whether it broke (a burst of shards: 0117's shield break). */
    strike(time: number, at: Vec3, ram: boolean, shield: boolean, broke: boolean) {
      const p = scale(at, R + (ram ? 1.2 : 1.8));
      if (shield || broke) {
        for (let i = 0; i < (broke ? 3 : 2); i++) lay(time, flash(p, scale(any(), 2), broke ? 3.4 : 2, AZURE));
        for (let i = 0; i < (broke ? 26 : 8); i++) lay(time, shard(add(p, any(), broke ? 1.5 : 0.6), broke ? 9 : 4));
        if (shield) return;
      }
      for (let i = 0; i < (ram ? 10 : 24); i++) lay(time, splinter(p, at));
      if (ram) return;
      for (let i = 0; i < 3; i++) lay(time, flash(p, scale(any(), 2), 2.4));
      for (let i = 0; i < 14; i++) lay(time, smoke(p, add(scale(at, u(1, 5)), any(), 2), SOOT, 0.7, u(2.5, 4), 1));
    },
    /** A ship gone down at `at` (a unit vector): her timbers thrown, the sea heaved white over her, a pall of smoke. */
    sink(time: number, at: Vec3) {
      const p = scale(at, R + 1);
      for (let i = 0; i < 30; i++) lay(time, splinter(add(p, across(at), u(0, 4)), at));
      for (let i = 0; i < 3; i++) lay(time, flash(add(p, at, 1.5), scale(any(), 3), 4.5));
      for (let i = 0; i < 40; i++) {
        lay(time, {
          at: add(scale(at, R), across(at), u(0, 6)), way: add(scale(at, u(4, 12)), across(at), u(1, 5)), size: u(0.6, 1.1), grow: 0.6,
          drag: 0.2, pull: 9.8, life: u(1.6, 2.8), ink: FOAM, glow: 0, opacity: 0.9, soft: 0.3, fadeIn: 0,
        });
      }
      for (let i = 0; i < 16; i++) lay(time, smoke(add(p, across(at), u(0, 4)), add(scale(at, u(2, 7)), any(), 2), SOOT, 0.75, u(4, 7), 2));
    },
    /** Each frame: the world's clock now (s), and every ball in flight. */
    draw(time: number, flying: readonly BallDraw[]) {
      now.value = time;
      const n = Math.min(flying.length, BALLS), a = balls.buffer.array as Float32Array;
      // each ball's trail along the way it came since the last frame (none on the first, or after a pause), its puffs
      // laid when the ball passed, from a start that slides with the clock so they don't stand in step frame to frame
      const since = time - drawn > 0 && time - drawn < 0.25 ? time - drawn : 0;
      const m = marks.buffer.array as Float32Array;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const { at, way, gun, to } = flying[i], speed = Math.max(1e-3, Math.hypot(way[0], way[1], way[2])), shot = SHOT[gun];
        const o = i * 8;
        for (let j = 0; j < 3; j++) {
          a[o + j] = at[j];
          a[o + 4 + j] = way[j];
        }
        a[o + 3] = gunOrder(gun);
        a[o + 7] = 0;
        // a shell's fall marked: nearer as the seconds it has left to fly (about its distance from it over its speed) run out
        if (gun === 'mortar' && k < MARKS) {
          const q = 4 * k++, rx = at[0] - to[0] * R, ry = at[1] - to[1] * R, rz = at[2] - to[2] * R;
          for (let j = 0; j < 3; j++) m[q + j] = to[j] * (R + 0.15);
          m[q + 3] = 1 - Math.min(1, Math.hypot(rx, ry, rz) / speed / FLIGHT);
        }
        if (!shot.trail) continue;
        for (let d = (time * 997) % shot.trail; d < speed * since; d += shot.trail) {
          const ago = d / speed;
          lay(time - ago, { ...smoke(add(at, way, -ago), [0, 0, 0], TRAIL_INK, TRAIL_OPACITY, TRAIL_LIFE, shot.puff), grow: TRAIL_GROW, drag: 1, pull: -0.2, fadeIn: 0.02 });
        }
      }
      drawn = time;
      balls.buffer.needsUpdate = n > 0;
      balls.geometry.instanceCount = balls.trail.instanceCount = n;
      marks.buffer.needsUpdate = k > 0;
      marks.geometry.instanceCount = k;
      puffs.geometry.instanceCount = laid;
      send();
    },
    /** Each frame, once the eye has moved (view.ts). */
    update(eye: Readonly<Eye>) {
      pixel.value = eye.pixel;
    },
  };
}

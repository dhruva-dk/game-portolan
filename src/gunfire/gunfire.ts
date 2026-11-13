// The guns' work as it is seen: the balls in flight, and the puffs where they go off and come down. Two draws for all
// of it, each a single instanced mesh; no targets of their own, nothing to compute.
//
// Balls: 0117's (render/actors/projectiles.ts), one instance each, placed each frame where the battle has them and
// drawn out along its flight, at least a few pixels across so it is seen at the far end of its range: a dark iron core
// with a hot rim, so it reads dark against the bright sky and bright against the sea; behind it a warm tracer, glowing
// (the bloom takes it) and tapering back over TRACER s of its flight; and behind that a ribbon of thin grey smoke
// (puffs laid along the way it came since the frame before), thickening and fading over a second and a half.
//
// Puffs: soft round sprites facing the eye, each written once into a ring of instances when the battle reports what
// made it, and moved from then on wholly in the vertex stage: carried off at its velocity with its drag (exponential)
// and under its pull (gravity, or a lift for warm smoke), growing, then fading. Each event lays a few kinds:
//   a gun fired    a flash at the muzzle (light it gives, added), and a bank of white powder smoke blown down the bore
//   a ball in sea  a column of spray thrown up and falling back, and mist off it; on land, dust
//   a ball home    a flash, splinters thrown out of her side and falling, and dark smoke
//   a ram          splinters
// Lit by the sun and the sky as everything else is (sky/light.ts), and blended premultiplied: a flash is all added
// light, smoke and spray cover what is behind them.

import {
  AddEquation, BufferAttribute, CustomBlending, DoubleSide, DynamicDrawUsage, IcosahedronGeometry, InstancedBufferGeometry,
  InstancedInterleavedBuffer, InterleavedBufferAttribute, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor, type PerspectiveCamera,
} from 'three/webgpu';
import {
  Fn, abs, atan, attribute, cameraPosition, cos, cross, exp, float, max, mix, normalize, pow, select, sin, smoothstep, uniform, varying, vec3,
} from 'three/tsl';
import type { Light } from '../sky/light';
import type { BallDraw } from '../snapshot';
import { pixelSize } from '../view/view';
import { random } from '../world/random';
import { R, add, dot as vdot, normalize as vnormalize, scale, type Vec3 } from '../world/sphere';
import type { FloatNode, Vec2Node } from '../tsl';

/** The most balls in flight, and puffs alive, at once. */
const BALLS = 128, PUFFS = 4096;
/** Floats a puff: at+born, way+life, size+grow+drag+pull, ink+glow, opacity+seed+softness+fade-in; each a vec4. */
const STRIDE = 20;
/** A ball: its radius, metres (0117's), the fewest pixels it is drawn across, and how many seconds of its flight it is
 *  drawn out along; its core's iron and its rim's glow (radiance per unit sun), the rim from where the surface turns
 *  this far from the eye (the cosine). */
const BALL = 0.16, BALL_PIXELS = 6, STREAK = 0.02, CORE: Vec3 = [0.015, 0.013, 0.012], SPARK: Vec3 = [6, 3, 0.9], RIM = 0.55;
/** Its tracer: how many seconds of its flight it trails over, its width at the ball (m, and the fewest pixels), and its
 *  glow (radiance per unit sun) there, dying to nothing at its tail. */
const TRACER = 0.09, TRACER_WIDE = 0.22, TRACER_PIXELS = 3, TRACER_GLOW: Vec3 = [5, 2.2, 0.6];
/** Its trail (0117's smoke ribbon): a puff every TRAIL m along its way, its size and growth (m, m/s), life (s), ink and
 *  opacity. */
const TRAIL = 3, TRAIL_SIZE = 0.3, TRAIL_GROW = 1.4, TRAIL_LIFE = 1.6, TRAIL_INK: Vec3 = [0.78, 0.77, 0.75], TRAIL_OPACITY = 0.26;

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
  const at = attribute('ballAt', 'vec4').xyz, way = attribute('ballWay', 'vec4').xyz, local = attribute('position', 'vec3');
  const far = cameraPosition.sub(at).length(), radius = max(float(BALL), far.mul(pixel).mul(BALL_PIXELS / 2));
  // drawn out along its flight: its half-length the streak's or its radius, whichever the more
  const speed = way.length().max(1e-3), along = way.div(speed);
  const stretch = max(radius, speed.mul(STREAK / 2)).div(radius);
  m.positionNode = at.add(local.add(along.mul(local.dot(along).mul(stretch.sub(1)))).mul(radius));
  // the iron where it faces the eye, the rim's glow where it turns away
  const facing = varying(abs(normalize(local).dot(normalize(cameraPosition.sub(at)))));
  m.colorNode = mix(vec3(...SPARK), vec3(...CORE), smoothstep(RIM - 0.12, RIM + 0.12, facing));
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.visible = false;

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
  const back = local.y, taper = float(1).sub(back.mul(0.75));
  tm.positionNode = at.sub(along.mul(back.mul(speed).mul(TRACER))).add(across.mul(local.x.mul(wide).mul(taper)));
  const y = varying(back), x = varying(local.x);
  tm.colorNode = vec3(...TRACER_GLOW).mul(pow(float(1).sub(y), 2)).mul(smoothstep(1, 0.4, abs(x)));
  const tracer = new Mesh(t, tm);
  tracer.frustumCulled = false;
  tracer.renderOrder = 3;
  tracer.visible = false;
  return { mesh, tracer, buffer, geometry: g, trail: t };
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
  const uv = varying(local.xy), mid = varying(centre), facing = varying(normalize(up.add(eye.mul(0.6))));
  const tv = varying(t);
  // a drop's hard disc, or a cloud's soft one billowed round its edge by a few lobes (its own, by its seed)
  const lobes = (uvv: Vec2Node) => sin(atan(uvv.y, uvv.x).mul(5).add(look.y.mul(40))).mul(0.5).add(sin(atan(uvv.y, uvv.x).mul(3).sub(look.y.mul(17))).mul(0.5));
  const shapeOf = (r: FloatNode): FloatNode => mix(smoothstep(1, 0.55, r), exp(r.mul(r).mul(-2.5)).mul(smoothstep(1, 0.55, r.mul(float(1).sub(lobes(uv).mul(0.18))))), look.z);
  const fade = (tt: FloatNode) => smoothstep(0, max(look.w, 1e-3), tt).mul(pow(float(1).sub(tt).max(0), 1.5));
  const alpha = Fn(() => look.x.mul(shapeOf(uv.length())).mul(fade(tv)))();
  m.colorNode = Fn(() => {
    const r = uv.length();
    const lit = light(mid, normalize(facing));
    return ink.rgb.mul(lit).mul(alpha).add(ink.rgb.mul(ink.w).mul(shapeOf(r)).mul(fade(tv)));
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
  mesh.visible = false;
  return { mesh, buffer, geometry: g };
}

/** light: how the world is lit (sky/light.ts): the puffs; the sparks glow of themselves. */
export function createGunfire(light: Light) {
  const now = uniform(0), pixel = uniform(0.0026);
  const balls = ballMesh(pixel);
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
  const flash = (at: Vec3, way: Vec3, size: number): Puff =>
    ({ at, way, size, grow: 12, drag: 8, pull: 0, life: u(0.08, 0.14), ink: [1, 0.55, 0.2], glow: 6, opacity: 0, soft: 1, fadeIn: 0 });
  const splinter = (at: Vec3, up: Vec3): Puff => {
    const d = vnormalize(add(any(), up, 1.2));
    return { at, way: scale(d, u(4, 13)), size: u(0.12, 0.22), grow: 0, drag: 0.4, pull: 9.8, life: u(1, 1.8), ink: [0.16, 0.1, 0.06], glow: 0, opacity: 1, soft: 0, fadeIn: 0 };
  };

  return {
    meshes: [balls.mesh, balls.tracer, puffs.mesh],
    /** A gun fired at `time` (the world's clock, s) from `from` (metres, from the centre) along `dir` (unit). */
    shot(time: number, from: Vec3, dir: Vec3) {
      for (let i = 0; i < 3; i++) lay(time, flash(add(from, dir, 0.6 + 0.5 * i), scale(dir, u(3, 9)), 0.9 + 0.3 * i));
      for (let i = 0; i < 12; i++) {
        lay(time, smoke(add(from, dir, 0.8), add(scale(dir, u(2, 16)), any(), 1.2), [0.8, 0.79, 0.76], 0.5, u(2.5, 4.5)));
      }
    },
    /** A ball come down at `at` (a unit vector), in the sea or on the land. */
    splash(time: number, at: Vec3, land: boolean) {
      const p = scale(at, R);
      if (land) {
        for (let i = 0; i < 10; i++) lay(time, smoke(p, add(scale(at, u(1, 5)), across(at), u(0.5, 2.5)), [0.42, 0.36, 0.27], 0.55, u(1.5, 3), 0.6));
        return;
      }
      for (let i = 0; i < 40; i++) {
        lay(time, {
          at: add(p, across(at), u(0, 0.8)), way: add(scale(at, u(6, 16)), across(at), u(0.3, 3)), size: u(0.4, 0.8), grow: 0.5,
          drag: 0.15, pull: 9.8, life: u(1.4, 2.6), ink: [0.9, 0.92, 0.93], glow: 0, opacity: 0.9, soft: 0.3, fadeIn: 0,
        });
      }
      for (let i = 0; i < 12; i++) {
        lay(time, { ...smoke(p, add(scale(at, u(1, 6)), across(at), u(0.5, 2.5)), [0.95, 0.96, 0.97], 0.35, u(1.8, 3), 1.4), grow: 2.6, pull: -0.1, drag: 1.2 });
      }
    },
    /** A ball home in a hull at `at` (a unit vector), or a ram. */
    strike(time: number, at: Vec3, ram: boolean) {
      const p = scale(at, R + (ram ? 1.2 : 1.8));
      for (let i = 0; i < (ram ? 10 : 24); i++) lay(time, splinter(p, at));
      if (ram) return;
      for (let i = 0; i < 3; i++) lay(time, flash(p, scale(any(), 2), 2.4));
      for (let i = 0; i < 14; i++) lay(time, smoke(p, add(scale(at, u(1, 5)), any(), 2), [0.24, 0.22, 0.2], 0.7, u(2.5, 4), 1));
    },
    /** Each frame: the world's clock now (s), and every ball in flight. */
    draw(time: number, flying: readonly BallDraw[]) {
      now.value = time;
      const n = Math.min(flying.length, BALLS), a = balls.buffer.array as Float32Array;
      // each ball's trail along the way it came since the last frame (none on the first, or after a pause), its puffs
      // laid when the ball passed, from a start that slides with the clock so they don't stand in step frame to frame
      const since = time - drawn > 0 && time - drawn < 0.25 ? time - drawn : 0;
      for (let i = 0; i < n; i++) {
        const { at, way } = flying[i], speed = Math.max(1e-3, Math.hypot(...way));
        a.set([...at, 0, ...way, 0], i * 8);
        for (let d = (time * 997) % TRAIL; d < speed * since; d += TRAIL) {
          const ago = d / speed;
          lay(time - ago, { ...smoke(add(at, way, -ago), [0, 0, 0], TRAIL_INK, TRAIL_OPACITY, TRAIL_LIFE, TRAIL_SIZE), grow: TRAIL_GROW, drag: 1, pull: -0.2, fadeIn: 0.02 });
        }
      }
      drawn = time;
      balls.buffer.needsUpdate = n > 0;
      balls.geometry.instanceCount = balls.trail.instanceCount = n;
      balls.mesh.visible = balls.tracer.visible = n > 0;
      puffs.geometry.instanceCount = laid;
      puffs.mesh.visible = laid > 0;
      send();
    },
    /** Each frame, after the camera has moved: the drawing buffer's height, pixels. */
    update(camera: PerspectiveCamera, height: number) {
      pixel.value = pixelSize(camera, height);
    },
  };
}

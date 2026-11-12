// The guns' work as it is seen: the balls in flight, and the puffs where they go off and come down. Two draws for all
// of it, each a single instanced mesh; no targets of their own, nothing to compute.
//
// Balls: small dark iron spheres, one instance each, placed each frame where the battle has them (filled in by the
// game: the only CPU work there is). A ball is a few centimetres across and would vanish at a hundred metres, so it is
// drawn at least a pixel and a half across, as the ropes are (ship/materials.ts).
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
  AddEquation, BufferAttribute, CustomBlending, DynamicDrawUsage, IcosahedronGeometry, InstancedBufferAttribute, InstancedBufferGeometry,
  InstancedInterleavedBuffer, InterleavedBufferAttribute, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor, type PerspectiveCamera,
} from 'three/webgpu';
import {
  Fn, atan, attribute, cameraPosition, cos, cross, exp, float, max, mix, normalize, pow, select, sin, smoothstep, uniform, varying, vec3,
} from 'three/tsl';
import type { Light } from '../sky/light';
import { pixelSize } from '../view/view';
import { random } from '../world/random';
import { R, add, dot as vdot, normalize as vnormalize, scale, type Vec3 } from '../world/sphere';

type N = any;

/** The most balls in flight, and puffs alive, at once. */
const BALLS = 128, PUFFS = 1024;
/** Floats a puff: at+born, way+life, size+grow+drag+pull, ink+glow, opacity+seed+softness+fade-in; each a vec4. */
const STRIDE = 20;
/** A ball's radius, metres (a 9-pounder's), and the fewest pixels it is drawn across. */
const BALL = 0.06, BALL_PIXELS = 1.5;
/** Cast iron, sooty. */
const IRON = 0.04;

/** One puff as it is laid: where it starts (metres) and its velocity (m/s), its size (m, radius) and how fast it grows
 * (m/s), its drag (per second) and pull (m/s² down; negative rises), life (s), colour (linear; a glow's is radiance
 * per unit of sun), glow, opacity (0 for a glow), softness (0 a hard drop, 1 a soft cloud) and share of its life fading in. */
interface Puff {
  at: Vec3; way: Vec3; size: number; grow: number; drag: number; pull: number; life: number;
  ink: Vec3; glow: number; opacity: number; soft: number; fadeIn: number;
}

function ballMesh(light: Light, pixel: N) {
  const ico = new IcosahedronGeometry(1, 1);
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', ico.getAttribute('position'));
  g.setAttribute('normal', ico.getAttribute('normal'));
  const places = new InstancedBufferAttribute(new Float32Array(BALLS * 4), 4).setUsage(DynamicDrawUsage);
  g.setAttribute('ballAt', places);
  g.instanceCount = 0;
  const m = new MeshBasicNodeMaterial();
  const at: N = attribute('ballAt', 'vec4').xyz, local: N = attribute('position', 'vec3');
  const radius: N = max(float(BALL), cameraPosition.sub(at).length().mul(pixel).mul(BALL_PIXELS / 2));
  m.positionNode = at.add(local.mul(radius));
  const n: N = varying(attribute('normal', 'vec3'));
  m.colorNode = Fn(() => {
    const p: N = at, nn: N = normalize(n);
    const lit = light.glossy(p, nn, float(0.45), vec3(IRON));
    return lit.diffuse.mul(IRON).add(lit.specular);
  })();
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return { mesh, places, geometry: g };
}

function puffMesh(light: Light, now: N) {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const buffer = new InstancedInterleavedBuffer(new Float32Array(PUFFS * STRIDE), STRIDE).setUsage(DynamicDrawUsage);
  ['puffAt', 'puffWay', 'puffForm', 'puffInk', 'puffLook'].forEach((name, i) => g.setAttribute(name, new InterleavedBufferAttribute(buffer, 4, i * 4)));
  g.instanceCount = 0;

  const o: N = attribute('puffAt', 'vec4'), w: N = attribute('puffWay', 'vec4'), f: N = attribute('puffForm', 'vec4');
  const ink: N = attribute('puffInk', 'vec4'), look: N = attribute('puffLook', 'vec4');
  const age: N = now.sub(o.w), t: N = age.div(w.w);
  const alive: N = age.greaterThanEqual(0).and(t.lessThan(1));
  const up: N = normalize(o.xyz), k: N = max(f.z, 1e-3);
  // carried off against its drag, and pulled down (or lifted)
  const centre: N = o.xyz.add(w.xyz.mul(float(1).sub(exp(k.negate().mul(age))).div(k))).sub(up.mul(f.w.mul(0.5).mul(age).mul(age)));
  const size: N = select(alive, f.x.add(f.y.mul(age)), float(0));
  const eye: N = normalize(cameraPosition.sub(centre));
  const right: N = normalize(cross(up, eye)), upward: N = cross(eye, right);
  const local: N = attribute('position', 'vec3');
  // each turned its own way, so a bank of them doesn't read as a grid
  const a: N = look.y.mul(6.283), c: N = cos(a), s: N = sin(a);
  const turned: N = vec3(local.x.mul(c).sub(local.y.mul(s)), local.x.mul(s).add(local.y.mul(c)), 0);
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.positionNode = centre.add(right.mul(turned.x).add(upward.mul(turned.y)).mul(size));
  const uv: N = varying(local.xy), mid: N = varying(centre), facing: N = varying(normalize(up.add(eye.mul(0.6))));
  const tv: N = varying(t);
  // a drop's hard disc, or a cloud's soft one billowed round its edge by a few lobes (its own, by its seed)
  const lobes: N = (uvv: N) => sin(atan(uvv.y, uvv.x).mul(5).add(look.y.mul(40))).mul(0.5).add(sin(atan(uvv.y, uvv.x).mul(3).sub(look.y.mul(17))).mul(0.5));
  const shapeOf = (r: N): N => mix(smoothstep(1, 0.55, r), exp(r.mul(r).mul(-2.5)).mul(smoothstep(1, 0.55, r.mul(float(1).sub(lobes(uv).mul(0.18))))), look.z);
  const fade: N = (tt: N) => smoothstep(0, max(look.w, 1e-3), tt).mul(pow(float(1).sub(tt).max(0), 1.5));
  const alpha: N = Fn(() => look.x.mul(shapeOf(uv.length())).mul(fade(tv)))();
  m.colorNode = Fn(() => {
    const r: N = uv.length();
    const lit: N = light(mid, normalize(facing));
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

/** light: how the world is lit (sky/light.ts). */
export function createGunfire(light: Light) {
  const now = uniform(0), pixel = uniform(0.0026);
  const balls = ballMesh(light, pixel);
  const puffs = puffMesh(light, now);
  const array = puffs.buffer.array as Float32Array;
  let head = 0, laid = 0, dirty = false;
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
    dirty = true;
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
    meshes: [balls.mesh, puffs.mesh],
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
      for (let i = 0; i < 26; i++) {
        lay(time, {
          at: add(p, across(at), u(0, 0.6)), way: add(scale(at, u(5, 13)), across(at), u(0.3, 2.5)), size: u(0.3, 0.6), grow: 0.4,
          drag: 0.15, pull: 9.8, life: u(1.2, 2.4), ink: [0.9, 0.92, 0.93], glow: 0, opacity: 0.85, soft: 0.3, fadeIn: 0,
        });
      }
      for (let i = 0; i < 8; i++) {
        lay(time, { ...smoke(p, add(scale(at, u(1, 5)), across(at), u(0.5, 2)), [0.95, 0.96, 0.97], 0.3, u(1.5, 2.5), 1), grow: 2.2, pull: -0.1, drag: 1.2 });
      }
    },
    /** A ball home in a hull at `at` (a unit vector), or a ram. */
    strike(time: number, at: Vec3, ram: boolean) {
      const p = scale(at, R + (ram ? 1.2 : 1.8));
      for (let i = 0; i < (ram ? 10 : 16); i++) lay(time, splinter(p, at));
      if (ram) return;
      for (let i = 0; i < 2; i++) lay(time, flash(p, [0, 0, 0], 1.6));
      for (let i = 0; i < 8; i++) lay(time, smoke(p, add(scale(at, u(1, 4)), any(), 1.5), [0.3, 0.28, 0.26], 0.6, u(2, 3.5), 0.7));
    },
    /** Each frame: the world's clock now (s), and every ball in flight (metres, from the centre). */
    draw(time: number, at: readonly Vec3[]) {
      now.value = time;
      const n = Math.min(at.length, BALLS), a = balls.places.array as Float32Array;
      for (let i = 0; i < n; i++) a.set(at[i], i * 4);
      balls.places.needsUpdate = n > 0;
      balls.geometry.instanceCount = n;
      balls.mesh.visible = n > 0;
      puffs.geometry.instanceCount = laid;
      puffs.mesh.visible = laid > 0;
      if (dirty) puffs.buffer.needsUpdate = true;
      dirty = false;
    },
    /** Each frame, after the camera has moved: the drawing buffer's height, pixels. */
    update(camera: PerspectiveCamera, height: number) {
      pixel.value = pixelSize(camera, height);
    },
  };
}

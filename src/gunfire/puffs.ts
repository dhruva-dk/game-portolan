// The puffs: soft round sprites facing the eye, one draw for all of them, a
// single instanced mesh. Each is written once into a ring of instances when the
// battle reports what made it, and moved from then on wholly in the vertex
// stage: carried off at its velocity with its drag (exponential) and under its
// pull (gravity, or a lift for warm smoke), growing, then fading.
// Each event lays a few kinds:
//   a gun fired    a flash at the muzzle (light it gives, added), and a bank of white powder smoke blown down the bore
//   a ball in sea  a column of spray thrown up and falling back, and mist off it; on land, dust
//   a ball home    a flash, splinters thrown out of her side and falling, and dark smoke
//   a ram          splinters
//   a ball flying  a ribbon of thin grey smoke along the way it came (its kind's trail, balls.ts SHOT)
//   a worn ship    thin grey wisps off her waist (wear 1), a sooty column (wear 2); spray off her side where her
//                  waterline is holed, smoke from her gun ports where her deck is (her faults): as smoking.ts
//                  plans it, the nearest few, fewer and bigger puffs the farther she is, none past sight (worn)
// A puff thins away close by the eye (EYE), and nearest it is not drawn.
// Smoke and spray are flat shapes in two tones (palette.ts: powder smoke cream,
// rose beneath; spray the foam's white), as bright as the place and the hour
// (sky/light.ts level), and blended premultiplied: a flash is all added light,
// smoke and spray cover what is behind them.

import {
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import {
  Fn,
  atan,
  attribute,
  cameraPosition,
  cos,
  cross,
  exp,
  float,
  max,
  mix,
  normalize,
  pow,
  select,
  sin,
  smoothstep,
  varying,
  vec3,
} from 'three/tsl';
import type { GunKind } from '../kinds.ts';
import { AZURE, DUST, FIRE, FOAM, SMOKE, SOOT, TIMBER } from '../palette.ts';
import type { Light } from '../sky/light.ts';
import type { BallDraw, ShipDraw } from '../snapshot.ts';
import { random } from '../world/random.ts';
import * as sphere from '../world/sphere.ts';
import { premultiplied, quad } from '../gpu.ts';
import type { FloatNode, Vec2Node } from '../tsl.ts';
import { SHOT } from './balls.ts';
import { MARK } from './marks.ts';
import {
  CLOSE,
  HOLED,
  LIFE_SPREAD,
  PORTS,
  SMOKING,
  WORN,
  smokers,
  type Smoker,
} from './smoking.ts';

/** The most puffs alive at once. */
const PUFFS = 4096;
/**
 * Floats a puff: at+born, way+life, size+grow+drag+pull, ink+glow,
 * opacity+seed+softness+fade-in; each a vec4.
 */
const STRIDE = 20;
/**
 * A ball's trail, a ribbon of smoke: its puffs' growth (m/s), life (s), ink and
 * opacity.
 */
const TRAIL_GROW = 1.4,
  TRAIL_LIFE = 1.6,
  TRAIL_INK: sphere.Vec3 = SMOKE.lit,
  TRAIL_OPACITY = 0.26;
/**
 * Each kind's firing: its flashes, their size, its puffs of smoke, how wide
 * they spread, and how dense.
 */
const FIRING: Record<
  GunKind,
  readonly [number, number, number, number, number]
> = {
  cannon: [3, 0.9, 12, 1.2, 0.5],
  scatter: [4, 1.2, 14, 3, 0.5],
  repeater: [1, 0.55, 2, 0.6, 0.35],
  harpoon: [0, 0, 5, 1.5, 0.22],
  mortar: [3, 1.3, 18, 2, 0.6],
};

type Vec3 = sphere.Vec3;

/**
 * How near the eye a puff thins away (metres from it to the puff's middle: none
 * at the first, whole from the second), so smoke on the lens neither walls off
 * the view nor costs its fill.
 */
const EYE = [3, 12] as const;

/**
 * A puff's flat shape: its edge's radius on its sprite and half that edge's
 * width; how far its lobes scallop it; how far below its middle its shadow tone
 * begins; and how many times its opacity it covers until it thins away.
 */
const SHAPE = 0.86,
  CRISP = 0.04,
  SCALLOP = 0.2,
  UNDER = -0.18,
  SOLID = 2.5;
/**
 * A puff's shadow tone, of its ink: as powder smoke's cream goes to its rose
 * (palette.ts SMOKE).
 */
const SHADE: sphere.Vec3 = [
  SMOKE.shadow[0] / SMOKE.lit[0],
  SMOKE.shadow[1] / SMOKE.lit[1],
  SMOKE.shadow[2] / SMOKE.lit[2],
];

/**
 * One puff as it is laid: where it starts (metres) and its velocity (m/s), its
 * size (m, radius) and how fast it grows (m/s), its drag (per second) and pull
 * (m/s² down; negative rises), life (s), colour (linear; a glow's is radiance
 * per unit of sun), glow, opacity (0 for a glow), softness (0 a hard drop, 1 a
 * soft cloud) and share of its life fading in.
 */
interface Puff {
  at: sphere.Vec3;
  way: sphere.Vec3;
  size: number;
  grow: number;
  drag: number;
  pull: number;
  life: number;
  ink: sphere.Vec3;
  glow: number;
  opacity: number;
  soft: number;
  fadeIn: number;
}

function puffMesh(light: Light, now: FloatNode) {
  const g = quad(new InstancedBufferGeometry());
  const data = new Float32Array(PUFFS * STRIDE);
  const buffer = new InstancedInterleavedBuffer(data, STRIDE).setUsage(
    DynamicDrawUsage
  );
  ['puffAt', 'puffWay', 'puffForm', 'puffInk', 'puffLook'].forEach(
    (name, i) => {
      g.setAttribute(name, new InterleavedBufferAttribute(buffer, 4, i * 4));
    }
  );
  g.instanceCount = 0;

  const o = attribute('puffAt', 'vec4'),
    w = attribute('puffWay', 'vec4'),
    f = attribute('puffForm', 'vec4');
  const ink = attribute('puffInk', 'vec4'),
    look = attribute('puffLook', 'vec4');
  const age = now.sub(o.w),
    t = age.div(w.w);
  const alive = age.greaterThanEqual(0).and(t.lessThan(1));
  const up = normalize(o.xyz),
    k = max(f.z, 1e-3);
  // carried off against its drag, and pulled down (or lifted)
  const centre = o.xyz
    .add(
      w.xyz.mul(
        float(1)
          .sub(exp(k.negate().mul(age)))
          .div(k)
      )
    )
    .sub(up.mul(f.w.mul(0.5).mul(age).mul(age)));
  // thinning away near the eye (EYE), and gone, not drawn at all, nearest it
  const toEye = cameraPosition.sub(centre),
    seen = smoothstep(EYE[0], EYE[1], toEye.length());
  const size = select(
    alive.and(seen.greaterThan(0)),
    f.x.add(f.y.mul(age)),
    float(0)
  );
  const eye = normalize(toEye);
  const right = normalize(cross(up, eye)),
    upward = cross(eye, right);
  const local = attribute('position', 'vec3');
  // each turned its own way, so a bank of them doesn't read as a grid
  const a = look.y.mul(6.283),
    c = cos(a),
    s = sin(a);
  const turned = vec3(
    local.x.mul(c).sub(local.y.mul(s)),
    local.x.mul(s).add(local.y.mul(c)),
    0
  );
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.positionNode = centre.add(
    right.mul(turned.x).add(upward.mul(turned.y)).mul(size)
  );
  // (its place on the sprite as the eye sees it, y up the world: its underside
  // is its shadow's)
  const uv = varying(local.xy),
    upright = varying(turned.y),
    mid = varying(centre);
  const tv = varying(t),
    near = varying(seen);
  // a flat shape with a crisp edge: a drop's disc, or a cloud's, scalloped
  // round its edge by a few lobes (its own, by its seed); a glow's stays soft,
  // as light is
  const lobes = (uvv: Vec2Node) => {
    const angle = atan(uvv.y, uvv.x);
    return sin(angle.mul(5).add(look.y.mul(40)))
      .mul(0.5)
      .add(sin(angle.mul(3).sub(look.y.mul(17))).mul(0.5));
  };
  const billowed = (r: FloatNode): FloatNode =>
    r.mul(float(1).sub(lobes(uv).mul(look.z).mul(SCALLOP)));
  const shapeOf = (r: FloatNode): FloatNode =>
    smoothstep(SHAPE, SHAPE - CRISP, billowed(r));
  const glowOf = (r: FloatNode): FloatNode =>
    exp(r.mul(r).mul(-2.5)).mul(smoothstep(1, 0.55, r));
  const fade = (tt: FloatNode) =>
    smoothstep(0, max(look.w, 1e-3), tt).mul(pow(float(1).sub(tt).max(0), 1.5));
  // it thins only at the end of its life: until then the shape is whole, as
  // painted
  const alpha = Fn(() =>
    shapeOf(uv.length())
      .mul(look.x.mul(fade(tv)).mul(SOLID).min(1))
      .mul(near)
  )();
  m.colorNode = Fn(() => {
    const r = uv.length();
    // two tones: its ink, and on its underside its shadow's (a cloud's rose:
    // palette.ts SMOKE)
    const under = smoothstep(
      UNDER + CRISP,
      UNDER - CRISP,
      upright.add(lobes(uv).mul(0.12))
    );
    const tone = ink.rgb.mul(mix(vec3(1), vec3(...SHADE), under));
    return tone
      .mul(light.level(mid))
      .mul(alpha)
      .add(ink.rgb.mul(ink.w).mul(glowOf(r)).mul(fade(tv)).mul(near));
  })();
  m.opacityNode = alpha;
  // premultiplied: a glow adds its light, smoke covers what is behind
  premultiplied(m);
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  // after the sea, which reads what was drawn before it
  mesh.renderOrder = 2;
  return { mesh, buffer, data, geometry: g };
}

/**
 * light: how the world is lit (sky/light.ts); now: the world's clock
 * (gunfire.ts sets it).
 */
export function createPuffs(light: Light, now: FloatNode) {
  const puffs = puffMesh(light, now);
  const array = puffs.data;
  /** The world's clock when the balls' trails, and the worn ships' smoke, were last laid. */
  let drawn = -Infinity,
    wornAt = -Infinity;
  /**
   * Each smoking ship's share of a puff owed, by her id and the kind (smoking.ts
   * Smoker: smoke, spray, ports); the smoking this frame (smoking.ts smokers,
   * its entries kept); the puff they lay, rewritten for each, and the ways it
   * is worked out in (so none is made).
   */
  const owed = new Map<number, number>(),
    smoking: Smoker[] = [],
    wornAt3: [number, number, number] = [0, 0, 0],
    wornWay: [number, number, number] = [0, 0, 0],
    wornPuff: Puff = {
      at: wornAt3,
      way: wornWay,
      size: 0,
      grow: 0,
      drag: 0,
      pull: 0,
      life: 0,
      ink: SOOT,
      glow: 0,
      opacity: 0,
      soft: 1,
      fadeIn: 0,
    },
    side: [number, number, number] = [0, 0, 0],
    rand: [number, number, number] = [0, 0, 0];
  /** The puff a ball's trail lays, rewritten for each (so none is made). */
  const trailAt: [number, number, number] = [0, 0, 0];
  const trailPuff: Puff = {
    at: trailAt,
    way: [0, 0, 0],
    size: 0,
    grow: TRAIL_GROW,
    drag: 1,
    pull: -0.2,
    life: TRAIL_LIFE,
    ink: TRAIL_INK,
    glow: 0,
    opacity: TRAIL_OPACITY,
    soft: 1,
    fadeIn: 0.02,
  };
  /**
   * The ring's next slot, how many hold a puff, and how many were laid since
   * the last were sent (only those go up).
   */
  let head = 0,
    laid = 0,
    fresh = 0;
  const draw = random(0x6a11);
  const u = (lo: number, hi: number) => lo + (hi - lo) * draw();
  /** A random unit vector (into `out`, if given). */
  const any = (out?: [number, number, number]): sphere.Vec3 => {
    const z = u(-1, 1),
      a = u(0, 2 * Math.PI),
      s = Math.sqrt(1 - z * z);
    return sphere.put(out, s * Math.cos(a), s * Math.sin(a), z);
  };
  /**
   * How many puffs of kind `j` (Smoker's order) ship `id` lays now, laying
   * `rate` a second for `since` s: what is owed carried over, a frame's
   * fraction at a time.
   */
  const owe = (id: number, j: number, rate: number, since: number) => {
    const key = id * 3 + j,
      due = (owed.get(key) ?? draw()) + rate * since,
      k = Math.floor(due);
    owed.set(key, due - k);
    return k;
  };
  /** A random unit tangent at `up`: one random direction, laid in the plane. */
  const across = (up: sphere.Vec3): sphere.Vec3 =>
    sphere.normalize(sphere.tangent(any(), up));

  /**
   * Writes puff `p`, born at `born`, into the ring's next slot (its floats in
   * STRIDE's order), a seed of its own drawn.
   */
  function lay(born: number, p: Puff) {
    const o = head * STRIDE;
    ((array[o] = p.at[0]),
      (array[o + 1] = p.at[1]),
      (array[o + 2] = p.at[2]),
      (array[o + 3] = born));
    ((array[o + 4] = p.way[0]),
      (array[o + 5] = p.way[1]),
      (array[o + 6] = p.way[2]),
      (array[o + 7] = p.life));
    ((array[o + 8] = p.size),
      (array[o + 9] = p.grow),
      (array[o + 10] = p.drag),
      (array[o + 11] = p.pull));
    ((array[o + 12] = p.ink[0]),
      (array[o + 13] = p.ink[1]),
      (array[o + 14] = p.ink[2]),
      (array[o + 15] = p.glow));
    ((array[o + 16] = p.opacity),
      (array[o + 17] = draw()),
      (array[o + 18] = p.soft),
      (array[o + 19] = p.fadeIn));
    head = (head + 1) % PUFFS;
    laid = Math.min(PUFFS, laid + 1);
    fresh++;
  }
  /**
   * The puffs laid since the last were sent, as the ring's ranges to send (one,
   * or two where it wraps).
   */
  function send() {
    if (fresh === 0) return;
    const b = puffs.buffer,
      n = Math.min(fresh, PUFFS),
      from = (head - n + PUFFS) % PUFFS;
    fresh = 0;
    b.clearUpdateRanges();
    if (from + n <= PUFFS) b.addUpdateRange(from * STRIDE, n * STRIDE);
    else {
      b.addUpdateRange(from * STRIDE, (PUFFS - from) * STRIDE);
      b.addUpdateRange(0, (from + n - PUFFS) * STRIDE);
    }
    b.needsUpdate = true;
  }

  const smoke = (
    at: Vec3,
    way: Vec3,
    ink: Vec3,
    opacity: number,
    life: number,
    size = 0.8
  ): Puff => ({
    at,
    way,
    size,
    grow: 1.6,
    drag: 2.2,
    pull: -0.5,
    life,
    ink,
    glow: 0,
    opacity,
    soft: 1,
    fadeIn: 0.05,
  });
  const flash = (
    at: Vec3,
    way: Vec3,
    size: number,
    ink: Vec3 = FIRE
  ): Puff => ({
    at,
    way,
    size,
    grow: 12,
    drag: 8,
    pull: 0,
    life: u(0.08, 0.14),
    ink,
    glow: 6,
    opacity: 0,
    soft: 1,
    fadeIn: 0,
  });
  /**
   * A mote of a shield's light thrown off it: a small hard azure spark, falling
   * slowly.
   */
  const shard = (at: Vec3, speed: number): Puff => ({
    at,
    way: sphere.scale(any(), u(speed / 2, speed)),
    size: u(0.18, 0.34),
    grow: 0,
    drag: 1.6,
    pull: 2,
    life: u(0.35, 0.7),
    ink: AZURE,
    glow: 4,
    opacity: 0,
    soft: 0.2,
    fadeIn: 0,
  });
  const splinter = (at: Vec3, up: Vec3): Puff => {
    const d = sphere.normalize(sphere.add(any(), up, 1.2));
    return {
      at,
      way: sphere.scale(d, u(4, 13)),
      size: u(0.12, 0.22),
      grow: 0,
      drag: 0.4,
      pull: 9.8,
      life: u(1, 1.8),
      ink: TIMBER.shadow,
      glow: 0,
      opacity: 1,
      soft: 0,
      fadeIn: 0,
    };
  };
  /**
   * Spray thrown up off the sea: foam-white drops, `at` where it starts, `way`
   * its velocity, as big as `size` m.
   */
  const spray = (
    at: Vec3,
    way: Vec3,
    size: number,
    grow: number,
    drag: number,
    life: number
  ): Puff => ({
    at,
    way,
    size,
    grow,
    drag,
    pull: 9.8,
    life,
    ink: FOAM,
    glow: 0,
    opacity: 0.9,
    soft: 0.3,
    fadeIn: 0,
  });

  return {
    mesh: puffs.mesh,
    /**
     * A gun of `gun` fired at `time` (the world's clock, s) from `from`
     * (metres, from the centre) along `dir` (unit): the cannon's flash and bank
     * of smoke; the scatter's wide burst; the repeater's small quick flash and
     * a wisp; the harpoon's no fire, a kick of dust off its stock; the mortar's
     * flash and a great bank thrown up.
     */
    shot(time: number, from: Vec3, dir: Vec3, gun: GunKind) {
      const [flashes, size, puffs, spread, ink] = FIRING[gun];
      for (let i = 0; i < flashes; i++) {
        const at = sphere.add(
          sphere.add(from, dir, 0.6 + 0.5 * i),
          any(),
          gun === 'scatter' ? 0.5 : 0
        );
        lay(time, flash(at, sphere.scale(dir, u(3, 9)), size + 0.3 * i));
      }
      for (let i = 0; i < puffs; i++) {
        const way = sphere.add(sphere.scale(dir, u(2, 16)), any(), spread);
        lay(
          time,
          smoke(
            sphere.add(from, dir, 0.8),
            way,
            SMOKE.lit,
            ink,
            u(2.5, 4.5),
            gun === 'mortar' ? 1.2 : 0.8
          )
        );
      }
    },
    /**
     * A ball of `gun` come down at `at` (a unit vector), in the sea or on the
     * land: a scatter's pellet or a repeater's round a small spout; a mortar's
     * shell bursting, its flash, its spray over its splash's breadth.
     */
    splash(time: number, at: Vec3, land: boolean, gun: GunKind) {
      const p = sphere.scale(at, sphere.R);
      const [k, wide] =
        gun === 'mortar'
          ? [2.5, MARK / 2]
          : gun === 'scatter' || gun === 'repeater'
            ? [0.25, 0.3]
            : [1, 0.8];
      if (gun === 'mortar')
        for (let i = 0; i < 3; i++)
          lay(time, flash(sphere.add(p, at, 1), sphere.scale(any(), 4), 5));
      if (land) {
        for (let i = 0; i < 10 * k; i++) {
          const from = sphere.add(p, across(at), u(0, wide)),
            way = sphere.add(
              sphere.scale(at, u(1, 5)),
              across(at),
              u(0.5, 2.5)
            );
          lay(time, smoke(from, way, DUST, 0.55, u(1.5, 3), 0.6));
        }
        return;
      }
      for (let i = 0; i < 40 * k; i++) {
        const from = sphere.add(p, across(at), u(0, wide)),
          way = sphere.add(sphere.scale(at, u(6, 16)), across(at), u(0.3, 3));
        lay(time, spray(from, way, u(0.4, 0.8), 0.5, 0.15, u(1.4, 2.6)));
      }
      for (let i = 0; i < 12 * k; i++) {
        const from = sphere.add(p, across(at), u(0, wide)),
          way = sphere.add(sphere.scale(at, u(1, 6)), across(at), u(0.5, 2.5));
        lay(time, {
          ...smoke(from, way, FOAM, 0.35, u(1.8, 3), 1.4),
          grow: 2.6,
          pull: -0.1,
          drag: 1.2,
        });
      }
    },
    /**
     * A ball home in a hull at `at` (a unit vector), or a ram; whether her
     * shield took all of it (a glint of azure and no splinters), and whether it
     * broke (a burst of shards).
     */
    strike(
      time: number,
      at: Vec3,
      ram: boolean,
      shield: boolean,
      broke: boolean
    ) {
      const p = sphere.scale(at, sphere.R + (ram ? 1.2 : 1.8));
      if (shield || broke) {
        for (let i = 0; i < (broke ? 3 : 2); i++)
          lay(time, flash(p, sphere.scale(any(), 2), broke ? 3.4 : 2, AZURE));
        for (let i = 0; i < (broke ? 26 : 8); i++)
          lay(
            time,
            shard(sphere.add(p, any(), broke ? 1.5 : 0.6), broke ? 9 : 4)
          );
        if (shield) return;
      }
      for (let i = 0; i < (ram ? 10 : 24); i++) lay(time, splinter(p, at));
      if (ram) return;
      for (let i = 0; i < 3; i++)
        lay(time, flash(p, sphere.scale(any(), 2), 2.4));
      for (let i = 0; i < 14; i++) {
        const way = sphere.add(sphere.scale(at, u(1, 5)), any(), 2);
        lay(time, smoke(p, way, SOOT, 0.7, u(2.5, 4), 1));
      }
    },
    /**
     * A ship gone down at `at` (a unit vector): her timbers thrown, the sea
     * heaved white over her, a pall of smoke.
     */
    sink(time: number, at: Vec3) {
      const p = sphere.scale(at, sphere.R + 1);
      for (let i = 0; i < 30; i++)
        lay(time, splinter(sphere.add(p, across(at), u(0, 4)), at));
      for (let i = 0; i < 3; i++)
        lay(time, flash(sphere.add(p, at, 1.5), sphere.scale(any(), 3), 4.5));
      for (let i = 0; i < 40; i++) {
        const from = sphere.add(
          sphere.scale(at, sphere.R),
          across(at),
          u(0, 6)
        );
        const way = sphere.add(sphere.scale(at, u(4, 12)), across(at), u(1, 5));
        lay(time, spray(from, way, u(0.6, 1.1), 0.6, 0.2, u(1.6, 2.8)));
      }
      for (let i = 0; i < 16; i++) {
        const from = sphere.add(p, across(at), u(0, 4)),
          way = sphere.add(sphere.scale(at, u(2, 7)), any(), 2);
        lay(time, smoke(from, way, SOOT, 0.75, u(4, 7), 2));
      }
    },
    /**
     * Each frame, at `time` (the world's clock, s), before draw: the smoke of
     * the worn among `ships` (ShipDraw.wear), and the spray and ports' smoke
     * of the holed and afire (ShipDraw.faults), seen from `eye` (metres), as
     * smoking.ts plans it; bigger puffs the farther she is, and lower and
     * smaller close by the eye. Makes nothing.
     */
    worn(time: number, ships: readonly ShipDraw[], eye: Vec3) {
      const since =
        time - wornAt > 0 && time - wornAt < 0.25 ? time - wornAt : 0;
      wornAt = time;
      if (!since) return;
      const n = smokers(ships, eye, smoking),
        q = wornPuff,
        at = wornAt3,
        way = wornWay;
      for (let i = 0; i < n; i++) {
        const m = smoking[i];
        if (!m) continue;
        const s = m.ship,
          w = WORN[s.wear],
          big = Math.sqrt(Math.max(1, m.away / SMOKING.near)),
          low = CLOSE.rise + (1 - CLOSE.rise) * m.close,
          small = CLOSE.size + (1 - CLOSE.size) * m.close;
        const { position: p, up, forward } = s.pose;
        sphere.cross(up, forward, side);
        // her side's spray where her waterline is holed
        for (let k = owe(s.id, 1, m.spray, since); k > 0; k--) {
          const out = Math.sign(u(-1, 1));
          sphere.add(p, side, out * HOLED.beam, at);
          sphere.add(at, forward, u(-HOLED.length, HOLED.length), at);
          sphere.scale(up, u(2, 5), way);
          sphere.add(way, side, out * u(1, 3), way);
          q.size = u(0.4, 0.8) * big;
          q.grow = 0.6;
          q.drag = 0.3;
          q.pull = 9.8;
          q.life = u(0.8, HOLED.life);
          q.ink = FOAM;
          q.opacity = 0.9;
          q.soft = 0.3;
          q.fadeIn = 0;
          lay(time - u(0, since), q);
        }
        // her ports' smoke where her deck is afire
        for (let k = owe(s.id, 2, m.ports, since); k > 0; k--) {
          const out = Math.sign(u(-1, 1));
          sphere.add(p, up, PORTS.over, at);
          sphere.add(at, side, out * HOLED.beam, at);
          sphere.add(at, forward, u(-PORTS.length, PORTS.length), at);
          sphere.scale(side, out * u(1, 2.5), way);
          sphere.add(way, up, u(1, 2.5) * low, way);
          q.size = 0.55 * big * small;
          q.grow = 0.9 * big * small;
          q.drag = 0.8;
          q.pull = -0.6 * low;
          q.life = u(2, PORTS.life);
          q.ink = SOOT;
          q.opacity = PORTS.opacity;
          q.soft = 1;
          q.fadeIn = 0.05;
          lay(time - u(0, since), q);
        }
        // her wear's smoke off her waist
        if (!w) continue;
        for (let k = owe(s.id, 0, m.wear, since); k > 0; k--) {
          sphere.add(p, up, SMOKING.over * low, at);
          sphere.add(at, forward, -SMOKING.aft, at);
          sphere.normalize(sphere.tangent(any(rand), up, rand), rand);
          sphere.add(at, rand, u(0, 0.8), at);
          sphere.scale(up, w.rise * low * u(0.7, 1.2), way);
          sphere.add(way, any(rand), 0.4, way);
          q.size = w.size * big * small;
          q.grow = w.grow * big * small;
          q.drag = w.drag;
          q.pull = -w.lift * low;
          q.life = w.life * u(0.8, LIFE_SPREAD);
          q.ink = w.ink;
          q.opacity = w.opacity;
          q.soft = 1;
          q.fadeIn = 0.12;
          lay(time - u(0, since), q);
        }
      }
    },
    /**
     * Each frame, at `time` (the world's clock, s): the trails of the first `n`
     * balls in flight, then every puff laid since the last frame sent up.
     */
    draw(time: number, flying: readonly BallDraw[], n: number) {
      // each ball's trail along the way it came since the last frame (none on
      // the first, or after a pause), its puffs laid when the ball passed, from
      // a start that slides with the clock so they don't stand in step frame to
      // frame
      const since = time - drawn > 0 && time - drawn < 0.25 ? time - drawn : 0;
      for (let i = 0; i < n; i++) {
        const { at, way, gun } = flying[i],
          shot = SHOT[gun];
        if (!shot.trail) continue;
        const speed = Math.max(1e-3, Math.hypot(way[0], way[1], way[2]));
        for (
          let d = (time * 997) % shot.trail;
          d < speed * since;
          d += shot.trail
        ) {
          const ago = d / speed;
          ((trailAt[0] = at[0] - way[0] * ago),
            (trailAt[1] = at[1] - way[1] * ago),
            (trailAt[2] = at[2] - way[2] * ago));
          trailPuff.size = shot.puff;
          lay(time - ago, trailPuff);
        }
      }
      drawn = time;
      puffs.geometry.instanceCount = laid;
      send();
    },
  };
}

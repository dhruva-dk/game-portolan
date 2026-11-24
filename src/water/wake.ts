import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  HalfFloatType,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LinearFilter,
  MaxEquation,
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  RGBAFormat,
  RenderTarget,
  Scene,
} from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  cos,
  cross,
  dot,
  exp,
  float,
  length,
  max,
  min,
  mix,
  mx_noise_float,
  normalize,
  saturate,
  select,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Environment } from '../environment.ts';
import { additive, type Draw } from '../gpu.ts';
import { PIVOT_Z, buildShip } from '../ship/build.ts';
import { THROUGH } from '../ship/materials.ts';
import { WATERLINE } from '../ship/waterline.ts';
import { WAKE, lay, type WakePoint } from '../sim/wake.ts';
import type { Sky } from '../sky/sky.ts';
import type { View } from '../view/view.ts';
import type { ShipPose } from '../world/pose.ts';
import { clamp } from '../world/scalar.ts';
import * as sphere from '../world/sphere.ts';
import type { FloatNode, Vec2Node, Vec3Node, Vec4Node } from '../tsl.ts';
import { outside } from './hulls.ts';
import {
  ARM_LIFE,
  ARM_WIDTH,
  CHURN,
  KELVIN,
  SPREAD,
  WIDEN,
  createRibbon,
  type Route,
} from './ribbon.ts';

const SIZE = 512,
  REACH = 128;
const TEXEL = (2 * REACH) / SIZE;
const FULL = 10;
const LENGTH = WATERLINE.stem - WATERLINE.stern;

const TONGUE = 3.5,
  TONGUE_SLANT = 1.2,
  TONGUE_CREST = 1.35,
  TONGUE_LANE = 0.2;
const ARM = 0.18,
  ARM_FADE = 10,
  ROUGH = 0.45;
const BOW_LIFE = 3,
  BOW_FOAM = 2.4,
  STREAK = 0.12,
  STREAK_WIDEST = 1.4,
  BOW_REACH = 1.5,
  AIR_REACH = 1.5;
const RIM_SHARE = 0.3,
  CURL_REACH = 0.9;
const FEATHER = [0.1, 0.6] as const;
const CURL = 1.8;
const ROUGHEST = 14;
const LAPPING = 0.85,
  LAPPING_OUT = 0.6,
  AIR_OUT = 3,
  LAPPING_AIR = 0.6,
  BOW = 0.45;
const LAP_SCALLOP = 0.6,
  LAP_WAVE = 2.1;
const PATCH = { astern: 7, ahead: 4, out: 4.5 };
const LOW_SUN = 0.15;
const SOFT = 3;

const vertices = WAKE.most + 1;

const sq = (x: FloatNode): FloatNode => x.mul(x);

export interface Afloat {
  pose: ShipPose;
  velocity: sphere.Vec3;
  look: { brace: number };
}

function marker(at: Vec2Node, mark: Vec4Node): MeshBasicNodeMaterial {
  const m = additive(
    new MeshBasicNodeMaterial({
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
  );
  m.vertexNode = vec4(at.x.div(REACH), at.y.div(REACH), 0.5, 1);
  m.fragmentNode = mark;
  return m;
}

const dynamic = (n: number, size: number) => {
  const data = new Float32Array(n * size);
  return {
    data,
    attribute: new BufferAttribute(data, size).setUsage(DynamicDrawUsage),
  };
};

function sent(a: BufferAttribute | InstancedInterleavedBuffer, items: number) {
  const size = a instanceof BufferAttribute ? a.itemSize : a.stride;
  if (items <= 0) return;
  a.addUpdateRange(0, items * size);
  a.needsUpdate = true;
}

export function createWake(view: View, sky: Sky, capacity: number) {
  const target = new RenderTarget(SIZE, SIZE, {
    type: HalfFloatType,
    format: RGBAFormat,
    depthBuffer: false,
  });
  target.texture.minFilter = target.texture.magFilter = LinearFilter;
  target.texture.generateMipmaps = false;
  const scene = new Scene();
  const camera = new OrthographicCamera();
  const draw: Draw = { scene, camera, target, clear: { color: 0, alpha: 0 } };
  const live = uniform(0);
  const rough = uniform(0);

  const trailGeometry = new BufferGeometry();
  const trailAt = dynamic(capacity * vertices * 2, 2),
    trailMark = dynamic(capacity * vertices * 2, 4);
  const trailLaid = dynamic(capacity * vertices * 2, 1);
  trailGeometry.setAttribute('at', trailAt.attribute);
  trailGeometry.setAttribute('mark', trailMark.attribute);
  trailGeometry.setAttribute('laid', trailLaid.attribute);
  const trailIndex = new Uint16Array(capacity * (vertices - 1) * 6);
  const trailIndexAttribute = new BufferAttribute(trailIndex, 1).setUsage(
    DynamicDrawUsage
  );
  trailGeometry.setIndex(trailIndexAttribute);
  const trails = new Mesh(
    trailGeometry,
    marker(
      attribute('at', 'vec2'),
      Fn(() => {
        const m = attribute('mark', 'vec4'),
          across = m.x,
          age = m.y,
          v = m.z,
          run = m.w,
          laid = attribute('laid', 'float');
        const pace = saturate(v.div(FULL)),
          calm = float(1).sub(rough.mul(ROUGH));
        const patchy = (size: number, salt: number): FloatNode =>
          mx_noise_float(vec3(laid.div(size), across.div(size), salt));
        const spread = age
          .mul(SPREAD)
          .add(CHURN)
          .mul(patchy(5, 0.5).mul(0.3).add(1));
        const churned = exp(sq(across.div(spread)).negate())
          .mul(smoothstep(LENGTH - 1, LENGTH + 3, run))
          .mul(pace);
        const worn = age.div(24).add(rough.mul(0.2));
        const churnLeft = smoothstep(
          worn.sub(0.45),
          worn.sub(0.1),
          patchy(3, 1.5)
        );
        const tongue = cos(
          laid
            .add(abs(across).mul(TONGUE_SLANT))
            .add(patchy(2, 4.5).mul(1.5))
            .mul((2 * Math.PI) / TONGUE)
        );
        const tongues = mix(
          float(TONGUE_LANE),
          float(TONGUE_CREST),
          smoothstep(-0.25, 0.25, tongue)
        );
        const foam = churned
          .mul(
            exp(age.div(-3))
              .mul(0.3)
              .add(exp(age.div(-12)).mul(0.1).mul(churnLeft))
          )
          .mul(tongues)
          .toVar();
        const behind = max(run.sub(LENGTH), 0);
        const air = churned
          .mul(exp(age.div(-10)))
          .mul(exp(behind.div(-AIR_REACH * LENGTH)));
        const astern = exp(behind.div(-BOW_REACH * LENGTH));
        const off = abs(across).sub(v.mul(age).mul(KELVIN));
        const width = v.mul(age).mul(WIDEN).add(ARM_WIDTH);
        const life = exp(age.div(calm.mul(-ARM_FADE)))
          .mul(smoothstep(calm.mul(ARM_LIFE), calm.mul(ARM_LIFE * 0.5), age))
          .mul(pace);
        const wavelength = v.mul(0.6).add(3);
        const slant = (along: FloatNode): FloatNode =>
          cos(
            off
              .mul(0.82)
              .add(along.mul(0.57))
              .mul(2 * Math.PI)
              .div(wavelength)
          );
        const band = exp(
          sq(
            off.div(width.mul(select(off.greaterThan(0), float(1), float(2))))
          ).negate()
        );
        const groups = mx_noise_float(vec2(run.div(14), 0.3))
          .mul(0.35)
          .add(0.8);
        const height = band
          .mul(slant(run))
          .mul(groups)
          .mul(life)
          .mul(ARM)
          .div(v.mul(age).mul(0.06).add(1).sqrt());
        const feathers = smoothstep(FEATHER[0], FEATHER[1], slant(laid));
        const rim = exp(sq(off.div(BOW_FOAM * RIM_SHARE)).negate());
        const curls = exp(sq(off.div(BOW_FOAM * CURL_REACH)).negate())
          .mul(step(off, 0))
          .mul(feathers);
        foam.addAssign(
          max(rim, curls.mul(CURL))
            .mul(pace)
            .mul(exp(age.div(-BOW_LIFE)).mul(0.9))
            .mul(astern)
        );
        const streak = min(width.mul(0.5).add(0.6), STREAK_WIDEST),
          gone = age.div(calm.mul(ARM_LIFE)).add(rough.mul(0.2));
        const left = smoothstep(
          gone.sub(0.55),
          gone.sub(0.15),
          patchy(4, 2.5).mul(0.7).add(patchy(1.5, 3.5).mul(0.3))
        );
        const streaks = exp(sq(off.div(streak)).negate()).mul(
          float(1.2).div(streak).sqrt()
        );
        foam.addAssign(
          streaks.mul(life).mul(feathers).mul(left).mul(STREAK).mul(astern)
        );
        return vec4(foam, height, air, 0);
      })()
    )
  );

  const patchGeometry = new BufferGeometry();
  const patchAt = dynamic(capacity * 4, 2),
    patchMark = dynamic(capacity * 4, 4);
  patchGeometry.setAttribute('at', patchAt.attribute);
  patchGeometry.setAttribute('mark', patchMark.attribute);
  const patchIndex = new Uint16Array(capacity * 6);
  for (let i = 0; i < capacity; i++)
    patchIndex.set(
      [0, 1, 2, 0, 2, 3].map((k) => k + 4 * i),
      i * 6
    );
  patchGeometry.setIndex(new BufferAttribute(patchIndex, 1));
  const patches = new Mesh(
    patchGeometry,
    marker(
      attribute('at', 'vec2'),
      Fn(() => {
        const m = attribute('mark', 'vec4'),
          across = m.x,
          ahead = m.y,
          pace = m.z;
        const d = outside(across, ahead);
        const fore = smoothstep(
          0.35,
          0.95,
          ahead.sub(WATERLINE.stern).div(LENGTH)
        );
        const scallop = sin(ahead.mul(LAP_WAVE).add(step(0, across).mul(1.7)))
          .mul(LAP_SCALLOP)
          .add(1 - LAP_SCALLOP);
        const ring = exp(
          sq(
            max(d, 0).div(pace.mul(fore).mul(1.4).add(scallop.mul(LAPPING_OUT)))
          ).negate()
        ).mul(smoothstep(-0.8, 0, d));
        const astern = float(WATERLINE.stern).sub(ahead);
        const boil = exp(sq(astern.sub(1.5).div(2.5)).negate())
          .mul(exp(sq(across.div(1.8)).negate()))
          .mul(pace);
        const foam = ring
          .mul(pace.mul(fore.mul(0.9).add(0.35)).add(LAPPING))
          .add(boil.mul(0.5));
        const height = exp(sq(max(d, 0).div(1.8)).negate())
          .mul(fore.mul(fore))
          .mul(pace.mul(pace))
          .mul(BOW);
        const stirred = exp(sq(max(d, 0).div(AIR_OUT)).negate())
          .mul(smoothstep(-0.8, 0, d))
          .mul(LAPPING_AIR);
        return vec4(
          foam,
          height,
          max(ring.mul(pace).mul(0.7).add(boil), stirred),
          0
        );
      })()
    )
  );

  const caster = buildShip(2);
  const shadowGeometry = new InstancedBufferGeometry();
  {
    const parts = [
      { p: caster.body, dark: 1 },
      { p: caster.cloth, dark: 1 - THROUGH },
    ];
    const position = new Float32Array(
      parts.reduce((n, { p }) => n + p.position.length, 0)
    );
    const part = new Uint8Array(
      parts.reduce((n, { p }) => n + p.part.length, 0)
    );
    const dark = new Float32Array(
      parts.reduce((n, { p }) => n + p.vertices, 0)
    );
    const index: number[] = [];
    let base = 0;
    for (const { p, dark: d } of parts) {
      position.set(p.position, base * 3);
      part.set(p.part, base * 4);
      dark.fill(d, base, base + p.vertices);
      p.index.forEach((i) => index.push(i + base));
      base += p.vertices;
    }
    shadowGeometry.setAttribute('position', new BufferAttribute(position, 3));
    shadowGeometry.setAttribute('part', new BufferAttribute(part, 4, true));
    shadowGeometry.setAttribute('dark', new BufferAttribute(dark, 1));
    shadowGeometry.setIndex(index);
  }
  const shadowPoses = new Float32Array(capacity * 12);
  const poses = new InstancedInterleavedBuffer(shadowPoses, 12).setUsage(
    DynamicDrawUsage
  );
  ['shadowAt', 'shadowFwd', 'shadowUp'].forEach((name, i) => {
    shadowGeometry.setAttribute(
      name,
      new InterleavedBufferAttribute(poses, 4, i * 4)
    );
  });
  shadowGeometry.instanceCount = 0;
  const shadowOn = Fn(() => {
    const at = attribute('shadowAt', 'vec4'),
      fwd = attribute('shadowFwd', 'vec4').xyz,
      up = attribute('shadowUp', 'vec4').xyz;
    const local = attribute('position', 'vec3'),
      part = attribute('part', 'vec4');
    const pivot = part.y.mul(255).round();
    const angle = at.w
      .mul(part.z)
      .mul(select(pivot.greaterThan(0.5), float(1), float(0)));
    const pz = select(
      pivot.greaterThan(1.5),
      float(PIVOT_Z[2]),
      float(PIVOT_Z[1])
    );
    const z = local.z.sub(pz),
      c = cos(angle),
      s = sin(angle);
    const braced = vec3(
      local.x.mul(c).add(z.mul(s)),
      local.y,
      local.x.negate().mul(s).add(z.mul(c)).add(pz)
    );
    const p = at.xyz
      .add(cross(up, fwd).mul(braced.x))
      .add(up.mul(braced.y))
      .add(fwd.mul(braced.z));
    const n = normalize(at.xyz),
      sun = sky.sun(at.xyz);
    const drop = dot(p.sub(n.mul(sphere.R)), n).div(max(dot(sun, n), LOW_SUN));
    return view.local(p.sub(sun.mul(drop)));
  })();
  const shadowMarker = marker(
    shadowOn,
    vec4(0, 0, 0, attribute('dark', 'float'))
  );
  shadowMarker.blendEquationAlpha = MaxEquation;
  const shadows = new Mesh(shadowGeometry, shadowMarker);

  for (const mesh of [trails, patches, shadows]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  trails.count = patches.count = 0;

  const place = (p: Vec3Node) => {
    const c = view.onEye(p);
    return {
      uv: vec2(c.q.x.div(2 * REACH).add(0.5), c.q.y.div(-2 * REACH).add(0.5)),
      fade: smoothstep(REACH, REACH * 0.8, max(abs(c.q.x), abs(c.q.y))).mul(
        live
      ),
      e1: c.e1,
      e2: c.e2,
    };
  };

  const wakes: WakePoint[][] = [];
  const sailed = new Float64Array(capacity);
  const stems: (sphere.Out3 | undefined)[] = [],
    bow: sphere.Out3 = [0, 1, 0];
  const head: WakePoint = { at: [0, 1, 0], time: 0, speed: 0 };
  const chart: sphere.Chart = { at: [0, 1, 0], axis: [1, 0, 0] };
  const onChart = new Float64Array(2);
  const patch = patchAt.data,
    patchM = patchMark.data;
  const route: Route = { head, kept: [], skip: 0 };
  const ribbon = createRibbon(trailAt.data, trailMark.data, trailLaid.data);

  return {
    read(p: Vec3Node): { marks: Vec3Node; slope: Vec3Node } {
      const { uv, fade, e1, e2 } = place(p);
      const look = (o: Vec2Node) => texture(target.texture, o).mul(fade);
      const here = look(uv),
        east = look(uv.add(vec2(1 / SIZE, 0))),
        south = look(uv.sub(vec2(0, 1 / SIZE)));
      return {
        marks: here.xyz,
        slope: e1
          .mul(east.y.sub(here.y))
          .add(e2.mul(south.y.sub(here.y)))
          .div(TEXEL),
      };
    },
    shade(p: Vec3Node): FloatNode {
      const up = normalize(p),
        sun = sky.sun(p);
      const { uv, fade } = place(
        p.sub(
          sun.mul(
            length(p)
              .sub(sphere.R)
              .div(max(dot(sun, up), LOW_SUN))
          )
        )
      );
      let sum: FloatNode = float(0);
      for (let i = 0; i < SOFT; i++)
        for (let j = 0; j < SOFT; j++) {
          sum = sum.add(
            texture(
              target.texture,
              uv.add(vec2(i - (SOFT - 1) / 2, j - (SOFT - 1) / 2).div(SIZE))
            ).w
          );
        }
      return sum.mul(fade).div(SOFT * SOFT);
    },
    height: (p: Vec3Node): FloatNode => {
      const { uv, fade } = place(p);
      return texture(target.texture, uv).level(float(0)).y.mul(fade);
    },
    draw,
    update(env: Environment, ships: readonly Afloat[]): Draw | null {
      const eye = view.eye,
        now = env.clock;
      chart.at = eye.frame.up;
      chart.axis = eye.frame.east;
      rough.value = clamp((env.windSpeed - ROUGHEST / 4) / (ROUGHEST * 0.75));
      let vertex = 0,
        triangle = 0,
        near = 0;
      for (let i = 0; i < ships.length; i++) {
        const { pose, velocity, look } = ships[i],
          pos = pose.position,
          fwd = pose.forward,
          up = pose.up;
        const speed = sphere.length(velocity);
        const bx = pos[0] + fwd[0] * WATERLINE.stem,
          by = pos[1] + fwd[1] * WATERLINE.stem,
          bz = pos[2] + fwd[2] * WATERLINE.stem;
        const bl = 1 / Math.hypot(bx, by, bz),
          stem = bow;
        sphere.put(stem, bx * bl, by * bl, bz * bl);
        const last = stems[i],
          wake = (wakes[i] ??= []),
          on = lay(wake, stem, now, speed);
        sailed[i] =
          on && last ? (sailed[i] + sphere.distance(last, stem)) % 4096 : 0;
        if (last) sphere.put(last, stem[0], stem[1], stem[2]);
        else stems[i] = [stem[0], stem[1], stem[2]];
        if (sphere.distance(stem, eye.frame.up) > REACH * 1.5 + WAKE.most * 3)
          continue;
        head.at = stem;
        head.time = now;
        head.speed = speed;
        route.kept = wakes[i];
        route.skip =
          route.kept.length > 0 &&
          sphere.distance(route.kept[0].at, stem) <= 0.05
            ? 1
            : 0;
        const took = ribbon(chart, route, now, sailed[i], vertex);
        for (let k = 0; k + 1 < took / 2; k++) {
          const a = vertex + 2 * k,
            t = triangle * 3;
          ((trailIndex[t] = a),
            (trailIndex[t + 1] = a + 1),
            (trailIndex[t + 2] = a + 2));
          ((trailIndex[t + 3] = a + 1),
            (trailIndex[t + 4] = a + 3),
            (trailIndex[t + 5] = a + 2));
          triangle += 2;
        }
        vertex += took;
        const wide = WATERLINE.beam / 2 + PATCH.out,
          pace = Math.min(speed / FULL, 1);
        const px = up[1] * fwd[2] - up[2] * fwd[1],
          py = up[2] * fwd[0] - up[0] * fwd[2],
          pz = up[0] * fwd[1] - up[1] * fwd[0];
        for (let k = 0; k < 4; k++) {
          const x = k === 1 || k === 2 ? wide : -wide,
            z =
              k < 2
                ? WATERLINE.stern - PATCH.astern
                : WATERLINE.stem + PATCH.ahead;
          sphere.chartAt(
            chart,
            pos[0] + px * x + fwd[0] * z,
            pos[1] + py * x + fwd[1] * z,
            pos[2] + pz * x + fwd[2] * z,
            onChart
          );
          const corner = near * 4 + k;
          patch[corner * 2] = onChart[0];
          patch[corner * 2 + 1] = onChart[1];
          patchM[corner * 4] = x;
          patchM[corner * 4 + 1] = z;
          patchM[corner * 4 + 2] = pace;
          patchM[corner * 4 + 3] = 0;
        }
        const o = near * 12;
        ((shadowPoses[o] = pos[0]),
          (shadowPoses[o + 1] = pos[1]),
          (shadowPoses[o + 2] = pos[2]),
          (shadowPoses[o + 3] = look.brace));
        ((shadowPoses[o + 4] = fwd[0]),
          (shadowPoses[o + 5] = fwd[1]),
          (shadowPoses[o + 6] = fwd[2]),
          (shadowPoses[o + 7] = 0));
        ((shadowPoses[o + 8] = up[0]),
          (shadowPoses[o + 9] = up[1]),
          (shadowPoses[o + 10] = up[2]),
          (shadowPoses[o + 11] = 0));
        near++;
      }
      trailGeometry.setDrawRange(0, triangle * 3);
      trails.count = triangle > 0 ? 1 : 0;
      patchGeometry.setDrawRange(0, near * 6);
      patches.count = near > 0 ? 1 : 0;
      shadowGeometry.instanceCount = near;
      sent(trailAt.attribute, vertex);
      sent(trailMark.attribute, vertex);
      sent(trailLaid.attribute, vertex);
      sent(trailIndexAttribute, triangle * 3);
      sent(patchAt.attribute, near * 4);
      sent(patchMark.attribute, near * 4);
      sent(poses, near);
      live.value = near > 0 ? 1 : 0;
      return near > 0 ? draw : null;
    },
  };
}

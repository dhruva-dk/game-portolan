import { Matrix4, NearestFilter, StorageTexture, Vector3 } from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  clamp,
  float,
  floor,
  fract,
  instanceIndex,
  int,
  interleavedGradientNoise,
  ivec2,
  max,
  min,
  mix,
  normalize,
  select,
  smoothstep,
  texture,
  textureLoad,
  textureStore,
  uniform,
  uvec2,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { storageTable, type Compute } from '../gpu.ts';
import type { View } from '../view/view.ts';
import { createCloudNoise } from './cloud-noise.ts';
import {
  BASE,
  DIFFUSION,
  SIGMA,
  TOP,
  createCloudField,
  type CloudField,
} from './cloud-field.ts';
import type { Tables } from './tables.ts';
import {
  clampInts,
  loop,
  type FloatNode,
  type Vec2Node,
  type Vec3Node,
  type Vec4Node,
} from '../tsl.ts';

const MAX_STEPS = 64;
const BLEND = 0.25;
const LATTICE = [
  [0, 0],
  [1, 1],
  [1, 0],
  [0, 1],
];

function catmullRom(
  tex: StorageTexture,
  uv: Vec2Node,
  size: Vec2Node
): Vec4Node {
  const s = uv.mul(size);
  const t1 = floor(s.sub(0.5)).add(0.5);
  const f = s.sub(t1);
  const w0 = f.mul(f.mul(f.mul(-0.5).add(1)).sub(0.5));
  const w1 = f.mul(f).mul(f.mul(1.5).sub(2.5)).add(1);
  const w2 = f.mul(f.mul(f.mul(-1.5).add(2)).add(0.5));
  const w3 = f.mul(f).mul(f.mul(0.5).sub(0.5));
  const w12 = w1.add(w2);
  const t0 = t1.sub(1).div(size),
    t3 = t1.add(2).div(size),
    t12 = t1.add(w2.div(w12)).div(size);
  const at = (x: FloatNode, y: FloatNode) =>
    texture(tex).sample(vec2(x, y)).level(float(0));
  const sum = at(t12.x, t0.y)
    .mul(w12.x.mul(w0.y))
    .add(at(t0.x, t12.y).mul(w0.x.mul(w12.y)))
    .add(at(t12.x, t12.y).mul(w12.x.mul(w12.y)))
    .add(at(t3.x, t12.y).mul(w3.x.mul(w12.y)))
    .add(at(t12.x, t3.y).mul(w12.x.mul(w3.y)));
  const weight = w12.x
    .mul(w0.y)
    .add(w0.x.mul(w12.y))
    .add(w12.x.mul(w12.y))
    .add(w3.x.mul(w12.y))
    .add(w12.x.mul(w3.y));
  return sum.div(weight);
}

function cameraInputs() {
  return {
    projectionInverse: uniform(new Matrix4()),
    cameraWorld: uniform(new Matrix4()),
    previousViewProjection: uniform(new Matrix4()),
    previousFrame: {
      east: uniform(new Vector3(1, 0, 0)),
      up: uniform(new Vector3(0, 1, 0)),
      south: uniform(new Vector3(0, 0, 1)),
      dip: uniform(0),
    },
    shift: uniform(new Vector3()),
    frameIndex: uniform(0, 'uint'),
  };
}

function createPasses(
  width: number,
  height: number,
  view: View,
  field: CloudField,
  cam: ReturnType<typeof cameraInputs>
) {
  const rayAt = (uv: Vec2Node): Vec3Node => {
    const ndc = vec4(uv.x.mul(2).sub(1), float(1).sub(uv.y.mul(2)), 1, 1);
    const camera = cam.projectionInverse.mul(ndc);
    return view.toSky(
      cam.cameraWorld.mul(vec4(camera.xyz.div(camera.w), 0)).xyz
    );
  };

  const HW = Math.max(1, Math.ceil(width / 2)),
    HH = Math.max(1, Math.ceil(height / 2));
  const MW = Math.ceil(HW / 2),
    MH = Math.ceil(HH / 2);
  const nearest = { filter: NearestFilter };
  const marched = storageTable(MW, MH, nearest);
  const marchedDistance = storageTable(MW, MH, nearest);
  const history = [storageTable(HW, HH), storageTable(HW, HH)];
  const historyDistance = [
    storageTable(HW, HH, nearest),
    storageTable(HW, HH, nearest),
  ];
  const cell = uniform(new Vector3());

  const marchKernel = Fn(() => {
    const x = instanceIndex.mod(MW),
      y = instanceIndex.div(MW);
    const px = vec2(x, y).mul(2).add(cell.xy);
    const f = float(cam.frameIndex.div(4).mod(4096));
    const d = rayAt(
      px
        .add(fract(vec2(f.mul(0.7548777), f.mul(0.5698403)).add(0.5)))
        .div(vec2(HW, HH))
    );
    const distance = float(0).toVar();
    const start = fract(
      interleavedGradientNoise(px).add(float(cam.frameIndex).mul(0.618034))
    );
    const result = field.march(d, MAX_STEPS, start, distance, true);
    textureStore(marched, uvec2(x, y), result);
    textureStore(marchedDistance, uvec2(x, y), vec4(distance, 0, 0, 1));
  })().compute(MW * MH, [64]);

  const spread = (p: Vec2Node): Vec4Node => {
    const q = p.sub(cell.xy).mul(0.5),
      base = floor(q),
      t = q.sub(base),
      b = ivec2(base);
    const at = (i: number, j: number) =>
      textureLoad(
        marched,
        clampInts(b.add(ivec2(i, j)), ivec2(0, 0), ivec2(MW - 1, MH - 1))
      );
    return mix(mix(at(0, 0), at(1, 0), t.x), mix(at(0, 1), at(1, 1), t.x), t.y);
  };

  const resolveKernels = [0, 1].map((write) => {
    const read = 1 - write;
    return Fn(() => {
      const x = instanceIndex.mod(HW),
        y = instanceIndex.div(HW);
      const m = ivec2(int(x).div(2), int(y).div(2));
      const fresh = int(x)
        .mod(2)
        .equal(int(cell.x))
        .and(int(y).mod(2).equal(int(cell.y)));
      const current = textureLoad(marched, m).toVar();
      const out = spread(vec2(x, y)).toVar();
      const outDistance = textureLoad(marchedDistance, m).x.toVar();
      const uv = vec2(x, y).add(0.5).div(vec2(HW, HH));
      const then = rayAt(uv).mul(outDistance).add(cam.shift);
      const clip = cam.previousViewProjection.mul(
        vec4(view.fromSky(normalize(then), cam.previousFrame), 0)
      );
      const prev = vec2(
        clip.x.div(clip.w).mul(0.5).add(0.5),
        float(0.5).sub(clip.y.div(clip.w).mul(0.5))
      );
      const onScreen = prev.x
        .greaterThanEqual(0)
        .and(prev.x.lessThanEqual(1))
        .and(prev.y.greaterThanEqual(0))
        .and(prev.y.lessThanEqual(1))
        .and(clip.w.greaterThan(0));
      If(onScreen, () => {
        const old = catmullRom(history[read], prev, vec2(HW, HH));
        const lo = vec4(1e4).toVar(),
          hi = vec4(-1e4).toVar();
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) {
            const s = textureLoad(
              marched,
              clampInts(m.add(ivec2(i, j)), ivec2(0, 0), ivec2(MW - 1, MH - 1))
            );
            lo.assign(min(lo, s));
            hi.assign(max(hi, s));
          }
        const margin = hi.sub(lo).mul(0.1);
        const held = clamp(old, lo.sub(margin), hi.add(margin));
        out.assign(select(fresh, mix(held, current, BLEND), held));
      });
      textureStore(history[write], uvec2(x, y), out);
      textureStore(
        historyDistance[write],
        uvec2(x, y),
        vec4(outDistance, 0, 0, 1)
      );
    })().compute(HW * HH, [64]);
  });

  return {
    history,
    historyDistance,
    cell,
    marchKernel,
    resolveKernels,
    dispose() {
      for (const t of [
        marched,
        marchedDistance,
        ...history,
        ...historyDistance,
      ])
        t.dispose();
      for (const k of [marchKernel, ...resolveKernels]) k.dispose();
    },
  };
}

const SHADOW_EXTENT = 8;
const SHADOW_N = 256;
const SHADOW_STEPS = 12;

function createShadow(view: View, field: CloudField) {
  const { eye, sunDir } = field.inputs;
  const map = storageTable(SHADOW_N, SHADOW_N);
  const centre = uniform(new Vector3());

  const kernel = Fn(() => {
    const x = instanceIndex.mod(SHADOW_N),
      y = instanceIndex.div(SHADOW_N);
    const ground = vec2(x, y)
      .add(0.5)
      .div(SHADOW_N)
      .sub(0.5)
      .mul(SHADOW_EXTENT);
    const sea = vec3(
      ground.x.add(centre.x).sub(eye.x),
      eye.y.negate(),
      ground.y.add(centre.z).sub(eye.z)
    );
    const up = max(sunDir.y, 0.05);
    const t0 = float(BASE).div(up),
      t1 = float(TOP).div(up);
    const dt = t1.sub(t0).div(SHADOW_STEPS);
    const tau = float(0).toVar();
    loop('ss', SHADOW_STEPS, (i) => {
      tau.addAssign(
        field
          .density(sea.add(sunDir.mul(t0.add(float(i).add(0.5).mul(dt)))))
          .mul(SIGMA)
          .mul(dt)
      );
    });
    textureStore(
      map,
      uvec2(x, y),
      vec4(float(1).div(tau.mul(DIFFUSION).add(1)), 0, 0, 1)
    );
  })().compute(SHADOW_N * SHADOW_N, [64]);

  return {
    kernel,
    centre,
    at: (p: Vec3Node): FloatNode => {
      const uv = view
        .local(p)
        .mul(0.001)
        .add(eye.xz)
        .sub(centre.xz)
        .div(SHADOW_EXTENT)
        .add(0.5);
      const edge = smoothstep(
        0.5,
        0.4,
        max(abs(uv.x.sub(0.5)), abs(uv.y.sub(0.5)))
      );
      return mix(float(1), texture(map).sample(uv).level(float(0)).r, edge);
    },
  };
}

export interface CloudInputs {
  coverage: number;
  wind: { x: number; y: number };
  sunDirection: Vector3;
}

export function createClouds(view: View, tables: Tables) {
  const noise = createCloudNoise();
  const field = createCloudField(tables, noise);
  const { coverage, drift, sunDir, eye } = field.inputs;
  const cam = cameraInputs();
  const shadow = createShadow(view, field);

  let passes = createPasses(1, 1, view, field, cam);
  let wide = 0,
    high = 0;
  let frame = 0;
  let last: readonly number[] | null = null;
  const seen = {
    viewProjection: new Matrix4(),
    east: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    south: new Vector3(0, 0, 1),
    dip: 0,
  };
  const due: Compute[] = [];
  const historyTexture = texture(passes.history[0]);
  const historyDistanceTexture = texture(passes.historyDistance[0]);

  return {
    at(uv: Vec2Node): { color: Vec4Node; metres: FloatNode } {
      return {
        color: historyTexture.sample(uv),
        metres: historyDistanceTexture.sample(uv).x.mul(1000),
      };
    },
    shadow: shadow.at,
    along: field.along,
    bake: noise.bake,
    shape: noise.shape,

    update(
      inputs: CloudInputs,
      dt: number,
      width: number,
      height: number
    ): readonly Compute[] {
      if (width !== wide || height !== high) {
        wide = width;
        high = height;
        passes.dispose();
        passes = createPasses(width, height, view, field, cam);
        frame = 0;
      }
      coverage.set(inputs.coverage);
      const carryX = (inputs.wind.x * dt) / 1000,
        carryZ = (inputs.wind.y * dt) / 1000;
      drift.value.x += carryX;
      drift.value.z += carryZ;
      drift.value.y += dt * 0.002;
      sunDir.value.copy(inputs.sunDirection);
      const { position, frame: f, height: h } = view.eye;
      let stepX = 0,
        stepZ = 0;
      if (last) {
        const sx = position[0] - last[0],
          sy = position[1] - last[1],
          sz = position[2] - last[2];
        stepX = (sx * f.east[0] + sy * f.east[1] + sz * f.east[2]) / 1000;
        stepZ = -(sx * f.north[0] + sy * f.north[1] + sz * f.north[2]) / 1000;
      }
      eye.value.x += stepX;
      eye.value.z += stepZ;
      const climb = h / 1000 - eye.value.y;
      eye.value.y = h / 1000;
      last = position;
      cam.shift.value.set(stepX - carryX, climb, stepZ - carryZ);
      cam.projectionInverse.value.copy(view.eye.projectionInverse);
      cam.cameraWorld.value.copy(view.eye.world);
      cam.frameIndex.value = frame;
      const then = cam.previousFrame;
      cam.previousViewProjection.value.copy(seen.viewProjection);
      then.east.value.copy(seen.east);
      then.up.value.copy(seen.up);
      then.south.value.copy(seen.south);
      then.dip.value = seen.dip;
      seen.viewProjection.copy(view.eye.viewProjection);
      seen.east.set(f.east[0], f.east[1], f.east[2]);
      seen.up.set(f.up[0], f.up[1], f.up[2]);
      seen.south.set(-f.north[0], -f.north[1], -f.north[2]);
      seen.dip = view.eye.dip;

      const [cx, cy] = LATTICE[frame % 4];
      passes.cell.value.set(cx, cy, 0);
      const write = frame % 2;
      due.length = 0;
      due.push(passes.marchKernel, passes.resolveKernels[write]);
      historyTexture.value = passes.history[write];
      historyDistanceTexture.value = passes.historyDistance[write];

      if (frame % 4 === 0) {
        shadow.centre.value.set(
          Math.round(eye.value.x),
          0,
          Math.round(eye.value.z)
        );
        due.push(shadow.kernel);
      }
      frame++;
      return due;
    },
  };
}

// The clouds on screen and on the sea: the cloud field (cloud-field.ts) marched a fraction of the pixels each frame
// and accumulated over frames, and a map of their shadow.
//
// Each frame marches a quarter-resolution grid, each texel taking one of the 2×2 half-resolution pixels it covers in
// turn; a resolve pass at half resolution keeps the rest from earlier frames, moved to where the camera now sees them
// (reprojected by the cloud's distance, the eye's step and the wind's carry, read with a Catmull-Rom filter so
// moving doesn't blur them) and held to the new samples' range. After four frames every half-resolution pixel is
// fresh.

import {
  ClampToEdgeWrapping, HalfFloatType, LinearFilter, Matrix4, NearestFilter, StorageTexture, Vector3,
  type PerspectiveCamera, type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn, If, Loop, abs, clamp, dot, exp, float, floor, fract, instanceIndex, int, ivec2, max, min, mix, normalize, select,
  smoothstep, texture, textureLoad, textureStore, uniform, uvec2, vec2, vec3, vec4,
} from 'three/tsl';
import type { View } from '../view/view';
import { bakeCloudNoise } from './cloud-noise';
import { BASE, SIGMA, TOP, createCloudField, type CloudField } from './cloud-field';

type N = any;

const loop = (name: string, count: number, body: (i: N) => void) =>
  (Loop as N)({ start: 0, end: count, type: 'int', condition: '<', name }, (v: N) => body(v[name]));

function target(w: number, h: number, filter: typeof LinearFilter | typeof NearestFilter = LinearFilter): StorageTexture {
  const t = new StorageTexture(w, h);
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = filter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

/** Most steps a screen ray takes (a grazing one; one looking up needs about 30). */
const MAX_STEPS = 64;
/** How much of a fresh sample goes into the history. */
const BLEND = 0.25;
/** The 2×2 cell each frame takes, in an order that spreads them. */
const LATTICE = [[0, 0], [1, 1], [1, 0], [0, 1]];

/** Interleaved gradient noise (Jimenez 2014), for the march's start. */
const ign = (p: N): N => fract(float(52.9829189).mul(fract(dot(p, vec2(0.06711056, 0.00583715)))));

/** A texture read at uv with a Catmull-Rom filter, from five bilinear reads (Jimenez 2016); size in texels. */
function catmullRom(tex: N, uv: N, size: N): N {
  const s: N = uv.mul(size);
  const t1: N = floor(s.sub(0.5)).add(0.5);
  const f: N = s.sub(t1);
  const w0: N = f.mul(f.mul(f.mul(-0.5).add(1)).sub(0.5));
  const w1: N = f.mul(f).mul(f.mul(1.5).sub(2.5)).add(1);
  const w2: N = f.mul(f.mul(f.mul(-1.5).add(2)).add(0.5));
  const w3: N = f.mul(f).mul(f.mul(0.5).sub(0.5));
  const w12: N = w1.add(w2);
  const t0 = t1.sub(1).div(size), t3 = t1.add(2).div(size), t12 = t1.add(w2.div(w12)).div(size);
  const at = (x: N, y: N) => texture(tex).sample(vec2(x, y)).level(float(0));
  const sum = at(t12.x, t0.y).mul(w12.x.mul(w0.y))
    .add(at(t0.x, t12.y).mul(w0.x.mul(w12.y)))
    .add(at(t12.x, t12.y).mul(w12.x.mul(w12.y)))
    .add(at(t3.x, t12.y).mul(w3.x.mul(w12.y)))
    .add(at(t12.x, t3.y).mul(w12.x.mul(w3.y)));
  const weight = w12.x.mul(w0.y).add(w0.x.mul(w12.y)).add(w12.x.mul(w12.y)).add(w3.x.mul(w12.y)).add(w12.x.mul(w3.y));
  return sum.div(weight);
}

/** Per-frame camera inputs the passes share. */
function cameraInputs() {
  return {
    projectionInverse: uniform(new Matrix4()),
    cameraWorld: uniform(new Matrix4()),
    previousViewProjection: uniform(new Matrix4()),
    /** The eye's frame and its horizon's dip last frame, for finding where a cloud was seen then. */
    previousFrame: {
      east: uniform(new Vector3(1, 0, 0)), up: uniform(new Vector3(0, 1, 0)), south: uniform(new Vector3(0, 0, 1)), dip: uniform(0),
    },
    /** Where a cloud now at q (km from the eye) was last frame, from the eye then: q + shift. */
    shift: uniform(new Vector3()),
    frameIndex: uniform(0, 'uint'),
  };
}

function createPasses(width: number, height: number, view: View, field: CloudField, cam: ReturnType<typeof cameraInputs>) {
  /** The sky's direction through the screen at uv. */
  const rayAt = (uv: N): N => {
    const ndc = vec4(uv.x.mul(2).sub(1), float(1).sub(uv.y.mul(2)), 1, 1);
    const camera = cam.projectionInverse.mul(ndc);
    return view.toSky(cam.cameraWorld.mul(vec4(camera.xyz.div(camera.w), 0)).xyz);
  };

  const HW = Math.max(1, Math.ceil(width / 2)), HH = Math.max(1, Math.ceil(height / 2));
  const MW = Math.ceil(HW / 2), MH = Math.ceil(HH / 2);
  const marched = target(MW, MH, NearestFilter);
  const marchedDistance = target(MW, MH, NearestFilter);
  const history = [target(HW, HH), target(HW, HH)];
  const historyDistance = [target(HW, HH, NearestFilter), target(HW, HH, NearestFilter)];
  const cell = uniform(new Vector3());

  const marchKernel = Fn(() => {
    const x = instanceIndex.mod(MW), y = instanceIndex.div(MW);
    const px = vec2(x, y).mul(2).add(cell.xy);
    const d = rayAt(px.add(0.5).div(vec2(HW, HH)));
    const distance = float(0).toVar();
    const result = field.march(d, MAX_STEPS, fract(ign(px).add(float(cam.frameIndex).mul(0.618034))), distance, true);
    textureStore(marched, uvec2(x, y), result);
    textureStore(marchedDistance, uvec2(x, y), vec4(distance, 0, 0, 1));
  })().compute(MW * MH, [64]);

  // two resolves, one per direction of the history ping-pong
  const resolveKernels = [0, 1].map((write) => {
    const read = 1 - write;
    return Fn(() => {
      const x = instanceIndex.mod(HW), y = instanceIndex.div(HW);
      const m = ivec2(int(x).div(2), int(y).div(2));
      const fresh = int(x).mod(2).equal(int(cell.x)).and(int(y).mod(2).equal(int(cell.y)));
      const current = textureLoad(marched, m).toVar();
      const out = current.toVar();
      const outDistance = textureLoad(marchedDistance, m).x.toVar();
      // where this pixel's cloud was last frame, found by its distance now: seen from where the eye was over the
      // map then, the wind's carry undone, and turned from that frame's sky back into the world, where last frame's
      // camera saw it
      const uv = vec2(x, y).add(0.5).div(vec2(HW, HH));
      const then = rayAt(uv).mul(outDistance).add(cam.shift);
      const clip = cam.previousViewProjection.mul(vec4(view.fromSky(normalize(then), cam.previousFrame), 0));
      const prev = vec2(clip.x.div(clip.w).mul(0.5).add(0.5), float(0.5).sub(clip.y.div(clip.w).mul(0.5)));
      const onScreen = prev.x.greaterThanEqual(0).and(prev.x.lessThanEqual(1))
        .and(prev.y.greaterThanEqual(0)).and(prev.y.lessThanEqual(1)).and(clip.w.greaterThan(0));
      If(onScreen, () => {
        const old = catmullRom(history[read], prev, vec2(HW, HH));
        // the history is held to the range of this frame's samples round it (a little widened, since the samples
        // themselves are noisy), which rejects cloud that has moved or changed without pulling settled cloud about
        const lo = vec4(1e4).toVar(), hi = vec4(-1e4).toVar();
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const s = textureLoad(marched, (clamp as N)(m.add(ivec2(i, j)), ivec2(0, 0), ivec2(MW - 1, MH - 1)));
          lo.assign(min(lo, s));
          hi.assign(max(hi, s));
        }
        const margin = hi.sub(lo).mul(0.1);
        const held = clamp(old, lo.sub(margin), hi.add(margin));
        // a fresh sample is blended in, so its noise averages away over visits; the others keep the history
        out.assign(select(fresh, mix(held, current, BLEND), held));
      });
      textureStore(history[write], uvec2(x, y), out);
      textureStore(historyDistance[write], uvec2(x, y), vec4(outDistance, 0, 0, 1));
    })().compute(HW * HH, [64]);
  });

  return { history, historyDistance, cell, marchKernel, resolveKernels };
}

// ------------------------------------------------------------------ cloud shadows

/** The shadow map covers this many km round the eye. */
const SHADOW_EXTENT = 8;
const SHADOW_N = 256;
const SHADOW_STEPS = 12;

function createShadow(view: View, field: CloudField) {
  const { eye, sunDir } = field.inputs;
  const map = target(SHADOW_N, SHADOW_N);
  /** Where the shadow map was centred when last drawn, km. */
  const centre = uniform(new Vector3());

  const kernel = Fn(() => {
    const x = instanceIndex.mod(SHADOW_N), y = instanceIndex.div(SHADOW_N);
    const ground = vec2(x, y).add(0.5).div(SHADOW_N).sub(0.5).mul(SHADOW_EXTENT);
    // from the sea point up toward the sun, through the shell; positions relative to the eye
    const sea = vec3(ground.x.add(centre.x).sub(eye.x), eye.y.negate(), ground.y.add(centre.z).sub(eye.z));
    const up = max(sunDir.y, 0.05);
    const t0 = float(BASE).div(up), t1 = float(TOP).div(up);
    const dt = t1.sub(t0).div(SHADOW_STEPS);
    const tau = float(0).toVar();
    loop('ss', SHADOW_STEPS, (i) => {
      // the eroded shape, as the eye sees it: the uneroded one is far fatter, and its shadow covers the sea
      tau.addAssign(field.density(sea.add(sunDir.mul(t0.add(float(i).add(0.5).mul(dt))))).mul(SIGMA).mul(dt));
    });
    // a soft floor: thick cloud still lets some light round it
    textureStore(map, uvec2(x, y), vec4(mix(0.15, 1, exp(tau.negate())), 0, 0, 1));
  })().compute(SHADOW_N * SHADOW_N, [64]);

  return {
    kernel,
    centre,
    /** Fraction of the sun's light the clouds let through to world position p (metres), read where p lies on the eye's chart. */
    at: (p: N): N => {
      const uv = view.local(p).mul(0.001).add(eye.xz).sub(centre.xz).div(SHADOW_EXTENT).add(0.5);
      const edge = smoothstep(0.5, 0.4, max(abs(uv.x.sub(0.5)), abs(uv.y.sub(0.5))));
      return mix(float(1), texture(map).sample(uv).level(float(0)).r, edge);
    },
  };
}

// ------------------------------------------------------------------ the system

export interface CloudInputs {
  coverage: number;
  /** m/s, east (x) and south (y). */
  wind: { x: number; y: number };
  /** Toward the sun, as the eye's sky shows it (view.toSky). */
  sunDirection: Vector3;
}

export function createClouds(renderer: WebGPURenderer, view: View) {
  bakeCloudNoise(renderer);
  const field = createCloudField();
  const { coverage, drift, sunDir, eye } = field.inputs;
  const cam = cameraInputs();
  const shadow = createShadow(view, field);

  let passes = createPasses(1, 1, view, field, cam);
  let size = [0, 0];
  let frame = 0;
  let last: readonly number[] | null = null;
  const viewProjection = new Matrix4();
  const historyTexture = texture(passes.history[0]);
  const historyDistanceTexture = texture(passes.historyDistance[0]);

  return {
    /** The clouds' light (rgb) and what survives behind them (a), at half resolution, for the composite. */
    color: historyTexture,
    /** Distance to the clouds, km. */
    distance: historyDistanceTexture,
    shadow: shadow.at,
    /** The clouds along a sky direction, coarser, for the reflection. */
    along: field.along,

    update(inputs: CloudInputs, camera: PerspectiveCamera, dt: number, width: number, height: number) {
      if (width !== size[0] || height !== size[1]) {
        size = [width, height];
        passes = createPasses(width, height, view, field, cam);
        frame = 0;
      }
      coverage.set(inputs.coverage);
      const carry = [(inputs.wind.x * dt) / 1000, (inputs.wind.y * dt) / 1000];
      drift.value.x += carry[0];
      drift.value.z += carry[1];
      drift.value.y += dt * 0.002; // the billows slowly turn over
      sunDir.value.copy(inputs.sunDirection);
      // the eye slides over the map as it moves over the planet, by its step along its own east and south
      const { position, frame: f, height: h } = view.eye;
      const step = [0, 0];
      if (last) {
        const s = [position[0] - last[0], position[1] - last[1], position[2] - last[2]];
        step[0] = (s[0] * f.east[0] + s[1] * f.east[1] + s[2] * f.east[2]) / 1000;
        step[1] = -(s[0] * f.north[0] + s[1] * f.north[1] + s[2] * f.north[2]) / 1000;
      }
      eye.value.x += step[0];
      eye.value.z += step[1];
      const climb = h / 1000 - eye.value.y;
      eye.value.y = h / 1000;
      last = position;
      // a cloud at q now was at q + step − carry from where the eye was then
      cam.shift.value.set(step[0] - carry[0], climb, step[1] - carry[1]);
      cam.projectionInverse.value.copy(camera.projectionMatrixInverse);
      cam.cameraWorld.value.copy(camera.matrixWorld);
      cam.frameIndex.value = frame;

      const [cx, cy] = LATTICE[frame % 4];
      passes.cell.value.set(cx, cy, 0);
      renderer.compute(passes.marchKernel);
      const write = frame % 2;
      renderer.compute(passes.resolveKernels[write]);
      historyTexture.value = passes.history[write];
      historyDistanceTexture.value = passes.historyDistance[write];

      if (frame % 4 === 0) {
        shadow.centre.value.set(Math.round(eye.value.x), 0, Math.round(eye.value.z));
        renderer.compute(shadow.kernel);
      }

      cam.previousViewProjection.value.copy(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      cam.previousFrame.east.value.set(...f.east);
      cam.previousFrame.up.value.set(...f.up);
      cam.previousFrame.south.value.set(-f.north[0], -f.north[1], -f.north[2]);
      cam.previousFrame.dip.value = view.eye.dip;
      frame++;
    },
  };
}

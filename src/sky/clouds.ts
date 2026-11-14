// The clouds on screen and on the sea: the cloud field (cloud-field.ts) marched a fraction of the pixels each frame
// and accumulated over frames, and a map of their shadow.
//
// Each frame marches a quarter-resolution grid, each texel taking one of the 2×2 half-resolution pixels it covers in
// turn; a resolve pass at half resolution keeps the rest from earlier frames, moved to where the camera now sees them
// (reprojected by the cloud's distance, the eye's step and the wind's carry, read with a Catmull-Rom filter so
// moving doesn't blur them) and held to the new samples' range. After four frames every half-resolution pixel is
// fresh.

import {
  ClampToEdgeWrapping, HalfFloatType, LinearFilter, Matrix4, NearestFilter, StorageTexture, Vector2, Vector3,
} from 'three/webgpu';
import {
  Fn, If, abs, clamp, dot, float, floor, fract, instanceIndex, int, ivec2, max, min, mix, normalize, select,
  smoothstep, texture, textureLoad, textureStore, uniform, uvec2, vec2, vec3, vec4,
} from 'three/tsl';
import type { Compute } from '../gpu';
import type { View } from '../view/view';
import { createCloudNoise } from './cloud-noise';
import { BASE, DIFFUSION, SIGMA, TOP, createCloudField, type CloudField } from './cloud-field';
import type { Tables } from './tables';
import { clampInts, loop, type FloatNode, type Vec2Node, type Vec3Node, type Vec4Node } from '../tsl';

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
/** The clouds are read through a tent this many of their (half-resolution) texels each way. */
const TENT = 0.75;
/** The 2×2 cell each frame takes, in an order that spreads them. */
const LATTICE = [[0, 0], [1, 1], [1, 0], [0, 1]];

/** Interleaved gradient noise (Jimenez 2014), for the march's start. */
const ign = (p: Vec2Node): FloatNode => fract(float(52.9829189).mul(fract(dot(p, vec2(0.06711056, 0.00583715)))));

/** A texture read at uv with a Catmull-Rom filter, from five bilinear reads (Jimenez 2016); size in texels. */
function catmullRom(tex: StorageTexture, uv: Vec2Node, size: Vec2Node): Vec4Node {
  const s = uv.mul(size);
  const t1 = floor(s.sub(0.5)).add(0.5);
  const f = s.sub(t1);
  const w0 = f.mul(f.mul(f.mul(-0.5).add(1)).sub(0.5));
  const w1 = f.mul(f).mul(f.mul(1.5).sub(2.5)).add(1);
  const w2 = f.mul(f.mul(f.mul(-1.5).add(2)).add(0.5));
  const w3 = f.mul(f).mul(f.mul(0.5).sub(0.5));
  const w12 = w1.add(w2);
  const t0 = t1.sub(1).div(size), t3 = t1.add(2).div(size), t12 = t1.add(w2.div(w12)).div(size);
  const at = (x: FloatNode, y: FloatNode) => texture(tex).sample(vec2(x, y)).level(float(0));
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
  const rayAt = (uv: Vec2Node): Vec3Node => {
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
    // each visit's ray through its own point of the pixel (an R2 sequence), so the history gathers how much of the
    // pixel a cloud's edge covers, not one hard step a pixel wide
    const f = float(cam.frameIndex.div(4).mod(4096));
    const d = rayAt(px.add(fract(vec2(f.mul(0.7548777), f.mul(0.5698403)).add(0.5))).div(vec2(HW, HH)));
    const distance = float(0).toVar();
    const result = field.march(d, MAX_STEPS, fract(ign(px).add(float(cam.frameIndex).mul(0.618034))), distance, true);
    textureStore(marched, uvec2(x, y), result);
    textureStore(marchedDistance, uvec2(x, y), vec4(distance, 0, 0, 1));
  })().compute(MW * MH, [64]);

  /** This frame's march at the half-resolution pixel p, between the four samples round it (each taken near
   *  2m + cell + ½): for a pixel with no history, so a cloud just come into view is soft, not in blocks of four. */
  const spread = (p: Vec2Node): Vec4Node => {
    const q = p.sub(cell.xy).mul(0.5), base = floor(q), t = q.sub(base), b = ivec2(base);
    const at = (i: number, j: number) => textureLoad(marched, clampInts(b.add(ivec2(i, j)), ivec2(0, 0), ivec2(MW - 1, MH - 1)));
    return mix(mix(at(0, 0), at(1, 0), t.x), mix(at(0, 1), at(1, 1), t.x), t.y);
  };

  // two resolves, one per direction of the history ping-pong
  const resolveKernels = [0, 1].map((write) => {
    const read = 1 - write;
    return Fn(() => {
      const x = instanceIndex.mod(HW), y = instanceIndex.div(HW);
      const m = ivec2(int(x).div(2), int(y).div(2));
      const fresh = int(x).mod(2).equal(int(cell.x)).and(int(y).mod(2).equal(int(cell.y)));
      const current = textureLoad(marched, m).toVar();
      const out = spread(vec2(x, y)).toVar();
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
          const s = textureLoad(marched, clampInts(m.add(ivec2(i, j)), ivec2(0, 0), ivec2(MW - 1, MH - 1)));
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

  return {
    history, historyDistance, cell, marchKernel, resolveKernels,
    /** The history's size, texels. */
    size: [HW, HH] as const,
    /** Frees the textures and the kernels' pipelines (for a new size). */
    dispose() {
      for (const t of [marched, marchedDistance, ...history, ...historyDistance]) t.dispose();
      for (const k of [marchKernel, ...resolveKernels]) k.dispose();
    },
  };
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
      // the cloud as the eye sees it (eroded: the uneroded one is far fatter, and its shadow covers the sea)
      tau.addAssign(field.density(sea.add(sunDir.mul(t0.add(float(i).add(0.5).mul(dt))))).mul(SIGMA).mul(dt));
    });
    // the sun's light through the cloud, direct and diffused forward together (the two-stream slab's 1/(1 + ¾(1−g)τ)):
    // a fair-weather cumulus (τ 10–30) still lets a quarter to a half through, a thick one little
    textureStore(map, uvec2(x, y), vec4(float(1).div(tau.mul(DIFFUSION).add(1)), 0, 0, 1));
  })().compute(SHADOW_N * SHADOW_N, [64]);

  return {
    kernel,
    centre,
    /** Fraction of the sun's light the clouds let through to world position p (metres), read where p lies on the eye's chart. */
    at: (p: Vec3Node): FloatNode => {
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

/** tables: the air's (tables.ts), which light the clouds and the air in front of them. */
export function createClouds(view: View, tables: Tables) {
  const noise = createCloudNoise();
  const field = createCloudField(tables, noise);
  const { coverage, drift, sunDir, eye } = field.inputs;
  const cam = cameraInputs();
  const shadow = createShadow(view, field);

  let passes = createPasses(1, 1, view, field, cam);
  let size = [0, 0];
  let frame = 0;
  let last: readonly number[] | null = null;
  /** Where the camera looked from last frame, and the eye's frame then (the uniforms' own values before the first). */
  const seen = { viewProjection: new Matrix4(), east: [1, 0, 0], up: [0, 1, 0], south: [0, 0, 1], dip: 0 };
  const historyTexture = texture(passes.history[0]);
  const historyDistanceTexture = texture(passes.historyDistance[0]);
  /** One texel of the history, in uv. */
  const texel = uniform(new Vector2(1, 1));

  return {
    /**
     * The clouds seen through the screen at uv: their light (rgb) and what survives behind them (a); and metres to
     * them. Read through a tent TENT texels each way (four bilinear taps), so the march's grid left in a cloud's edge
     * is smoothed out, not stepped.
     */
    at(uv: Vec2Node): { color: Vec4Node; metres: FloatNode } {
      const t = texel.mul(TENT), s = vec2(t.x, t.y.negate());
      const color = historyTexture.sample(uv.add(t)).add(historyTexture.sample(uv.sub(t)))
        .add(historyTexture.sample(uv.add(s))).add(historyTexture.sample(uv.sub(s))).mul(0.25);
      return { color, metres: historyDistanceTexture.sample(uv).x.mul(1000) };
    },
    shadow: shadow.at,
    /** The clouds along a sky direction, coarser, for the reflection. */
    along: field.along,
    /** The passes that fill the clouds' patterns, to be run once before the first frame. */
    bake: noise.bake,
    /** Their Perlin-Worley volume (cloud-noise.ts), which the storm's cloud and rain are drawn from too. */
    shape: noise.shape,

    /** Readies this frame's march, and returns the passes due: the march, its resolve, and every fourth frame the
     * shadow map. */
    update(inputs: CloudInputs, dt: number, width: number, height: number) {
      if (width !== size[0] || height !== size[1]) {
        size = [width, height];
        // (three frees a texture's memory and a kernel's pipeline and bindings once it is disposed)
        passes.dispose();
        passes = createPasses(width, height, view, field, cam);
        texel.value.set(1 / passes.size[0], 1 / passes.size[1]);
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
      cam.projectionInverse.value.copy(view.eye.projectionInverse);
      cam.cameraWorld.value.copy(view.eye.world);
      cam.frameIndex.value = frame;
      // last frame's camera and eye, for the resolve to find where a cloud was seen then; and this frame's, for the next
      cam.previousViewProjection.value.copy(seen.viewProjection);
      cam.previousFrame.east.value.set(seen.east[0], seen.east[1], seen.east[2]);
      cam.previousFrame.up.value.set(seen.up[0], seen.up[1], seen.up[2]);
      cam.previousFrame.south.value.set(seen.south[0], seen.south[1], seen.south[2]);
      cam.previousFrame.dip.value = seen.dip;
      seen.viewProjection.copy(view.eye.viewProjection);
      seen.east = [...f.east];
      seen.up = [...f.up];
      seen.south = [-f.north[0], -f.north[1], -f.north[2]];
      seen.dip = view.eye.dip;

      const [cx, cy] = LATTICE[frame % 4];
      passes.cell.value.set(cx, cy, 0);
      const write = frame % 2;
      const due: Compute[] = [passes.marchKernel, passes.resolveKernels[write]];
      historyTexture.value = passes.history[write];
      historyDistanceTexture.value = passes.historyDistance[write];

      if (frame % 4 === 0) {
        shadow.centre.value.set(Math.round(eye.value.x), 0, Math.round(eye.value.z));
        due.push(shadow.kernel);
      }
      frame++;
      return due;
    },
  };
}

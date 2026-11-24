import {
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  type Texture,
} from 'three/webgpu';
import {
  Discard,
  Fn,
  If,
  abs,
  cameraPosition,
  cameraProjectionMatrix,
  cameraProjectionMatrixInverse,
  cameraViewMatrix,
  dFdx,
  dFdy,
  dot,
  float,
  getScreenPosition,
  getViewPosition,
  length,
  log2,
  luminance,
  max,
  min,
  mix,
  normalize,
  positionView,
  positionWorld,
  saturate,
  screenUV,
  select,
  smoothstep,
  sqrt,
  step,
  tanh,
  texture,
  varying,
  vec2,
  vec3,
  vec4,
  viewportDepthTexture,
  viewportSharedTexture,
} from 'three/tsl';
import type { Environment } from '../environment.ts';
import { LIGHTNING } from '../palette.ts';
import type { Snapshot } from '../snapshot.ts';
import type { Compute, Draw } from '../gpu.ts';
import type { Ground } from '../land/ground.ts';
import type { Sky } from '../sky/sky.ts';
import { createCharts } from '../view/charts.ts';
import type { View } from '../view/view.ts';
import {
  BANDS,
  BREAKER,
  CASCADES,
  FETCH,
  LONG,
  SIZE,
} from '../world/cascades.ts';
import { likeness } from '../world/spectrum.ts';
import { R } from '../world/sphere.ts';
import type { Wind } from '../world/wind.ts';
import type { FloatNode, Vec2Node, Vec3Node } from '../tsl.ts';
import { createCaustics } from './caustics.ts';
import { createClaims } from './claims.ts';
import { createFoam } from './foam.ts';
import { createHulls } from './hulls.ts';
import { N_WATER, createOptics } from './optics.ts';
import { createWake, type Afloat } from './wake.ts';
import { createWaves } from './waves.ts';

const SPOKES = 128;
const FIRST = 1;
const GROWTH = 1.05;
const FACING = 0.05;
const MAX_REFRACT_DEPTH = 20;
const LIKENESS_WINDS = [5, 10, 15, 20];
const GATHER = 0.8;
const STORM_ROUGH = 0.03,
  STORM_FOAM = 0.45,
  STORM_DARK = 0.3;
const FOOT = [6, 26] as const,
  EDGE_LINE = 0.3,
  EDGE_LIGHT = 1.6;
const WAKE_BOLD = 1.8;
const SMOOTHEST = 1e-4;
const RUNUP = 0.5,
  BACKWASH = 0.3,
  SWASH_FROM = 0.5;

export type SeaShows = 'water' | 'charts' | 'wake';

export function createWater(
  view: View,
  sky: Sky,
  ground: Ground,
  wind: Wind,
  ships: number,
  shows: SeaShows = 'water'
) {
  const waves = createWaves();
  const wake = createWake(view, sky, ships);
  const hulls = createHulls();
  const optics = createOptics(sky, view);
  const claims = createClaims(ships);
  const each = LIKENESS_WINDS.flatMap((wind) =>
    CASCADES.map((L, c) => likeness(SIZE, L, { wind, fetch: FETCH }, BANDS[c]))
  );
  const charts = createCharts(
    CASCADES[0],
    (x, z) => Math.max(...each.map((f) => Math.abs(f(x, z)))),
    wind
  );
  const material = new MeshBasicNodeMaterial();

  const grid = view.rings(FIRST, GROWTH, SPOKES);
  const cell = max(grid.arc.mul(GROWTH - 1), FIRST);

  const shallows = (p: Vec3Node) => {
    const depth = max(ground.height(p).negate(), 0);
    const hs = waves.amplitude.mul(2);
    return {
      long: saturate(min(hs, depth.mul(BREAKER)).div(hs)),
      short: saturate(depth.div(0.3)),
      breaking: saturate(
        hs
          .div(max(depth.mul(BREAKER), 0.01))
          .sub(1)
          .mul(0.4)
      ).mul(smoothstep(0, 0.05, depth)),
    };
  };
  const waveAt = (up: Vec3Node, cell: FloatNode) =>
    Fn(() => {
      const { long, short } = shallows(up);
      const moved = vec3(0).toVar(),
        swell = float(0).toVar();
      charts.each(up, (c) => {
        let d: Vec3Node = vec3(0),
          h: FloatNode = float(0);
        CASCADES.forEach((L, k) => {
          const lod = log2(max(cell.div(L / SIZE), 1));
          const r = texture(waves.displacement[k], c.q.div(L)).level(lod).xyz;
          d = d.add(r.mul(k < LONG ? long : short));
          h = h.add(r.y);
        });
        moved.addAssign(
          c.e1.mul(d.x).add(c.e2.mul(d.z)).add(up.mul(d.y)).mul(c.w)
        );
        swell.addAssign(h.mul(c.w));
      });
      return vec4(moved, swell);
    })();
  const wave = waveAt(grid.up, cell);
  const swash = mix(
    wave.w.mul(BACKWASH),
    wave.w.mul(RUNUP),
    step(0, wave.w)
  ).mul(smoothstep(-SWASH_FROM, 0, ground.height(grid.up)));
  material.positionNode = view
    .place(grid.up, 0)
    .add(wave.xyz)
    .add(grid.up.mul(wake.height(grid.up).add(swash)));

  const height = varying(dot(wave.xyz, grid.up).add(swash));
  const phase = varying(
    saturate(wave.w.div(waves.amplitude).mul(0.5).add(0.5))
  );
  const foamOn = createFoam(waves);
  const rest = varying(grid.up);
  const seaShader = () =>
    Fn(() => {
      const hull = hulls.at(positionWorld);
      If(hull.inside, () => {
        Discard();
      });
      const { long, short, breaking } = shallows(rest);
      const up = view.up(positionWorld);
      const scale = (c: number): FloatNode => (c < LONG ? long : short);
      const p = normalize(rest).mul(R);
      const dp: [Vec3Node, Vec3Node] = [dFdx(p), dFdy(p)];
      const footprint = max(length(dp[0]), length(dp[1]));
      const marks = wake.read(p);
      const held = claims.at(p, dp[0], dp[1]);
      const wakeFoam = marks.marks.x.mul(WAKE_BOLD),
        air = saturate(marks.marks.z);
      const thickness = ground.height(rest).negate().add(height);
      const surf = breaking.mul(smoothstep(0.4, 0.85, phase)).mul(0.7);

      const slope = marks.slope.toVar(),
        variance = float(0).toVar(),
        foam = float(0).toVar(),
        bubbles = float(0).toVar();
      const lean = float(0).toVar();
      charts.each(
        p,
        (c) => {
          const read = (t: Texture, k: FloatNode) =>
            texture(t, c.q.mul(k)).grad(c.dx.mul(k), c.dy.mul(k));
          let s2: Vec2Node = vec2(0),
            v: FloatNode = float(0),
            h: FloatNode = float(0);
          CASCADES.forEach((L, k) => {
            const s = read(waves.slopes[k], float(1 / L)),
              m = scale(k);
            s2 = s2.add(s.xy.mul(m));
            v = v.add(
              max(s.z.sub(s.x.mul(s.x)), 0)
                .add(max(s.w.sub(s.y.mul(s.y)), 0))
                .mul(m.mul(m))
            );
            if (k < LONG) {
              h = h.add(read(waves.displacement[k], float(1 / L)).y.mul(m));
            }
          });
          slope.addAssign(
            c.e1.mul(s2.x).add(c.e2.mul(s2.y)).mul(c.w).add(c.dw.mul(h))
          );
          variance.addAssign(v.mul(c.w.mul(c.w)));
          lean.addAssign(s2.x.mul(c.w));
          const froth = foamOn(c, surf.add(wakeFoam), thickness, footprint);
          foam.addAssign(froth.foam.mul(c.w.mul(c.w)));
          bubbles.addAssign(froth.air.mul(c.w.mul(c.w)));
        },
        dp
      );
      variance.addAssign(
        waves.ripples
          .mul(short)
          .mul(float(1).sub(tanh(lean.div(waves.steepness)).mul(GATHER)))
      );
      const storm = sky.storm(p),
        past = sky.stormEdge(p);
      variance.addAssign(storm.mul(STORM_ROUGH));
      const foot = smoothstep(-2, 2, past).mul(
        float(1).sub(smoothstep(FOOT[0], FOOT[1], past))
      );
      const stormFoam = mix(
        foam,
        max(foam, smoothstep(0.55, 1, phase)),
        storm.mul(STORM_FOAM)
      );
      foam.assign(
        max(stormFoam, foot.mul(smoothstep(0.2, 0.8, phase)).mul(0.8))
      );
      const edgeLine = float(1).sub(
        smoothstep(
          0,
          max(footprint, 0.05),
          abs(past).sub(max(float(EDGE_LINE), footprint.mul(0.75)))
        )
      );
      const v = normalize(cameraPosition.sub(positionWorld));
      const tilted = normalize(up.sub(slope));
      const n = normalize(
        tilted.add(v.mul(max(float(FACING).sub(dot(tilted, v)), 0)))
      );
      const crest = saturate(height.div(waves.amplitude));

      const ray = v.negate().refract(n, 1 / N_WATER);
      const down = min(max(ground.height(rest).negate(), 0), MAX_REFRACT_DEPTH);
      const end = positionWorld.add(
        ray.mul(down.div(max(dot(ray, up).negate(), 0.2)))
      );
      const landed = getScreenPosition(
        cameraViewMatrix.mul(vec4(end, 1)).xyz,
        cameraProjectionMatrix
      );
      const off = landed.sub(screenUV);
      const room = mix(screenUV, vec2(1).sub(screenUV), step(0, off));
      const shifted = screenUV.add(
        off.mul(min(room.div(max(off.abs().mul(2), 1e-6)), 1))
      );
      const behindAt = (uv: Vec2Node) =>
        getViewPosition(
          uv,
          viewportDepthTexture(uv).x,
          cameraProjectionMatrixInverse
        );
      const inFront = behindAt(shifted).z.greaterThan(positionView.z);
      const uv = select(inFront, screenUV, shifted);
      const depthBehind = viewportDepthTexture(uv).x;
      const path = select(
        depthBehind.greaterThanEqual(1),
        float(1e4),
        length(behindAt(uv).sub(positionView))
      );
      const behind = viewportSharedTexture(uv).rgb;

      const near = {
        lit: float(1).sub(wake.shade(positionWorld)),
        glow: hull.glow,
        air: max(max(air, bubbles), held.drain.mul(0.6)),
      };
      const alpha = sqrt(
        max(variance.mul(float(1).sub(air.mul(0.6))), SMOOTHEST)
      );
      const depth = max(ground.height(rest).negate(), 0);
      const surface = {
        p: positionWorld,
        v,
        n,
        alpha,
        crest,
        foam,
        behind,
        path,
        depth,
      };
      const sea = optics
        .seaRadiance(surface, near, held)
        .mul(float(1).sub(storm.mul(STORM_DARK)));
      return mix(
        sea,
        vec3(...LIGHTNING)
          .mul(luminance(sky.open))
          .mul(EDGE_LIGHT),
        edgeLine
      );
    })();
  const chartsShader = () => Fn(() => charts.debug(rest).mul(0.1))();
  const wakeShader = () =>
    Fn(() => {
      const m = wake.read(normalize(rest).mul(R)).marks;
      return vec3(saturate(m.x), saturate(m.y.mul(2).add(0.5)), saturate(m.z))
        .mul(float(1).sub(wake.shade(positionWorld).mul(0.7)))
        .mul(0.1);
    })();
  material.colorNode =
    shows === 'charts'
      ? chartsShader()
      : shows === 'wake'
        ? wakeShader()
        : seaShader();

  material.transparent = true;
  material.side = DoubleSide;
  const mesh = new Mesh(grid.geometry, material);
  mesh.frustumCulled = false;

  const caustics = createCaustics(view, sky, waves, charts, shallows);

  return {
    mesh,
    anchors: charts.anchors,
    below: {
      sun: (p: Vec3Node): Vec3Node => optics.sunBelow(p),
      sky: (p: Vec3Node): Vec3Node => optics.skyBelow(p),
    },
    floor: {
      sun: (p: Vec3Node): Vec3Node => optics.sunBelow(p).mul(caustics(p)),
      sky: (p: Vec3Node): Vec3Node => optics.skyBelow(p),
    },
    marks: wake.draw,
    update(
      env: Environment,
      dt: number,
      ships: readonly Afloat[],
      drawn?: Pick<Snapshot, 'sea' | 'own' | 'ships' | 'clock'>
    ): { waves: Compute[]; wake: Draw | null } {
      const clock = drawn?.clock ?? env.clock;
      claims.update(drawn?.sea, clock, drawn?.own ?? null);
      const swell = waves.update(
        { wind: env.seaWind, fetch: FETCH },
        env.windSpeed,
        env.clock,
        dt
      );
      const marks = wake.update(env, ships);
      hulls.update(ships, view.eye.position);
      charts.update(view.eye.position, grid.update(waves.amplitude.value * 2));
      return { waves: swell, wake: marks };
    },
  };
}

// The sea: a grid of rings round the point under the eye, laid on the sphere (view.rings), moved by the waves
// (waves.ts) and shaded as water.
//
// The rings start a metre out and each lies 5% further than the last, with 128 spokes, so a cell is about as long as
// it is wide and covers about as much of the screen near as far; only those out to the horizon are drawn. The grid
// follows the eye; the waves stay put on the planet, read from the cascades' patches through the sea's charts
// (view/charts.ts): each point through its nearest anchor's chart, and near a cell's border through up to three,
// each read moved and tilted along its own chart's axes and summed with its weight (Σw² = 1, so the sum of
// independent seas has one sea's height). The wind blows along each chart's x (the patches' +x).
//
// In shallow water a wave can be no higher than about 0.78 of the depth (the breaker index, McCowan 1894): higher
// and it breaks. So the long waves (the two larger cascades) are cut to that height over the ground (land/ground.ts,
// the whole planet's), and where a wave arrives higher than the depth allows, it is breaking: surf on the shallowest
// banks and along the beaches.
//
// The water is drawn after everything solid, and reads it behind itself (the colour and depth the frame has drawn so
// far) to see the sea floor through the water: along the eye's ray refracted at the surface and followed down to
// the floor's depth, then looked up where that lands on the screen — the one screen-space approximation here (what
// lies off the screen, or behind something nearer, can't be seen through the water).
//
// The ships' marks on it — foam round their hulls and down their wakes, the wakes' waves, the air worked into the
// water astern, their shadows — are wake.ts's map, read once a pixel (and once a vertex, for the waves' height; the
// shadows where the sun's ray through the water meets the sea's level, softened). The
// hulls of the few nearest the eye cut the surface away inside them and shade the water against them (hulls.ts).
//
// The light off the water is optics.ts's. Fog and clouds come from the frame's post pass, as for anything solid.

import { DoubleSide, Mesh, MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import {
  Discard, Fn, If, cameraPosition, cross, cameraProjectionMatrix, cameraProjectionMatrixInverse, cameraViewMatrix, dFdx, dFdy, dot, float,
  getScreenPosition, getViewPosition, length, log2, max, min, mix, normalize, positionView, positionWorld, saturate,
  screenUV, select, smoothstep, sqrt, step, texture, varying, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture,
} from 'three/tsl';
import type { Environment } from '../environment';
import type { Ground } from '../land/ground';
import type { Sky } from '../sky/sky';
import { createCharts } from '../view/charts';
import type { View } from '../view/view';
import { R } from '../world/sphere';
import type { Wind } from '../world/wind';
import { BANDS, BREAKER, CASCADES, FETCH, LONG, SIZE } from './cascades';
import { createCaustics } from './caustics';
import { createFoam } from './foam';
import { glitter } from './glitter';
import { createHulls } from './hulls';
import { N_WATER, createOptics } from './optics';
import { likeness } from './spectrum';
import { createWake, type Afloat } from './wake';
import { createWaves } from './waves';

type N = any;

const SPOKES = 128;
const FIRST = 1;
const GROWTH = 1.05;
/** The least the surface's normal faces the eye (cosine): no less than the eye can see. */
const FACING = 0.05;
/** Refracted rays are followed no deeper than this: beyond, the floor is too dim through the water to matter. */
const MAX_REFRACT_DEPTH = 20;
/** The winds (m/s) at which neighbouring charts' seas are kept unlike: from a breeze to a gale. */
const LIKENESS_WINDS = [5, 10, 15, 20];

/**
 * wind: the planet's prevailing wind; ships: the most there will be; debug: 'charts' colours the sea by its charts'
 * weights (red, green, blue: nearest first); 'wake' shows the ships' marks (wake.ts).
 */
export function createWater(renderer: WebGPURenderer, view: View, sky: Sky, ground: Ground, wind: Wind, ships: number, debug = '') {
  const waves = createWaves(renderer);
  const wake = createWake(renderer, view, sky, ships);
  const hulls = createHulls();
  const optics = createOptics(sky, view);
  // neighbouring charts' seas as unlike as can be at every wind, each cascade on its own
  const each = LIKENESS_WINDS.flatMap((wind) => CASCADES.map((L, c) => likeness(SIZE, L, { wind, fetch: FETCH }, BANDS[c])));
  const charts = createCharts(CASCADES[0], (x, z) => Math.max(...each.map((f) => Math.abs(f(x, z)))), wind);
  const material = new MeshBasicNodeMaterial();

  // The water under this vertex at rest, and where the waves have moved it. Each cascade is read at the mip whose
  // texels are as wide as the grid's cell here, so waves too short for the grid to draw average away, not alias.
  const grid = view.rings(FIRST, GROWTH, SPOKES);
  const cell = max(grid.arc.mul(GROWTH - 1), FIRST);

  // How much of the waves the depth at world position p lets through: the long waves cut to what the depth holds,
  // the ripples only in the last few centimetres. Where waves are higher than the depth holds, they break.
  // Worked out per vertex for moving the water, and again per pixel for its look: far off the grid's cells are wider
  // than a beach.
  const shallows = (p: N) => {
    const depth = max(ground.height(p).negate(), 0);
    const hs = waves.amplitude.mul(2);
    return {
      long: saturate(min(hs, depth.mul(BREAKER)).div(hs)),
      short: saturate(depth.div(0.3)),
      breaking: saturate(hs.div(max(depth.mul(BREAKER), 0.01)).sub(1).mul(0.4)).mul(smoothstep(0, 0.05, depth)),
    };
  };
  const { long, short } = shallows(grid.up);

  // The water's move, along each chart's axes and up (xyz), and the waves' height here unscaled by the depth (w).
  const wave: N = Fn(() => {
    const moved = vec3(0).toVar(), swell = float(0).toVar();
    charts.each(grid.up, (c) => {
      let d: N = vec3(0), h: N = float(0);
      CASCADES.forEach((L, k) => {
        const lod = log2(max(cell.div(L / SIZE), 1));
        const r = texture(waves.displacement[k], c.q.div(L)).level(lod).xyz;
        d = d.add(r.mul(k < LONG ? long : short));
        h = h.add(r.y);
      });
      moved.addAssign(c.e1.mul(d.x).add(c.e2.mul(d.z)).add(grid.up.mul(d.y)).mul(c.w));
      swell.addAssign(h.mul(c.w));
    });
    return vec4(moved, swell);
  })();
  // the wakes' waves over the sea's
  material.positionNode = view.place(grid.up, 0).add(wave.xyz).add(grid.up.mul(wake.height(grid.up)));

  const height: N = varying(dot(wave.xyz, grid.up));
  /** Where in its wave this water is, unscaled by the depth: 0 in the troughs … 1 on the crests. */
  const phase: N = varying(saturate(wave.w.div(waves.amplitude).mul(0.5).add(0.5)));
  const foamOn = createFoam(waves);
  const rest: N = varying(grid.up);
  material.colorNode = Fn(() => {
    // no water inside a hull
    const hull = hulls.at(positionWorld);
    If(hull.inside, () => {
      Discard();
    });
    const { long, short, breaking } = shallows(rest);
    const up = view.up(positionWorld);
    const scale = (c: number): N => (c < LONG ? long : short);
    // the water at rest under this pixel, and its change across the pixel, for the charts' reads
    const p = normalize(rest).mul(R);
    const dp: [N, N] = [dFdx(p), dFdy(p)];
    const footprint = max(length(dp[0]), length(dp[1]));
    const marks = wake.read(p);
    const wakeFoam = marks.marks.x, air = saturate(marks.marks.z);
    // the water over the ground here, as the waves lift it and let it fall: the swash's
    const thickness = ground.height(rest).negate().add(height);
    // surf: the breaking waves' fronts white, from the crest down the face; the troughs between keep what the
    // whitecaps' fading leaves
    const surf = breaking.mul(smoothstep(0.4, 0.85, phase)).mul(0.7);

    // Per chart: the slopes, filtered over the pixel's footprint by the mips; what the filtering averages away (the
    // slopes' variance within the footprint) becomes roughness, as do the ripples too small for any cascade. The
    // slopes, as a tangent vector, sum with the charts' weights; the variances, independent, with their squares.
    // The foam from the breaking cascades' cover (averaged over the footprint by their mips), and the air under it,
    // drawn by foam.ts. Cover is no Gaussian height: summed with weights w it could pass one sea's, or a whitecap's 1. Weighted by w²
    // (Σw² = 1), each chart's foam fades across the band as its waves do, the mean cover stays one sea's, and no
    // pixel is whiter than a whitecap; so too the air.
    const slope = marks.slope.toVar(), variance = waves.ripples.mul(short).toVar(), foam = float(0).toVar(), bubbles = float(0).toVar();
    const q = vec2(0).toVar();
    charts.each(p, (c, slot) => {
      if (slot === 0) q.assign(c.q);
      const read = (t: N, k: N) => texture(t, c.q.mul(k)).grad(c.dx.mul(k), c.dy.mul(k));
      let s2: N = vec2(0), v: N = float(0), h: N = float(0);
      CASCADES.forEach((L, k) => {
        const s = read(waves.slopes[k], float(1 / L)), m = scale(k);
        s2 = s2.add(s.xy.mul(m));
        v = v.add(max(s.z.sub(s.x.mul(s.x)), 0).add(max(s.w.sub(s.y.mul(s.y)), 0)).mul(m.mul(m)));
        if (k < 2) {
          h = h.add(read(waves.displacement[k], float(1 / L)).y.mul(m));
        }
      });
      // the sea is Σ w·h, so its slope is Σ w·∇h + h·∇w: across the band, where the weights change, the second
      // tilts it too (the long cascades' height; the shortest's is too small to matter)
      slope.addAssign(c.e1.mul(s2.x).add(c.e2.mul(s2.y)).mul(c.w).add(c.dw.mul(h)));
      variance.addAssign(v.mul(c.w.mul(c.w)));
      const froth = foamOn(c, surf.add(wakeFoam), thickness, footprint);
      foam.addAssign(froth.foam.mul(c.w.mul(c.w)));
      bubbles.addAssign(froth.air.mul(c.w.mul(c.w)));
    }, dp);
    const v = normalize(cameraPosition.sub(positionWorld));
    // Toward the horizon the eye looks along the sea, and the filtered slopes turn some of it away from the eye. The
    // eye can't see a face turned away (only the faces of those waves toward it), so such normals are bent back
    // until the eye just sees them.
    const tilted = normalize(up.sub(slope));
    const n: N = normalize(tilted.add(v.mul(max(float(FACING).sub(dot(tilted, v)), 0))));
    const crest = saturate(height.div(waves.amplitude));

    // What lies behind the surface, where the eye's ray goes once refracted (Snell): followed down through the water
    // here to the floor's depth and looked up where that lands on the screen. If the look-up lands on something in
    // front of the water, it looks straight through instead.
    const ray = v.negate().refract(n, 1 / N_WATER);
    const down = min(max(ground.height(rest).negate(), 0), MAX_REFRACT_DEPTH);
    const end = positionWorld.add(ray.mul(down.div(max(dot(ray, up).negate(), 0.2))));
    // Near the screen's edges the look-up is shortened, along each axis to at most half the way left to the edge it
    // heads for, so it never reaches past it and the image behind is only gently squeezed there (easing it back once it
    // had passed the edge folded the image over on itself: a band of streaks).
    const landed = getScreenPosition(cameraViewMatrix.mul(vec4(end, 1)).xyz, cameraProjectionMatrix);
    const off = landed.sub(screenUV);
    const room = mix(screenUV, vec2(1).sub(screenUV), step(0, off));
    const shifted = screenUV.add(off.mul(min(room.div(max(off.abs().mul(2), 1e-6)), 1)));
    const behindAt = (uv: N) => getViewPosition(uv, viewportDepthTexture(uv).x, cameraProjectionMatrixInverse);
    const inFront = behindAt(shifted).z.greaterThan(positionView.z);
    const uv = select(inFront, screenUV, shifted);
    const depthBehind = viewportDepthTexture(uv).x;
    const path = select(depthBehind.greaterThanEqual(1), float(1e4), length(behindAt(uv).sub(positionView)));
    const behind = viewportSharedTexture(uv).rgb;

    const sparkle = (D: N, nh: N, hl: N) => glitter(q, length(cross(dp[0], dp[1])), footprint, D, nh, hl);
    // the ships' shadows, the hulls' shade and the wakes' air
    const near = { lit: float(1).sub(wake.shade(positionWorld)), glow: hull.glow, air: max(air, bubbles) };
    // the facets' α² is the mean square slope over both axes; a wake's air calms the ripples over it
    return optics.seaRadiance(positionWorld, n, v, sqrt(variance.mul(float(1).sub(air.mul(0.6)))), crest, foam, behind, path, sparkle, near);
  })();
  // the charts' weights as red, green and blue, about as bright on the screen as they are after the frame's exposure
  if (debug === 'charts') material.colorNode = Fn(() => charts.debug(rest).mul(0.1))();
  // the ships' marks: foam red, the wake's crests green (troughs dark), air blue, shadow grey
  if (debug === 'wake') {
    material.colorNode = Fn(() => {
      const m = wake.read(normalize(rest).mul(R)).marks;
      return vec3(saturate(m.x), saturate(m.y.mul(2).add(0.5)), saturate(m.z)).mul(float(1).sub(wake.shade(positionWorld).mul(0.7))).mul(0.1);
    })();
  }

  // drawn after everything solid, which it reads behind itself; and both sides of it, since near the horizon the eye
  // looks so low across the waves that it sees the backs of their faces past the crests
  material.transparent = true;
  material.side = DoubleSide;
  const mesh = new Mesh(grid.geometry, material);
  mesh.frustumCulled = false;

  const caustics = createCaustics(view, sky, waves, charts, shallows);

  return {
    mesh,
    /** The sea's charts (world/lattice.ts), for its CPU copy (swell.ts). */
    anchors: charts.anchors,
    /** The light under the water at world position p, as a share of what is above it: the sun's and the sky's. */
    below: {
      sun: (p: N): N => optics.sunBelow(p).mul(caustics(p)),
      sky: (p: N): N => optics.skyBelow(p),
    },
    /** Each frame: the world, and the ships on the sea. */
    update(env: Environment, dt: number, ships: readonly Afloat[]) {
      waves.update({ wind: env.windSpeed, fetch: FETCH }, env.clock, dt);
      wake.update(env, ships);
      hulls.update(ships.map((s) => s.pose), view.eye.position);
      // past the horizon, as far as a crest could still show over it; the charts that can weigh in out to there
      charts.update(view.eye.position, grid.update(waves.amplitude.value * 2));
    },
  };
}

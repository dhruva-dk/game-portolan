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
// The light off the water is optics.ts's. Fog and clouds come from the frame's post pass, as for anything solid.

import { DoubleSide, Mesh, MeshBasicNodeMaterial, NoColorSpace, RepeatWrapping, TextureLoader, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, cameraPosition, cameraProjectionMatrix, cameraProjectionMatrixInverse, cameraViewMatrix, dFdx, dFdy, dot, float,
  getScreenPosition, getViewPosition, length, log2, max, min, mix, normalize, positionView, positionWorld, saturate,
  screenUV, select, smoothstep, sqrt, step, texture, varying, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture,
} from 'three/tsl';
import type { Environment } from '../environment';
import type { Ground } from '../land/ground';
import type { Sky } from '../sky/sky';
import { createCharts } from '../view/charts';
import type { View } from '../view/view';
import { R } from '../world/sphere';
import { BANDS, CASCADES, SIZE } from './cascades';
import { N_WATER, createOptics } from './optics';
import { likeness } from './spectrum';
import { CURVED, createWaves } from './waves';

type N = any;

const SPOKES = 128;
const FIRST = 1;
const GROWTH = 1.05;
/** The breaker index: the highest wave (significant height) water of a given depth holds. */
const BREAKER = 0.78;
/** The least the surface's normal faces the eye (cosine): no less than the eye can see. */
const FACING = 0.05;
/** Refracted rays are followed no deeper than this: beyond, the floor is too dim through the water to matter. */
const MAX_REFRACT_DEPTH = 20;
/** Caustics focus as if the floor were no deeper than about this, metres: deeper, the nets of the many short waves
 * cross past their foci and, with the sun's disc, blur toward an even light (drawn sharp, they would only speckle). */
const FOCUS = 2.5;
/** The foam pattern (ambientCG Foam002) repeats every this many metres across the wind. */
const FOAM_TILE = 3;
/** Open ocean: the trade winds have blown over hundreds of kilometres. */
const FETCH = 300_000;
/** The winds (m/s) at which neighbouring charts' seas are kept unlike: from a breeze to a gale. */
const LIKENESS_WINDS = [5, 10, 15, 20];

/** debug: 'charts' colours the sea by its charts' weights (red, green, blue: nearest first). */
export function createWater(renderer: WebGPURenderer, view: View, sky: Sky, ground: Ground, debug = '') {
  const waves = createWaves(renderer);
  const optics = createOptics(sky, view);
  // neighbouring charts' seas as unlike as can be at every wind, each cascade on its own
  const each = LIKENESS_WINDS.flatMap((wind) => CASCADES.map((L, c) => likeness(SIZE, L, { wind, fetch: FETCH }, BANDS[c])));
  const charts = createCharts(CASCADES[0], (x, z) => Math.max(...each.map((f) => Math.abs(f(x, z)))));
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
        d = d.add(r.mul(k < 2 ? long : short));
        h = h.add(r.y);
      });
      moved.addAssign(c.e1.mul(d.x).add(c.e2.mul(d.z)).add(grid.up.mul(d.y)).mul(c.w));
      swell.addAssign(h.mul(c.w));
    });
    return vec4(moved, swell);
  })();
  material.positionNode = view.place(grid.up, 0).add(wave.xyz);

  const height: N = varying(dot(wave.xyz, grid.up));
  /** Where in its wave this water is, unscaled by the depth: 0 in the troughs … 1 on the crests. */
  const phase: N = varying(saturate(wave.w.div(waves.amplitude).mul(0.5).add(0.5)));
  const foamPattern = new TextureLoader().load(`${import.meta.env.BASE_URL}tex/foam.png`);
  foamPattern.wrapS = foamPattern.wrapT = RepeatWrapping;
  foamPattern.anisotropy = 4;
  foamPattern.colorSpace = NoColorSpace;
  const rest: N = varying(grid.up);
  material.colorNode = Fn(() => {
    const { long, short, breaking } = shallows(rest);
    const up = view.up(positionWorld);
    const scale = (c: number): N => (c < 2 ? long : short);
    // the water at rest under this pixel, and its change across the pixel, for the charts' reads
    const p = normalize(rest).mul(R);
    const dp: [N, N] = [dFdx(p), dFdy(p)];
    // surf: the breaking waves' fronts white, from the crest down the face, the troughs between them less so
    const surf = breaking.mul(smoothstep(0.35, 0.8, phase).mul(0.8).add(0.2));

    // Per chart: the slopes, filtered over the pixel's footprint by the mips; what the filtering averages away (the
    // slopes' variance within the footprint) becomes roughness, as do the ripples too small for any cascade. The
    // slopes, as a tangent vector, sum with the charts' weights; the variances, independent, with their squares.
    // The foam's cover from the breaking cascades (averaged over the footprint by their mips), drawn by the foam
    // pattern: fresh foam is white but for the pattern's holes, and as it fades only its brighter strands are left,
    // so a whitecap thins into a web and then into flecks. The pattern is stretched along the wind (the chart's x),
    // as foam is drawn out in streaks, and read at two scales so it doesn't repeat. Cover is no Gaussian height: summed
    // with weights w it could pass one sea's, or a whitecap's 1. Weighted by w² (Σw² = 1), each chart's foam fades
    // across the band as its waves do, the mean cover stays one sea's, and no pixel is whiter than a whitecap.
    const slope = vec3(0).toVar(), variance = waves.ripples.mul(short).toVar(), foam = float(0).toVar();
    charts.each(p, (c) => {
      const read = (t: N, k: N) => texture(t, c.q.mul(k)).grad(c.dx.mul(k), c.dy.mul(k));
      let s2: N = vec2(0), v: N = float(0), cover: N = surf;
      CASCADES.forEach((L, k) => {
        const s = read(waves.slopes[k], float(1 / L)), m = scale(k);
        s2 = s2.add(s.xy.mul(m));
        v = v.add(max(s.z.sub(s.x.mul(s.x)), 0).add(max(s.w.sub(s.y.mul(s.y)), 0)).mul(m.mul(m)));
        if (k < 2) cover = cover.add(read(waves.displacement[k], float(1 / L)).w);
      });
      slope.addAssign(c.e1.mul(s2.x).add(c.e2.mul(s2.y)).mul(c.w));
      variance.addAssign(v.mul(c.w.mul(c.w)));
      const strands = read(foamPattern, vec2(1 / (2 * FOAM_TILE), 1 / FOAM_TILE)).r.mul(0.6)
        .add(read(foamPattern, vec2(1 / (5.3 * FOAM_TILE), 1 / (2.7 * FOAM_TILE))).r.mul(0.4));
      foam.addAssign(saturate(strands.sub(float(1).sub(saturate(cover)).mul(0.7)).mul(2.5)).mul(c.w.mul(c.w)));
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

    // GGX's α² is the mean square slope over both axes
    return optics.seaRadiance(positionWorld, n, v, sqrt(variance), crest, foam, behind, path);
  })();
  // the charts' weights as red, green and blue, about as bright on the screen as they are after the frame's exposure
  if (debug === 'charts') material.colorNode = Fn(() => charts.debug(rest).mul(0.1))();

  // drawn after everything solid, which it reads behind itself; and both sides of it, since near the horizon the eye
  // looks so low across the waves that it sees the backs of their faces past the crests
  material.transparent = true;
  material.side = DoubleSide;
  const mesh = new Mesh(grid.geometry, material);
  mesh.frustumCulled = false;

  /**
   * Caustics: how much the waves above focus the sunlight reaching world position p under the water. A bit of the
   * surface refracts its light down onto the floor a depth D below, moving it sideways by D·(1 − 1/n)·∇h; the patch it
   * lights is the surface's own area times the determinant J of I + D·(1 − 1/n)·H (D eased to at most FOCUS) (H, the height's second
   * derivatives), so the light there is 1/|J| as bright. Under a crest, which bulges like a lens, J < 1: the bright
   * net on the floor. H is the two smaller cascades' curvature (waves.ts), read where the light came in
   * (toward the sun); far off their mips smooth the slopes and the net fades to an even light, as it should.
   * Read through each of the sea's charts at p, each H turned into the first chart's axes and summed with the
   * chart's weight (H is linear in the height, which sums so).
   */
  const caustics = (p: N): N => Fn(() => {
    const up = view.up(p);
    const depth = max(view.altitude(p).negate(), 0);
    const { long, short } = shallows(p);
    const l = sky.sun, ly = dot(l, up), flat = l.sub(up.mul(ly));
    const sin = sqrt(float(1).sub(ly.mul(ly))).div(N_WATER);
    const across = flat.div(max(length(flat), 1e-4)).mul(depth.mul(sin).div(sqrt(float(1).sub(sin.mul(sin)))));
    const E1 = vec3(1, 0, 0).toVar(), E2 = vec3(0, 0, 1).toVar(), H = vec3(0).toVar();
    charts.each(p, (c, slot) => {
      if (slot === 0) {
        E1.assign(c.e1);
        E2.assign(c.e2);
      }
      const entry = c.q.add(vec2(dot(across, c.e1), dot(across, c.e2)));
      let h: N = vec3(0);
      CURVED.forEach((k, i) => {
        const L = CASCADES[k];
        h = h.add(texture(waves.curvature[i], entry.div(L)).grad(c.dx.div(L), c.dy.div(L)).xyz.mul(k < 2 ? long : short));
      });
      // (hxx, hzz, hxz) on this chart's axes, onto the first's
      const a = dot(c.e1, E1), b = dot(c.e2, E1), e = dot(c.e1, E2), d = dot(c.e2, E2);
      H.addAssign(vec3(
        h.x.mul(a.mul(a)).add(h.y.mul(b.mul(b))).add(h.z.mul(a.mul(b).mul(2))),
        h.x.mul(e.mul(e)).add(h.y.mul(d.mul(d))).add(h.z.mul(e.mul(d).mul(2))),
        h.x.mul(a.mul(e)).add(h.y.mul(b.mul(d))).add(h.z.mul(a.mul(d).add(b.mul(e)))),
      ).mul(c.w));
    }, [dFdx(p), dFdy(p)]);
    const hxx = H.x, hzz = H.y, hxz = H.z;
    const f = depth.div(sqrt(float(1).add(depth.div(FOCUS).pow(2)))).mul(1 - 1 / N_WATER);
    const J = float(1).add(f.mul(hxx)).mul(float(1).add(f.mul(hzz))).sub(f.mul(hxz).mul(f.mul(hxz)));
    return mix(float(1), float(1).div(max(J.abs(), 0.15)), smoothstep(0, 0.3, depth));
  })();

  return {
    mesh,
    /** The light under the water at world position p, as a share of what is above it: the sun's and the sky's. */
    below: {
      sun: (p: N): N => optics.sunBelow(p).mul(caustics(p)),
      sky: (p: N): N => optics.skyBelow(p),
    },
    update(env: Environment, dt: number) {
      waves.update({ wind: env.windSpeed, fetch: FETCH }, dt);
      // past the horizon, as far as a crest could still show over it; the charts that can weigh in out to there
      charts.update(view.eye.position, grid.update(waves.amplitude.value * 2));
    },
  };
}

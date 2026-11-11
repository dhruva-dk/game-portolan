// The sea: a grid of rings round the point under the eye, laid on the sphere (view.rings), moved by the waves
// (waves.ts) and shaded as water.
//
// The rings start a metre out and each lies 5% further than the last, with 128 spokes, so a cell is about as long as
// it is wide and covers about as much of the screen near as far; only those out to the horizon are drawn. The grid
// follows the eye; the waves stay put on the planet, read from the cascades' patches that tile a chart of the sea
// (cascadesAt), and move the water along that chart's axes and up.
//
// In shallow water a wave can be no higher than about 0.78 of the depth (the breaker index, McCowan 1894): higher
// and it breaks. So the long waves (the two larger cascades) are cut to that height over the seabed, and to what got
// across the reef's crest on the way in (seabed.passage) — the lagoon behind the reef lies calm — and where a wave
// arrives higher than the depth allows, it is breaking: surf on the crest and along the beach.
//
// The water is drawn after everything solid, and reads it behind itself (the colour and depth the frame has drawn so
// far) to see the sea floor through the water: along the eye's ray refracted at the surface and followed down to
// the floor's depth, then looked up where that lands on the screen — the one screen-space approximation here (what
// lies off the screen, or behind something nearer, can't be seen through the water).
//
// The light off the water is optics.ts's. Fog and clouds come from the frame's post pass, as for anything solid.

import { DoubleSide, Mesh, MeshBasicNodeMaterial, NoColorSpace, RepeatWrapping, TextureLoader, Vector2, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, cameraPosition, cameraProjectionMatrix, cameraProjectionMatrixInverse, cameraViewMatrix, dot, float, getScreenPosition,
  getViewPosition, length, log2, max, min, mix, normalize, positionView, positionWorld, saturate, screenUV, select,
  smoothstep, sqrt, texture, uniform, varying, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture,
} from 'three/tsl';
import type { Environment } from '../environment';
import type { Seabed } from '../land/seabed';
import type { Sky } from '../sky/sky';
import type { View } from '../view/view';
import type { Chart } from '../world/sphere';
import { CASCADES, SIZE } from './cascades';
import { N_WATER, createOptics } from './optics';
import { CURVED, createWaves } from './waves';

type N = any;

const SPOKES = 128;
const FIRST = 1;
const GROWTH = 1.05;
/** The breaker index: the highest wave (significant height) water of a given depth holds. */
const BREAKER = 0.78;
/** Refracted rays are followed no deeper than this: beyond, the floor is too dim through the water to matter. */
const MAX_REFRACT_DEPTH = 20;
/** The foam pattern (ambientCG Foam002) repeats every this many metres across the wind. */
const FOAM_TILE = 3;
/** Open ocean: the trade winds have blown over hundreds of kilometres. */
const FETCH = 300_000;

/** chart: the sea's chart, whose x and z the cascades' patches tile and the wind is given along. */
export function createWater(renderer: WebGPURenderer, view: View, sky: Sky, seabed: Seabed, chart: Chart) {
  const waves = createWaves(renderer);
  const optics = createOptics(sky, view);
  const material = new MeshBasicNodeMaterial();
  /** The way the wind blows, a unit vector along the sea's chart (x, z). */
  const wind = uniform(new Vector2(1, 0));

  /**
   * Where the cascades are read for world position p (q, metres on the sea's chart) and the axes their x and z run
   * along there (e1, e2, unit tangents; e1 × up = e2). One chart for now, so the waves stretch a little far from
   * its centre: about 1.04 times across at 100 m, 1.6 a quarter of the way round, and without bound at the far side.
   */
  const cascadesAt = view.chart(chart);

  // The water under this vertex at rest, and where the waves have moved it. Each cascade is read at the mip whose
  // texels are as wide as the grid's cell here, so waves too short for the grid to draw average away, not alias.
  const grid = view.rings(FIRST, GROWTH, SPOKES);
  const rest = cascadesAt(grid.up);
  const ground = rest.q;
  const cell = max(grid.arc.mul(GROWTH - 1), FIRST);

  // How much of the waves the depth here lets through: the long waves cut to what the depth and the way in hold,
  // the ripples only in the last few centimetres. Where waves arrive higher than the depth holds, they break.
  // Worked out per vertex for moving the water, and again per pixel for its look: far off the grid's cells are wider
  // than the reef's crest.
  const shallows = (where: N) => {
    const depth = max(seabed.height(where).negate(), 0);
    const hs = waves.amplitude.mul(2);
    const arriving = min(hs, seabed.passage(where).mul(BREAKER));
    return {
      long: saturate(min(arriving, depth.mul(BREAKER)).div(hs)),
      short: saturate(depth.div(0.3)),
      breaking: saturate(arriving.div(max(depth.mul(BREAKER), 0.01)).sub(1).mul(0.4)).mul(smoothstep(0, 0.05, depth)),
    };
  };
  const where = seabed.locate(grid.up);
  const { long, short } = shallows(where);

  let moved: N = vec3(0), swell: N = float(0);
  CASCADES.forEach((L, c) => {
    const lod = log2(max(cell.div(L / SIZE), 1));
    const d = texture(waves.displacement[c], ground.div(L)).level(lod).xyz;
    moved = moved.add(d.mul(c < 2 ? long : short));
    swell = swell.add(d.y);
  });
  material.positionNode = view.place(grid.up, moved.y).add(rest.e1.mul(moved.x)).add(rest.e2.mul(moved.z));

  const height: N = varying(moved.y);
  /** Where in its wave this water is, unscaled by the depth: 0 in the troughs … 1 on the crests. */
  const phase: N = varying(saturate(swell.div(waves.amplitude).mul(0.5).add(0.5)));
  const foamPattern = new TextureLoader().load(`${import.meta.env.BASE_URL}tex/foam.png`);
  foamPattern.wrapS = foamPattern.wrapT = RepeatWrapping;
  foamPattern.anisotropy = 4;
  foamPattern.colorSpace = NoColorSpace;
  const at: N = varying(ground), e1: N = varying(rest.e1), e2: N = varying(rest.e2), here: N = varying(where);
  material.colorNode = Fn(() => {
    const { long, short, breaking } = shallows(here);
    const up = view.up(positionWorld);
    const scale = (c: number): N => (c < 2 ? long : short);
    // The slopes, filtered over the pixel's footprint by the mips; what the filtering averages away (the slopes'
    // variance within the footprint) becomes roughness, as do the ripples too small for any cascade.
    let slope: N = vec2(0), variance: N = waves.ripples.mul(short);
    CASCADES.forEach((L, c) => {
      const s = texture(waves.slopes[c], at.div(L)), k = scale(c);
      slope = slope.add(s.xy.mul(k));
      variance = variance.add(max(s.z.sub(s.x.mul(s.x)), 0).add(max(s.w.sub(s.y.mul(s.y)), 0)).mul(k.mul(k)));
    });
    const n: N = normalize(up.sub(e1.mul(slope.x)).sub(e2.mul(slope.y)));
    const v = normalize(cameraPosition.sub(positionWorld));
    const crest = saturate(height.div(waves.amplitude));

    // The foam's cover from the breaking cascades (averaged over the footprint by their mips), drawn by the foam
    // pattern: fresh foam is white but for the pattern's holes, and as it fades only its brighter strands are left,
    // so a whitecap thins into a web and then into flecks. The pattern is
    // stretched along the wind, as foam is drawn out in streaks, and read at two scales so it doesn't repeat.
    let cover: N = float(0);
    CASCADES.slice(0, 2).forEach((L, c) => { cover = cover.add(texture(waves.displacement[c], at.div(L)).w); });
    // surf: the breaking waves' fronts white, from the crest down the face, the troughs between them less so
    cover = cover.add(breaking.mul(smoothstep(0.35, 0.8, phase).mul(0.8).add(0.2)));
    const along = vec2(at.dot(wind), at.dot(vec2(wind.y.negate(), wind.x)));
    const strands = texture(foamPattern, along.mul(vec2(1 / (2 * FOAM_TILE), 1 / FOAM_TILE))).r.mul(0.6)
      .add(texture(foamPattern, along.mul(vec2(1 / (5.3 * FOAM_TILE), 1 / (2.7 * FOAM_TILE)))).r.mul(0.4));
    const foam = saturate(strands.sub(float(1).sub(saturate(cover)).mul(0.7)).mul(2.5));

    // What lies behind the surface, where the eye's ray goes once refracted (Snell): followed down through the water
    // here to the floor's depth and looked up where that lands on the screen. If the look-up lands on something in
    // front of the water, it looks straight through instead.
    const ray = v.negate().refract(n, 1 / N_WATER);
    const down = min(max(seabed.height(here).negate(), 0), MAX_REFRACT_DEPTH);
    const end = positionWorld.add(ray.mul(down.div(max(dot(ray, up).negate(), 0.2))));
    // near the screen's edges the look-up eases back to straight through, so it never reaches past them
    const landed = getScreenPosition(cameraViewMatrix.mul(vec4(end, 1)).xyz, cameraProjectionMatrix);
    const margin = min(min(landed.x, landed.y), min(float(1).sub(landed.x), float(1).sub(landed.y)));
    const shifted = mix(screenUV, landed, smoothstep(0, 0.05, margin));
    const behindAt = (uv: N) => getViewPosition(uv, viewportDepthTexture(uv).x, cameraProjectionMatrixInverse);
    const inFront = behindAt(shifted).z.greaterThan(positionView.z);
    const uv = select(inFront, screenUV, shifted);
    const depthBehind = viewportDepthTexture(uv).x;
    const path = select(depthBehind.greaterThanEqual(1), float(1e4), length(behindAt(uv).sub(positionView)));
    const behind = viewportSharedTexture(uv).rgb;

    // GGX's α² is the mean square slope over both axes
    return optics.seaRadiance(positionWorld, n, v, sqrt(variance), crest, foam, behind, path);
  })();

  // drawn after everything solid, which it reads behind itself; and both sides of it, since near the horizon the eye
  // looks so low across the waves that it sees the backs of their faces past the crests
  material.transparent = true;
  material.side = DoubleSide;
  const mesh = new Mesh(grid.geometry, material);
  mesh.frustumCulled = false;

  /**
   * Caustics: how much the waves above focus the sunlight reaching world position p under the water. A bit of the
   * surface refracts its light down onto the floor a depth D below, moving it sideways by D·(1 − 1/n)·∇h; the patch it
   * lights is the surface's own area times the determinant J of I + D·(1 − 1/n)·H (H, the height's second
   * derivatives), so the light there is 1/|J| as bright. Under a crest, which bulges like a lens, J < 1: the bright
   * net on the floor. H is the two smaller cascades' curvature (waves.ts), read where the light came in
   * (toward the sun); far off their mips smooth the slopes and the net fades to an even light, as it should.
   * All of it on the sea's chart, about the up at p.
   */
  const caustics = (p: N): N => {
    const { q, e1, e2, up } = cascadesAt(p);
    const depth = max(view.altitude(p).negate(), 0);
    const { long, short } = shallows(seabed.locate(p));
    const l = sky.sun, ly = dot(l, up), lxz = vec2(dot(l, e1), dot(l, e2));
    const sin = sqrt(float(1).sub(ly.mul(ly))).div(N_WATER);
    const across = lxz.div(max(length(lxz), 1e-4)).mul(depth.mul(sin).div(sqrt(float(1).sub(sin.mul(sin)))));
    const entry = q.add(across);
    let H: N = vec3(0);
    CURVED.forEach((c, i) => { H = H.add(texture(waves.curvature[i], entry.div(CASCADES[c])).xyz.mul(c < 2 ? long : short)); });
    const hxx = H.x, hzz = H.y, hxz = H.z;
    const f = depth.mul(1 - 1 / N_WATER);
    const J = float(1).add(f.mul(hxx)).mul(float(1).add(f.mul(hzz))).sub(f.mul(hxz).mul(f.mul(hxz)));
    return mix(float(1), float(1).div(max(J.abs(), 0.15)), smoothstep(0, 0.3, depth));
  };

  return {
    mesh,
    /** The light under the water at world position p, as a share of what is above it: the sun's and the sky's. */
    below: {
      sun: (p: N): N => optics.sunBelow(p).mul(caustics(p)),
      sky: (p: N): N => optics.skyBelow(p),
    },
    update(env: Environment, dt: number) {
      wind.value.copy(env.wind).normalize();
      waves.update({ wind: env.wind.length(), heading: Math.atan2(env.wind.y, env.wind.x), fetch: FETCH }, dt);
      // past the horizon, as far as a crest could still show over it
      grid.update(waves.amplitude.value * 2);
    },
  };
}

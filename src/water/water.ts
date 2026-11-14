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
// Who holds the sea is drawn in it (claims.ts): the water tinted its holder's colour, her border a hard glowing line,
// and the changes sweeping over it.
//
// The light off the water is optics.ts's. Fog and clouds come from the frame's post pass, as for anything solid.

import { DoubleSide, Mesh, MeshBasicNodeMaterial, type Texture } from 'three/webgpu';
import {
  Discard, Fn, If, abs, cameraPosition, cameraProjectionMatrix, cameraProjectionMatrixInverse, cameraViewMatrix, dFdx, dFdy, dot, float,
  getScreenPosition, getViewPosition, length, log2, max, min, mix, normalize, positionView, positionWorld, pow, saturate,
  screenUV, select, smoothstep, step, texture, varying, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture,
} from 'three/tsl';
import type { Environment } from '../environment';
import { STORM_FOOT } from '../palette';
import type { Snapshot } from '../snapshot';
import type { Compute, Draw } from '../gpu';
import type { Ground } from '../land/ground';
import type { Sky } from '../sky/sky';
import { createCharts } from '../view/charts';
import type { View } from '../view/view';
import { R } from '../world/sphere';
import type { Wind } from '../world/wind';
import { BANDS, BREAKER, CASCADES, FETCH, LONG, SIZE } from '../world/cascades';
import { createCaustics } from './caustics';
import { createClaims } from './claims';
import { createTrails } from './trails';
import { createFoam } from './foam';
import { createHulls } from './hulls';
import { N_WATER, createOptics } from './optics';
import { likeness } from '../world/spectrum';
import { createWake, type Afloat } from './wake';
import { createWaves } from './waves';
import type { FloatNode, Vec2Node, Vec3Node } from '../tsl';

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
 * In the storm (sky/storm.ts) the sea's whitecaps cover STORM_FOAM of it, and the rain on it and the dark over it
 * take STORM_DARK of its light.
 */
const STORM_FOAM = 0.45, STORM_DARK = 0.3;
/**
 * The storm's foot: the sea churned white from its edge out to FOOT (fading over the second) metres; and its edge's
 * line, EDGE_LINE m to each side (or most of a pixel), the calm's gold at its foot (STORM_FOOT) at EDGE_LIGHT of what a white surface
 * in the open shows: under the bloom and the glow (GOLD), so it is a drawn line, not the hard bright band review28 and
 * review32 saw.
 */
const FOOT = [6, 26] as const, EDGE_LINE = 0.3, EDGE_LIGHT = 0.25, EDGE_FAR = [0.4, 2] as const;
/** The middle cascade's crests in the water's tones: the height (of the sea's amplitude) that is a full crest, and
 *  how much of the crest the tones read they take. */
const CHOP = [0.15, 0.85] as const;
/** The cascade whose crests the tones read; less its mean over this mip's texels (2⁴ of its 0.5 m), so its longest
 *  waves, whose troughs lay in broad blotches, are left out and its short ones draw the rows (review27). */
const CHOP_CASCADE = 1, ROWS_MIP = 4;
/** And the shortest cascade's crests, this many times their height: near a low eye they draw the rows, small and
 *  dense, where the middle's are tens of pixels across; gone by where a pixel spans FINE_FADE metres, before they
 *  print as grain. */
const FINE = 2.5, FINE_FADE = [0.06, 0.2] as const;
/** The crests read for the tones are averaged (seven taps) this many metres to each side along the screen's level, so they lie in
 *  level rows, as art/target/idea.png's painted waves, rather than in blotches with no direction (review26). */
const STROKE = 32;
/** Nor more than this many pixels: near a low eye 12 m spans hundreds of them, and the five offset copies of the crests
 *  printed as stair-stepped patches (review25). */
const STROKE_PX = 60;
/** The calm's water along the wall's foot gold (art/target/idea.png), out to GOLD metres from its edge: the palette's
 *  gold as bright as a white surface in the open, GOLD_SHARE of it at most, added to the water's light (mixed in, it
 *  greyed the blue into the tan stripe review33 saw), rising as the square of nearness so it is a soft glow along the
 *  wall rather than the hard pale seam review32 saw. */
const GOLD = 40, GOLD_SHARE = 0.3;
/** The gold is the calm's light off the water, so it shows at a glancing look (the far wall's foot on the horizon),
 *  whole while the eye's look meets the sea at a sine under GLANCE[0], gone by GLANCE[1]: looking down onto a near wall's
 *  foot it would mix with the blue into the tan stripe review33 saw. */
const GLANCE = [0.1, 0.3] as const;
/** How much of the sun a ship's shadow takes from the water: some, so she sits on the sea, but not a dark smear
 *  across it (art/target/idea.png's ships cast barely any). */
const SHIP_SHADE = 0.5;
/** A wake's foam (wake.ts) drawn this much fuller than it is kept: bold lobes of white along her sides and astern. */
const WAKE_BOLD = 1.8;
/**
 * The swash: each wave's bore runs on up the beach after it breaks, RUNUP of its crest's height offshore above the
 * still water, and drains back BACKWASH of its trough's below it, on ground from SWASH_FROM metres down up the beach.
 * (Stockdon et al. 2006 give about 0.3 m of swash for 1.2 m waves on a 1:20 beach: half a crest's height.)
 */
const RUNUP = 0.5, BACKWASH = 0.3, SWASH_FROM = 0.5;

/** What the sea is drawn as: its water; or, to judge them, its charts' weights (red, green, blue: nearest first) or
 *  the ships' marks on it (wake.ts). */
export type SeaShows = 'water' | 'charts' | 'wake';

/** wind: the planet's prevailing wind; ships: the most there will be, and shipLength a ship's overall, m; shows: what the
 *  sea is drawn as. */
export function createWater(view: View, sky: Sky, ground: Ground, wind: Wind, ships: number, shipLength: number, shows: SeaShows = 'water') {
  const waves = createWaves();
  const wake = createWake(view, sky, ships);
  const hulls = createHulls();
  const optics = createOptics(sky, view);
  const claims = createClaims(ships);
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
  const shallows = (p: Vec3Node) => {
    const depth = max(ground.height(p).negate(), 0);
    const hs = waves.amplitude.mul(2);
    return {
      long: saturate(min(hs, depth.mul(BREAKER)).div(hs)),
      short: saturate(depth.div(0.3)),
      breaking: saturate(hs.div(max(depth.mul(BREAKER), 0.01)).sub(1).mul(0.8)).mul(smoothstep(0, 0.05, depth)),
    };
  };
  // The water's move at rest point `up`, along each chart's axes and up (xyz), and the waves' height there unscaled by
  // the depth (w); its cascades read as for a grid's cell `cell` m across.
  const waveAt = (up: Vec3Node, cell: FloatNode) => Fn(() => {
    const { long, short } = shallows(up);
    const moved = vec3(0).toVar(), swell = float(0).toVar();
    charts.each(up, (c) => {
      let d: Vec3Node = vec3(0), h: FloatNode = float(0);
      CASCADES.forEach((L, k) => {
        const lod = log2(max(cell.div(L / SIZE), 1));
        const r = texture(waves.displacement[k], c.q.div(L)).level(lod).xyz;
        d = d.add(r.mul(k < LONG ? long : short));
        h = h.add(r.y);
      });
      moved.addAssign(c.e1.mul(d.x).add(c.e2.mul(d.z)).add(up.mul(d.y)).mul(c.w));
      swell.addAssign(h.mul(c.w));
    });
    return vec4(moved, swell);
  })();
  const wave = waveAt(grid.up, cell);
  // Where the waves come ashore their height is cut to nothing, and the swash runs up the sand and back in their
  // place, with the waves' height offshore.
  const swash = mix(wave.w.mul(BACKWASH), wave.w.mul(RUNUP), step(0, wave.w)).mul(smoothstep(-SWASH_FROM, 0, ground.height(grid.up)));
  // the wakes' waves over the sea's
  material.positionNode = view.place(grid.up, 0).add(wave.xyz).add(grid.up.mul(wake.height(grid.up).add(swash)));

  const height = varying(dot(wave.xyz, grid.up).add(swash));
  /** Where in its wave this water is, unscaled by the depth: 0 in the troughs … 1 on the crests. */
  const phase = varying(saturate(wave.w.div(waves.amplitude).mul(0.5).add(0.5)));
  const foamOn = createFoam(waves);
  const rest = varying(grid.up);
  material.colorNode = Fn(() => {
    // no water inside a hull
    const hull = hulls.at(positionWorld);
    If(hull.inside, () => {
      Discard();
    });
    const { long, short, breaking } = shallows(rest);
    const up = view.up(positionWorld);
    const scale = (c: number): FloatNode => (c < LONG ? long : short);
    // the water at rest under this pixel, and its change across the pixel, for the charts' reads
    const p = normalize(rest).mul(R);
    const dp: [Vec3Node, Vec3Node] = [dFdx(p), dFdy(p)];
    const footprint = max(length(dp[0]), length(dp[1]));
    const marks = wake.read(p);
    const held = claims.at(p, dp[0], dp[1]);
    const wakeFoam = marks.marks.x.mul(WAKE_BOLD), air = saturate(marks.marks.z);
    // the water over the ground here, as the waves lift it and let it fall: the swash's
    const thickness = ground.height(rest).negate().add(height);
    // surf: the breaking waves' fronts white, from the crest down the face; the troughs between keep what the
    // whitecaps' fading leaves
    const surf = breaking.mul(smoothstep(0.25, 0.75, phase)).mul(0.9);

    // Per chart: the slopes, filtered over the pixel's footprint by the mips; as a tangent vector they sum with the
    // charts' weights.
    // The foam from the breaking cascades' cover (averaged over the footprint by their mips), and the air under it,
    // drawn by foam.ts. Cover is no Gaussian height: summed with weights w it could pass one sea's, or a whitecap's 1.
    // Weighted by w² (Σw² = 1), each chart's foam fades across the band as its waves do, the mean cover stays one
    // sea's, and no pixel is whiter than a whitecap; so too the air.
    // The long cascades' slope alone, too: the sun's glints are mirrored off it, so they lie in a few broad shapes
    // along the long waves' faces rather than a glitter of pixels off the ripples.
    const slope = marks.slope.toVar(), broad = marks.slope.toVar(), foam = float(0).toVar(), bubbles = float(0).toVar(), chop = float(0).toVar();
    charts.each(p, (c) => {
      const read = (t: Texture, k: FloatNode) => texture(t, c.q.mul(k)).grad(c.dx.mul(k), c.dy.mul(k));
      let s2: Vec2Node = vec2(0), l2: Vec2Node = vec2(0), h: FloatNode = float(0);
      CASCADES.forEach((L, k) => {
        const s = read(waves.slopes[k], float(1 / L)), m = scale(k);
        s2 = s2.add(s.xy.mul(m));
        const y = read(waves.displacement[k], float(1 / L)).y.mul(m);
        if (k === 2) chop.addAssign(y.mul(c.w).mul(float(FINE).mul(float(1).sub(smoothstep(FINE_FADE[0], FINE_FADE[1], footprint)))));
        if (k < 2) {
          l2 = l2.add(s.xy.mul(m));
          h = h.add(y);
        }
        if (k === CHOP_CASCADE) {
          const along = c.dx.div(max(length(c.dx), 1e-9)).mul(min(float(STROKE), length(c.dx).mul(STROKE_PX)).div(L));
          // each tap filtered (anisotropically) over the third of the stroke to the next, so they join in one smear
          const side = (o: number) => texture(waves.displacement[k], c.q.div(L).add(along.mul(o))).grad(along.div(3), c.dy.div(L)).y;
          const taps = side(-1).add(side(1)).add(side(-2 / 3)).add(side(2 / 3)).add(side(-1 / 3)).add(side(1 / 3));
          const coarse = texture(waves.displacement[k], c.q.div(L)).level(float(ROWS_MIP)).y.mul(m);
          chop.addAssign(y.add(taps.mul(m)).div(7).sub(coarse).mul(c.w));
        }
      });
      // the sea is Σ w·h, so its slope is Σ w·∇h + h·∇w: across the band, where the weights change, the second
      // tilts it too (the long cascades' height; the shortest's is too small to matter)
      slope.addAssign(c.e1.mul(s2.x).add(c.e2.mul(s2.y)).mul(c.w).add(c.dw.mul(h)));
      broad.addAssign(c.e1.mul(l2.x).add(c.e2.mul(l2.y)).mul(c.w).add(c.dw.mul(h)));
      const froth = foamOn(c, surf.add(wakeFoam), thickness, footprint);
      foam.addAssign(froth.foam.mul(c.w.mul(c.w)));
      bubbles.addAssign(froth.air.mul(c.w.mul(c.w)));
    }, dp);
    const storm = sky.storm(p), past = sky.stormEdge(p);
    // the storm's foot churned white along its edge, over the crests
    const foot = smoothstep(-2, 2, past).mul(float(1).sub(smoothstep(FOOT[0], FOOT[1], past)));
    foam.assign(max(mix(foam, max(foam, smoothstep(0.55, 1, phase)), storm.mul(STORM_FOAM)), foot.mul(smoothstep(0.2, 0.8, phase)).mul(0.4)));
    // and its line on the water: so wide in metres near, never under a pixel and a half; fading out where a pixel
    // spans metres (EDGE_FAR), so along the horizon the gold band's glow is left, not a hard seam
    const edgeLine = float(1).sub(smoothstep(0, max(footprint, 0.05), abs(past).sub(max(float(EDGE_LINE), footprint.mul(0.75)))))
      .mul(float(1).sub(smoothstep(EDGE_FAR[0], EDGE_FAR[1], footprint)));
    const v = normalize(cameraPosition.sub(positionWorld));
    // Toward the horizon the eye looks along the sea, and the filtered slopes turn some of it away from the eye. The
    // eye can't see a face turned away (only the faces of those waves toward it), so such normals are bent back
    // until the eye just sees them.
    const tilted = normalize(up.sub(slope));
    const n = normalize(tilted.add(v.mul(max(float(FACING).sub(dot(tilted, v)), 0))));
    const smooth = normalize(up.sub(broad));
    const g = normalize(smooth.add(v.mul(max(float(FACING).sub(dot(smooth, v)), 0))));
    // where on its waves the water is, for its tones (optics.ts): the swell's, and more the middle cascade's, whose
    // crests lie a few metres apart, so the troughs' tone falls in rows across the sea, as a painter's, rather than in
    // the swell's broad patches (far off its waves are under the pixel and it settles to its middle)
    const crest = mix(saturate(height.div(waves.amplitude)), saturate(chop.div(waves.amplitude.mul(CHOP[0])).mul(0.5).add(0.5)), CHOP[1]);

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
    const behindAt = (uv: Vec2Node) => getViewPosition(uv, viewportDepthTexture(uv).x, cameraProjectionMatrixInverse);
    const inFront = behindAt(shifted).z.greaterThan(positionView.z);
    const uv = select(inFront, screenUV, shifted);
    const depthBehind = viewportDepthTexture(uv).x;
    const path = select(depthBehind.greaterThanEqual(1), float(1e4), length(behindAt(uv).sub(positionView)));
    const behind = viewportSharedTexture(uv).rgb;

    // the ships' shadows, the hulls' shade and the wakes' air
    const near = { lit: float(1).sub(wake.shade(positionWorld).mul(SHIP_SHADE)),glow: hull.glow, air: max(max(air, bubbles), held.drain.mul(0.6)) };
    const lit = optics.seaRadiance(positionWorld, n, g, v, crest, foam, behind, path, max(ground.height(rest).negate(), 0), near, held).mul(float(1).sub(storm.mul(STORM_DARK)));
    const open = dot(sky.open, vec3(0.2126, 0.7152, 0.0722));
    const glancing = float(1).sub(smoothstep(GLANCE[0], GLANCE[1], dot(v, up)));
    const sea = lit.add(vec3(...STORM_FOOT).mul(open).mul(pow(smoothstep(-GOLD, 0, past), 2).mul(float(1).sub(smoothstep(0, 4, past))).mul(glancing).mul(GOLD_SHARE)));
    return mix(sea, vec3(...STORM_FOOT).mul(dot(sky.open, vec3(0.2126, 0.7152, 0.0722)).mul(EDGE_LIGHT)), edgeLine);
  })();
  // the charts' weights as red, green and blue, about as bright on the screen as they are after the frame's exposure
  if (shows === 'charts') material.colorNode = Fn(() => charts.debug(rest).mul(0.1))();
  // the ships' marks: foam red, the wake's crests green (troughs dark), air blue, shadow grey
  if (shows === 'wake') {
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
  // the open trails, riding the waves (and the wakes' waves) as the water does
  const trails = createTrails(sky, (up, c) => view.place(up, 0).add(waveAt(up, c).xyz).add(up.mul(wake.height(up))), shipLength);

  return {
    mesh,
    /** The open trails' ribbons, drawn after the sea. */
    ribbons: trails.mesh,
    /** The sea's charts (world/lattice.ts), for its CPU copy (world/swell.ts). */
    anchors: charts.anchors,
    /** The light under the water at world position p, as a share of what is above it: the sun's and the sky's. */
    below: {
      sun: (p: Vec3Node): Vec3Node => optics.sunBelow(p),
      sky: (p: Vec3Node): Vec3Node => optics.skyBelow(p),
    },
    /** The same on the sea floor, the sun's focused by the waves above (caustics.ts): kept to the ground's shaders,
     *  where it shows, so every other lit thing compiles without it. */
    floor: {
      sun: (p: Vec3Node): Vec3Node => optics.sunBelow(p).mul(caustics(p)),
      sky: (p: Vec3Node): Vec3Node => optics.skyBelow(p),
    },
    /** The ships' marks' draw, due or not (update gives it only when due): for the frame to build its shaders before
     *  any ship is near. */
    marks: wake.draw,
    /** Each frame: the world, the ships on the sea, who holds it and whose ship is hers (at the snapshot's clock).
     *  Returns what is due: the waves' passes, the marks' draw. */
    update(env: Environment, dt: number, ships: readonly Afloat[], drawn?: Pick<Snapshot, 'sea' | 'own' | 'ships' | 'clock'>): { waves: Compute[]; wake: Draw | null } {
      const clock = drawn?.clock ?? env.clock;
      claims.update(drawn?.sea, clock, drawn?.own ?? null);
      trails.update(drawn?.sea, clock, drawn?.ships ?? [], view.eye.position, drawn?.own ?? null);
      const swell = waves.update({ wind: env.seaWind, fetch: FETCH }, env.windSpeed, env.clock, dt);
      const marks = wake.update(env, ships);
      hulls.update(ships.map((s) => s.pose), view.eye.position);
      // past the horizon, as far as a crest could still show over it; the charts that can weigh in out to there
      charts.update(view.eye.position, grid.update(waves.amplitude.value * 2));
      return { waves: swell, wake: marks };
    },
  };
}

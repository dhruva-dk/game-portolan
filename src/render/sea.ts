// The sea (WP13): the style carried across the whole planet's water. One camera-centred geodesic disc (a polar grid
// with geometric radial spacing reaching past the horizon) is laid on the sphere in the vertex shader and moved by
// the render swell, so there are no seams or pinching anywhere, poles and cube edges included, in one draw call.
// The planet's curve is real geometry, so distant ships and islands sink hull first behind it. The fragment paints
// a portolan chart's sea brought to life: bare parchment washed with depth (pale lagoons, verdigris shallows,
// ultramarine shelves, deep indigo), each wash its own glaze with a wavering pooled edge; coastlines traced by rings
// of fine parallel lines spreading from the shore; waves as small pen strokes drawn on, riding the swell downwind and
// lifting off; lead-white dry-brush foam along the waterline, on bores running in, and on reef crests.
import * as THREE from 'three';
import { inkMaterial, linearVec, transmittanceVec } from '../style/glsl.ts';
import { PARCHMENT, PIGMENTS, SEA_WASHES } from '../style/palette.ts';
import { horizonDistance, R } from '../sim/sphere.ts';
import type { Geography } from '../sim/world/geography.ts';
import type { Pipeline } from './pipeline.ts';
import { SEA_FIELD_BYTES, Swell, SWELL_GLSL } from './swell.ts';
import type { RenderContext, RenderModule } from './world.ts';

/** Rings of the sea disc, centre to rim. */
export const DISC_RINGS = 112;
const RINGS = DISC_RINGS, SEGMENTS = 224;
/** How much of each SEA_WASHES density the sea lays: a chart's sea is pale vellum washed with depth. */
const WASH_LOAD = { lagoon: 0.5, shallows: 0.45, shelf: 0.32, deep: 0.38 } as const;

export interface DiscShape {
  /** Arc distance from the camera's foot to the disc's rim, u. */
  reach: number;
  /** Geometric spacing exponent: ring t ∈ [0, 1] lies at reach·(e^{kt} − 1)/(e^k − 1). */
  k: number;
  /** Straight-line distance from the eye to the horizon, u. */
  horizon: number;
}

/** The disc for an eye `height` above the sea: past the horizon, its first ring about 3 % of the height out. */
export function discShape(height: number, out: DiscShape): DiscShape {
  const h = Math.max(height, 0.3);
  out.reach = Math.min(horizonDistance(h) * 1.2 + 6, Math.PI * R * 0.98);
  out.horizon = Math.sqrt(h * (2 * R + h));
  const first = Math.max(0.1, 0.03 * h) / out.reach, ring = (k: number) => Math.expm1(k / RINGS) / Math.expm1(k);
  let lo = 1e-3, hi = 40;
  if (ring(lo) <= first) hi = lo;
  for (let i = 0; i < 40 && hi > lo; i++) {
    const mid = (lo + hi) / 2;
    if (ring(mid) > first) lo = mid; else hi = mid;
  }
  out.k = hi;
  return out;
}

function discGeometry(): THREE.BufferGeometry {
  const pos = new Float32Array((RINGS + 1) * SEGMENTS * 3), idx: number[] = [];
  for (let r = 0; r <= RINGS; r++) {
    for (let k = 0; k < SEGMENTS; k++) {
      const o = (r * SEGMENTS + k) * 3;
      pos[o] = r / RINGS;
      pos[o + 1] = (k / SEGMENTS) * Math.PI * 2;
      if (r === RINGS) continue;
      const a = r * SEGMENTS + k, b = r * SEGMENTS + ((k + 1) % SEGMENTS), c = a + SEGMENTS, d = b + SEGMENTS;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const vec = (v: THREE.Vector3) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
const washT = (k: keyof typeof SEA_WASHES) => vec(transmittanceVec(SEA_WASHES[k].pigment));
const washD = (k: keyof typeof SEA_WASHES) => (SEA_WASHES[k].density * WASH_LOAD[k]).toFixed(4);

const VERTEX = /* glsl */ `
${SWELL_GLSL}
uniform float uTime;
uniform vec3 uFoot;
uniform vec3 uEast;
uniform vec3 uNorth;
uniform float uReach;
uniform float uK;
out vec3 vRest;
out vec3 vWorld;
out vec3 vNormal;
out float vLift;
void main() {
  float a = uReach * (exp(uK * position.x) - 1.0) / (exp(uK) - 1.0) / SEA_R;
  vec3 dir = cos(a) * uFoot + sin(a) * (cos(position.y) * uEast + sin(position.y) * uNorth);
  vec4 f = seaField(dir);
  vec3 d = swell(dir, uTime, swellAmp(uSeaLevel - f.x), vNormal, vLift);
  vRest = dir;
  vWorld = dir * (SEA_R + uSeaLevel) + d;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
${SWELL_GLSL}
in vec3 vRest;
in vec3 vWorld;
in vec3 vNormal;
in float vLift;
uniform float uHorizon; // straight-line distance from the eye to the horizon, u
uniform float uStrokes; // the share of cells that carry a wave stroke
const vec3 LAGOON_T = ${washT('lagoon')}, SHALLOWS_T = ${washT('shallows')}, SHELF_T = ${washT('shelf')}, DEEP_T = ${washT('deep')};
const float LAGOON_D = ${washD('lagoon')}, SHALLOWS_D = ${washD('shallows')}, SHELF_D = ${washD('shelf')}, DEEP_D = ${washD('deep')};
const vec3 LEAD = ${vec(linearVec(PIGMENTS.leadWhite))}, PARCH = ${vec(linearVec(PARCHMENT))};
// coast rings: the first RING0 u off the solid contour, then spreading by RING_G; widths in CSS px
const float RING0 = 0.8, RING_D = 1.1, RING_G = 1.5, RINGS = 6.0, RING_CSS = 0.5, COAST_CSS = 0.6;
// wave strokes: the nearest cells are STROKE_CELL u; farther, each octave doubles and keeps at least STROKE_CELL_CSS
const float STROKE_CELL = 1.0, STROKE_CELL_CSS = 40.0, STROKE_CSS = 1.0;

// A wash laid where e > 0 (e: how far past its edge, in depth u; fw = fwidth(e)): its anti-aliased cover and the
// pooled ring where the drying pigment gathered just inside the edge.
vec2 layer(float e, float fw) {
  float px = e / max(fw, 1e-4);
  float cover = smoothstep(-0.75, 0.75, px);
  return vec2(cover, cover * (1.0 - smoothstep(0.0, 6.0 * uRenderPx, px)));
}

// One wave stroke per occupied cell of size C in plane coordinates x, wind w (unit, in the plane): a crescent whose
// chord lies along the crest, bowed downwind, tapering at both ends like a nib. The pen sweeps it on, it drifts
// downwind as it rides, then the ink lifts. upx: plane units per render pixel.
float stroke(vec2 x, vec2 w, float C, float upx, float seed) {
  vec2 cell = floor(x / C);
  float h0 = hash12(cell + seed), h1 = hash12(cell.yx + seed * 1.37 + 11.0), h2 = hash12(cell + seed * 2.11 + 23.0);
  if (h0 > uStrokes) return 0.0;
  float age = fract(uTime / (3.0 + 2.5 * h1) + h2);
  vec2 c = (cell + 0.5 + (vec2(h1, h2) - 0.5) * 0.3) * C + w * (age - 0.5) * 0.25 * C;
  vec2 d = x - c;
  float hl = (0.2 + 0.08 * h0 / max(uStrokes, 1e-3)) * C;
  float s = dot(d, vec2(-w.y, w.x)) / hl;
  float a = dot(d, w) - 0.22 * hl * (1.0 - s * s);
  float hw = (0.2 + 0.55 * sqrt(max(1.0 - s * s, 0.0))) * STROKE_CSS * uRenderPx;
  float drawn = -1.0 + 2.2 * smoothstep(0.0, 0.25, age);
  float cov = (1.0 - smoothstep(hw - 0.5, hw + 0.5, abs(a) / upx)) * step(abs(s), 1.0) * (1.0 - smoothstep(drawn - 0.08, drawn, s));
  return cov * (1.0 - smoothstep(0.55, 0.95, age));
}

// The strokes at rest point P (normal n), projected on the planet frame's three planes (only the dominant one away
// from the cube's diagonals), in two octaves blended by the pixel footprint upx.
float waveInk(vec3 P, vec3 n, vec3 wind, float upx) {
  float lvl = max(log2(upx * uRenderPx * STROKE_CELL_CSS / STROKE_CELL), 0.0);
  float lo = floor(lvl), f = lvl - lo, C = STROKE_CELL * exp2(lo);
  vec3 an = abs(n);
  float m = max(an.x, max(an.y, an.z));
  vec3 wts = smoothstep(m - 0.1, m, an);
  wts /= wts.x + wts.y + wts.z;
  float ink = 0.0;
  for (int i = 0; i < 3; i++) {
    if (wts[i] < 0.01) continue;
    vec2 x = i == 0 ? P.yz : i == 1 ? P.zx : P.xy;
    vec2 wd = i == 0 ? wind.yz : i == 1 ? wind.zx : wind.xy;
    wd /= max(length(wd), 1e-4);
    float sd = float(i) * 7.1;
    ink = max(ink, wts[i] * mix(stroke(x, wd, C, upx, sd + lo * 3.3), stroke(x, wd, 2.0 * C, upx, sd + lo * 3.3 + 3.3), f));
  }
  return ink;
}

void main() {
  vec3 dir = normalize(vRest);
  vec3 P = dir * SEA_R; // the paper and every mark ride the water
  Paper q = paperAt(P, dir, 1.0);
  vec3 tw = triWeights(dir, 4.0);
  float upx = max(length(dFdx(P)), length(dFdy(P)));
  vec4 f = seaField(dir);
  float wob = tri(tPaper, P / 23.0, tw).b - 0.5; // a broad, world-fixed waver for every drawn edge
  float depth = uSeaLevel - f.x, fwD = fwidth(depth);
  float water = smoothstep(-0.6, 0.6, depth / max(fwD, 1e-4));
  float dist = length(vWorld - cameraPosition), far = smoothstep(0.3, 1.0, dist / uHorizon);

  // depth washes: the swell's faces turned from the sun take a little more, the far sea pales toward the horizon
  float tone = clamp(1.0 - 3.0 * dot(vNormal - dir, uSun), 0.75, 1.3) * (1.0 - 0.5 * far);
  float lagoon = smoothstep(0.3, 0.7, f.z);
  vec2 sh = layer(depth, fwD), shEnd = layer(16.0 + 4.0 * wob - depth, fwD);
  vec2 shelf = layer(depth - 3.0 - 1.5 * wob, fwD), deep = layer(depth - 24.0 - 6.0 * wob, fwD);
  vec3 col = parchment(q);
  col = glaze(col, SHALLOWS_T, SHALLOWS_D * tone * sh.x * shEnd.x * (1.0 - lagoon), 0.5 * shEnd.y + 0.3 * sh.y, q);
  col = glaze(col, SHELF_T, SHELF_D * tone * shelf.x * (1.0 - lagoon), 0.5 * shelf.y, q);
  col = glaze(col, DEEP_T, DEEP_D * tone * deep.x, 0.5 * deep.y, q);
  col = glaze(col, LAGOON_T, LAGOON_D * tone * lagoon * sh.x, 0.0, q);
  // the swell's backs, turned from the sun, take one more glaze laid with a frilled, pooled edge: brushed bands
  float back = -10.0 * dot(vNormal - dir, uSun) + 0.6 * (q.mottle - 0.5);
  vec2 band = layer(back - 0.3, fwidth(back));
  col = glaze(col, SHELF_T, 0.11 * band.x * water * (1.0 - far), 0.7 * band.y, q);

  // coast rings, fading outward and wherever they would pack tighter than a few pixels
  float fine = tri(tPaper, P / 4.1, tw).g - 0.5; // the nib's own tremor
  float rx = log(max(1.0 + (f.y + 0.35 * wob + 0.12 * fine - RING0) / RING_D, 0.3)) / log(RING_G), fx = fwidth(rx);
  float k = floor(rx + 0.5), rw = RING_CSS * uRenderPx * (1.0 - 0.08 * k);
  float ring = (1.0 - smoothstep(rw - 0.5, rw + 0.5, abs(rx - k) / max(fx, 1e-5))) * step(-0.5, k) * step(k, RINGS - 0.5)
             * pow(0.8, max(k, 0.0)) * (0.75 + 0.6 * fine) * smoothstep(2.5, 5.0, 1.0 / max(fx, 1e-5)) * water * (1.0 - far);
  float cw = COAST_CSS * uRenderPx;
  float coast = 1.0 - smoothstep(cw - 0.5, cw + 0.5, abs(depth) / max(fwD, 1e-4));

  // foam: a fringe at the waterline, bores running in to it, and the reef crests breaking as the swell lifts
  float shore = depth / max(fwD / upx, 0.02); // u to the waterline
  float run = fract(uTime / 6.5 + wob * 1.7);
  float bore = (1.0 - smoothstep(0.0, 0.3, abs(f.y - mix(2.8, 0.0, run)))) * sin(run * 3.14159) * smoothstep(3.5, 0.5, depth);
  float reef = f.w * smoothstep(2.0, 0.6, depth) * smoothstep(-0.4, 0.5, vLift + wob);
  float foam = max(max(1.0 - smoothstep(0.15, 0.7 + 0.4 * wob, shore), 0.75 * bore), reef) * water;
  float lead = smoothstep(0.42, 0.62, foam * (0.5 + 0.55 * q.grain + 0.45 * tri(tMarks, P / 2.3, tw).b));

  // wave strokes ride the crests downwind, thinning toward the horizon
  vec3 wind = normalize(cross(uWindAxis, dir) + 1e-6);
  float waves = waveInk(P, dir, wind, upx) * mix(0.6, 1.0, smoothstep(-0.4, 0.6, vLift)) * water
              * smoothstep(0.8, 2.5, depth) * (1.0 - smoothstep(0.25, 0.7, dist / uHorizon)) * (1.0 - lead);

  vec3 white = mix(LEAD * uPaper / PARCH, uSilver, uNight * 0.6);
  vec3 pen = mix(hatchInk(0.6), uSilver, uNight * 0.7);
  col = mix(col, hatchInk(0.45), ring * 0.85);
  col = mix(col, white, lead * 0.9);
  col = mix(col, pen, waves * 0.95);
  col = mix(col, uInk, coast * 0.9);
  // the far sea goes into the sky's horizon wash (render/sky.ts lays the same), so sea and sky meet at every hour
  col = mix(col, uSkyHorizon * parchment(q) / uPaper, far * far * 0.6);
  writeInk(candle(col, vWorld), normalize(dir + 0.3 * (vNormal - dir)));
}
`;

export class Sea {
  readonly mesh: THREE.Mesh;
  readonly swell: Swell;
  private readonly material: THREE.ShaderMaterial;
  private readonly shape: DiscShape = { reach: 0, k: 0, horizon: 0 };
  private readonly foot = new THREE.Vector3();
  private readonly east = new THREE.Vector3(1, 0, 0);
  private readonly local = {
    uFoot: { value: new THREE.Vector3(0, 1, 0) },
    uEast: { value: new THREE.Vector3(1, 0, 0) },
    uNorth: { value: new THREE.Vector3(0, 0, -1) },
    uReach: { value: 1 },
    uK: { value: 1 },
    uHorizon: { value: 1 },
    uStrokes: { value: 0.4 },
  };

  constructor(pipeline: Pipeline, geo: Geography) {
    this.swell = new Swell(geo);
    pipeline.registerTexture('sea fields', SEA_FIELD_BYTES);
    this.material = inkMaterial(pipeline.style, {
      vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { ...this.swell.uniforms, ...this.local }, inkWeight: 0.8,
    });
    this.mesh = new THREE.Mesh(discGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.onBeforeRender = (_r, _s, camera) => this.centre(camera.position);
  }

  /** Triangles the disc submits per frame. */
  get triangles(): number {
    return this.mesh.geometry.index!.count / 3;
  }

  /** The wind at p toward the tangent `toward`, strength 0–1.4: the swell runs with it and strokes thicken. */
  setWind(p: THREE.Vector3, toward: THREE.Vector3, strength: number): void {
    this.swell.setWind(p, toward, strength);
    this.local.uStrokes.value = 0.35 + 0.35 * Math.min(strength, 1.4);
  }

  /** Lay the disc round the eye's foot; its frame is carried along (parallel transport), so it never spins at a pole. */
  private centre(eye: THREE.Vector3): void {
    const u = this.local, foot = this.foot.copy(eye).normalize();
    discShape(eye.length() - R - this.swell.uniforms.uSeaLevel.value, this.shape);
    const e = this.east.addScaledVector(foot, -this.east.dot(foot));
    if (e.lengthSq() < 1e-6) e.set(Math.abs(foot.y) < 0.9 ? 0 : 1, Math.abs(foot.y) < 0.9 ? 1 : 0, 0).cross(foot);
    e.normalize();
    u.uFoot.value.copy(foot);
    u.uEast.value.copy(e);
    u.uNorth.value.crossVectors(foot, e);
    u.uReach.value = this.shape.reach;
    u.uK.value = this.shape.k;
    u.uHorizon.value = this.shape.horizon;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.swell.dispose();
  }
}

/** The composition root's sea (MODULES): built when a match screen opens. */
export function createSea(ctx: RenderContext): RenderModule {
  const sea = new Sea(ctx.pipeline, ctx.world.geo);
  ctx.scene.add(sea.mesh);
  return {
    frame(f) {
      ctx.pipeline.style.uniforms.uTime.value = f.clock;
    },
    dispose() {
      ctx.scene.remove(sea.mesh);
      sea.dispose();
    },
  };
}

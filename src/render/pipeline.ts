// The ink render pipeline: renderer, frame graph, dynamic resolution and the budget counters.
//
// Each frame, at the dynamic render scale:
//   1. Scene pass into two colour targets and a depth texture. Materials (style/glsl.ts) paint their washes and
//      hatching in display sRGB — no HDR, tone mapping or bloom — and write normal, ink id and ink weight to aux.
//   2. Edge pass: each pixel compares itself with its four neighbours and, where it lies on a silhouette (a farther
//      surface or the sky next to it), a crease (a fold in the normal) or a boundary between materials, writes a line
//      element: darkness, half-width, the boundary's normal and an offset that centres the line on the boundary.
//      Silhouettes swell on the side turned from the light and with nearness, creases stay thin, both thin out and
//      lighten with distance so the horizon stays delicate, and a world-anchored noise gives every line the wander and
//      pressure of a nib, fixed to the thing drawn.
//   2b. Mask (WP30a): one texel per MASK_BLOCK² pixels, set where any line element lies within INK_REACH of the block
//      (25 bilinear taps on texel corners, each testing four elements). Most of a frame has none, and the composite
//      skips its gather there: the same lines for a fraction of the taps.
//   3. Ink composite: every pixel gathers the line elements within INK_REACH pixels into an anti-aliased coverage and
//      lays iron-gall ink over the colour (veils such as fog hide it), adds the deckle — a smooth, darker tone toward
//      the frame's edge with no texture of its own — and the storm grade. Straight to the canvas at render scale 1,
//      else into a target that a bilinear pass lifts to the canvas.
//   4. Interface: `ui`, an orthographic scene in CSS px (origin top left), drawn over the canvas at full resolution.
// No MSAA: lines carry their own coverage. 8-bit colour targets (iOS has no float32 colour buffers; nothing here
// needs more than 8 bits).
import * as THREE from 'three';
import { createStyle, STYLE_GLSL, type Style } from '../style/glsl.ts';
import { textureBytes } from '../style/textures.ts';
import { PIGMENTS, STORM_DIM, STORM_GREY, STORM_SLATE, toLinear, transmittance } from '../style/palette.ts';

/** Pixels around each pixel the composite searches for line elements; line half-widths are clamped to fit. */
const INK_REACH = 3;
/** Cast shade at a low sun: steps of the march toward the sun, and how far it reaches (world units, a hill's shade). */
const CAST_STEPS = 24;
const CAST_REACH = 160;

const FULLSCREEN_VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const EDGE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tAux;
uniform sampler2D tDepth;
uniform sampler2D tPaper;
uniform vec2 uNearFar;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec3 uLightView;
uniform vec2 uFade;      // distances where lines start and finish thinning
uniform vec2 uWidth;     // silhouette and crease widths at full weight, render px
uniform float uPxAngle;  // world units per render px at unit distance
uniform float uRenderPx;
layout(location = 0) out vec4 outEdge;

float viewZ(float d) { return uNearFar.x * uNearFar.y / (uNearFar.y - d * (uNearFar.y - uNearFar.x)); }
float inkId(vec4 a) { return floor(a.b * 255.0 + 0.5); }
vec3 octDecode(vec2 e) {
  e = e * 2.0 - 1.0;
  vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  float t = max(-n.z, 0.0);
  n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t);
  return normalize(n);
}
// Smooth noise fixed to the world at about \`size\` world units, octave-blended so it never slides or swims.
vec4 anchored(vec3 p, float size) {
  float k = log2(size), lo = floor(k), f = k - lo, s = exp2(lo);
  vec2 q = vec2(p.x + 0.43 * p.z, p.y - 0.29 * p.z);
  return mix(textureLod(tPaper, q / s, 0.0), textureLod(tPaper, q / (2.0 * s) + 0.5, 0.0), f);
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy), last = textureSize(tAux, 0) - 1;
  vec4 a0 = texelFetch(tAux, px, 0);
  float id0 = inkId(a0);
  if (id0 == 0.0) { outEdge = vec4(0.0); return; } // the sky never carries a line: the thing in front of it does
  float d0 = texelFetch(tDepth, px, 0).r, z0 = viewZ(d0);
  vec3 n0 = octDecode(a0.rg);
  const ivec2 D[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
  vec4 an[4];
  float zn[4];
  for (int i = 0; i < 4; i++) {
    ivec2 q = clamp(px + D[i], ivec2(0), last);
    an[i] = texelFetch(tAux, q, 0);
    zn[i] = viewZ(texelFetch(tDepth, q, 0).r);
  }
  vec2 silhouette = vec2(0.0), boundary = vec2(0.0);
  float crease = 0.0;
  for (int i = 0; i < 4; i++) {
    float idn = inkId(an[i]);
    float ahead = zn[i] - z0, behind = z0 - zn[i ^ 1];
    if (idn != id0) {
      if (idn == 0.0 || ahead > 0.03 * z0) silhouette += vec2(D[i]);
      else if (ahead > -0.03 * z0 && id0 > idn) { boundary += vec2(D[i]); crease = 1.0; } // one side of the meeting
    } else if (ahead > max(2.5 * behind, 0.0) + 0.012 * z0) {
      silhouette += vec2(D[i]); // a fold: the neighbour is on a farther part of the same surface
    } else if (i == 0 || i == 2) {
      float c = dot(n0, octDecode(an[i].rg));
      float s = smoothstep(0.8, 0.45, c);
      if (s > 0.0) { boundary += vec2(D[i]); crease = max(crease, s); }
    }
  }
  bool isSilhouette = dot(silhouette, silhouette) > 0.0;
  float weight = a0.a * 4.0;
  if ((!isSilhouette && crease == 0.0) || weight == 0.0) { outEdge = vec4(0.0); return; }
  vec2 dir = normalize(isSilhouette ? silhouette : boundary);

  vec4 vp = uProjInv * vec4((gl_FragCoord.xy / vec2(last + 1)) * 2.0 - 1.0, d0 * 2.0 - 1.0, 1.0);
  vec3 wp = (uViewInv * vec4(vp.xyz / vp.w, 1.0)).xyz;
  float cssWorld = z0 * uPxAngle * uRenderPx;                // world units per CSS px at this depth
  float wander = anchored(wp, cssWorld * 240.0).b;           // the line's slow wander and pressure, ~60 CSS px
  float fibre = anchored(wp, cssWorld * 40.0).r;             // ragged where the ink bled into the fibres
  float fade = smoothstep(uFade.x, uFade.y, z0);
  float shadowSide = 1.0 - clamp(dot(n0, uLightView) * 0.5 + 0.5, 0.0, 1.0);
  float pressure = (0.68 + 0.64 * wander) * (0.86 + 0.28 * fibre) * weight;
  float width = isSilhouette ? uWidth.x * (0.5 + 1.0 * shadowSide) * mix(1.0, 0.32, fade)
                             : uWidth.y * crease * mix(1.0, 0.55, fade);
  float halfWidth = min(0.5 * width * pressure, ${(INK_REACH - 1.15).toFixed(2)});
  float darkness = (isSilhouette ? 1.0 : 0.82) * mix(1.0, 0.42, fade) * min(weight, 1.0);
  float offset = 0.5 + (isSilhouette ? (wander - 0.5) * 1.1 : 0.0); // centred on the boundary, then wandering
  outEdge = vec4(darkness, halfWidth / 4.0, atan(dir.y, dir.x) / 6.2831853 + 0.5, (offset + 2.0) / 4.0);
}
`;

/** Pixels per side of a mask texel's block. */
const MASK_BLOCK = 4;
const MASK_TAPS = (MASK_BLOCK + 2 * INK_REACH) / 2;
const MASK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tEdge; // bilinear: a tap on a texel corner averages the four elements round it
layout(location = 0) out vec4 outMask;
void main() {
  vec2 size = vec2(textureSize(tEdge, 0)), a = floor(gl_FragCoord.xy) * ${MASK_BLOCK}.0 - ${INK_REACH}.0;
  float hit = 0.0;
  for (int y = 0; y < ${MASK_TAPS}; y++) {
    for (int x = 0; x < ${MASK_TAPS}; x++) hit = max(hit, textureLod(tEdge, (a + vec2(2 * x + 1, 2 * y + 1)) / size, 0.0).r);
  }
  outMask = vec4(hit > 0.0 ? 1.0 : 0.0);
}
`;

const SLATE = toLinear(STORM_SLATE);
const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tEdge;
uniform sampler2D tMask;
uniform vec3 uInkLin;
uniform vec3 uDeckle;
uniform vec2 uCss;       // frame size, CSS px
uniform float uStorm;
uniform float uPxAngle;  // world units per render px at unit distance
layout(location = 0) out vec4 outColor;
${STYLE_GLSL}
uniform sampler2D tDepth;
uniform sampler2D tAux;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec2 uNearFar;
uniform vec3 uLightView; // toward the sun (the moon by night), view space

float viewZ(float d) { return uNearFar.x * uNearFar.y / (uNearFar.y - d * (uNearFar.y - uNearFar.x)); }
vec3 viewPos(vec2 uv, float d) { vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
vec3 octDecode(vec2 e) {
  e = e * 2.0 - 1.0;
  vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  float t = max(-n.z, 0.0);
  n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t);
  return normalize(n);
}

// Cast shade at a low sun, 0 lit … 1 in shade: a march from the surface toward the sun through the depth buffer, in
// steps growing from a fraction of a unit (a rope, a gunwale) to CAST_REACH (a hill). Wherever the scene stands in front
// of the ray, and not so far in front that it is only something nearer the eye, the ray is blocked.
float castShade(vec3 P, vec3 N, vec2 size) {
  float z0 = -P.z, t = 0.15 + 0.003 * z0;
  float grow = exp(log(${CAST_REACH.toFixed(1)} / t) / ${CAST_STEPS.toFixed(1)});
  vec3 O = P + N * (0.06 + 0.004 * z0);
  float occ = 0.0;
  for (int i = 0; i < ${CAST_STEPS}; i++) {
    vec3 Q = O + uLightView * t;
    if (-Q.z < uNearFar.x) break;
    vec4 c = uProj * vec4(Q, 1.0);
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float zq = -Q.z, zs = viewZ(texelFetch(tDepth, ivec2(uv * size), 0).r);
    float dz = zq - zs, bias = 0.06 + 0.004 * zq, thick = 1.5 + 0.6 * t;
    occ = max(occ, smoothstep(bias, 2.5 * bias, dz) * (1.0 - smoothstep(thick, 1.5 * thick, dz)));
    if (occ > 0.99) break;
    t *= grow;
  }
  return occ;
}

// Smooth noise fixed to the world at about \`size\` world units, octave-blended so it never slides or swims.
vec4 anchored(vec3 p, float size) {
  float k = log2(size), lo = floor(k), f = k - lo, s = exp2(lo);
  vec2 q = vec2(p.x + 0.43 * p.z, p.y - 0.29 * p.z);
  return mix(textureLod(tPaper, q / s, 0.0), textureLod(tPaper, q / (2.0 * s) + 0.5, 0.0), f);
}
// One family of the cast shade's hatching over frame coordinates xw (world units, fixed to the world), its strokes
// along angle ang: spaced from the frame's change across them per render px (dxw, dyw), so ground or water seen at a
// glance keeps its strokes spaced, never filled in; p, the world units per render px at this depth, bounds that change
// where the depth breaks. w: stroke width as a share of the spacing; spacing: a multiple of the style's.
float castHatch(vec2 xw, vec2 dxw, vec2 dyw, float ang, float p, float w, float spacing) {
  vec2 d = vec2(cos(ang), sin(ang)), n = vec2(-d.y, d.x);
  float x = dot(xw, n), y = dot(xw, d);
  float hpx = clamp(length(vec2(dot(dxw, n), dot(dyw, n))), p, 40.0 * p);
  float k = log2(hpx * uRenderPx * HATCH_SPACING * spacing), S = exp2(floor(k)), i = floor(x / S + 0.5);
  float brk = step(0.1, fract(y / (S * 11.0) + hash11(i * 0.7317 + 11.7)));        // strokes lifted now and then
  return clamp(0.5 * w * S / hpx - abs(x - i * S) / hpx + 0.5, 0.0, 1.0) * brk
       * (mod(i, 2.0) > 0.5 ? 1.0 - fract(k) : 1.0);                                // every second fades out as the spacing doubles
}
const float CAST_TURN = 0.2617994; // the hatching's steps as the sun swings round, rad (15°)
const vec3 SLATE = vec3(${SLATE.map((x) => x.toFixed(5)).join(', ')});

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy), last = textureSize(tColor, 0) - 1;
  vec4 c = texelFetch(tColor, px, 0);
  vec3 col = toLinear(c.rgb);

  // Cast shade at a low sun (uLow): hills, trees, buildings and ships throw long shade over the ground and the sea,
  // laid as a cool wash with a frilled, world-fixed edge and hatched along its length (strokes running away from the
  // sun, anchored to the world), as an engraver draws it. Surfaces turned from the sun keep their own shading.
  if (uLow > 0.001) {
    vec2 size = vec2(textureSize(tDepth, 0));
    vec4 a = texelFetch(tAux, px, 0);
    vec3 P = viewPos(gl_FragCoord.xy / size, texelFetch(tDepth, px, 0).r);
    vec3 W = (uViewInv * vec4(P, 1.0)).xyz, up = normalize(W);
    vec3 sG = normalize(uSun - up * dot(uSun, up) + 1e-5);
    // the hatching's frame: the face of the planet's cube that the ground looks to (fixed to the world; a frame built on
    // the ground's own up would be degenerate, since W is that up times the radius, and fill every stroke in), its strokes
    // along the sun's bearing turned in steps of 15° and eased from one step to the next as the sun swings round
    vec3 au = abs(up);
    int pl = au.x > au.y && au.x > au.z ? 0 : au.y > au.z ? 1 : 2;
    vec2 xw = pl == 0 ? W.yz : pl == 1 ? W.zx : W.xy, dxw = dFdx(xw), dyw = dFdy(xw);
    vec2 sw = pl == 0 ? sG.yz : pl == 1 ? sG.zx : sG.xy;
    float turn = atan(sw.y, sw.x) / CAST_TURN, turn0 = floor(turn), ease = smoothstep(0.3, 0.7, turn - turn0);
    float z = -P.z, cssWorld = z * uPxAngle * uRenderPx;
    float blot = anchored(W, cssWorld * 90.0).g;
    if (a.b > 0.5 / 255.0) { // not the sky
      vec3 N = octDecode(a.rg);
      float facing = smoothstep(-0.15, 0.15, dot(N, uLightView));
      float s = facing > 0.0 ? castShade(P, N, size) * facing : 0.0;
      s = smoothstep(0.25, 0.75, s + (blot - 0.5) * 0.6);
      float rim = s * (1.0 - s) * 4.0;               // pigment pooled where the wash dried at its edge
      s *= uLow * c.a * (1.0 - smoothstep(350.0, 800.0, z));
      if (s > 0.0) {
        // water and level ground seen at a glance take only a light, soft cool wash, the strokes fading out: there the
        // shade lies foreshortened into a band, a full wash reads as a slab of slate and ruled strokes as planks (S-025)
        float nv = abs(dot(N, normalize(-P))), level = smoothstep(0.8, 0.95, dot(mat3(uViewInv) * N, up));
        float light = level * smoothstep(0.75, 0.25, nv);
        col = wash(col, uShade, (s * 0.5 + rim * uLow * c.a * 0.25) * mix(1.0, 0.6, light));
        float p = max(z * uPxAngle, 1e-5), w = mix(0.34, 0.18, light), sp = mix(1.0, 2.0, light), h = 0.0;
        if (ease < 1.0) h = castHatch(xw, dxw, dyw, turn0 * CAST_TURN, p, w, sp) * (1.0 - ease);
        if (ease > 0.0) h += castHatch(xw, dxw, dyw, (turn0 + 1.0) * CAST_TURN, p, w, sp) * ease;
        col = mix(col, wash(hatchInk(mix(0.7, 0.35, light)), uShade, mix(0.8, 1.2, light)), h * s * mix(0.85, 0.0, light));
      }
    }
  }

  float cover = 0.0;
  if (texelFetch(tMask, px / ${MASK_BLOCK}, 0).r > 0.0) { // a line element lies near (the mask pass)
    for (int y = -${INK_REACH}; y <= ${INK_REACH}; y++) {
      for (int x = -${INK_REACH}; x <= ${INK_REACH}; x++) {
        if (x * x + y * y > ${INK_REACH * INK_REACH}) continue;
        vec4 e = texelFetch(tEdge, clamp(px + ivec2(x, y), ivec2(0), last), 0);
        if (e.r == 0.0) continue;
        float a = (e.b - 0.5) * 6.2831853;
        vec2 n = vec2(cos(a), sin(a)), q = -vec2(float(x), float(y));
        float across = abs(dot(q, n) - (e.a * 4.0 - 2.0));
        float along = abs(dot(q, vec2(-n.y, n.x)));
        cover = max(cover, e.r * clamp(e.g * 4.0 - across + 0.5, 0.0, 1.0) * clamp((1.25 - along) * 2.0, 0.0, 1.0));
      }
    }
  }
  col = mix(col, uInkLin, cover * c.a);

  // the deckle: the sheet darkened toward its edge by handling, an umber tone deepening into rounded corners. It has no
  // texture of its own: it glazes the world's paper beneath, whose fibres, stains and washes show through it, so
  // nothing is painted across the screen and nothing swims through it as the camera moves.
  vec2 css = gl_FragCoord.xy / uRenderPx, e2 = min(min(css, uCss - css), vec2(200.0));
  float edge = -14.0 * log(exp(-e2.x / 14.0) + exp(-e2.y / 14.0));
  float deckle = 1.0 - smoothstep(-8.0, 46.0, edge);
  col = wash(col, uDeckle, deckle * deckle * 0.34 + (1.0 - smoothstep(0.0, 2.5, edge)) * 0.12);

  // the storm grade (mirrors palette.ts stormGrade)
  float y = dot(col, vec3(0.2126, 0.7152, 0.0722)) / dot(SLATE, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, y * SLATE, ${STORM_GREY.toFixed(3)} * uStorm) * (1.0 - ${STORM_DIM.toFixed(3)} * uStorm);
  outColor = vec4(toDisplay(col), 1.0);
}
`;

const PRESENT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uCanvasPx;
layout(location = 0) out vec4 outColor;
void main() { outColor = texture(tSrc, gl_FragCoord.xy / uCanvasPx); }
`;

function pass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: FULLSCREEN_VERT, fragmentShader, uniforms,
    depthTest: false, depthWrite: false,
  });
}

function target(linear: boolean): THREE.WebGLRenderTarget {
  const filter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  return new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter,
    depthBuffer: false, generateMipmaps: false,
  });
}

/** What the last frame cost: read by the budget check (acceptance check 6) and the test hooks. */
export interface FrameStats {
  calls: number;
  triangles: number;
  renderScale: number;
  renderWidth: number;
  renderHeight: number;
  /** Registered textures, bytes on the GPU. */
  textureBytes: number;
  /** Render targets at their current size, bytes on the GPU. */
  targetBytes: number;
}

const MIN_STEP = 12, MAX_STEP = 20; // render scale in twentieths of the device resolution: 0.6–1.0
/** WP26 graphics quality, the player's choice (settings.quality): the dynamic resolution's floor and ceiling in twentieths
 * and the detail factor the flora and structure governors scale their reach by. Finest, the default, is the full controller. */
export const QUALITY = [
  { name: 'Swift', floor: MIN_STEP, ceiling: 15, detail: 0.6 },
  { name: 'Fine', floor: MIN_STEP, ceiling: 18, detail: 0.8 },
  { name: 'Finest', floor: MIN_STEP, ceiling: MAX_STEP, detail: 1 },
] as const;
export type QualityTier = (typeof QUALITY)[number];
const PROBE_SECONDS = 5; // after the first frame the scale climbs quickly to find what the GPU sustains

export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly style: Style;
  /** The interface scene, in CSS px with the origin at the top left; drawn over the frame at full resolution. */
  readonly ui = new THREE.Scene();
  readonly uiCamera = new THREE.OrthographicCamera(0, 1, 0, 1, -1000, 1000);
  /**
   * Ink rules for the world: silhouette and crease widths at full weight (CSS px), and the view distances (world
   * units) over which lines thin and lighten toward the horizon. The camera rig sets the distances per view.
   */
  readonly ink = { silhouette: 1.6, crease: 0.7, fadeStart: 60, fadeEnd: 520 };
  /** Storm strength over the frame, 0–1 (the storm grade). */
  storm = 0;
  readonly stats: FrameStats = {
    calls: 0, triangles: 0, renderScale: 1, renderWidth: 1, renderHeight: 1, textureBytes: 0, targetBytes: 0,
  };

  private readonly scene: THREE.WebGLRenderTarget;
  private readonly edges = target(true); // bilinear for the mask's corner taps; the composite fetches texels
  private readonly mask = target(false);
  private readonly inked = target(true);
  private readonly textures = new Map<string, number>();
  private readonly quad: THREE.Mesh;
  private readonly quadCamera = new THREE.Camera();
  private readonly edgePass: THREE.ShaderMaterial;
  private readonly maskPass: THREE.ShaderMaterial;
  private readonly compositePass: THREE.ShaderMaterial;
  private readonly presentPass: THREE.ShaderMaterial;
  private readonly auxClear = new Float32Array([0.5, 0.5, 0, 0]);
  private css = new THREE.Vector2(1, 1);
  private dpr = 1;

  // dynamic resolution from frame times (GPU timer queries on ANGLE/Metal read high, so they cannot steer it)
  private step = 16;
  private pinned: number | null = null;
  private clock = 0;
  private ceiling = MAX_STEP;
  /** WP26 the graphics quality in force (setQuality). */
  quality: QualityTier = QUALITY[2];
  private ceilingTime = 0;
  private calm = 0;
  private sinceRise = Infinity;
  private slow = 0;
  private hold = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.style = createStyle();
    for (const [name, t] of Object.entries(this.style.textures)) this.registerTexture(name, textureBytes(t));

    this.scene = new THREE.WebGLRenderTarget(1, 1, {
      count: 2, type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
      depthBuffer: true, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    });

    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(tri);
    this.quad.frustumCulled = false;

    const s = this.style.uniforms;
    this.edgePass = pass(EDGE_FRAG, {
      tAux: { value: this.scene.textures[1] }, tDepth: { value: this.scene.depthTexture }, tPaper: s.tPaper,
      uNearFar: { value: new THREE.Vector2() }, uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() },
      uLightView: { value: new THREE.Vector3() }, uFade: { value: new THREE.Vector2() }, uWidth: { value: new THREE.Vector2() },
      uPxAngle: { value: 0 }, uRenderPx: s.uRenderPx,
    });
    this.maskPass = pass(MASK_FRAG, { tEdge: { value: this.edges.texture } });
    const e = this.edgePass.uniforms;
    this.compositePass = pass(COMPOSITE_FRAG, {
      ...s, tColor: { value: this.scene.textures[0] }, tEdge: { value: this.edges.texture }, tMask: { value: this.mask.texture },
      uInkLin: s.uInk, uDeckle: { value: new THREE.Vector3().fromArray(transmittance(PIGMENTS.umber)) },
      uCss: { value: this.css }, uStorm: { value: 0 },
      tDepth: e.tDepth, tAux: e.tAux, uNearFar: e.uNearFar, uProjInv: e.uProjInv, uViewInv: e.uViewInv,
      uLightView: e.uLightView, uPxAngle: e.uPxAngle, uProj: { value: new THREE.Matrix4() },
    });
    this.presentPass = pass(PRESENT_FRAG, { tSrc: { value: this.inked.texture }, uCanvasPx: { value: new THREE.Vector2() } });
  }

  /** Record a texture's GPU size for the texture-memory budget. */
  registerTexture(name: string, bytes: number): void {
    this.textures.set(name, bytes);
    this.stats.textureBytes = [...this.textures.values()].reduce((a, b) => a + b, 0);
  }

  /** Size the canvas: CSS px and device pixel ratio. */
  setSize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.css.set(cssWidth, cssHeight);
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.uiCamera.right = cssWidth;
    this.uiCamera.bottom = cssHeight;
    this.uiCamera.updateProjectionMatrix();
    this.resizeTargets();
  }

  /** Hold the render scale (captures and tests use 1), or release it to the dynamic controller with null. */
  pinScale(scale: number | null): void {
    this.pinned = scale;
    this.resizeTargets();
  }

  get renderScale(): number {
    return this.pinned ?? this.step / MAX_STEP;
  }

  /** WP26 a graphics quality tier: the controller works within its range, stepping down into it a frame at a time. */
  setQuality(tier: number): void {
    this.quality = QUALITY[Math.max(0, Math.min(QUALITY.length - 1, Math.round(tier)))]!;
  }

  /** Draw one frame. dt: seconds since the last frame (drives the dynamic resolution). */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, dt: number): void {
    const r = this.renderer;
    r.info.reset();
    if (this.pinned === null) this.adapt(dt);
    const w = this.scene.width, h = this.scene.height;

    // 1. scene
    r.setRenderTarget(this.scene);
    r.setClearColor(0xffffff, 1);
    r.clear(true, true, false);
    const gl = r.getContext() as WebGL2RenderingContext;
    gl.clearBufferfv(gl.COLOR, 1, this.auxClear); // aux: a flat normal, ink id 0 (nothing), no ink
    r.render(scene, camera);

    // 2. edges
    const e = this.edgePass.uniforms;
    e.uNearFar.value.set(camera.near, camera.far);
    e.uProjInv.value.copy(camera.projectionMatrixInverse);
    e.uViewInv.value.copy(camera.matrixWorld);
    e.uLightView.value.copy(this.style.uniforms.uSun.value).transformDirection(camera.matrixWorldInverse);
    e.uFade.value.set(this.ink.fadeStart, this.ink.fadeEnd);
    const renderPx = this.dpr * this.renderScale;
    e.uWidth.value.set(this.ink.silhouette * renderPx, this.ink.crease * renderPx);
    e.uPxAngle.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / (h * camera.zoom);
    this.draw(this.edgePass, this.edges);
    this.draw(this.maskPass, this.mask);

    // 3. composite, 4. present
    this.compositePass.uniforms.uStorm.value = this.storm;
    this.compositePass.uniforms.uProj.value.copy(camera.projectionMatrix);
    if (this.renderScale === 1) this.draw(this.compositePass, null);
    else {
      this.draw(this.compositePass, this.inked);
      this.presentPass.uniforms.uCanvasPx.value.set(this.css.x * this.dpr, this.css.y * this.dpr);
      this.draw(this.presentPass, null);
    }

    // 5. interface
    r.setRenderTarget(null);
    r.render(this.ui, this.uiCamera);

    const st = this.stats;
    st.calls = r.info.render.calls;
    st.triangles = r.info.render.triangles;
    st.renderScale = this.renderScale;
    st.renderWidth = w;
    st.renderHeight = h;
  }

  private draw(material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(to);
    this.renderer.render(this.quad, this.quadCamera);
  }

  private resizeTargets(): void {
    const s = this.renderScale;
    const w = Math.max(1, Math.round(this.css.x * this.dpr * s)), h = Math.max(1, Math.round(this.css.y * this.dpr * s));
    this.scene.setSize(w, h);
    this.edges.setSize(w, h);
    this.mask.setSize(Math.ceil(w / MASK_BLOCK), Math.ceil(h / MASK_BLOCK));
    if (s === 1) this.inked.setSize(1, 1);
    else this.inked.setSize(w, h);
    this.style.uniforms.uRenderPx.value = this.dpr * s;
    // colour + aux + 32-bit depth, the edge target, the mask, and the upscaled frame when the scale is below 1
    this.stats.targetBytes = w * h * (4 + 4 + 4 + 4) + (this.inked.width * this.inked.height + this.mask.width * this.mask.height) * 4;
  }

  // Dynamic resolution in 5 % steps, from frame times alone. Two slow frames within about half a second drop a
  // step at once; the scale rises a step only after 10 s without a slow frame, and a scale that failed soon after a
  // rise stays barred for a minute. In the first seconds it rises every half second of calm to find what the GPU
  // sustains. Long frames are stalls (uploads, garbage collection) a lower resolution would not cure: ignored.
  private adapt(dt: number): void {
    this.clock += dt;
    this.hold -= dt;
    if (dt >= 1 / 25) this.hold = Math.max(this.hold, 0.4);
    this.slow = this.slow * Math.exp(-dt / 0.5) + (dt > 1 / 50 && this.hold <= 0 ? 1 : 0);
    this.calm = this.slow > 0.5 ? 0 : this.calm + dt;
    this.sinceRise += dt;
    this.ceilingTime -= dt;
    if (this.ceilingTime <= 0) this.ceiling = this.quality.ceiling;
    let next = this.step;
    if (this.step > this.quality.ceiling) {
      next = this.step - 1; // a lower quality was chosen: down into its range
    } else if (this.slow > 1.8 && this.step > this.quality.floor && this.hold <= 0) {
      next = this.step - 1;
      this.ceiling = next;
      this.ceilingTime = this.sinceRise < 8 && this.clock > PROBE_SECONDS ? 60 : 15;
      this.hold = 0.3;
    } else if (this.calm > (this.clock < PROBE_SECONDS ? 0.5 : 10) && this.step < Math.min(this.ceiling, this.quality.ceiling)) {
      next = this.step + 1;
      this.sinceRise = 0;
    }
    if (next === this.step) return;
    this.step = next;
    this.slow = 0;
    this.calm = 0;
    this.resizeTargets();
  }
}

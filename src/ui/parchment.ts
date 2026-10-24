// The interface's share of the style: the parchment, ink and wash primitives every screen and the HUD are drawn with.
// Each is a mesh for the pipeline's `ui` scene (CSS px, origin top left), shaded by the one style module: the same
// parchment fibres, ink and pigment washes as the world, anchored to the scrap itself.
//
//   Scrap          a torn piece of parchment with a darker deckled edge, optional ruled ink frame, lifted off the
//                  page by a soft wash shadow; panels, cards, the hull bar's ground.
//   ButtonBase     a round parchment medallion ringed in ink with an engraved bevel, a pressed and a disabled state,
//                  and a pigment wash that sweeps round it (cooldowns, the gull's flight, a chest's tier).
//   ThreatVignette a dark ink wash that bleeds in from the frame edge a threat is coming from.
import * as THREE from 'three';
import { STYLE_GLSL, linearVec, transmittanceVec, type Style } from '../style/glsl.ts';
import { PIGMENTS, type RGB } from '../style/palette.ts';

const UI_VERT = /* glsl */ `
out vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Shared by the interface shaders: parchment at a fixed size in scrap-local CSS px, ink lines, and the output.
const UI_GLSL = /* glsl */ `
in vec2 vLocal;
layout(location = 0) out vec4 outColor;
uniform float uSeed;
const vec3 DECKLE_T = ${vec3Of(PIGMENTS.umber)};
const vec3 SHADOW = ${vec3Of(PIGMENTS.sepia, true)};

// parchment fibres and mottle, R fibre, G grain, B mottle, A bloom, at a steady CSS size
vec4 uiPaper(vec2 p) { return texture(tPaper, p / ${(280).toFixed(1)} + uSeed * 0.137); }
vec3 uiParchment(vec2 p, float age) {
  vec4 g = uiPaper(p);
  vec3 c = uPaper * (1.0 + (g.r - 0.5) * 0.16 + (g.b - 0.5) * 0.12);
  c = wash(c, STAIN_T, texture(tMarks, p / 520.0 + uSeed * 0.31).g * (0.25 + age));
  return wash(c, DECKLE_T, age * 0.35);
}
// fibrous tear depth along an edge (CSS px): a long wander and short fibres
float tear(float s, float side) {
  vec2 q = vec2(s, side * 37.0 + uSeed * 13.0);
  return textureLod(tPaper, q / vec2(260.0, 400.0), 0.0).a * 7.0 + textureLod(tPaper, q / vec2(18.0, 300.0), 0.0).r * 3.0;
}
// coverage of an ink line of half-width hw (CSS px) at distance d, anti-aliased over aa
float inkLine(float d, float hw, float aa) { return clamp((hw - abs(d)) / aa + 0.5, 0.0, 1.0); }
// paint over a wash shadow: premultiplied in, straight alpha out
void writeUi(vec3 colour, float cover, float shadow) {
  float a = cover + (1.0 - cover) * shadow;
  vec3 c = (colour * cover + SHADOW * shadow * (1.0 - cover)) / max(a, 1e-4);
  outColor = vec4(toDisplay(c), a);
}
`;

/** GLSL literal of a pigment's wash transmittance, or (linear) of the colour itself. */
function vec3Of(c: RGB, linear = false): string {
  const v = linear ? linearVec(c) : transmittanceVec(c);
  return `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
}

let nextSeed = 0;

function uiMaterial(style: Style, fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: UI_VERT,
    fragmentShader: STYLE_GLSL + UI_GLSL + fragmentShader,
    uniforms: { ...style.uniforms, uSeed: { value: (nextSeed++ * 23.17) % 89 }, ...uniforms },
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------------------------------------------

const SCRAP_FRAG = /* glsl */ `
uniform vec2 uSize;
uniform vec4 uTorn;      // tear depth of the top, right, bottom and left edges, 0 (cut) – 1 (torn)
uniform float uFrame;    // 0 none, 1 a single rule, 2 a double rule (heavy outer, fine inner)
uniform float uAge;
uniform vec2 uShadow;    // shadow offset, CSS px
void main() {
  vec2 p = vLocal, hs = uSize * 0.5;
  float aa = max(fwidth(p.x), 1e-3);
  // distance inside each edge, the torn ones bitten by fibrous tears and every one a little hand-cut
  vec4 bite = vec4(tear(p.x, 0.0), tear(p.y, 1.0), tear(p.x, 2.0), tear(p.y, 3.0)) * uTorn
            + vec4(tear(p.x * 0.3, 4.0), tear(p.y * 0.3, 5.0), tear(p.x * 0.3, 6.0), tear(p.y * 0.3, 7.0)) * 0.12;
  vec4 inside = vec4(p.y + hs.y, hs.x - p.x, hs.y - p.y, p.x + hs.x) - bite;
  float d = min(min(inside.x, inside.y), min(inside.z, inside.w));
  float cover = clamp(d / aa + 0.5, 0.0, 1.0);
  vec2 ps = p - uShadow;
  vec4 si = vec4(ps.y + hs.y, hs.x - ps.x, hs.y - ps.y, ps.x + hs.x) - bite;
  float shadow = 0.3 * smoothstep(-5.0, 3.0, min(min(si.x, si.y), min(si.z, si.w)));

  vec3 col = uiParchment(p, uAge);
  vec4 g = uiPaper(p * 3.1);
  // the deckle: darker toward the edge, deeper along tears; a pale fringe of torn fibres right at a torn edge
  float tornness = dot(uTorn, vec4(inside.x <= d + 0.01, inside.y <= d + 0.01, inside.z <= d + 0.01, inside.w <= d + 0.01));
  col = wash(col, DECKLE_T, (1.0 - smoothstep(0.0, 9.0 + 9.0 * g.a, d)) * (0.55 + 0.5 * tornness));
  col = mix(col, uPaper * 1.04, (1.0 - smoothstep(0.4, 1.8 + 1.2 * g.r, d)) * tornness * 0.8);

  if (uFrame > 0.0) {
    // ruled by hand: the rules overshoot at the corners where the pen crossed, and wander a little
    vec2 q = abs(p), wob = vec2(uiPaper(p.yx * 0.2).a, uiPaper(p * 0.2).a) - 0.5;
    float ink = 0.0;
    for (int k = 0; k < 2; k++) {
      if (k == 1 && uFrame < 2.0) break;
      float inset = k == 0 ? 9.0 : 13.5, hw = k == 0 ? (uFrame > 1.0 ? 0.95 : 0.7) : 0.42;
      vec2 r = hs - inset;
      float h = inkLine(q.y - r.y + wob.x * 0.8, hw, aa) * step(q.x, r.x + 3.5);
      float v = inkLine(q.x - r.x + wob.y * 0.8, hw, aa) * step(q.y, r.y + 3.5);
      ink = max(ink, max(h, v) * (0.82 + 0.3 * g.g));
    }
    col = mix(col, uInk, clamp(ink, 0.0, 1.0));
  }
  writeUi(col, cover, shadow);
}
`;

export interface ScrapOptions {
  width: number;
  height: number;
  /** Tear depth of the top, right, bottom and left edges, 0 (cut) – 1 (torn). */
  torn?: readonly [number, number, number, number];
  frame?: 'none' | 'rule' | 'double';
  /** How old and foxed the parchment looks, 0–1. */
  age?: number;
}

const SCRAP_MARGIN = 16; // CSS px of quad beyond the scrap for its shadow

/** A torn parchment scrap, centred on its position. */
export class Scrap extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  constructor(style: Style, o: ScrapOptions) {
    super(
      new THREE.PlaneGeometry(o.width + SCRAP_MARGIN * 2, o.height + SCRAP_MARGIN * 2),
      uiMaterial(style, SCRAP_FRAG, {
        uSize: { value: new THREE.Vector2(o.width, o.height) },
        uTorn: { value: new THREE.Vector4(...(o.torn ?? [0.4, 0.4, 0.4, 0.4])) },
        uFrame: { value: { none: 0, rule: 1, double: 2 }[o.frame ?? 'none'] },
        uAge: { value: o.age ?? 0.2 },
        uShadow: { value: new THREE.Vector2(3, 4) },
      }),
    );
  }
}

// ---------------------------------------------------------------------------------------------------------------

const BUTTON_FRAG = /* glsl */ `
uniform float uRadius;
uniform float uPressed;   // 0–1
uniform float uDisabled;  // 0–1
uniform float uFill;      // 0–1 of the sweep, clockwise from twelve o'clock
uniform vec3 uFillT;      // transmittance of the sweep's pigment
void main() {
  vec2 p = vLocal;
  float aa = max(fwidth(p.x), 1e-3);
  float r = length(p), ang = atan(p.x, -p.y);                       // 0 at twelve o'clock, clockwise (y down)
  float rr = uRadius * (1.0 + 0.012 * (textureLod(tPaper, vec2(ang * 0.6, uSeed), 0.0).a - 0.5) - 0.04 * uPressed);
  float d = rr - r;
  float cover = clamp(d / aa + 0.5, 0.0, 1.0);
  float shadow = 0.3 * smoothstep(-5.0, 3.0, rr - length(p - vec2(2.5, 3.5)));

  vec3 col = uiParchment(p, 0.15);
  vec4 g = uiPaper(p * 3.1);
  col = wash(col, DECKLE_T, (1.0 - smoothstep(0.0, 4.0 + 4.0 * g.a, d)) * 0.7);
  float inner = uRadius - 7.5;

  // the sweep: a pigment wash pooled darker at its wet edges
  float sweep = uFill * 6.2831853, a = mod(ang, 6.2831853);
  float wet = min(min(a, sweep - a) * r, inner - r);
  if (uFill > 0.0 && wet > 0.0) {
    float edge = 1.0 - smoothstep(0.0, 3.5 + 2.0 * g.a, wet);
    col = wash(col, uFillT, 0.85 * (1.0 + (g.g - 0.5) * 0.8) + edge * 0.6);
  }

  // engraved bevel: short radial strokes on the shaded side of the ring band, which flips when pressed
  vec2 light = normalize(mix(vec2(-0.6, -0.8), vec2(0.6, 0.8), uPressed));
  float shade = smoothstep(0.1, 0.9, dot(normalize(p + 1e-4), -light));
  float band = step(inner + 1.2, r) * step(r, uRadius - 3.4);
  float count = floor(6.2831853 * (uRadius - 5.0) / 3.2);              // strokes about 3 CSS px apart
  float across = (fract(ang / 6.2831853 * count) - 0.5) * 6.2831853 * r / count;
  float bevel = band * smoothstep(0.15, 0.6, shade) * inkLine(across, 0.25 + 0.3 * shade, aa);

  float rings = max(inkLine(r - (uRadius - 2.6), 1.0 + 0.25 * g.r, aa), inkLine(r - inner, 0.45, aa));
  float ink = max(rings, bevel * 0.85) * (0.85 + 0.25 * g.g) * (1.0 - 0.45 * uDisabled);
  col = mix(col, uInk, ink);
  col = mix(col, uPaper * 0.97, uDisabled * 0.35);
  col = wash(col, DECKLE_T, uPressed * 0.25);
  writeUi(col, cover, shadow * (1.0 - uPressed * 0.6));
}
`;

const BUTTON_MARGIN = 8;

/** A round parchment button base, centred on its position, radius in CSS px. */
export class ButtonBase extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  constructor(style: Style, radius: number) {
    super(
      new THREE.PlaneGeometry((radius + BUTTON_MARGIN) * 2, (radius + BUTTON_MARGIN) * 2),
      uiMaterial(style, BUTTON_FRAG, {
        uRadius: { value: radius },
        uPressed: { value: 0 },
        uDisabled: { value: 0 },
        uFill: { value: 0 },
        uFillT: { value: transmittanceVec(PIGMENTS.ultramarine) },
      }),
    );
  }

  /** Pressed (0–1): the bevel flips to the sunken side and the medallion settles onto the page. */
  set pressed(v: number) {
    this.material.uniforms.uPressed.value = v;
  }

  set disabled(v: number) {
    this.material.uniforms.uDisabled.value = v;
  }

  /** A pigment wash sweeping clockwise from twelve o'clock over `amount` (0–1) of the face. */
  sweep(amount: number, pigment: RGB): void {
    this.material.uniforms.uFill.value = amount;
    this.material.uniforms.uFillT.value = transmittanceVec(pigment);
  }
}

// ---------------------------------------------------------------------------------------------------------------

const VIGNETTE_FRAG = /* glsl */ `
uniform vec2 uView;       // frame size, CSS px
uniform vec2 uFrom;       // unit direction (screen, y down) the threat is coming from
uniform float uStrength;  // 0–1
const vec3 WASH_T = ${vec3Of(PIGMENTS.indigo)};
void main() {
  vec2 p = vLocal, c = uView * 0.5;
  // distance from the frame edge, travelling toward the threat, and how squarely this part of the frame faces it
  vec2 f = max(uFrom * vec2(-1.0, -1.0), vec2(1e-3)), b = max(uFrom, vec2(1e-3));
  float dist = min(min(p.x / f.x, (uView.x - p.x) / b.x), min(p.y / f.y, (uView.y - p.y) / b.y));
  float facing = smoothstep(-0.2, 0.9, dot(normalize(p - c), uFrom));
  vec4 g = texture(tPaper, p / 140.0);
  float span = 0.2 * min(uView.x, uView.y) * (0.92 + 0.16 * g.r);
  float depth = dist / span;                                           // 0 at the frame, 1 where the ink gives out
  float a = uStrength * facing * pow(1.0 - smoothstep(0.0, 1.0, depth), 1.8) * (0.9 + 0.25 * (g.g - 0.5));
  outColor = vec4(toDisplay(wash(uPaper, WASH_T, 3.2)), min(a, 0.92));
}
`;

/** The frame-edge ink vignette that warns of a threat; it covers only a band round the frame. */
export class ThreatVignette extends THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  constructor(style: Style) {
    super(new THREE.BufferGeometry(), uiMaterial(style, VIGNETTE_FRAG, {
      uView: { value: new THREE.Vector2(1, 1) },
      uFrom: { value: new THREE.Vector2(1, 0) },
      uStrength: { value: 0 },
    }));
    this.frustumCulled = false;
  }

  /** Fit the frame (CSS px): a ring of quads between the frame and an inset a quarter of its short side deep. */
  setView(width: number, height: number): void {
    this.material.uniforms.uView.value.set(width, height);
    const i = 0.25 * Math.min(width, height);
    const o = [0, 0, width, 0, width, height, 0, height], n = [i, i, width - i, i, width - i, height - i, i, height - i];
    const pos: number[] = [];
    for (let k = 0; k < 4; k++) {
      const a = k * 2, b = ((k + 1) % 4) * 2;
      pos.push(o[a], o[a + 1], 0, o[b], o[b + 1], 0, n[b], n[b + 1], 0, o[a], o[a + 1], 0, n[b], n[b + 1], 0, n[a], n[a + 1], 0);
    }
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }

  /** The threat's bearing on screen (radians, 0 = right, π/2 = down) and how near it is (0–1). */
  set(angle: number, strength: number): void {
    this.material.uniforms.uFrom.value.set(Math.cos(angle), Math.sin(angle));
    this.material.uniforms.uStrength.value = strength;
    this.visible = strength > 0;
  }
}

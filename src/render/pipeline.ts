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
//   3. Ink composite: every pixel gathers the line elements within INK_REACH pixels into an anti-aliased coverage and
//      lays iron-gall ink over the colour (veils such as fog hide it), adds the deckle — the darker, torn tone at the
//      frame's edge, the only screen-anchored mark — and the storm grade. Straight to the canvas at render scale 1,
//      else into a target that a bilinear pass lifts to the canvas.
//   4. Interface: `ui`, an orthographic scene in CSS px (origin top left), drawn over the canvas at full resolution.
// No MSAA: lines carry their own coverage. 8-bit colour targets (iOS has no float32 colour buffers; nothing here
// needs more than 8 bits).
import * as THREE from 'three';
import { createStyle, COLOUR_GLSL, type Style } from '../style/glsl.ts';
import { textureBytes } from '../style/textures.ts';
import { PIGMENTS, STORM_DIM, STORM_GREY, STORM_SLATE, toLinear, transmittance } from '../style/palette.ts';

/** Pixels around each pixel the composite searches for line elements; line half-widths are clamped to fit. */
const INK_REACH = 3;

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
  float width = isSilhouette ? uWidth.x * (0.42 + 1.05 * shadowSide) * mix(1.0, 0.32, fade)
                             : uWidth.y * crease * mix(1.0, 0.55, fade);
  float halfWidth = min(0.5 * width * pressure, ${(INK_REACH - 1.15).toFixed(2)});
  float darkness = (isSilhouette ? 1.0 : 0.82) * mix(1.0, 0.42, fade) * min(weight, 1.0);
  float offset = 0.5 + (isSilhouette ? (wander - 0.5) * 1.1 : 0.0); // centred on the boundary, then wandering
  outEdge = vec4(darkness, halfWidth / 4.0, atan(dir.y, dir.x) / 6.2831853 + 0.5, (offset + 2.0) / 4.0);
}
`;

const SLATE = toLinear(STORM_SLATE);
const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tEdge;
uniform sampler2D tPaper;
uniform vec3 uInkLin;
uniform vec3 uDeckle;
uniform vec2 uCss;       // frame size, CSS px
uniform float uRenderPx;
uniform float uStorm;
layout(location = 0) out vec4 outColor;
${COLOUR_GLSL}
const vec3 SLATE = vec3(${SLATE.map((x) => x.toFixed(5)).join(', ')});

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy), last = textureSize(tColor, 0) - 1;
  vec4 c = texelFetch(tColor, px, 0);
  vec3 col = toLinear(c.rgb);

  float cover = 0.0;
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
  col = mix(col, uInkLin, cover * c.a);

  // the deckle: darker, torn parchment tone at the frame's edge
  vec2 css = gl_FragCoord.xy / uRenderPx;
  float edge = min(min(css.x, uCss.x - css.x), min(css.y, uCss.y - css.y));
  float tear = textureLod(tPaper, css / 1100.0, 0.0).a + 0.3 * textureLod(tPaper, css / 160.0, 0.0).r;
  float t = edge - (tear - 0.62) * 18.0;
  float deckle = 1.0 - smoothstep(0.0, 30.0, t);
  col = wash(col, uDeckle, deckle * deckle * 0.32 + (1.0 - smoothstep(0.0, 3.0, t)) * 0.22);

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
  readonly ink = { silhouette: 1.4, crease: 0.65, fadeStart: 60, fadeEnd: 520 };
  /** Storm strength over the frame, 0–1 (the storm grade). */
  storm = 0;
  readonly stats: FrameStats = {
    calls: 0, triangles: 0, renderScale: 1, renderWidth: 1, renderHeight: 1, textureBytes: 0, targetBytes: 0,
  };

  private readonly scene: THREE.WebGLRenderTarget;
  private readonly edges = target(false);
  private readonly inked = target(true);
  private readonly textures = new Map<string, number>();
  private readonly quad: THREE.Mesh;
  private readonly quadCamera = new THREE.Camera();
  private readonly edgePass: THREE.ShaderMaterial;
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
    this.compositePass = pass(COMPOSITE_FRAG, {
      tColor: { value: this.scene.textures[0] }, tEdge: { value: this.edges.texture }, tPaper: s.tPaper,
      uInkLin: s.uInk, uDeckle: { value: new THREE.Vector3().fromArray(transmittance(PIGMENTS.umber)) },
      uCss: { value: this.css }, uRenderPx: s.uRenderPx, uStorm: { value: 0 },
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

    // 3. composite, 4. present
    this.compositePass.uniforms.uStorm.value = this.storm;
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
    if (s === 1) this.inked.setSize(1, 1);
    else this.inked.setSize(w, h);
    this.style.uniforms.uRenderPx.value = this.dpr * s;
    // colour + aux + 32-bit depth, the edge target, and the upscaled frame when the scale is below 1
    this.stats.targetBytes = w * h * (4 + 4 + 4 + 4) + this.inked.width * this.inked.height * 4;
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
    if (this.ceilingTime <= 0) this.ceiling = MAX_STEP;
    let next = this.step;
    if (this.slow > 1.8 && this.step > MIN_STEP && this.hold <= 0) {
      next = this.step - 1;
      this.ceiling = next;
      this.ceilingTime = this.sinceRise < 8 && this.clock > PROBE_SECONDS ? 60 : 15;
      this.hold = 0.3;
    } else if (this.calm > (this.clock < PROBE_SECONDS ? 0.5 : 10) && this.step < this.ceiling) {
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

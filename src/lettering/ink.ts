// The lettering on screen: text rasters (src/lettering/text.ts) as textures, inked on the parchment with the style's
// iron-gall ink, a pigment or gold leaf, bleeding a little into the paper's fibres and revealed stroke by stroke.
//
//   const lettering = new Lettering(pipeline.style, devicePixelRatio, (b) => pipeline.registerTexture('lettering', b));
//   const name = lettering.text('Saetta', { size: 18, align: 'center', valign: 'middle' });
//   pipeline.ui.add(name); name.position.set(x, y, 0);
//   name.text = 'Lanza';            // re-set only when it changes; repeated texts come from the cache
//   title.progress = t / title.duration;   // the stroke-by-stroke lettering-in
//
// Each distinct text (with its layout options, at the current pixel ratio) is written once and kept while any mesh
// shows it; unused rasters stay cached up to CACHE_BYTES, so counters that cycle through values never rewrite them.
import * as THREE from 'three';
import { linearVec, type Style } from '../style/glsl.ts';
import { PIGMENTS, type PigmentName } from '../style/palette.ts';
import { uiMaterial } from '../ui/parchment.ts';
import { layoutText, rasterizeText, type TextLayout, type TextOptions, type TextRaster } from './text.ts';

/** Bytes of unused text rasters kept for reuse. */
export const CACHE_BYTES = 6 * 1024 * 1024;

const vec3 = (v: THREE.Vector3) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

/**
 * Iron-gall lettering on parchment, for any material that samples a text raster (the interface below, the chart's
 * names). t: the raster texel (r coverage, g coverage bled into the paper, b writing time 0–1, a ink load); fibre: the
 * parchment there (tPaper: r fibre, g grain, b mottle, a bloom); progress: how much is written, 0–1; wetSpan: how
 * long ink stays wet, as a fraction of the writing time; detail: 0 for small interface text (solid and clean) to 1 at
 * display sizes (bleed along the fibres, pooling at the edges, the grain showing through thin ink).
 * letterInk returns the ink's cover and wetness; letterInkColour the ink's linear colour.
 */
export const LETTERING_GLSL = /* glsl */ `
const vec3 THIN_INK = ${vec3(linearVec(PIGMENTS.sepia))};
vec2 letterInk(vec4 t, vec4 fibre, float progress, float wetSpan, float detail) {
  const float FRONT = 1.5 / 255.0;
  float since = progress * (1.0 + FRONT) - t.b;
  float shown = smoothstep(0.0, FRONT, since);
  float wet = shown * (1.0 - smoothstep(0.0, wetSpan, since));
  float pool = clamp((t.r - t.g) * 2.5, 0.0, 1.0);
  float wick = smoothstep(0.42, 0.8, fibre.r) * (0.5 + 0.5 * fibre.a);
  float body = 0.92 + 0.08 * t.a - detail * (0.16 * (1.0 - t.a) + 0.12 * smoothstep(0.55, 0.8, fibre.g) * (1.0 - pool));
  float cover = t.r * clamp(body + detail * 0.1 * pool + 0.1 * wet, 0.0, 1.0)
              + max(t.g - t.r, 0.0) * wick * (0.2 + 0.45 * detail) * (1.0 + wet);
  return vec2(clamp(cover, 0.0, 1.0) * shown, wet);
}
vec3 letterInkColour(vec4 t, float wet) {
  float dark = clamp(0.45 + 0.55 * t.a + 0.3 * clamp((t.r - t.g) * 2.5, 0.0, 1.0) + 0.4 * wet, 0.0, 1.0);
  return mix(THIN_INK, uInk, dark) * (1.0 - 0.25 * wet);
}
`;

const TEXT_FRAG = /* glsl */ `
uniform sampler2D tText;
uniform vec4 uRect;       // the raster's left, top, width and height, CSS px
uniform float uProgress;
uniform float uWetSpan;
uniform float uDetail;
uniform float uOpacity;
uniform float uMode;      // 0 ink, 1 a pigment, 2 gold leaf
uniform vec3 uColour;     // linear, the pigment
${LETTERING_GLSL}
void main() {
  vec4 t = texture(tText, (vLocal - uRect.xy) / uRect.zw);
  vec2 ink = letterInk(t, uiPaper(vLocal * 3.1), uProgress, uWetSpan, uDetail);
  vec3 col = uMode < 0.5 ? letterInkColour(t, ink.y)
           : uMode < 1.5 ? uColour * (1.1 - 0.2 * t.a)
           : goldLeaf(vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, 1.0), vec3(0.0, -1.0, 0.0), vec3(vLocal * 0.02, 0.0), vec3(0.0, 0.0, 1.0));
  writeUi(col, ink.x * uOpacity, 0.0);
}
`;

export interface InkTextOptions extends TextOptions {
  /** The style's ink (default), a pigment laid as body colour, or burnished gold leaf. */
  pigment?: 'ink' | PigmentName;
  /** How much has been written, 0–1. */
  progress?: number;
  opacity?: number;
}

interface Entry {
  readonly key: string;
  readonly layout: TextLayout;
  readonly raster: TextRaster;
  readonly texture: THREE.DataTexture;
  readonly geometry: THREE.PlaneGeometry;
  users: number;
  used: number;
}

/** The lettering of every screen: writes texts once and shares them between meshes. */
export class Lettering {
  readonly style: Style;
  private ratio: number;
  private readonly onBytes: (bytes: number) => void;
  private readonly entries = new Map<string, Entry>();
  private readonly live = new Set<InkText>();
  private clock = 0;

  /** `onBytes` hears the GPU bytes held by text rasters whenever they change (the texture budget). */
  constructor(style: Style, pixelRatio: number, onBytes: (bytes: number) => void = () => {}) {
    this.style = style;
    this.ratio = pixelRatio;
    this.onBytes = onBytes;
  }

  get pixelRatio(): number { return this.ratio; }

  /** Bytes of text rasters held, in use and cached. */
  get bytes(): number {
    let b = 0;
    for (const e of this.entries.values()) b += e.raster.data.byteLength;
    return b;
  }

  /** A mesh for the `ui` scene lettering `content`; its position is the anchor (see TextOptions align and valign). */
  text(content: string, options: InkTextOptions): InkText {
    return new InkText(this, content, options);
  }

  /** Rewrites every live text for a new device pixel ratio. */
  setPixelRatio(ratio: number): void {
    if (ratio === this.ratio) return;
    this.ratio = ratio;
    for (const t of this.live) t.rewrite();
  }

  /** The written text for content and options (InkText's use). */
  acquire(content: string, o: TextOptions, user: InkText): Entry {
    this.live.add(user);
    const key = JSON.stringify([content, o.size, o.align, o.valign, o.maxWidth, o.lineHeight, o.swash, this.ratio]);
    let e = this.entries.get(key);
    if (!e) {
      const layout = layoutText(content, o), raster = rasterizeText(layout, this.ratio);
      const texture = new THREE.DataTexture(raster.data, raster.width, raster.height, THREE.RGBAFormat);
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      const w = raster.width / this.ratio, h = raster.height / this.ratio;
      const geometry = new THREE.PlaneGeometry(w, h).translate(raster.left + w / 2, raster.top + h / 2, 0);
      e = { key, layout, raster, texture, geometry, users: 0, used: 0 };
      this.entries.set(key, e);
      e.users++;
      this.evict();
      this.onBytes(this.bytes);
    } else e.users++;
    e.used = ++this.clock;
    return e;
  }

  /** Lets go of a written text (InkText's use); `dead` when the mesh is disposed. */
  release(e: Entry, user: InkText, dead: boolean): void {
    e.users--;
    if (dead) this.live.delete(user);
    this.evict();
  }

  private evict(): void {
    const idle = [...this.entries.values()].filter((e) => e.users === 0).sort((a, b) => a.used - b.used);
    let held = idle.reduce((b, e) => b + e.raster.data.byteLength, 0);
    let freed = false;
    for (const e of idle) {
      if (held <= CACHE_BYTES) break;
      held -= e.raster.data.byteLength;
      e.texture.dispose();
      e.geometry.dispose();
      this.entries.delete(e.key);
      freed = true;
    }
    if (freed) this.onBytes(this.bytes);
  }
}

/** Lettering in the `ui` scene (CSS px). Set `text`, `progress` and `opacity` freely; only new texts are written. */
export class InkText extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  private readonly lettering: Lettering;
  private readonly options: TextOptions;
  private content: string;
  private entry: Entry;

  constructor(lettering: Lettering, content: string, o: InkTextOptions) {
    const pigment = o.pigment ?? 'ink';
    const material = uiMaterial(lettering.style, TEXT_FRAG, {
      tText: { value: null },
      uRect: { value: new THREE.Vector4() },
      uProgress: { value: o.progress ?? 1 },
      uWetSpan: { value: 0.1 },
      uDetail: { value: 0 },
      uOpacity: { value: o.opacity ?? 1 },
      uMode: { value: pigment === 'ink' ? 0 : pigment === 'goldLeaf' ? 2 : 1 },
      uColour: { value: linearVec(pigment === 'ink' ? PIGMENTS.ironGall : PIGMENTS[pigment]) },
    });
    super(undefined, material);
    this.lettering = lettering;
    this.options = { size: o.size, align: o.align, valign: o.valign, maxWidth: o.maxWidth, lineHeight: o.lineHeight, swash: o.swash };
    this.content = content;
    this.entry = this.show(lettering.acquire(content, this.options, this));
  }

  get text(): string { return this.content; }
  set text(content: string) {
    if (content === this.content) return;
    this.content = content;
    this.rewrite();
  }

  /** Lines, advance box and stroke timing of what is shown, CSS px. */
  get layout(): TextLayout { return this.entry.layout; }
  /** Seconds to write it at the pen's pace. */
  get duration(): number { return this.entry.layout.duration; }

  get progress(): number { return this.material.uniforms.uProgress.value; }
  set progress(p: number) { this.material.uniforms.uProgress.value = Math.min(1, Math.max(0, p)); }

  get opacity(): number { return this.material.uniforms.uOpacity.value; }
  set opacity(a: number) { this.material.uniforms.uOpacity.value = a; }

  /** Writes the current text at the lettering's pixel ratio (after a text or pixel-ratio change). */
  rewrite(): void {
    const next = this.lettering.acquire(this.content, this.options, this);
    this.lettering.release(this.entry, this, false);
    this.entry = this.show(next);
  }

  /** Releases the text and the material; the mesh must already be out of the scene. */
  dispose(): void {
    this.lettering.release(this.entry, this, true);
    this.material.dispose();
  }

  private show(e: Entry): Entry {
    const u = this.material.uniforms, r = e.raster;
    this.geometry = e.geometry;
    u.tText.value = e.texture;
    u.uRect.value.set(r.left, r.top, r.width / r.pixelRatio, r.height / r.pixelRatio);
    u.uDetail.value = Math.min(1, Math.max(0, (r.nib - 3) / 10));
    u.uWetSpan.value = Math.min(0.25, 0.6 / Math.max(e.layout.duration, 0.1));
    return e;
  }
}

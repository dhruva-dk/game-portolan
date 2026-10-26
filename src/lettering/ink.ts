import * as THREE from 'three';
import { linearVec, type Style } from '../style/glsl.ts';
import { PIGMENTS, type PigmentName } from '../style/palette.ts';
import { uiMaterial } from '../ui/parchment.ts';
import { layoutText, rasterizeText, type TextLayout, type TextOptions, type TextRaster } from './text.ts';

export const CACHE_BYTES = 6 * 1024 * 1024;

const vec3 = (v: THREE.Vector3) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

export const LETTERING_GLSL =  `
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

const TEXT_FRAG =  `
uniform sampler2D tText;
uniform vec4 uRect;
uniform float uProgress;
uniform float uWetSpan;
uniform float uDetail;
uniform float uOpacity;
uniform float uMode;
uniform vec3 uColour;
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
  pigment?: 'ink' | PigmentName;
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

export class Lettering {
  readonly style: Style;
  private ratio: number;
  private readonly onBytes: (bytes: number) => void;
  private readonly entries = new Map<string, Entry>();
  private readonly live = new Set<InkText>();
  private clock = 0;

  constructor(style: Style, pixelRatio: number, onBytes: (bytes: number) => void = () => {}) {
    this.style = style;
    this.ratio = pixelRatio;
    this.onBytes = onBytes;
  }

  get pixelRatio(): number { return this.ratio; }

  get bytes(): number {
    let b = 0;
    for (const e of this.entries.values()) b += e.raster.data.byteLength;
    return b;
  }

  text(content: string, options: InkTextOptions): InkText {
    return new InkText(this, content, options);
  }

  setPixelRatio(ratio: number): void {
    if (ratio === this.ratio) return;
    this.ratio = ratio;
    for (const t of this.live) t.rewrite();
  }

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

  get layout(): TextLayout { return this.entry.layout; }
  get duration(): number { return this.entry.layout.duration; }

  get progress(): number { return this.material.uniforms.uProgress.value; }
  set progress(p: number) { this.material.uniforms.uProgress.value = Math.min(1, Math.max(0, p)); }

  get opacity(): number { return this.material.uniforms.uOpacity.value; }
  set opacity(a: number) { this.material.uniforms.uOpacity.value = a; }

  rewrite(): void {
    const next = this.lettering.acquire(this.content, this.options, this);
    this.lettering.release(this.entry, this, false);
    this.entry = this.show(next);
  }

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

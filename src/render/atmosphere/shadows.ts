// The sun's shadows: cascades of shadow maps fitted to slices of the view (Engel, "Cascaded Shadow Maps", ShaderX5
// 2006; Dimitrov, "Cascaded Shadow Maps", NVIDIA 2007), each slice's map snapped to whole texels as the eye moves so
// the edges never crawl, with the slices cross-faded where they meet.
//
// Two slices, cut for a ship's eye: the first holds the ship and what is round her, the second reaches as far as the
// land is drawn with any detail. Beyond, the haze has taken most of the contrast a shadow would have had, and the
// shadows thin out over the last stretch rather than stop.
//
// The slice a fragment reads is chosen by the depth of the point the map is read at, which is not always the
// fragment: under the sea it is further along the sun's unbent ray (see refractedShadowPosition). Where two slices
// meet they are cross-faded over a tenth of the distance either side, with weights that sum to one, and each slice's
// map is read once, in its own branch, only where it has any weight.
//
// Each map is read with a disc of eight hardware-compared taps (each a bilinear 2×2 compare), whose spread keeps the penumbra at least as wide on
// the ground as the sun's disc makes it a couple of metres behind an edge, and never under a texel and a half in any
// slice, so the near slices are not razor-cut and the far ones are not blocky. The disc is the same at every pixel:
// turned by a noise, with nothing to gather the turns over frames, a penumbra would be a grain fixed to the screen.
//
// Light a material works out for itself, rather than through three's lights (the sea's body, the sun's share of the
// light the caustics move), reads the same cascades through sunShadow.
import type { DirectionalLight, Node, NodeBuilder, NodeFrame, PerspectiveCamera, Texture, WebGPURenderer } from 'three/webgpu';
import {
  Fn, If, cameraNear, cameraViewMatrix, clamp, float, nodeObject, reference, renderGroup, shadowPositionWorld, smoothstep, texture, vec2, vec4,
} from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

/** The shadows reach this far from the eye, metres. */
const SHADOW_REACH = 360;
/** Where each slice ends, as a share of the reach. */
const SPLITS = [0.1, 1];
const MAP_SIZE = 1024;
/** The share of a boundary's distance the slices are cross-faded over, either side of it, and the share of the reach
 *  over which the last slice's shadows thin out. */
const FADE = 0.1;
const LAST_FADE = 0.15;
/** The sun's angular radius, and how far behind an edge the penumbra it makes is matched, metres. */
const SUN_RADIUS = 0.00465;
const PENUMBRA_AT = 2.5;
/** The fewest and most texels the taps spread over. */
const SPREAD_MIN = 1.5;
const SPREAD_MAX = 5;

/** Eight points on the unit disc (Vogel's spiral), weighted toward the middle so the penumbra falls off softly. */
const DISC = Array.from({ length: 8 }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / 8), a = i * 2.399963229728653;
  return [r * Math.cos(a), r * Math.sin(a), 1 - 0.5 * r * r] as const;
});
const DISC_WEIGHT = DISC.reduce((s, d) => s + d[2], 0);

type F = Node<'float'>;
interface FilterInputs { depthTexture: Texture & { isArrayTexture?: boolean }; shadowCoord: Node<'vec3'>; shadow: object; depthLayer: F }

/** The disc of compared taps; `radius` is the spread in texels. Called by the shadow node as it builds. */
const discFilter = ({ depthTexture, shadowCoord, shadow, depthLayer }: FilterInputs): F => {
  // read once a render, as three's own filters do
  const perRender = <T>(n: T): T => (n as unknown as { setGroup(g: unknown): T }).setGroup(renderGroup);
  const size = perRender(reference('mapSize', 'vec2', shadow));
  const spread = perRender(reference('radius', 'float', shadow));
  const step = vec2(spread).div(size);
  let sum: F = float(0);
  for (const [x, y, w] of DISC) {
    let tap = texture(depthTexture, shadowCoord.xy.add(vec2(x, y).mul(step)));
    if (depthTexture.isArrayTexture) tap = tap.depth(depthLayer);
    sum = sum.add((tap.compare(shadowCoord.z) as unknown as F).mul(w / DISC_WEIGHT));
  }
  return sum;
};

/** What three's cascades keep to themselves. */
interface Inner {
  _init(builder: NodeBuilder): void;
  _shadowNodes: Node<'float'>[];
  setupShadowPosition(builder: NodeBuilder): void;
}

/** The cascades, with each slice's bias and spread kept to its texel size as the slices are refitted. */
class Cascades extends CSMShadowNode {
  /** Makes the slices, each with its own light, the first time a material is built for them or they are readied. */
  #init(builder: { camera: unknown; renderer: unknown }): void {
    if (this.camera !== null) return;
    (this as unknown as Inner)._init(builder as unknown as NodeBuilder);
    for (const l of this.lights) (l.shadow as unknown as { filterNode: unknown }).filterNode = discFilter;
  }

  /** Makes the slices and puts their lights in the scene, as the first frame drawn would: the lights in the scene are
   *  part of what a material is built for, so materials built ahead of the first frame are built for these. */
  ready(camera: PerspectiveCamera, renderer: WebGPURenderer): void {
    this.#init({ camera, renderer });
    const parent = this.light.parent;
    for (const l of this.lights) if (l.parent === null && parent) parent.add(l.target, l);
  }

  override setup(builder: NodeBuilder): Node | null | undefined {
    const inner = this as unknown as Inner;
    this.#init(builder as unknown as { camera: unknown; renderer: unknown });
    return Fn((b: NodeBuilder) => {
      inner.setupShadowPosition(b);
      // how far into the reach the point the map is read at lies, 0 at the eye and 1 at the end
      const z = cameraViewMatrix.mul(vec4(shadowPositionWorld as unknown as Node<'vec3'>, 1)).z.negate();
      const depth = clamp(z.sub(cameraNear).div(float(SHADOW_REACH).sub(cameraNear)), 0, 1).toVar();
      // past each boundary, the share taken by the slices beyond it; past the last, the share the shadows have faded
      const beyond = SPLITS.map((b, i) => {
        const t = i === SPLITS.length - 1 ? smoothstep(1 - LAST_FADE, 1, depth) : smoothstep(b * (1 - FADE), b * (1 + FADE), depth);
        return t.toVar();
      });
      const lit = float(1).toVar();
      inner._shadowNodes.forEach((map, i) => {
        const weight = (i === 0 ? float(1) : beyond[i - 1]).sub(beyond[i]);
        If(weight.greaterThan(0.001), () => {
          lit.subAssign(weight.mul(float(1).sub(map)));
        });
      });
      return lit;
    })();
  }

  override updateBefore(frame: NodeFrame): boolean | undefined {
    super.updateBefore(frame);
    for (const l of this.lights) {
      const shadow = l.shadow!, cam = shadow.camera;
      const texel = (cam.right - cam.left) / MAP_SIZE;
      // a texel and a half along the normal and half a texel in depth keep the ground from shadowing itself where the
      // sun is low over it, without lifting the shadow off the foot of whatever casts it
      shadow.normalBias = texel * 1.5;
      shadow.bias = -(texel * 0.5) / (cam.far - cam.near);
      shadow.radius = Math.min(Math.max((SUN_RADIUS * PENUMBRA_AT) / texel, SPREAD_MIN), SPREAD_MAX);
    }
    return undefined;
  }
}

let installed: SunShadows | null = null;

/** The sun's shadow over the fragment, 1 in full sun, 0 in full shade: 1 everywhere until the sun has shadows. */
export const sunShadow = Fn((): F => (installed ? (nodeObject(installed.node) as unknown as F) : float(1)));

/** Gives the sun its shadows, and keeps the slices fitted to the eye's projection. */
export class SunShadows {
  readonly node: Cascades;
  #fov = 0;
  #aspect = 0;

  constructor(renderer: WebGPURenderer, sun: DirectionalLight) {
    renderer.shadowMap.enabled = true;
    sun.castShadow = true;
    const shadow = sun.shadow;
    shadow.mapSize.set(MAP_SIZE, MAP_SIZE);
    shadow.camera.near = 0.5;
    shadow.camera.far = 1600;
    this.node = new Cascades(sun, {
      cascades: SPLITS.length, maxFar: SHADOW_REACH, mode: 'custom', lightMargin: 260,
      customSplitsCallback: (_n, _near, _far, breaks) => breaks.push(...SPLITS),
    });
    this.node.fade = true;
    (shadow as unknown as { shadowNode: unknown }).shadowNode = this.node;
    installed = this;
  }

  /** Whether the sun's shadows are drawn and read: not while it lights nothing the eye can see. */
  set casting(on: boolean) {
    for (const l of this.node.lights) {
      l.shadow!.intensity = on ? 1 : 0;
      l.shadow!.autoUpdate = on;
    }
  }

  /** Refits the slices when the eye's projection changes. */
  update(camera: PerspectiveCamera): void {
    if (!this.node.camera) return;
    if (camera.fov === this.#fov && camera.aspect === this.#aspect) return;
    this.#fov = camera.fov;
    this.#aspect = camera.aspect;
    this.node.updateFrustums();
  }
}

// The atmosphere: the tables, the sky behind everything, the haze in front of everything, and the three lights the air
// casts. The stage owns one and calls update() once a frame before drawing.
import {
  DirectionalLight, Matrix4, Mesh, MeshBasicNodeMaterial, NoBlending, PMREMGenerator, PlaneGeometry, Scene, Vector3,
  type Material, type Node, type NodeBuilder, type PerspectiveCamera, type RenderTarget, type WebGPURenderer,
} from 'three/webgpu';
import {
  Discard, Fn, If, cameraProjectionMatrixInverse, cameraWorldMatrix, getViewPosition, output, positionGeometry, positionWorld,
  positionWorldDirection, screenUV, vec4,
} from 'three/tsl';
import { beneathColour, beneathDepth } from '../gpu/behind.ts';
import { seaLevelNode } from '../lift.ts';
import { AIR, CLEAR_AIR, setAir, type Air } from './model.ts';
import { EYE, aerialAt, passes } from './luts.ts';
import { probeBackground, probeEye, skyBackground, skyTurn } from './sky.ts';
import { BODIES, BodyLight, BodyLightNode, SkyLight, SkyLightNode, bodiesFor, moonlight, sunlight } from './light.ts';
import { SunShadows } from './shadows.ts';
import { fogAt } from './fog.ts';
import { P } from '../gpu/uniforms.ts';

type V3 = Node<'vec3'>;

/** What stands between the light and a surface, worked on the surface's light at p: the sea over it, say. */
export type LightFilter = (colour: V3, p: V3) => V3;

/** Everything a surface at p takes on with distance, by the air and then by the mist close round the eye: the share of
 *  its light that reaches the eye, and the light scattered in along the way. */
export function hazeAt(p: V3): { loss: V3; light: V3 } {
  const air = aerialAt(p);
  const mist = fogAt(p);
  return { loss: air.loss.mul(mist.loss), light: air.light.mul(mist.loss).add(mist.light) };
}

const hazed = (colour: V3, p: V3): V3 => {
  const h = hazeAt(p);
  return colour.mul(h.loss).add(h.light);
};

/** Whether three draws a material over the scene, after everything solid: its own test for its transparent list. */
const drawnOver = (m: Material | null): boolean => {
  const o = m as (Material & { transmission?: number; transmissionNode?: unknown; backdropNode?: unknown }) | null;
  return !!o && (o.transparent || (o.transmission ?? 0) > 0 || !!o.transmissionNode || !!o.backdropNode);
};

/** What every material with fog on does to its light: the filter first (the sea over it, say), then the haze. What
 *  is solid takes its haze from the veil, once a pixel, rather than each of its layers working the same haze out; what
 *  is drawn over the scene after the veil (the sea, smoke, trails, the clouds) works out its own. */
export function haze(filter?: LightFilter): Node<'vec4'> {
  return Fn((builder: NodeBuilder) => {
    const colour = filter ? filter(output.rgb, positionWorld) : output.rgb;
    return vec4(drawnOver(builder.material) ? hazed(colour, positionWorld) : colour, output.a);
  })();
}

/**
 * The haze of everything solid, laid on once a pixel: a sheet over the frame drawn first of what is drawn over the
 * scene, from the copy of the scene's colour and depth taken there for the sea (behind.ts), so it costs the pass no
 * break of its own. The sky is drawn through the mist already, and what lies surely under the sea is drawn over by
 * the sea, which hazes itself: both are left as they are.
 */
function veil(): Mesh {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: NoBlending });
  m.fog = false;
  m.toneMapped = false;
  m.vertexNode = vec4(positionGeometry.xy, 0, 1);
  m.colorNode = Fn(() => {
    const z = beneathDepth().x;
    If(z.greaterThanEqual(1), () => {
      Discard();
    });
    const view = getViewPosition(screenUV, z, cameraProjectionMatrixInverse);
    const p = cameraWorldMatrix.mul(vec4(view, 1)).xyz.toVar();
    const r = p.length();
    // (the depth's error grows with distance, and the troughs reach a few metres down)
    If(r.lessThan(seaLevelNode(p.div(r), true).sub(view.length().mul(0.004).add(3))), () => {
      Discard();
    });
    return vec4(hazed(beneathColour().rgb, p), 1);
  })();
  const mesh = new Mesh(new PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false;
  // before the sea, and everything else drawn over the scene
  mesh.renderOrder = -1;
  mesh.name = 'haze';
  return mesh;
}

/** The sky behind everything, through the mist close round the eye. */
const skyThroughMist = Fn(() => {
  const mist = fogAt(EYE.position.add(positionWorldDirection.mul(4000)));
  return vec4(skyBackground.rgb.mul(mist.loss).add(mist.light), 1);
})();

/** How often the probe of the sky round the eye is retaken, seconds, unless the light or the eye moves a lot. */
const PROBE_EVERY = 0.75;

const _m = new Matrix4();
const _v = new Vector3();
const _u = new Vector3();

export class Atmosphere {
  readonly sun: DirectionalLight;
  readonly moon: DirectionalLight;
  readonly sky = new SkyLight();
  readonly shadows: SunShadows;
  #renderer: WebGPURenderer;
  #air: Air = { ...CLEAR_AIR };
  #dirty = true;
  #probeScene = new Scene();
  #probeTarget: RenderTarget | null = null;
  #generator: PMREMGenerator;
  #probeAge = Infinity;
  #probeSun = new Vector3();
  #probeEye = new Vector3();

  constructor(renderer: WebGPURenderer) {
    this.#renderer = renderer;
    renderer.library.addLight(SkyLightNode, SkyLight);
    renderer.library.addLight(BodyLightNode, BodyLight as unknown as new () => DirectionalLight);
    this.sun = new BodyLight(sunlight, BODIES.sun);
    this.moon = new BodyLight(moonlight, BODIES.moon);
    this.sun.name = 'sun';
    this.moon.name = 'moon';
    this.shadows = new SunShadows(renderer, this.sun);
    this.#probeScene.backgroundNode = probeBackground;
    this.#generator = new PMREMGenerator(renderer);
  }

  /** Puts the sky, the haze and the lights into a scene; the filter works on every surface's light first. */
  install(scene: Scene, filter?: LightFilter): void {
    scene.backgroundNode = skyThroughMist;
    scene.fogNode = haze(filter);
    scene.add(veil(), this.sun, this.sun.target, this.moon, this.moon.target, this.sky);
  }

  /** The air now; the tables that depend on it alone are redone before the next frame. */
  set air(a: Air) {
    this.#air = a;
    setAir(a, (P.planet.value as { x: number }).x);
    this.#dirty = true;
  }

  get air(): Air {
    return this.#air;
  }

  /** How far the sky has turned with the hour, for the stars. */
  set turn(radians: number) {
    skyTurn.value = radians;
  }

  /** Follows the camera: the eye, the view tables, the lights' directions, and the probe now and then. */
  update(camera: PerspectiveCamera, dt: number): void {
    const renderer = this.#renderer;
    camera.updateMatrixWorld();
    const eye = camera.getWorldPosition(_v);
    (EYE.position.value as Vector3).copy(eye);
    (EYE.world.value as Matrix4).copy(camera.matrixWorld);
    const tanY = Math.tan((camera.fov * Math.PI) / 360) / camera.zoom;
    (EYE.tan.value as { set(x: number, y: number): void }).set(tanY * camera.aspect, tanY);
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    (EYE.viewProjection.value as Matrix4).copy(_m);
    // deep enough to reach the far side of the air from wherever the eye is
    const b = AIR.bottom.value as number, t = AIR.top.value as number;
    const r = eye.length();
    const shell = Math.sqrt(Math.max(t * t - b * b, 0));
    EYE.range.value = r < t ? Math.sqrt(Math.max(r * r - b * b, 0)) + shell : 2 * shell;

    if (this.#dirty) {
      renderer.compute([passes.transmittance, passes.multi, passes.irradiance]);
      this.#dirty = false;
      this.#probeAge = Infinity;
    }
    renderer.compute([passes.sky, passes.moonSky, passes.aerial]);

    // the lights hang over the ground below the eye, which is also where the shadows' cascades are fitted; the sun's
    // shadows are drawn only while it lights anything in view
    bodiesFor(_u.copy(eye).normalize(), P.sunDir.value as Vector3, P.moonDir.value as Vector3);
    this.shadows.casting = BODIES.sun.value === 1;
    const ground = _v.copy(eye).setLength(b);
    this.sun.target.position.copy(ground);
    this.sun.position.copy(ground).addScaledVector(P.sunDir.value as Vector3, 400);
    this.moon.target.position.copy(ground);
    this.moon.position.copy(ground).addScaledVector(P.moonDir.value as Vector3, 400);
    this.sun.target.updateMatrixWorld();
    this.moon.target.updateMatrixWorld();
    this.shadows.update(camera);

    this.#probeAge += dt;
    const sun = P.sunDir.value as Vector3;
    const turned = this.#probeSun.dot(sun) < 0.9995;
    const moved = this.#probeEye.distanceTo(eye) > 40;
    if (this.#probeAge >= PROBE_EVERY || turned || moved || !this.#probeTarget) {
      this.#takeProbe(eye);
      this.#probeAge = 0;
      this.#probeSun.copy(sun);
      this.#probeEye.copy(eye);
    }
  }

  /** Renders the sky over the sea below the eye into a cube and filters it for every roughness. */
  #takeProbe(eye: Vector3): void {
    const b = AIR.bottom.value as number;
    const at = (probeEye.value as Vector3).copy(eye).setLength(b + Math.min(Math.max(eye.length() - b, 2), 40));
    const target = this.#generator.fromScene(this.#probeScene, 0, 0.1, 100, {
      size: 128, position: at, renderTarget: this.#probeTarget,
    } as Parameters<PMREMGenerator['fromScene']>[4]);
    if (!this.#probeTarget) this.sky.probe = target.texture;
    this.#probeTarget = target;
    target.texture.needsPMREMUpdate = true;
  }
}

export { setAir, CLEAR_AIR, type Air };

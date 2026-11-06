// The atmosphere: the tables, the sky behind everything, the haze in front of everything, and the three lights the air
// casts. The stage owns one and calls update() once a frame before drawing.
import {
  DirectionalLight, Matrix4, PMREMGenerator, Scene, Vector3, type Node, type PerspectiveCamera, type RenderTarget, type WebGPURenderer,
} from 'three/webgpu';
import { Fn, output, positionWorld, vec4 } from 'three/tsl';
import { AIR, CLEAR_AIR, setAir, type Air } from './model.ts';
import { EYE, aerialAt, passes } from './luts.ts';
import { probeBackground, probeEye, skyBackground, skyTurn } from './sky.ts';
import { SkyLight, SkyLightNode, bodyLight, moonlight, sunlight } from './light.ts';
import { SunShadows } from './shadows.ts';
import { P } from '../gpu/uniforms.ts';

type V3 = Node<'vec3'>;

/** What stands between the light and a surface, worked on the surface's light at p: the sea over it, say. */
export type LightFilter = (colour: V3, p: V3) => V3;

/** Everything the scene's surfaces take on with distance: the light lost on the way to the eye and the light
 *  scattered in along it, after the filter has worked on the light the surface had. Every material with fog on
 *  reads it. */
export function haze(filter?: LightFilter): Node<'vec4'> {
  return Fn(() => {
    const colour = filter ? filter(output.rgb, positionWorld) : output.rgb;
    const { light, loss } = aerialAt(positionWorld);
    return vec4(colour.mul(loss).add(light), output.a);
  })();
}

/** How often the probe of the sky round the eye is retaken, seconds, unless the light or the eye moves a lot. */
const PROBE_EVERY = 0.75;

const _m = new Matrix4();
const _v = new Vector3();

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
    this.sun = bodyLight(sunlight);
    this.moon = bodyLight(moonlight);
    this.sun.name = 'sun';
    this.moon.name = 'moon';
    this.shadows = new SunShadows(renderer, this.sun);
    this.#probeScene.backgroundNode = probeBackground;
    this.#generator = new PMREMGenerator(renderer);
  }

  /** Puts the sky, the haze and the lights into a scene; the filter works on every surface's light first. */
  install(scene: Scene, filter?: LightFilter): void {
    scene.backgroundNode = skyBackground;
    scene.fogNode = haze(filter);
    scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.sky);
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

    // the lights hang over the ground below the eye, which is also where the shadows' cascades are fitted
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

// The weather and sky effects for the real sphere: cloud formations you see coming, rain with dimples on the sea,
// snow with icing, ash and embers, thunder with its warning and bolt, calm-water glitter, the aurora over the Ice
// Crown, the moonbow at Moonbow Arch, mist rolling out of Mistwood, and god rays.
//
//   const weather = createWeather(scene, { radius: 554 });
//   each frame:  const local = weather.update(view, dt, camera);   // local.fog etc. feed the host's atmosphere
//   on a strike: weather.strike(shipPosition);                        // warning glow, then the bolt
//
// Everything runs from plain parameters (WeatherView): system positions, kinds, radii and intensities, the sun's
// direction and the hour, plus the camera. It draws only into its own group, and never imports the simulation.
import * as THREE from 'three';
import { Aurora } from './aurora.ts';
import { Clouds } from './clouds.ts';
import { frameAt, makeShared, newFrame, skyAmbient, sunColor, surfaceDistance, type Shared, type Vec3Like } from './common.ts';
import { addIcing, addWetness, type Amount } from './hooks.ts';
import { Lightning } from './lightning.ts';
import { Mist } from './mist.ts';
import { Moonbow } from './moonbow.ts';
import { Precip } from './precip.ts';
import { Rays } from './rays.ts';
import { Shimmer } from './shimmer.ts';
import type { WeatherLocal, WeatherOptions, WeatherSystem, WeatherView } from './types.ts';

export type { WeatherKind, Vec3Like } from './common.ts';
export type { WeatherLocal, WeatherOptions, WeatherSpot, WeatherSystem, WeatherView } from './types.ts';
export { addIcing, addWetness, type Amount } from './hooks.ts';
export { formation } from './clouds.ts';

/** At most this many systems are drawn at once; the plan has 3–5. */
export const MAX_SYSTEMS = 6;

export interface Weather {
  /** Everything the weather draws. Already added to the scene. */
  readonly group: THREE.Group;
  /** What the weather is doing at the camera, refreshed by update(). */
  readonly local: WeatherLocal;
  /** Ice on the rigging, 0–1: builds in snow, melts out of it. Pass to addIcing, or drive your own per ship. */
  readonly icing: Amount;
  /** Wetness, 0–1: soaks in rain, dries out of it. Pass to addWetness. */
  readonly wetness: Amount;
  /** The shared uniforms: uGain matches the host's exposure; uTime drives addWetness. */
  readonly shared: Shared;
  update(view: WeatherView, dt: number, camera: THREE.Camera): WeatherLocal;
  /** A lightning strike at 'at' (a unit vector or a world point): a warning glow for 'warn' seconds, then the bolt. */
  strike(at: Vec3Like, warn?: number): void;
  /** Frosts a material with this weather's icing. */
  addIcing(material: THREE.Material): void;
  /** Wets a material with this weather's wetness. */
  addWetness(material: THREE.Material): void;
  dispose(): void;
}

const FOG_TINT = new THREE.Color(0.92, 0.94, 0.96), ASH_TINT = new THREE.Color(0.55, 0.47, 0.4);

export function createWeather(scene: THREE.Object3D, options: WeatherOptions = {}): Weather {
  const radius = options.radius ?? 554, quality = options.quality ?? 'high', seed = options.seed ?? 1;
  const shared = makeShared(radius);
  const group = new THREE.Group();
  group.name = 'weather';
  const clouds = new Clouds(shared, MAX_SYSTEMS);
  const precip = new Precip(shared, quality, seed);
  const lightning = new Lightning(shared, seed, options.light ?? true, options.ambientLightning ?? true, options.onBolt);
  const shimmer = new Shimmer(shared);
  const aurora = new Aurora(shared);
  const bow = new Moonbow(shared, quality, seed);
  const mist = new Mist(shared, quality, seed);
  const rays = new Rays(shared, seed);
  group.add(aurora.mesh, shimmer.mesh, rays.mesh, mist.mesh, bow.group, clouds.group, precip.group, lightning.group);
  scene.add(group);

  const local: WeatherLocal = { fog: 0, rain: 0, thunder: 0, snow: 0, ash: 0, calm: 0, flash: 0, night: 0, fogDensity: 0.0006, fogColor: new THREE.Color() };
  const icing: Amount = { value: 0 }, wetness: Amount = { value: 0 };
  const eye = new THREE.Vector3(), up = new THREE.Vector3(), last = new THREE.Vector3(), camVel = new THREE.Vector3();
  const wind = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmp = new THREE.Color(), sunC = new THREE.Color(), frame = newFrame();
  const depth = { fog: 0, rain: 0, thunder: 0, snow: 0, ash: 0, calm: 0 };
  let first = true;

  function depthIn(s: WeatherSystem, at: Vec3Like): number {
    const d = surfaceDistance(at, s.at, radius), q = 1 - (d * d) / (s.radius * s.radius);
    return q > 0 ? s.intensity * Math.min(1, q * 2.5) : 0;
  }

  function moonOf(view: WeatherView, out: THREE.Vector3): THREE.Vector3 {
    if (view.moonDir) return out.set(view.moonDir.x, view.moonDir.y, view.moonDir.z).normalize();
    // a moon a little off the anti-sun, lifted toward the north
    const s = view.sunDir, a = 0.5, c = Math.cos(a), sn = Math.sin(a);
    return out.set(-(s.x * c + s.z * sn), -s.y + 0.3, -(-s.x * sn + s.z * c)).normalize();
  }

  function update(view: WeatherView, dt: number, camera: THREE.Camera): WeatherLocal {
    dt = Math.min(Math.max(dt, 0), 0.1);
    shared.uTime.value += dt;
    shared.uSunDir.value.set(view.sunDir.x, view.sunDir.y, view.sunDir.z).normalize();
    moonOf(view, shared.uMoonDir.value);
    const sun = shared.uSunDir.value, moon = shared.uMoonDir.value;
    camera.getWorldPosition(eye);
    up.copy(eye).normalize();
    const h = eye.length() - radius;
    if (camera instanceof THREE.PerspectiveCamera) {
      const px = window.innerHeight > 0 ? window.innerHeight : 800;
      shared.uPixel.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / (px * Math.min(2, window.devicePixelRatio || 1));
    }
    // the camera's own motion stretches the rain
    if (first || eye.distanceTo(last) > 60) camVel.set(0, 0, 0);
    else if (dt > 0) camVel.lerp(tmpV.subVectors(eye, last).divideScalar(dt), Math.min(1, dt * 8));
    last.copy(eye);
    first = false;
    if (view.wind) wind.set(view.wind.x, view.wind.y, view.wind.z);
    else wind.set(0, 0, 0);

    // how deep the camera is in each kind
    depth.fog = depth.rain = depth.thunder = depth.snow = depth.ash = depth.calm = 0;
    const systems = view.systems.length > MAX_SYSTEMS ? view.systems.slice(0, MAX_SYSTEMS) : view.systems;
    for (const s of systems) {
      if (s.kind === 'clear') continue;
      depth[s.kind] = Math.max(depth[s.kind], depthIn(s, up));
    }
    // fog lies on the sea: climb out of it
    const fogLow = 1 - Math.min(1, Math.max(0, (h - 25) / 40));
    const k = Math.min(1, dt * 2);
    local.fog += (depth.fog * fogLow - local.fog) * k;
    local.rain += (depth.rain - local.rain) * k;
    local.thunder += (depth.thunder - local.thunder) * k;
    local.snow += (depth.snow - local.snow) * k;
    local.ash += (depth.ash - local.ash) * k;
    local.calm += (depth.calm - local.calm) * k;
    local.night = 1 - Math.min(1, Math.max(0, (up.dot(sun) + 0.15) / 0.3));
    const wet = Math.max(local.rain, local.thunder);
    local.fogDensity = 0.0006 + 0.03 * local.fog + 0.011 * wet + 0.01 * local.snow + 0.012 * local.ash;
    // the fog takes the light of the sky round it
    skyAmbient(up, sun, moon, local.fogColor).multiplyScalar(1.15);
    sunColor(up, 10, sun, radius, sunC);
    local.fogColor.add(sunC.multiplyScalar(0.28));
    const tint = local.fog * 0.6 + local.ash;
    if (tint > 0) {
      tmp.copy(FOG_TINT).multiplyScalar(local.fog * 0.6).add(sunC.copy(ASH_TINT).multiplyScalar(local.ash)).multiplyScalar(1 / tint);
      local.fogColor.lerp(tmp.multiply(local.fogColor), Math.min(1, tint));
    }
    shared.uHaze.value.copy(local.fogColor);
    shared.uHazeDensity.value = local.fogDensity;

    lightning.update(dt, eye, systems);
    local.flash = lightning.flash;
    clouds.update(systems, eye, lightning.flashes, local.night > 0.3 ? 1 : local.night * 3);
    precip.update(dt, eye, camVel, wind, { rain: wet, snow: local.snow, ash: local.ash, fog: local.fog }, local.night, local.flash);
    shimmer.update(systems);
    // the aurora wants a dark pole
    const pole = frameAt({ x: 0, y: 1, z: 0 }, frame).c;
    aurora.update((view.aurora ?? 1) * (1 - Math.min(1, Math.max(0, (pole.dot(sun) + 0.1) / 0.3))), sun);
    bow.update(view.moonbow, eye);
    mist.update(view.mist);
    rays.update(systems, view.rays);

    // ice builds slowly in snow and melts slowly out of it; rain soaks fast and dries slowly
    icing.value = Math.min(1, Math.max(0, icing.value + dt * (local.snow > 0.2 ? local.snow / 40 : -1 / 60)));
    wetness.value = Math.min(1, Math.max(0, wetness.value + dt * (wet > 0.1 ? wet / 4 : local.fog > 0.3 ? 0.02 : -1 / 45)));
    return local;
  }
  return {
    group, local, icing, wetness, shared,
    update,
    strike: (at, warn = 1.6) => lightning.strike(at, warn, true),
    addIcing: (m) => addIcing(m, icing),
    addWetness: (m) => addWetness(m, wetness, shared.uTime),
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      shared.uNoise.value.dispose();
    },
  };
}

// The WebGPU lab: the new renderer on a bare planet, driven from the capture tools through window.__lab. It shows
// what the GPU path draws before the stage is moved onto it.
import {
  Group, Mesh, MeshStandardNodeMaterial, PerspectiveCamera, Scene, Vector3,
  BoxGeometry, Color, DataUtils,
} from 'three/webgpu';
import { normalWorld, positionWorld, vec3 } from 'three/tsl';
import { RENDER_SCALE, createRenderer } from '../renderer.ts';
import { Post } from '../post.ts';
import { METER } from '../exposure.ts';
import { Waves, SEA, setSpectrum } from '../../ocean/waves.ts';
import { Ocean } from '../../ocean/index.ts';
import { CALM_SEA, LongWaves, N, SIZES, spectrumParams, type SeaState } from '../../ocean/spectrum.ts';
import { skyLight } from '../../atmosphere/light.ts';
import { passes, tables } from '../../atmosphere/luts.ts';
import { Atmosphere } from '../../atmosphere/index.ts';
import { P } from '../uniforms.ts';
import { R } from '../../../sim/sphere.ts';
import { Terrain } from '../../terrain.ts';
import { SCANS } from '../../land/library.ts';
import { ScanCache } from '../../land/scans.ts';
import { LAND, landMaterial } from '../../land/material.ts';
import { makeNoiseTexture } from '../noise.ts';
import type { ScanResult } from '../../land/scan-worker.ts';

const DEG = Math.PI / 180;

interface View {
  /** Where the eye stands: a unit direction from the planet's centre and a height over the sea. */
  at: [number, number, number];
  height: number;
  /** Which way it looks: a compass bearing from the local north, degrees, and a pitch, degrees up. */
  bearing: number;
  pitch: number;
  fov?: number;
}

const VIEWS: Record<string, View> = {
  deck: { at: [1, 0.25, 0.1], height: 6, bearing: 90, pitch: -4 },
  low: { at: [1, 0.25, 0.1], height: 2, bearing: 90, pitch: 2 },
  high: { at: [1, 0.25, 0.1], height: 60, bearing: 90, pitch: -18 },
  zenith: { at: [1, 0.25, 0.1], height: 6, bearing: 0, pitch: 70 },
  orbit: { at: [1, 0.5, 0.6], height: 1200, bearing: 0, pitch: -90, fov: 40 },
  // coasts: the shallows off an island in each of a few regions, looking at its highest land
  fjords: { at: [0.7599, 0.6425, 0.0983], height: 6, bearing: 34, pitch: 2 },
  kelp: { at: [-0.4317, 0.6696, 0.6044], height: 6, bearing: 326, pitch: -2 },
  reef: { at: [-0.4317, 0.6696, 0.6044], height: 7, bearing: 326, pitch: -38 },
  coral: { at: [-0.0424, -0.7069, -0.7060], height: 6, bearing: 68, pitch: 0 },
  spires: { at: [-0.227, 0.4845, -0.8449], height: 6, bearing: 337, pitch: 6 },
  narrows: { at: [-0.5532, 0.5405, -0.6339], height: 6, bearing: 270, pitch: 2 },
  basalt: { at: [-0.7497, 0.4472, 0.4878], height: 5, bearing: 270, pitch: 4 },
  fire: { at: [-0.8935, -0.4489, 0.0103], height: 6, bearing: 135, pitch: 4 },
  ice: { at: [-0.1932, 0.9812, 0], height: 6, bearing: 0, pitch: 2 },
  mangrove: { at: [-0.1419, -0.6446, 0.7512], height: 5, bearing: 270, pitch: 2 },
  coast: { at: [-0.4317, 0.6696, 0.6044], height: 90, bearing: 326, pitch: -30 },
};

function sunAt(hour: number, tilt: number, out: Vector3): Vector3 {
  const l = -(hour - 12) * 15 * DEG, t = tilt * DEG, c = Math.cos(t);
  return out.set(c * Math.cos(l), Math.sin(t), -c * Math.sin(l));
}

function moonAt(hour: number, tilt: number, out: Vector3): Vector3 {
  const l = -(hour - 12) * 15 * DEG + Math.PI + 0.45, lat = -tilt * DEG * 0.6 + 0.12, c = Math.cos(lat);
  return out.set(c * Math.cos(l), Math.sin(lat), -c * Math.sin(l));
}

/** Sea states to look at: a calm, a fresh breeze, and a gale. */
const SEAS: Record<string, SeaState> = {
  calm: { ...CALM_SEA },
  fresh: { wind: 10, heading: 0.3, fetch: 12000, swell: 0.8, swellLength: 40, swellHeading: 0.9, chop: 1 },
  gale: { wind: 17, heading: 0.3, fetch: 30000, swell: 1.4, swellLength: 55, swellHeading: 0.7, chop: 1.1 },
};

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const { renderer, info } = await createRenderer(canvas);
  const scene = new Scene();
  const camera = new PerspectiveCamera(58, 1, 0.25, 4000);
  const atmosphere = new Atmosphere(renderer);
  const ocean = new Ocean(3);
  atmosphere.install(scene, ocean.beneath);
  scene.add(ocean.mesh);
  const post = new Post(renderer, scene, camera, info.phone ? RENDER_SCALE.phone : RENDER_SCALE.desktop);
  const fog = scene.fogNode;

  // the land, painted with the scans of the regions round the eye
  const scans = new ScanCache(renderer);
  const terrain = new Terrain(landMaterial(scans, makeNoiseTexture()));
  scene.add(terrain.group);
  // a few ships' worth of boxes
  const hull = new MeshStandardNodeMaterial({ color: new Color(0.35, 0.2, 0.1), roughness: 0.55 });
  const sail = new MeshStandardNodeMaterial({ color: new Color(0.85, 0.82, 0.74), roughness: 0.8 });
  // ships' worth of boxes riding the swell, scattered round wherever the eye is put
  const ships: { at: Vector3; heading: number; group: Group }[] = [];
  const scatter = (home: Vector3) => {
    const side = new Vector3(0, 1, 0).cross(home).normalize();
    const fore = new Vector3().crossVectors(home, side);
    ships.forEach((s, i) => {
      const a = i * 1.1;
      s.at.copy(home).addScaledVector(side, 0.12 * Math.cos(a)).addScaledVector(fore, 0.12 * Math.sin(a)).setLength(R);
    });
  };
  for (let i = 0; i < 6; i++) {
    const group = new Group();
    const h = new Mesh(new BoxGeometry(3, 1.6, 9), hull);
    h.position.y = 0.3;
    const sl = new Mesh(new BoxGeometry(0.2, 8, 6), sail);
    sl.position.y = 5.7;
    h.castShadow = h.receiveShadow = sl.castShadow = sl.receiveShadow = true;
    group.add(h, sl);
    scene.add(group);
    ships.push({ at: new Vector3(), heading: i * 2.5, group });
  }
  scatter(new Vector3(1, 0.25, 0.1).normalize());
  const slope = { x: 0, y: 0, z: 0 };
  const ride = () => {
    for (const s of ships) {
      const up = s.at.clone().normalize();
      const h = ocean.heightAt(s.at, slope);
      s.group.position.copy(up).multiplyScalar(R + h);
      const tilted = up.clone().sub(new Vector3(slope.x, slope.y, slope.z)).normalize();
      s.group.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), tilted);
      s.group.rotateY(s.heading);
    }
  };

  // ?debug=irradiance shows the sky's irradiance on every surface as its colour
  if (new URLSearchParams(location.search).get('debug') === 'irradiance') {
    scene.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardNodeMaterial | undefined;
      if (!m?.isMeshStandardNodeMaterial) return;
      m.colorNode = vec3(0);
      m.emissiveNode = skyLight(positionWorld, normalWorld).mul(0.3);
    });
  }
  let view = VIEWS.deck;
  let hour = 15;
  let tilt = 20;
  let time = 0;
  const frame = (dt = 1 / 60) => {
    time += dt;
    P.time.value = time;
    P.dt.value = dt;
    // the hour is the eye's own solar time: the planet's clock is the hour at longitude 0
    const longitude = Math.atan2(-view.at[2], view.at[0]) / DEG;
    const clock = hour - longitude / 15;
    const sun = sunAt(clock, tilt, P.sunDir.value as Vector3);
    const moon = moonAt(clock, tilt, P.moonDir.value as Vector3);
    P.moonPhase.value = 0.5 - 0.5 * sun.dot(moon);
    atmosphere.turn = -(clock - 12) * 15 * DEG;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = view.fov ?? 58;
    // the eye's frame: up from the centre, north toward the pole, the bearing turned from north to east
    const up = new Vector3(...view.at).normalize();
    const pole = Math.abs(up.y) > 0.99 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
    const east = new Vector3().crossVectors(pole, up).normalize();
    const north = new Vector3().crossVectors(up, east).normalize();
    const b = view.bearing * DEG, p = view.pitch * DEG;
    const look = north.clone().multiplyScalar(Math.cos(b)).addScaledVector(east, Math.sin(b)).multiplyScalar(Math.cos(p)).addScaledVector(up, Math.sin(p));
    camera.position.copy(up).multiplyScalar(R + view.height);
    camera.up.copy(Math.abs(view.pitch) > 89 ? north : up);
    camera.lookAt(camera.position.clone().add(look));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    atmosphere.update(camera, dt);
    ocean.update(renderer, camera.position, time, dt);
    terrain.update(camera.position);
    scans.update(camera.position, dt);
    ride();
    post.render();
  };

  const lab = {
    info,
    ready: false,
    frames: 0,
    set(o: { land?: number; view?: string; at?: [number, number, number]; height?: number; pitch?: number; hour?: number; tilt?: number; exposure?: number; bearing?: number; fog?: boolean; sky?: boolean; sun?: boolean; shadows?: boolean; sea?: string; water?: boolean }) {
      if (o.water !== undefined) ocean.mesh.visible = o.water;
      if (o.land !== undefined) LAND.debug.value = o.land;
      if (o.sea) ocean.sea = SEAS[o.sea];
      if (o.view) {
        view = { ...VIEWS[o.view] };
        scatter(new Vector3(...view.at).normalize());
      }
      if (o.at) {
        view = { ...view, at: o.at };
        scatter(new Vector3(...o.at).normalize());
      }
      if (o.bearing !== undefined) view.bearing = o.bearing;
      if (o.height !== undefined) view.height = o.height;
      if (o.pitch !== undefined) view.pitch = o.pitch;
      if (o.fog !== undefined) scene.fogNode = o.fog ? fog : null;
      if (o.sky !== undefined) atmosphere.sky.visible = o.sky;
      if (o.sun !== undefined) atmosphere.sun.visible = o.sun;
      if (o.shadows !== undefined) atmosphere.sun.castShadow = o.shadows;
      if (o.hour !== undefined) hour = o.hour;
      if (o.tilt !== undefined) tilt = o.tilt;
      if (o.exposure !== undefined) METER.bias.value = Math.log2(o.exposure);
    },
    /** A table's texels as floats, row by row, four channels each. */
    async table(name: keyof typeof tables, layer = 0) {
      const t = tables[name];
      const { width, height } = t.image as { width: number; height: number };
      const backend = renderer.backend as unknown as { copyTextureToBuffer(t: unknown, x: number, y: number, w: number, h: number, face: number): Promise<Uint16Array> };
      const raw = await backend.copyTextureToBuffer(t, 0, 0, width, height, layer);
      return { width, height, data: Array.from(raw, (h) => DataUtils.fromHalfFloat(h)) };
    },
    /** The WGSL of one of the atmosphere's compute passes. */
    wgsl(name: keyof typeof passes) {
      const nodes = (renderer as unknown as { _nodes: { getForCompute(n: unknown): { computeShader: string } } })._nodes;
      return nodes.getForCompute(passes[name]).computeShader;
    },
    /** Steps n frames; with settle, the eye adapts at once, as it would have long before a still is taken. */
    /** Cascade 0's heights at a few texels against the CPU's direct sum of the same modes. */
    async checkWaves(t = 3.7) {
      const waves = new Waves();
      const p = spectrumParams(CALM_SEA);
      setSpectrum(p, 7);
      SEA.time.value = t;
      SEA.chop.value = 0;
      renderer.compute(waves.build);
      renderer.compute(waves.frame);
      const backend = renderer.backend as unknown as { copyTextureToBuffer(t: unknown, x: number, y: number, w: number, h: number, face: number): Promise<Uint16Array> };
      const raw = await backend.copyTextureToBuffer(waves.field, 0, 0, N, N, 0);
      const long = new LongWaves();
      long.update(p, 7, N / 2 - 1, 1e6);
      const out: number[][] = [];
      let rms = 0, gpuRms = 0;
      for (const [x, y] of [[0, 0], [17, 3], [100, 200], [255, 128], [64, 64], [31, 222]]) {
        const gpu = DataUtils.fromHalfFloat(raw[(y * N + x) * 4 + 1]);
        const cpu = long.at((x * SIZES[0]) / N, (y * SIZES[0]) / N, t);
        out.push([x, y, gpu, cpu]);
      }
      for (let i = 0; i < N * N; i++) gpuRms += DataUtils.fromHalfFloat(raw[i * 4 + 1]) ** 2;
      for (let i = 0; i < 400; i++) rms += long.at(Math.random() * 250, Math.random() * 250, t) ** 2;
      return { out, modes: long.count, gpuRms: Math.sqrt(gpuRms / (N * N)), cpuRms: Math.sqrt(rms / 400) };
    },
    /** The WGSL the land's material compiles to. */
    async landShader() {
      let mesh: Mesh | null = null;
      terrain.group.traverse((o) => { if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh; });
      const debug = (renderer as unknown as { debug: { getShaderAsync(s: Scene, c: PerspectiveCamera, m: Mesh): Promise<{ fragmentShader: string }> } }).debug;
      return (await debug.getShaderAsync(scene, camera, mesh!)).fragmentShader;
    },
    /** What the land holds now. */
    land() {
      return { resident: scans.resident, ...terrain.stats };
    },
    /** Every scan's means, decoded as the game decodes them, for land/means.ts. */
    async scanMeans() {
      const w = new Worker(new URL('../../land/scan-worker.ts', import.meta.url), { type: 'module' });
      const out: Record<string, number[]> = {};
      for (let i = 0; i < SCANS.length; i++) {
        const r = await new Promise<ScanResult>((res) => {
          w.onmessage = (e) => res(e.data);
          w.postMessage({ id: i, base: import.meta.env.BASE_URL, maps: SCANS[i].maps, size: 1024 });
        });
        out[SCANS[i].key] = r.error ? [NaN] : r.mean.map((x) => Math.round(x * 10000) / 10000);
      }
      w.terminate();
      return out;
    },
    async step(n = 1, settle = false) {
      const up = METER.up.value, down = METER.down.value;
      if (settle) METER.up.value = METER.down.value = 200;
      for (let i = 0; i < n; i++) frame();
      // the land round the eye is built as frames are drawn: draw until it has been
      if (settle) {
        let built = false;
        void Promise.all([terrain.settled(), scans.settled(camera.position)]).then(() => (built = true));
        const until = performance.now() + 90_000;
        while (!built && performance.now() < until) {
          frame();
          await new Promise((r) => setTimeout(r, 5));
        }
      }
      METER.up.value = up;
      METER.down.value = down;
      await (renderer.backend as unknown as { device: { queue: { onSubmittedWorkDone(): Promise<void> } } }).device.queue.onSubmittedWorkDone();
      lab.frames += n;
    },
  };
  (window as unknown as { __lab: typeof lab }).__lab = lab;
  frame();
  lab.ready = true;
  const loop = () => {
    frame();
    requestAnimationFrame(loop);
  };
  if (!new URLSearchParams(location.search).has('still')) requestAnimationFrame(loop);
}

main().catch((e) => {
  console.error(e);
  document.body.textContent = String(e?.stack ?? e);
});

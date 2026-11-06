// The WebGPU lab: the new renderer on a bare planet, driven from the capture tools through window.__lab. It shows
// what the GPU path draws before the stage is moved onto it.
import {
  Group, IcosahedronGeometry, Mesh, MeshStandardNodeMaterial, PerspectiveCamera, Scene, SphereGeometry, Vector3,
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
  atmosphere.install(scene);
  const post = new Post(renderer, scene, camera, info.phone ? RENDER_SCALE.phone : RENDER_SCALE.desktop);
  const fog = scene.fogNode;

  // the sea floor, deep sand (the islands make the shallows), and the sea over it
  const floor = new Mesh(new SphereGeometry(R - 60, 512, 256), new MeshStandardNodeMaterial({ color: new Color(0.62, 0.55, 0.4), roughness: 0.95, metalness: 0 }));
  scene.add(floor);
  const ocean = new Ocean(3);
  scene.add(ocean.mesh);
  // a few islands, a few ships' worth of boxes
  const rock = new MeshStandardNodeMaterial({ color: new Color(0.32, 0.3, 0.26), roughness: 0.9 });
  const grass = new MeshStandardNodeMaterial({ color: new Color(0.16, 0.26, 0.08), roughness: 0.85 });
  const hull = new MeshStandardNodeMaterial({ color: new Color(0.35, 0.2, 0.1), roughness: 0.55 });
  const sail = new MeshStandardNodeMaterial({ color: new Color(0.85, 0.82, 0.74), roughness: 0.8 });
  const place = (mesh: Mesh, dir: Vector3, height: number, scale: Vector3) => {
    dir.normalize();
    mesh.position.copy(dir).multiplyScalar(R + height);
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    mesh.scale.copy(scale);
    scene.add(mesh);
  };
  const islands: [number, number, number, number][] = [
    [1, 0.5, 0.05, 40], [1, 0.1, -0.5, 26], [1, 0.6, 0.6, 55], [0.6, 0.9, 0.2, 70], [0.8, -0.3, -0.4, 45], [1, 0.05, 0.6, 35],
    [-0.3, 1, 0.2, 50], [0.2, -1, 0.3, 60], [-1, 0.2, -0.3, 45],
  ];
  for (const [x, y, z, s] of islands) {
    place(new Mesh(new IcosahedronGeometry(1, 3), rock), new Vector3(x, y, z), -s * 0.55, new Vector3(s, s * 0.7, s));
    place(new Mesh(new IcosahedronGeometry(1, 2), grass), new Vector3(x, y, z).normalize().add(new Vector3(0.01, 0, 0.01)), -s * 0.35, new Vector3(s * 0.8, s * 0.52, s * 0.8));
  }
  const home = new Vector3(1, 0.25, 0.1).normalize();
  const side = new Vector3(0, 1, 0).cross(home).normalize();
  const fore = new Vector3().crossVectors(home, side);
  // ships' worth of boxes, riding the swell
  const ships: { at: Vector3; heading: number; group: Group }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1;
    const dir = home.clone().addScaledVector(side, 0.12 * Math.cos(a)).addScaledVector(fore, 0.12 * Math.sin(a)).normalize();
    const group = new Group();
    const h = new Mesh(new BoxGeometry(3, 1.6, 9), hull);
    h.position.y = 0.3;
    const sl = new Mesh(new BoxGeometry(0.2, 8, 6), sail);
    sl.position.y = 5.7;
    group.add(h, sl);
    scene.add(group);
    ships.push({ at: dir.multiplyScalar(R), heading: a * 2.3, group });
  }
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
    const sun = sunAt(hour, tilt, P.sunDir.value as Vector3);
    const moon = moonAt(hour, tilt, P.moonDir.value as Vector3);
    P.moonPhase.value = 0.5 - 0.5 * sun.dot(moon);
    atmosphere.turn = -(hour - 12) * 15 * DEG;
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
    ride();
    post.render();
  };

  const lab = {
    info,
    ready: false,
    frames: 0,
    set(o: { view?: string; hour?: number; tilt?: number; exposure?: number; bearing?: number; fog?: boolean; sky?: boolean; sun?: boolean; sea?: string }) {
      if (o.sea) ocean.sea = SEAS[o.sea];
      if (o.view) view = { ...VIEWS[o.view] };
      if (o.bearing !== undefined) view.bearing = o.bearing;
      if (o.fog !== undefined) scene.fogNode = o.fog ? fog : null;
      if (o.sky !== undefined) atmosphere.sky.visible = o.sky;
      if (o.sun !== undefined) atmosphere.sun.visible = o.sun;
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
    async step(n = 1, settle = false) {
      const up = METER.up.value, down = METER.down.value;
      if (settle) METER.up.value = METER.down.value = 200;
      for (let i = 0; i < n; i++) frame();
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

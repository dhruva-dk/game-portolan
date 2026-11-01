// The juice bench (dev/juice.html): a plain sea scene with two ships, a stand-in HUD, and a button per recipe.
// Particle hooks are answered with simple stand-in bursts and sound hooks are only logged, so what you see is the
// toolkit's own work: the camera, the hit-stop (the sea, ships and particles freeze; the shake doesn't), flashes,
// vignettes, markers, numbers and interface motion.
//
// URL parameters:
//   recipe=<id>    fire a recipe (or a sequence: volley, breakCombo, repeater, coins40) a second after load
//   repeat=<s>     and again every s seconds
//   light=dusk     dusk light instead of day
//   slow=<k>       run everything at k× speed, to watch timing by eye (0.25 is good)
//   hull=<0..1>    start with this much hull (0.2 shows the low-hull heartbeat)
//   dir=<rad>      the direction hits on you come from (clockwise from ahead); default cycles
//   clean=1        hide the dev panels (for captures)
//   strip=1        manual clock for frame-strip capture: window.__juice.step(dt) advances one frame
import * as THREE from 'three';
import { Juice, RECIPES, RECIPE_IDS, effects, format, pressable, type FireContext, type RecipeId } from '../index.ts';
import type { ParticleCall } from '../index.ts';
import { ticker } from '../ticker.ts';
import type { EffectEntry } from '../log.ts';

const q = new URLSearchParams(location.search);
const STRIP = q.has('strip');
const SLOW = Number(q.get('slow') ?? 1) || 1;
let dusk = q.get('light') === 'dusk';
if (q.has('clean')) document.body.classList.add('clean');
ticker.manual = true; // the bench steps the interface clock itself, so `slow` and `strip` cover everything

let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ the scene

const canvas = $<HTMLCanvasElement>('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: STRIP });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 8000);
const BASE_FOV = 58;

const LIGHTS = {
  day: { zenith: 0x2f6fc0, horizon: 0xcfe2f0, sun: 0xfff4e0, dir: [0.35, 0.7, -0.6], sky: 0xbfd8f0, ground: 0x30404a, sunI: 2.6, hemiI: 1.1, sea: 0x0d4466, exposure: 1 },
  dusk: { zenith: 0x1d2350, horizon: 0xff9560, sun: 0xffa060, dir: [-0.25, 0.1, -0.95], sky: 0x8a7aa8, ground: 0x2a1a20, sunI: 2.4, hemiI: 0.7, sea: 0x1a2740, exposure: 0.95 },
};

const skyU = { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() } };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(6000, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyU,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uZenith, uHorizon, uSun, uSunDir; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.5)); float s = max(dot(d, normalize(uSunDir)), 0.0);
        c += uSun * (pow(s, 900.0) * 30.0 + pow(s, 8.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }),
);
scene.add(sky);
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
const sun = new THREE.DirectionalLight(0xffffff, 2);
scene.add(hemi, sun);
scene.fog = new THREE.Fog(0xffffff, 300, 3200);

/** A tileable ripple normal map from integer-frequency waves. */
function rippleNormals(): THREE.CanvasTexture {
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!, img = g.createImageData(N, N);
  const waves = [[3, 1, 1], [1, 4, 0.8], [-5, 2, 0.5], [7, -3, 0.3], [2, 9, 0.25], [-11, -6, 0.15]].map(([kx, ky, a], i) => ({ kx, ky, a, p: i * 1.7 }));
  const h = (x: number, y: number) => waves.reduce((s, w) => s + w.a * Math.sin(((w.kx * x + w.ky * y) / N) * Math.PI * 2 + w.p), 0);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
      const l = Math.hypot(dx, dy, 0.6), i = (y * N + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (0.6 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(150, 150);
  return t;
}
const seaNormals = rippleNormals();
const seaMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0, normalMap: seaNormals, normalScale: new THREE.Vector2(0.28, 0.28) });
const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), seaMat);
sea.rotation.x = -Math.PI / 2;
scene.add(sea);

const rockMat = new THREE.MeshStandardMaterial({ color: 0x4d5148, roughness: 0.95, flatShading: true });
const turfMat = new THREE.MeshStandardMaterial({ color: 0x4f6b32, roughness: 1, flatShading: true });
for (const [x, z, r, h] of [[-220, -420, 40, 1.4], [260, -560, 60, 0.7], [-520, -900, 90, 1], [120, -1300, 140, 0.5], [600, -300, 35, 2.2], [-380, -180, 22, 1.2], [40, -2200, 220, 0.6]]) {
  const geo = new THREE.IcosahedronGeometry(r, 1);
  geo.scale(1, h, 1);
  const rock = new THREE.Mesh(geo, rockMat);
  rock.position.set(x, -r * h * 0.25, z);
  rock.rotation.y = x * 0.01;
  const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.72, 1).scale(1, h * 0.35, 1), turfMat);
  cap.position.set(x, r * h * 0.55, z);
  scene.add(rock, cap);
}

const auraVert = `varying vec3 vN; varying vec3 vV;
  void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const auraFrag = `uniform vec3 uColor; uniform float uOn; varying vec3 vN; varying vec3 vV;
  void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(uColor * (0.1 + f * 1.3) * uOn, 1.0); }`;

interface ShipRig {
  root: THREE.Group;
  body: THREE.Group;
  aura: { value: number };
}

function makeShip(sail: number): ShipRig {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const s = new THREE.Shape();
  s.moveTo(0, 9.5);
  s.quadraticCurveTo(2.8, 4, 2.6, -5);
  s.lineTo(1.9, -8.5);
  s.lineTo(-1.9, -8.5);
  s.lineTo(-2.6, -5);
  s.quadraticCurveTo(-2.8, 4, 0, 9.5);
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 2.8, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 2 });
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.translate(0, -1.3, 0);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.75 });
  body.add(new THREE.Mesh(hullGeo, wood));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 18, 8), wood);
  mast.position.set(0, 10.5, 0.5);
  body.add(mast);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 10, 6), wood);
  yard.rotation.z = Math.PI / 2;
  yard.position.set(0, 16.5, 0.2);
  body.add(yard);
  const sailGeo = new THREE.PlaneGeometry(9.5, 10, 10, 10);
  const pos = sailGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -Math.cos((pos.getX(i) / 9.5) * Math.PI) * Math.cos((pos.getY(i) / 10) * Math.PI) * 1.4);
  sailGeo.computeVertexNormals();
  const sailMesh = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color: sail, roughness: 0.9, side: THREE.DoubleSide }));
  sailMesh.position.set(0, 11.3, 0);
  body.add(sailMesh);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.2) }));
  lantern.position.set(0, 3.6, 7.4);
  body.add(lantern);
  const aura = { value: 1 };
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 20),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.25, 0.65, 1) }, uOn: aura },
      vertexShader: auraVert,
      fragmentShader: auraFrag,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  shell.scale.set(6.5, 8, 12.5);
  shell.position.y = 4;
  body.add(shell);
  return { root, body, aura };
}

const player = makeShip(0xf1e6cf);
scene.add(player.root);
const enemy = makeShip(0xb8452e);
const ENEMY_HOME = new THREE.Vector3(30, 0, -92);
enemy.root.position.copy(ENEMY_HOME);
enemy.root.rotation.y = Math.PI / 2 - 0.35;
scene.add(enemy.root);

const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.8, emissive: 0x332200 }));
const CRATE_HOME = new THREE.Vector3(-7, 0.4, -14);
crate.position.copy(CRATE_HOME);
scene.add(crate);

const shot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 }));
shot.visible = false;
scene.add(shot);
const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 300, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 9) }));
bolt.visible = false;
scene.add(bolt);

function applyLight(): void {
  const L = dusk ? LIGHTS.dusk : LIGHTS.day;
  skyU.uZenith.value.set(L.zenith);
  skyU.uHorizon.value.set(L.horizon);
  skyU.uSun.value.set(L.sun);
  skyU.uSunDir.value.set(L.dir[0], L.dir[1], L.dir[2]).normalize();
  hemi.color.set(L.sky);
  hemi.groundColor.set(L.ground);
  hemi.intensity = L.hemiI;
  sun.color.set(L.sun);
  sun.intensity = L.sunI;
  sun.position.set(L.dir[0], L.dir[1], L.dir[2]).multiplyScalar(100);
  seaMat.color.set(L.sea);
  (scene.fog as THREE.Fog).color.set(L.horizon);
  renderer.toneMappingExposure = L.exposure;
  const env = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  scene.environment = env.fromScene(envScene, 0, 1, 8000).texture;
  env.dispose();
}
applyLight();

// ------------------------------------------------------------------ stand-in particles (the actors owner's job)

const MAXP = 2000;
const pMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), MAXP);
pMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3);
pMesh.frustumCulled = false;
pMesh.count = 0;
scene.add(pMesh);
interface Part { p: THREE.Vector3; v: THREE.Vector3; g: number; drag: number; life: number; age: number; size: number; grow: number; spin: number; c: THREE.Color }
const parts: Part[] = [];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

interface Burst {
  n: number;
  at: THREE.Vector3;
  spread?: number;
  speed: [number, number];
  dir?: THREE.Vector3;
  cone?: number;
  up?: number;
  size: [number, number];
  life: [number, number];
  color: number | number[];
  bright?: number;
  g?: number;
  drag?: number;
  grow?: number;
}

function burst(b: Burst): void {
  for (let i = 0; i < b.n && parts.length < MAXP; i++) {
    let d = V(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
    if (b.dir) d = b.dir.clone().normalize().add(d.multiplyScalar(b.cone ?? 0.5)).normalize();
    const sp = b.speed[0] + (b.speed[1] - b.speed[0]) * rnd();
    const col = Array.isArray(b.color) ? b.color[Math.floor(rnd() * b.color.length)] : b.color;
    parts.push({
      p: b.at.clone().add(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(b.spread ?? 0.5)),
      v: d.multiplyScalar(sp).add(V(0, b.up ?? 0, 0)),
      g: b.g ?? -14,
      drag: b.drag ?? 1.2,
      life: b.life[0] + (b.life[1] - b.life[0]) * rnd(),
      age: 0,
      size: b.size[0] + (b.size[1] - b.size[0]) * rnd(),
      grow: b.grow ?? 0,
      spin: rnd() * 10,
      c: new THREE.Color(col).multiplyScalar(b.bright ?? 1),
    });
  }
}

const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), eul = new THREE.Euler(), sc = new THREE.Vector3();
function stepParts(dt: number): void {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.age += dt;
    if (p.age >= p.life) {
      parts.splice(i, 1);
      continue;
    }
    p.v.multiplyScalar(Math.exp(-p.drag * dt));
    p.v.y += p.g * dt;
    p.p.addScaledVector(p.v, dt);
    if (p.p.y < -0.2 && p.g < 0) p.v.y = Math.abs(p.v.y) * 0.2;
  }
  pMesh.count = parts.length;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], k = p.age / p.life;
    const s = (p.size + p.grow * p.age) * (1 - k * k);
    qt.setFromEuler(eul.set(p.spin + p.age * 7, p.spin * 2 + p.age * 5, 0));
    m4.compose(p.p, qt, sc.set(s, s, s));
    pMesh.setMatrixAt(i, m4);
    pMesh.setColorAt(i, p.c);
  }
  pMesh.instanceMatrix.needsUpdate = true;
  if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}

const SPLINTER = [0x6b4428, 0x8a5a33, 0x4a2e1a, 0xc9a06a];
const SPARK = [0xffb347, 0xffd27a, 0xff7a2a];
const CONFETTI = [0xffcf3a, 0x4fc3ff, 0xff5a7a, 0x7be36b, 0xb866ff, 0xffffff];

/** Where shots land on the enemy, and where the player's own hits land. */
const enemyHit = () => enemy.root.position.clone().add(V(0, 3, 0));
const playerHit = () => player.root.position.clone().add(V(1.5, 2.5, -2));
let enemyShieldOn = 1, playerShieldOn = 1, sinkT = -1, hopT = -1, gustT = -1, boltT = -1;

const HOOKS: Record<string, (c: ParticleCall) => void> = {
  muzzle: () => {
    const at = V(0.5, 2.6, -9.5);
    burst({ n: 18, at, speed: [3, 9], dir: V(0, 0.2, -1), cone: 0.6, size: [1.2, 2.2], life: [0.6, 1.2], color: 0x8d8a84, g: 1.5, drag: 2, grow: 2.5 });
    burst({ n: 14, at, speed: [10, 22], dir: V(0, 0.1, -1), cone: 0.35, size: [0.3, 0.6], life: [0.1, 0.25], color: SPARK, bright: 3, g: 0 });
  },
  splinters: (c) => {
    burst({ n: Math.round(26 * c.amount), at: enemyHit(), speed: [6, 16], up: 5, size: [0.25, 0.7], life: [0.6, 1.2], color: SPLINTER, g: -20 });
    burst({ n: 10, at: enemyHit(), speed: [10, 20], size: [0.15, 0.3], life: [0.1, 0.3], color: SPARK, bright: 3, g: 0 });
  },
  shieldRipple: () => burst({ n: 22, at: enemyHit().add(V(0, 0, 6)), spread: 4, speed: [2, 6], size: [0.2, 0.45], life: [0.2, 0.5], color: 0x4fc3ff, bright: 2.5, g: 0 }),
  critBurst: () => {
    burst({ n: 36, at: enemyHit(), speed: [10, 26], size: [0.2, 0.45], life: [0.2, 0.5], color: [0xffd23f, 0xfff0a0], bright: 3.5, g: -4 });
    burst({ n: 24, at: enemyHit(), speed: [6, 18], up: 6, size: [0.25, 0.7], life: [0.6, 1.2], color: SPLINTER, g: -20 });
  },
  shards: () => {
    enemyShieldOn = 0;
    enemy.aura.value = 0;
    burst({ n: 90, at: enemyHit(), spread: 8, speed: [8, 26], size: [0.4, 1.1], life: [0.5, 1.1], color: [0x9fe3ff, 0x4fc3ff, 0xffffff], bright: 2.2, g: -10, drag: 1.6 });
  },
  shardsSelf: () => {
    playerShieldOn = 0;
    player.aura.value = 0;
    burst({ n: 60, at: player.root.position.clone().add(V(0, 4, 0)), spread: 10, speed: [8, 20], size: [0.4, 1], life: [0.5, 1], color: [0x9fe3ff, 0x4fc3ff, 0xffffff], bright: 2.2, g: -10, drag: 1.6 });
  },
  splintersSelf: () => burst({ n: 26, at: playerHit(), speed: [6, 14], up: 5, size: [0.25, 0.6], life: [0.6, 1.1], color: SPLINTER, g: -20 }),
  wreck: () => {
    sinkT = 0;
    const at = enemyHit();
    burst({ n: 100, at, speed: [8, 30], up: 8, size: [0.3, 1], life: [0.8, 1.6], color: SPLINTER, g: -20 });
    burst({ n: 40, at, speed: [6, 18], size: [0.5, 1.2], life: [0.3, 0.6], color: SPARK, bright: 4, g: 2 });
    burst({ n: 40, at, speed: [2, 6], up: 3, size: [1.5, 3], life: [1.4, 2.4], color: 0x55524d, g: 2, drag: 1, grow: 2 });
    burst({ n: 60, at: at.clone().setY(0.3), spread: 8, speed: [4, 12], up: 10, size: [0.4, 0.9], life: [0.6, 1.2], color: 0xeaf6ff, bright: 1.4, g: -18 });
  },
  gustBurst: () => {
    hopT = 0;
    gustT = 0;
    burst({ n: 70, at: V(0, 0.4, 4), spread: 6, speed: [6, 16], dir: V(0, 0.6, 1), cone: 0.8, size: [0.3, 0.8], life: [0.4, 0.9], color: 0xeaf6ff, bright: 1.5, g: -14 });
  },
  sparkle: (c) =>
    burst({ n: Math.round(26 * c.amount), at: crate.position.clone().add(V(0, 1.5, 0)), spread: 2, speed: [2, 7], up: 4, size: [0.2, 0.45], life: [0.5, 1.1], color: new THREE.Color(c.color ?? '#ffffff').getHex(), bright: 2.5, g: -2 }),
  shimmer: () => {
    playerShieldOn = 1;
    burst({ n: 50, at: V(0, 4, 0), spread: 12, speed: [1, 4], up: 3, size: [0.2, 0.4], life: [0.6, 1.2], color: 0x4fc3ff, bright: 2.5, g: 1 });
  },
  repairGlow: () => burst({ n: 40, at: V(0, 3, 0), spread: 10, speed: [1, 3], up: 3, size: [0.2, 0.45], life: [0.6, 1.2], color: [0x7be36b, 0xd8ffb0], bright: 2.2, g: 1 }),
  levelBurst: () => burst({ n: 120, at: V(0, 12, -10), spread: 4, speed: [10, 24], up: 6, size: [0.3, 0.7], life: [1, 1.8], color: [0xffcf3a, 0xfff0a0, 0xffffff], bright: 2, g: -9, drag: 1.4 }),
  rankBurst: () => burst({ n: 120, at: V(0, 12, -10), spread: 4, speed: [10, 24], up: 6, size: [0.3, 0.7], life: [1, 1.8], color: [0x9fd0ff, 0xffffff, 0xc9d6e4], bright: 2, g: -9, drag: 1.4 }),
  fireworks: () => {
    for (let i = 0; i < 4; i++)
      burst({ n: 70, at: V(-30 + i * 20, 30 + (i % 2) * 10, -60 - i * 8), speed: [12, 22], size: [0.4, 0.8], life: [1.2, 2], color: CONFETTI[i % CONFETTI.length], bright: 3, g: -6, drag: 1.2 });
  },
  landingSplash: () => {
    hopT = 0.5;
    burst({ n: 120, at: V(0, 0.3, 0), spread: 14, speed: [6, 16], up: 9, size: [0.4, 1], life: [0.6, 1.2], color: 0xeaf6ff, bright: 1.4, g: -18 });
  },
  scrape: () => {
    burst({ n: 30, at: V(0, 0.5, -9), spread: 3, speed: [4, 12], up: 5, size: [0.3, 0.8], life: [0.5, 1], color: [0x6a6258, 0x8a7a68], g: -18 });
    burst({ n: 40, at: V(0, 0.3, -9), spread: 4, speed: [4, 10], up: 6, size: [0.3, 0.7], life: [0.4, 0.9], color: 0xeaf6ff, bright: 1.4, g: -16 });
  },
  breach: () => burst({ n: 220, at: V(-110, 2, -160), spread: 16, speed: [6, 20], up: 26, size: [0.8, 2.2], life: [1.2, 2.4], color: 0xeaf6ff, bright: 1.3, g: -16 }),
  lightning: () => {
    boltT = 0;
    bolt.position.set(140, 150, -260);
  },
};

// ------------------------------------------------------------------ the HUD stand-in and the toolkit

const hud = $('hud');
const juice = new Juice({
  hud,
  seed: 7,
  haptics: null,
  hooks: {
    particles: (c) => HOOKS[c.hook]?.(c),
  },
});
juice.target('coins', $('coins'));
juice.target('kills', $('kills'));
juice.target('shield', $('shieldbar'));
juice.target('shieldValue', $('shieldval'));
juice.target('hull', $('hullbar'));
juice.target('hullValue', $('hullval'));
juice.target('level', $('levelbox'));
juice.target('levelValue', $('level'));
juice.target('rank', $('rank'));
juice.target('hotbar', $('newslot'));
juice.target('gust', $('gust'));

const bench = { shield: 50, hull: 100, eShield: 100, eHull: 100, coins: 120, kills: 2, level: 12, xp: 400, rank: 4 };
const RANKS = ['Iron I', 'Iron II', 'Iron III', 'Bronze I', 'Silver II', 'Silver III', 'Gold I', 'Gold II'];
let lowHull = q.has('hull') ? Number(q.get('hull')) : 1;

function drawBars(): void {
  $('shieldfill').style.width = `${bench.shield}%`;
  $('hullfill').style.width = `${(lowHull < 1 ? lowHull * 100 : bench.hull)}%`;
  if (!countingShield) $('shieldval').textContent = String(Math.round(bench.shield));
  if (!countingHull) $('hullval').textContent = String(Math.round(lowHull < 1 ? lowHull * 100 : bench.hull));
  $('eshield').style.width = `${bench.eShield}%`;
  $('ehull').style.width = `${bench.eHull}%`;
  $('xpfill').style.width = `${bench.xp / 10}%`;
}
let countingShield = false, countingHull = false;

const tmpV = new THREE.Vector3();
function project(v: THREE.Vector3): { x: number; y: number } | null {
  tmpV.copy(v).project(camera);
  if (tmpV.z > 1) return null;
  return { x: ((tmpV.x + 1) / 2) * hud.clientWidth, y: ((1 - tmpV.y) / 2) * hud.clientHeight };
}

/** The screen direction an enemy shot comes from, clockwise from ahead. */
const DIRS = [1.6, -1.4, 0.2, 2.8];
let dirI = 0;
const hitDir = () => (q.has('dir') ? Number(q.get('dir')) : DIRS[dirI++ % DIRS.length]);

// ------------------------------------------------------------------ playing a recipe with bench context

let gameT = 0, realT = 0;
const later: { at: number; fn: () => void }[] = [];
const after = (s: number, fn: () => void) => later.push({ at: gameT + s, fn });

export const SEQUENCES = ['volley', 'breakCombo', 'repeater', 'coins40', 'lowHull'] as const;
type Play = RecipeId | (typeof SEQUENCES)[number];

function onEnemy(value: number): FireContext {
  const at = enemyHit();
  return { value, world: at, anchor: () => project(enemyHit()), key: 'enemy', distance: camera.position.distanceTo(at) };
}

function play(id: Play): void {
  switch (id) {
    case 'cannonHit':
      bench.eHull = Math.max(0, bench.eHull - 22);
      return juice.fire(id, onEnemy(22));
    case 'shieldHit':
      bench.eShield = Math.max(0, bench.eShield - 18);
      return juice.fire(id, onEnemy(18));
    case 'crit':
      bench.eHull = Math.max(0, bench.eHull - 44);
      return juice.fire(id, onEnemy(44));
    case 'shieldBreak':
      juice.fire(id, onEnemy(Math.max(1, bench.eShield)));
      bench.eShield = 0;
      return;
    case 'sink':
      bench.eHull = 0;
      bench.kills++;
      $('kills').textContent = String(bench.kills);
      return juice.fire(id, onEnemy(0));
    case 'shieldLost':
      bench.shield = 0;
      return juice.fire(id, { dir: hitDir(), world: playerHit() });
    case 'hurt':
      bench.hull = Math.max(5, bench.hull - 18);
      return juice.fire(id, { dir: hitDir(), world: playerHit() });
    case 'stormHurt':
      bench.hull = Math.max(5, bench.hull - 4);
      return juice.fire(id, {});
    case 'consumable.shield': {
      const from = bench.shield;
      bench.shield = Math.min(100, from + 50);
      countingShield = true;
      after(1.5, () => (countingShield = false));
      return juice.fire(id, { from, to: bench.shield });
    }
    case 'consumable.repair': {
      const from = bench.hull;
      bench.hull = Math.min(100, from + 15);
      countingHull = true;
      after(1.5, () => (countingHull = false));
      return juice.fire(id, { from, to: bench.hull });
    }
    case 'coins':
    case 'coins40': {
      const n = id === 'coins40' ? 40 : 8, from = bench.coins;
      bench.coins += n * 3;
      return juice.fire('coins', { from, to: bench.coins, count: n, value: n * 3, at: project(player.root.position.clone().add(V(0, 6, 0))) ?? undefined });
    }
    case 'levelUp': {
      const from = bench.level;
      bench.level++;
      bench.xp = 0;
      return juice.fire(id, { from, to: bench.level });
    }
    case 'rankUp':
      bench.rank = (bench.rank + 1) % RANKS.length;
      $('rank').textContent = RANKS[bench.rank];
      return juice.fire(id, {});
    case 'win': {
      const b = $('banner');
      b.style.opacity = '1';
      after(3, () => (b.style.opacity = '0'));
      juice.fire(id, {});
      juice.target('banner', b);
      return;
    }
    case 'whaleBreach':
      return juice.fire(id, { distance: 160, world: { x: -110, y: 0, z: -160 } });
    case 'lightning':
      return juice.fire(id, { distance: 280, world: { x: 140, y: 0, z: -260 } });
    case 'volley': {
      juice.fire('fire', {});
      shotFrom.set(0.5, 2.6, -9.5);
      shotT = 0;
      shot.visible = true;
      return;
    }
    case 'breakCombo':
      bench.eShield = 40;
      bench.eHull = 100;
      enemyShieldOn = 1;
      play('shieldHit');
      after(0.35, () => play('shieldHit'));
      after(0.7, () => play('shieldBreak'));
      after(1.1, () => play('cannonHit'));
      after(1.45, () => play('crit'));
      after(1.95, () => play('sink'));
      return;
    case 'repeater':
      bench.eShield = 100;
      enemyShieldOn = 1;
      for (let i = 0; i < 10; i++)
        after(i * 0.09, () => {
          bench.eShield = Math.max(0, bench.eShield - 6);
          juice.fire('shieldHit', { ...onEnemy(6), strength: 0.4 });
        });
      return;
    case 'lowHull':
      lowHull = lowHull < 1 ? 1 : 0.18;
      return;
    default:
      if (id.startsWith('pickup.')) {
        const at = project(crate.position.clone().add(V(0, 1, 0)));
        crate.visible = false;
        after(1.6, () => (crate.visible = true));
        const r = ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(id.slice(7));
        ($('newslot').firstElementChild as HTMLElement).style.setProperty('--c', ['#a9b4c0', '#5fd35a', '#3fa5ff', '#b866ff', '#ffb52e'][r]);
        return juice.fire(id, { at: at ?? undefined, world: { x: crate.position.x, y: 1, z: crate.position.z } });
      }
      return juice.fire(id, {});
  }
}

const shotFrom = new THREE.Vector3();
let shotT = -1;
const FLIGHT = 0.42;

// ------------------------------------------------------------------ the frame

function frame(dt: number): void {
  realT += dt;
  const gdt = juice.update(dt);
  gameT += gdt;
  for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= gameT) later.splice(i, 1)[0].fn();
  juice.setHull(lowHull < 1 ? lowHull : bench.hull / 100);

  // the world runs on game time, so a hit-stop freezes it
  const t = gameT;
  seaNormals.offset.set(t * 0.006, t * (0.012 + (gustT >= 0 && gustT < 1.2 ? 0.05 * (1 - gustT / 1.2) : 0)));
  if (gustT >= 0) gustT += gdt;
  let hop = 0;
  if (hopT >= 0) {
    hopT += gdt / 0.75;
    hop = hopT < 1 ? Math.sin(Math.PI * hopT) * 2.4 : 0;
    if (hopT >= 1) hopT = -1;
  }
  player.body.position.y = Math.sin(t * 1.1) * 0.22 + hop;
  player.body.rotation.z = Math.sin(t * 0.8) * 0.035;
  player.body.rotation.x = Math.sin(t * 0.9) * 0.02 - hop * 0.03;
  enemy.body.position.y = Math.sin(t * 1.0 + 2) * 0.25;
  enemy.body.rotation.z = Math.sin(t * 0.7 + 1) * 0.04;
  if (sinkT >= 0) {
    sinkT += gdt;
    const k = Math.min(1, sinkT / 2.6);
    enemy.root.position.y = -9 * k * k;
    enemy.root.rotation.z = 0.7 * k;
    if (sinkT > 4.5) {
      sinkT = -1;
      enemy.root.position.copy(ENEMY_HOME);
      enemy.root.rotation.z = 0;
      bench.eShield = 100;
      bench.eHull = 100;
      enemyShieldOn = 1;
    }
  }
  enemy.aura.value += ((enemyShieldOn && sinkT < 0 ? 0.35 + 0.65 * (bench.eShield / 100) : 0) - enemy.aura.value) * Math.min(1, gdt * 12);
  player.aura.value += ((playerShieldOn && bench.shield > 0 ? 0.08 + 0.17 * (bench.shield / 100) : 0) - player.aura.value) * Math.min(1, gdt * 6);
  crate.position.y = CRATE_HOME.y + Math.sin(t * 1.6) * 0.3;
  crate.rotation.y = t * 0.6;
  if (shotT >= 0) {
    shotT += gdt / FLIGHT;
    const to = enemyHit();
    shot.position.lerpVectors(shotFrom, to, Math.min(1, shotT));
    shot.position.y += Math.sin(Math.PI * Math.min(1, shotT)) * 6;
    if (shotT >= 1) {
      shotT = -1;
      shot.visible = false;
      play(bench.eShield > 0 ? 'shieldHit' : 'cannonHit');
    }
  }
  if (boltT >= 0) {
    boltT += gdt;
    bolt.visible = boltT < 0.16 && Math.floor(boltT * 40) % 2 === 0;
    if (boltT > 0.3) boltT = -1;
  }
  stepParts(juice.time.effectDt(dt));

  // the camera: a fixed over-the-shoulder chase, aimed at the enemy, then the juice on top
  camera.position.set(5, 9, 26);
  camera.lookAt(ENEMY_HOME.x, 5, ENEMY_HOME.z);
  juice.applyCamera(camera, BASE_FOV);
  camera.updateMatrixWorld();
  renderer.render(scene, camera);

  // the HUD's world-anchored bits
  const p = project(ENEMY_HOME.clone().add(V(0, 22, 0)));
  const eb = $('enemy');
  eb.style.opacity = p && sinkT < 0 ? '1' : '0';
  if (p) eb.style.transform = `translate(${p.x}px, ${p.y}px)`;
  drawBars();
  scope.push(juice);
}

// ------------------------------------------------------------------ the scope and the log

const scope = (() => {
  const c = $<HTMLCanvasElement>('scope');
  const N = 180;
  const rows: number[][] = [];
  const lines: [string, string, (r: number[]) => number][] = [
    ['time', '#ffffff', (r) => r[0]],
    ['shake', '#ff9b3d', (r) => r[1]],
    ['rumble', '#ffe066', (r) => r[2]],
    ['fov', '#4fc3ff', (r) => 0.5 - r[3] / 20],
    ['flash', '#ff7ad9', (r) => r[4]],
    ['vignette', '#ff4a4a', (r) => r[5]],
  ];
  return {
    push(j: Juice) {
      const s = j.screen.state;
      rows.push([j.time.scale, j.camera.trauma.hit ** 2, j.camera.trauma.rumble ** 2, j.camera.offset.fov, Math.max(s.add.alpha, s.tint.alpha), s.vignette.alpha]);
      if (rows.length > N) rows.shift();
      if (document.body.classList.contains('clean')) return;
      const w = (c.width = c.clientWidth * 2), h = (c.height = c.clientHeight * 2);
      const g = c.getContext('2d')!;
      g.lineWidth = 2;
      lines.forEach(([name, col, f], k) => {
        g.strokeStyle = col;
        g.beginPath();
        rows.forEach((r, i) => {
          const x = (i / (N - 1)) * w, y = 8 + (1 - Math.max(0, Math.min(1, f(r)))) * (h - 16);
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        });
        g.stroke();
        g.fillStyle = col;
        g.font = '600 18px system-ui';
        g.fillText(name, 8 + k * 96, h - 6);
      });
    },
  };
})();

const logEl = $('log');
const recent: EffectEntry[] = [];
effects.listen((e) => {
  recent.push(e);
  if (recent.length > 18) recent.shift();
  if (!document.body.classList.contains('clean')) logEl.innerHTML = recent.map((r) => `<div class="${r.outcome}">${escape(format(r))}</div>`).join('');
});
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ------------------------------------------------------------------ the panel

const GROUPS: [string, Play[]][] = [
  ['Your hits', ['fire', 'cannonHit', 'shieldHit', 'crit', 'shieldBreak', 'sink']],
  ['Hits on you', ['hurt', 'shieldLost', 'stormHurt']],
  ['Moves', ['gust', 'landing', 'aground']],
  ['Loot', ['pickup.common', 'pickup.uncommon', 'pickup.rare', 'pickup.epic', 'pickup.legendary', 'coins', 'coins40']],
  ['Consumables', ['consumable.shield', 'consumable.repair']],
  ['Ceremonies', ['levelUp', 'rankUp', 'win']],
  ['World', ['whaleBreach', 'lightning']],
  ['Interface', ['tap']],
  ['Sequences', ['volley', 'breakCombo', 'repeater', 'lowHull']],
];
const listed = new Set(GROUPS.flatMap((g) => g[1]));
const other = RECIPE_IDS.filter((id) => !listed.has(id) && id !== 'heartbeat');
if (other.length) GROUPS.push(['Other', other]);

const panel = $('panel');
const toggles = document.createElement('div');
toggles.className = 'row';
const toggle = (label: string, on: () => boolean, flip: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  const sync = () => b.classList.toggle('on', on());
  sync();
  pressable(b, { onTap: () => (flip(), sync()) });
  toggles.append(b);
};
let slow = SLOW;
toggle('Dusk', () => dusk, () => ((dusk = !dusk), applyLight()));
toggle('Slow', () => slow < 1, () => (slow = slow < 1 ? 1 : 0.25));
toggle('Shake', () => juice.camera.intensity > 0, () => juice.settings({ shake: juice.camera.intensity > 0 ? 0 : 1 }));
panel.append(toggles);
for (const [title, ids] of GROUPS) {
  const h = document.createElement('h3');
  h.textContent = title;
  panel.append(h);
  for (const id of ids) {
    const b = document.createElement('button');
    b.textContent = id in RECIPES ? RECIPES[id as RecipeId].label : { volley: 'Fire → hit (volley)', breakCombo: 'Shield → break → sink', repeater: 'Repeater on a shield', coins40: 'Coins ×40 (canvas)', lowHull: 'Low hull on/off' }[id as (typeof SEQUENCES)[number]];
    pressable(b, { onTap: () => play(id) });
    panel.append(b);
  }
}

// ------------------------------------------------------------------ running

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  juice.markers!.scale = juice.numbers!.scale = innerHeight < 600 ? 0.9 : 1;
}
addEventListener('resize', resize);
resize();

const auto = q.get('recipe') as Play | null;
if (auto) {
  const every = Number(q.get('repeat') ?? 0);
  setTimeout(function go() {
    play(auto);
    if (every > 0) setTimeout(go, every * 1000);
  }, STRIP ? 0 : 1000);
}

(window as unknown as { __juice: unknown }).__juice = {
  ready: true,
  ids: [...RECIPE_IDS, ...SEQUENCES],
  play,
  step: (dt = 1 / 60) => frame(dt),
  state: () => {
    const s = juice.screen.state, o = juice.camera.offset;
    return { gameT, realT, scale: juice.time.scale, shake: juice.camera.trauma.hit, rumble: juice.camera.trauma.rumble, fov: o.fov, roll: o.roll, pitch: o.pitch, add: s.add.alpha, tint: s.tint.alpha, vig: s.vignette.alpha };
  },
  log: (since = 0) => effects.text(effects.since(since)),
  clear: () => effects.clear(),
};

if (STRIP) frame(1 / 60);
else {
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000) * slow;
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

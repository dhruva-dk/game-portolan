// PROTOTYPE (throwaway): 3D gull portraits, head and shoulders, rendered once per gull to an image and cached.
// Seeded: plumage by age, head and beak shapes, sunglasses, dress by role in the crew's two colours, one accessory.
import {
  ACESFilmicToneMapping, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, Group, HemisphereLight,
  Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, WebGLRenderer,
  type BufferGeometry,
} from 'three';

export type Role = 'captain' | 'bosun' | 'shipwright' | 'scout' | 'flight' | 'manager' | 'elder';
export interface Who { seed: number; age: number; role: Role; c1: string; c2: string }

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const mats = new Map<string, MeshStandardMaterial>();
const mat = (hex: string, rough = 0.75, metal = 0) => {
  const k = `${hex}${rough}${metal}`;
  if (!mats.has(k)) mats.set(k, new MeshStandardMaterial({ color: new Color(hex), roughness: rough, metalness: metal }));
  return mats.get(k)!;
};

function put(g: Group, geo: BufferGeometry, m: MeshStandardMaterial, at: number[], scale: number[] = [1, 1, 1], rot: number[] = [0, 0, 0]) {
  const o = new Mesh(geo, m);
  o.position.set(at[0], at[1], at[2]);
  o.scale.set(scale[0], scale[1], scale[2]);
  o.rotation.set(rot[0], rot[1], rot[2]);
  g.add(o);
  return o;
}

function gull(w: Who): Group {
  const r = rng(w.seed);
  const g = new Group();
  const young = w.age < 20, old = w.age > 45;
  const feather = young ? '#a8927a' : old ? '#d4d4cf' : r() < 0.6 ? '#f4f2ec' : '#e4e3de';
  const mantle = young ? '#8a755e' : old ? '#a7a9a8' : '#9aa1a8';
  const F = mat(feather, 0.9), M = mat(mantle, 0.9);

  // the head: three shapes
  const head = [[0.95, 0.9, 1.08], [1.0, 0.98, 1.0], [0.9, 0.95, 1.15]][Math.floor(r() * 3)];
  put(g, new SphereGeometry(0.5, 48, 32), F, [0, 1.3, 0], head);
  // brow tufts
  const tufts = 2 + Math.floor(r() * 4);
  for (let i = 0; i < tufts; i++) put(g, new ConeGeometry(0.05, 0.22, 5), F, [(i - tufts / 2) * 0.07, 1.78, -0.12 - i * 0.03], [1, 1, 1], [-0.9 - r() * 0.4, 0, (i - tufts / 2) * 0.25]);
  if (young) for (let i = 0; i < 9; i++) put(g, new SphereGeometry(0.05, 6, 4), mat('#6e5a45'), [(r() - 0.5) * 0.8, 1.15 + r() * 0.5, 0.2 + r() * 0.3], [1, 0.5, 1]);

  // the beak: four shapes, yellow with its red spot
  const beak = [[0.12, 0.72, 0], [0.15, 0.6, 0.08], [0.1, 0.85, 0], [0.17, 0.55, 0.14]][Math.floor(r() * 4)];
  const Y = mat('#f2b632', 0.5);
  put(g, new ConeGeometry(beak[0], beak[1], 12), Y, [0, 1.2, 0.5 + beak[1] / 2], [1.15, 0.8, 1], [Math.PI / 2 + 0.12, 0, 0]);
  if (beak[2]) put(g, new SphereGeometry(beak[2], 10, 8), Y, [0, 1.15, 0.48 + beak[1]], [1, 1, 1.2]);
  put(g, new SphereGeometry(0.05, 10, 8), mat('#d2302a', 0.5), [0.07, 1.11, 0.55 + beak[1] * 0.7], [0.6, 1, 1]);

  // the sunglasses: six shapes, a tint from the inks
  const tint = ['#14181f', '#2b3f6b', '#5a2030', '#1f4a3a', '#6b4a12', '#3a2b55'][Math.floor(r() * 6)];
  const L = mat(tint, 0.15, 0.4), frame = mat(r() < 0.5 ? '#1a1a1a' : '#c9a227', 0.4, 0.6);
  const shades = Math.floor(r() * 6);
  if (shades === 3 || shades === 5) {
    // shield and visor: one band round the face
    put(g, new TorusGeometry(0.46, shades === 3 ? 0.09 : 0.06, 8, 24, Math.PI * 0.95), shades === 3 ? L : mat(w.c2, 0.3, 0.2), [0, 1.42, 0.05], [1.05, 0.8, 1.05], [Math.PI / 2 + 0.15, 0, Math.PI * 0.025]);
  } else {
    for (const s of [-1, 1]) {
      const at = [s * 0.27, 1.42, 0.33];
      const ry = s * 0.75;
      if (shades === 0) put(g, new SphereGeometry(0.15, 14, 10), L, at, [1, 0.8, 0.35], [0.1, ry, 0]); // aviator
      if (shades === 1) put(g, new BoxGeometry(0.3, 0.18, 0.05), L, at, [1, 1, 1], [0.1, ry, s * -0.12]); // wayfarer
      if (shades === 2) put(g, new CylinderGeometry(0.13, 0.13, 0.04, 18), L, at, [1, 1, 1], [Math.PI / 2, 0, -ry]); // round
      if (shades === 4) put(g, new SphereGeometry(0.15, 14, 10), L, at, [1.2, 0.6, 0.35], [0.1, ry, s * 0.35]); // cat-eye
    }
    put(g, new BoxGeometry(0.2, 0.035, 0.035), frame, [0, 1.47, 0.46]);
    for (const s of [-1, 1]) put(g, new BoxGeometry(0.03, 0.03, 0.45), frame, [s * 0.42, 1.46, 0.05]);
  }

  // the neck and the shoulders, black wingtips behind
  put(g, new CylinderGeometry(0.3, 0.38, 0.5, 18), F, [0, 0.85, 0.02]);
  for (const s of [-1, 1]) put(g, new ConeGeometry(0.16, 0.6, 6), mat('#1c1c1f', 0.9), [s * 0.95, 0.35, -0.35], [1, 1, 0.6], [0.6, 0, s * 0.9]);
  for (const s of [-1, 1]) put(g, new SphereGeometry(0.35, 12, 8), M, [s * 0.8, 0.3, -0.25], [1, 0.8, 1]);

  dress(g, w, r);
  accessory(g, w, r);
  g.rotation.y = 0.5;
  return g;
}

function dress(g: Group, w: Who, r: () => number) {
  const C1 = mat(w.c1, 0.7), C2 = mat(w.c2, 0.6), gold = mat('#d8b23a', 0.35, 0.7);
  const body = (m: MeshStandardMaterial) => put(g, new SphereGeometry(1, 24, 16), m, [0, 0.05, 0], [1.05, 0.72, 0.72]);
  const vee = (m: MeshStandardMaterial) => {
    for (const s of [-1, 1]) put(g, new BoxGeometry(0.16, 0.7, 0.06), m, [s * 0.16, 0.4, 0.66], [1, 1, 1], [-0.25, 0, s * 0.45]);
  };
  switch (w.role) {
    case 'captain':
      body(C1); vee(C2);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) put(g, new SphereGeometry(0.045, 8, 6), gold, [s * 0.22, 0.35 - i * 0.16, 0.7 - i * 0.02]);
      for (const s of [-1, 1]) put(g, new CylinderGeometry(0.26, 0.26, 0.06, 16), gold, [s * 0.78, 0.55, 0], [1, 1, 0.7], [0, 0, s * 0.35]);
      break;
    case 'manager':
      body(mat('#2a2d36', 0.6));
      put(g, new BoxGeometry(0.3, 0.6, 0.05), mat('#f2efe8'), [0, 0.42, 0.68], [1, 1, 1], [-0.25, 0, 0]);
      put(g, new BoxGeometry(0.1, 0.5, 0.05), C1, [0, 0.38, 0.72], [1, 1, 1], [-0.25, 0, 0]);
      vee(mat('#2a2d36', 0.6));
      put(g, new BoxGeometry(0.16, 0.08, 0.04), C2, [-0.42, 0.38, 0.6], [1, 1, 1], [-0.2, -0.5, 0]);
      break;
    case 'bosun':
      body(mat('#ece6d8', 0.9));
      for (const s of [-1, 1]) put(g, new BoxGeometry(0.12, 0.8, 0.05), C1, [s * 0.32, 0.3, 0.64], [1, 1, 1], [-0.3, 0, 0]);
      put(g, new BoxGeometry(0.7, 0.4, 0.05), C1, [0, -0.05, 0.7], [1, 1, 1], [-0.2, 0, 0]);
      put(g, new SphereGeometry(0.05, 8, 6), C2, [0.3, 0.55, 0.62]);
      break;
    case 'shipwright':
      body(C1);
      put(g, new BoxGeometry(0.75, 0.9, 0.05), mat('#7a5232', 0.8), [0, 0.2, 0.7], [1, 1, 1], [-0.25, 0, 0]);
      put(g, new BoxGeometry(0.75, 0.05, 0.05), C2, [0, 0.62, 0.62]);
      break;
    case 'scout':
      body(mat('#c79a2a', 0.45));
      put(g, new TorusGeometry(0.42, 0.13, 8, 20), mat('#b0861f', 0.45), [0, 0.68, 0.05], [1, 1, 1], [Math.PI / 2, 0, 0]);
      put(g, new BoxGeometry(0.5, 0.12, 0.05), C1, [0, 0.15, 0.72], [1, 1, 1], [-0.2, 0, 0]);
      break;
    case 'flight':
      body(C1);
      put(g, new BoxGeometry(0.04, 0.8, 0.05), mat('#cfcfcf', 0.3, 0.8), [0.05, 0.25, 0.72], [1, 1, 1], [-0.25, 0, 0]);
      put(g, new CylinderGeometry(0.13, 0.13, 0.04, 16), C2, [-0.35, 0.4, 0.62], [1, 1, 1], [Math.PI / 2 - 0.3, 0, 0.4]);
      put(g, new TorusGeometry(0.36, 0.06, 6, 18), C2, [0, 0.66, 0.05], [1, 1, 1], [Math.PI / 2, 0, 0]);
      break;
    case 'elder':
      body(mat('#3d2f4a', 0.9));
      put(g, new TorusGeometry(0.42, 0.14, 8, 20), C2, [0, 0.66, 0.05], [1, 1, 1], [Math.PI / 2, 0, 0]);
      put(g, new SphereGeometry(0.1, 10, 8), gold, [0, 0.3, 0.72]);
      break;
  }
  // the crew's emblem on the chest
  if (w.role !== 'manager' && w.role !== 'elder') put(g, new CylinderGeometry(0.09, 0.09, 0.03, 6), C2, [-0.38, 0.32, 0.63], [1, 1, 1], [Math.PI / 2 - 0.3, 0, 0.5]);
  void r;
}

function accessory(g: Group, w: Who, r: () => number) {
  const C1 = mat(w.c1, 0.7), C2 = mat(w.c2, 0.6), dark = mat('#2a2622', 0.8), gold = mat('#d8b23a', 0.35, 0.7);
  const pick = w.role === 'captain' && r() < 0.6 ? 0 : Math.floor(r() * 12);
  switch (pick) {
    case 0: // tricorn
      put(g, new CylinderGeometry(0.72, 0.72, 0.08, 3), dark, [0, 1.76, -0.02], [1, 1, 1], [0, Math.PI, 0]);
      put(g, new CylinderGeometry(0.36, 0.42, 0.3, 14), dark, [0, 1.9, -0.05]);
      put(g, new TorusGeometry(0.4, 0.025, 4, 18), gold, [0, 1.8, -0.03], [1, 1, 1], [Math.PI / 2, 0, 0]);
      break;
    case 1: // bandana
      put(g, new SphereGeometry(0.53, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), C2, [0, 1.36, -0.02], [0.97, 0.93, 1.1]);
      put(g, new SphereGeometry(0.09, 8, 6), C2, [0, 1.45, -0.55]);
      break;
    case 2: // earring
      put(g, new TorusGeometry(0.06, 0.015, 6, 14), gold, [0.47, 1.12, -0.08], [1, 1, 1], [0, Math.PI / 2, 0]);
      break;
    case 3: // pipe
      put(g, new CylinderGeometry(0.02, 0.02, 0.35, 6), dark, [0.12, 1.02, 0.78], [1, 1, 1], [Math.PI / 2.4, 0, 0.2]);
      put(g, new CylinderGeometry(0.07, 0.05, 0.14, 10), mat('#5a3a22'), [0.18, 0.95, 0.95]);
      break;
    case 4: // scarf
      put(g, new TorusGeometry(0.36, 0.1, 8, 20), C2, [0, 0.95, 0.03], [1, 1, 1], [Math.PI / 2 - 0.2, 0, 0]);
      put(g, new BoxGeometry(0.16, 0.45, 0.06), C2, [0.22, 0.65, 0.48], [1, 1, 1], [-0.3, 0, 0.15]);
      break;
    case 5: // headset
      put(g, new TorusGeometry(0.52, 0.035, 6, 20, Math.PI), dark, [0, 1.32, 0], [1, 1, 1], [0, Math.PI / 2, 0]);
      for (const s of [-1, 1]) put(g, new CylinderGeometry(0.11, 0.11, 0.08, 14), dark, [s * 0.5, 1.3, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
      put(g, new CylinderGeometry(0.015, 0.015, 0.45, 6), dark, [0.48, 1.12, 0.22], [1, 1, 1], [1.2, 0, 0]);
      break;
    case 6: // goggles pushed up
      for (const s of [-1, 1]) put(g, new CylinderGeometry(0.12, 0.12, 0.08, 14), mat('#7a5a2a', 0.5, 0.4), [s * 0.17, 1.72, 0.22], [1, 1, 1], [1.0, 0, 0]);
      put(g, new TorusGeometry(0.5, 0.03, 4, 24), mat('#4a3a2a'), [0, 1.62, 0], [1, 1, 1], [Math.PI / 2 - 0.4, 0, 0]);
      break;
    case 7: // feather
      put(g, new ConeGeometry(0.05, 0.75, 6), C2, [-0.2, 1.95, -0.25], [1, 1, 0.4], [-0.6, 0, 0.3]);
      break;
    case 8: // monocle chain (over the shades)
      put(g, new TorusGeometry(0.15, 0.015, 6, 18), gold, [0.27, 1.42, 0.37], [1, 1, 1], [0, 0.75, 0]);
      put(g, new CylinderGeometry(0.008, 0.008, 0.6, 4), gold, [0.36, 1.1, 0.42], [1, 1, 1], [0, 0, 0.2]);
      break;
    case 9: // medal
      put(g, new BoxGeometry(0.1, 0.16, 0.03), C2, [0.32, 0.42, 0.66], [1, 1, 1], [-0.25, 0, 0]);
      put(g, new CylinderGeometry(0.08, 0.08, 0.025, 14), gold, [0.32, 0.27, 0.69], [1, 1, 1], [Math.PI / 2 - 0.25, 0, 0]);
      break;
    case 10: // flat cap
      put(g, new SphereGeometry(0.54, 20, 8, 0, Math.PI * 2, 0, Math.PI / 3), C1, [0, 1.42, -0.02], [1, 0.8, 1.1]);
      put(g, new BoxGeometry(0.5, 0.04, 0.3), C1, [0, 1.62, 0.5], [1, 1, 1], [0.2, 0, 0]);
      break;
    case 11: // pencil behind the ear
      put(g, new CylinderGeometry(0.025, 0.025, 0.55, 6), mat('#e6b43a'), [0.45, 1.5, -0.1], [1, 1, 1], [1.3, 0, 0.4]);
      put(g, new ConeGeometry(0.025, 0.08, 6), mat('#e88a9a'), [0.45, 1.58, -0.38], [1, 1, 1], [-1.8, 0, 0]);
      break;
  }
}

let renderer: WebGLRenderer | undefined;
const cache = new Map<string, string>();

/** A portrait as an image URL, square, `px` pixels, rendered once per gull. */
export function portrait(w: Who, px = 256): string {
  const key = `${w.seed}|${w.age}|${w.role}|${w.c1}|${w.c2}|${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  renderer ??= new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(px, px, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new Scene();
  scene.add(new HemisphereLight('#fff3dc', '#5a4a3a', 1.3));
  const key1 = new DirectionalLight('#ffe6c0', 2.6);
  key1.position.set(2.5, 3, 3);
  const rim = new DirectionalLight('#9cc4ff', 1.6);
  rim.position.set(-3, 2, -2.5);
  scene.add(key1, rim);
  scene.add(gull(w));
  const cam = new PerspectiveCamera(26, 1, 0.1, 50);
  cam.position.set(0.3, 1.5, 4.7);
  cam.lookAt(0.1, 1.15, 0);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

// PROTOTYPE (throwaway): three penguin designs (?variant=A|B|C) seen as the game would show them: whole body turning,
// an MM-style headshot, four crew colourings and the bird at race size. One renderer draws every view into its slot.
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, Mesh, MeshBasicNodeMaterial, PerspectiveCamera,
  PlaneGeometry, Scene, Vector3, WebGPURenderer, type Group,
} from 'three/webgpu';
import { color, float, length, mix, smoothstep, uv, vec2 } from 'three/tsl';
import { buildPenguin, CREWS, headOf, STYLES, type Crew, type Style } from './penguin';

const params = new URLSearchParams(location.search);
const style: Style = STYLES.find(s => s.key === params.get('variant')) ?? STYLES[0];

interface View { slot: HTMLElement; scene: Scene; camera: PerspectiveCamera; bird: Group }

function lit(scene: Scene): void {
  scene.add(new HemisphereLight('#fff3dc', '#5a4a3a', 1.2));
  const key = new DirectionalLight('#ffe8c8', 2.6);
  key.position.set(1.2, 2, 2.2);
  const rim = new DirectionalLight('#a8c8ff', 1.8);
  rim.position.set(-1.5, 1.2, -2);
  scene.add(key, rim);
}

function backdrop(scene: Scene, camera: PerspectiveCamera, target: Vector3, top: string, bottom: string): void {
  const m = new MeshBasicNodeMaterial();
  m.colorNode = mix(color(bottom), color(top), uv().y);
  const plane = new Mesh(new PlaneGeometry(40, 40), m);
  const dir = target.clone().sub(camera.position).normalize();
  plane.position.copy(target).addScaledVector(dir, 6);
  plane.lookAt(camera.position);
  scene.add(plane);
}

function shadow(scene: Scene): void {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.colorNode = color('#2c2016');
  m.opacityNode = smoothstep(float(0.5), float(0.1), length(uv().sub(vec2(0.5)))).mul(0.5);
  const blob = new Mesh(new PlaneGeometry(0.9, 0.9), m);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.002;
  scene.add(blob);
}

function view(slot: HTMLElement, crew: Crew, kind: 'body' | 'head' | 'race'): View {
  const scene = new Scene();
  lit(scene);
  const bird = buildPenguin(style, crew);
  scene.add(bird);
  const head = headOf(style);
  const headR = Math.max(...style.profile.filter(([, y]) => y > style.neck).map(([r]) => r));
  const camera = new PerspectiveCamera(kind === 'head' ? 22 : 28, 1, 0.05, 60);
  let target: Vector3;
  if (kind === 'head') {
    // the crown a tenth below the top of the frame, head and shoulders below it
    const crown = style.profile[style.profile.length - 1][1];
    const tall = headR * 3.2;
    target = new Vector3(0, crown - tall * 0.4, head.z);
    const dir = new Vector3(Math.sin(0.45), 0.1, Math.cos(0.45)).normalize();
    camera.position.copy(target).addScaledVector(dir, tall / 2 / Math.tan((11 * Math.PI) / 180));
    backdrop(scene, camera, target, '#efe4cb', '#c9b894');
  } else if (kind === 'race') {
    target = new Vector3(0, 0.45, 0);
    camera.position.set(1.6, 2.2, 1.9);
    backdrop(scene, camera, target, '#4a8bb2', '#3a7298');
  } else {
    target = new Vector3(0, 0.46, 0);
    camera.position.set(0, 0.62, 3.1);
    backdrop(scene, camera, target, '#e2d6bb', '#cdbd9b');
    shadow(scene);
  }
  camera.lookAt(target);
  return { slot, scene, camera, bird };
}

// the header shows the style's numbers, so a switch shows what changed
const headR = Math.max(...style.profile.filter(([, y]) => y > style.neck).map(([r]) => r));
const bodyR = Math.max(...style.profile.filter(([, y]) => y <= style.neck).map(([r]) => r));
document.getElementById('state')!.textContent =
  `${style.key} · ${style.name} — head ÷ body ${(headR / bodyR).toFixed(2)}, eye ${style.eye.size}, beak ${style.beak.length}`;

const crews = document.getElementById('crews')!;
for (const c of CREWS) {
  const fig = document.createElement('figure');
  fig.innerHTML = `<div class="crop" style="width:96px;height:96px"><div class="hole" data-view="crew"></div></div><figcaption>${c.name}</figcaption>`;
  crews.append(fig);
}

const at = (sel: string): HTMLElement => document.querySelector(`[data-view="${sel}"]`)!;
const views: View[] = [
  view(at('body'), CREWS[0], 'body'),
  view(at('portrait'), CREWS[0], 'head'),
  ...[...document.querySelectorAll<HTMLElement>('[data-view="crew"]')].map((el, i) => view(el, CREWS[i], 'head')),
  ...['race72', 'race40', 'race24'].map(k => view(at(k), CREWS[0], 'race')),
];

const renderer = new WebGPURenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(new Color(0), 0);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.autoClear = false;
document.body.prepend(renderer.domElement);
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));

// drag the body to turn it; it drifts round on its own when left
// ?turn=<radians> holds the body at one angle (for checking the side and back)
const held = params.has('turn');
let turn = held ? Number(params.get('turn')) : -0.5, dragging = false, lastX = 0, idle = 0;
const body = views[0].slot;
body.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; body.setPointerCapture(e.pointerId); });
body.addEventListener('pointermove', e => { if (dragging) { turn += (e.clientX - lastX) * 0.01; lastX = e.clientX; idle = 0; } });
body.addEventListener('pointerup', () => { dragging = false; });

let last = 0;
renderer.setAnimationLoop((ms: number) => {
  const dt = Math.min((ms - last) / 1000, 0.1);
  last = ms;
  idle += dt;
  if (!dragging && !held && idle > 2) turn += dt * 0.4;
  views[0].bird.rotation.y = turn;
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setScissor(0, 0, innerWidth, innerHeight);
  renderer.clear();
  for (const v of views) {
    const r = v.slot.getBoundingClientRect();
    renderer.setViewport(r.left, r.top, r.width, r.height);
    renderer.setScissor(r.left, r.top, r.width, r.height);
    v.camera.aspect = r.width / r.height;
    v.camera.updateProjectionMatrix();
    renderer.render(v.scene, v.camera);
  }
});

// the prototype switcher: ← → cycle the variants; not in a production build
if (!import.meta.env.PROD) {
  const keys = STYLES.map(s => s.key);
  const go = (step: number) => {
    const i = (keys.indexOf(style.key) + step + keys.length) % keys.length;
    params.set('variant', keys[i]);
    location.search = params.toString();
  };
  const bar = document.createElement('div');
  bar.id = 'switch';
  bar.innerHTML = `<button aria-label="previous">←</button><span>${style.key} (${style.name})</span><button aria-label="next">→</button>`;
  const [prev, next] = bar.querySelectorAll('button');
  prev.onclick = () => go(-1);
  next.onclick = () => go(1);
  addEventListener('keydown', e => {
    if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  });
  document.body.append(bar);
}

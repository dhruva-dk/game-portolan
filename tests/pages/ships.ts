// The shipwright's sheet (tests/pages/ships.html, outside the game build): the four forms in three captains'
// pigments, a hero view of one form, the sail states, and the sheet seen far off. Query: view=sheet|hero|states|far,
// form=<name> (hero, states), hour=<0–24>. window.__ships drives it from tests/pages/ships.shots.ts.
import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { illustratedMaterial } from '../../src/style/glsl.ts';
import { NAMED_PIGMENTS as P, PIGMENTS, type RGB } from '../../src/style/palette.ts';
import { FORM_NAMES, type FormName } from '../../src/render/ships/forms.ts';
import { Ship } from '../../src/render/ships/shipwright.ts';
import type { RigState } from '../../src/render/ships/rig.ts';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'sheet', hour = Number(q.get('hour') ?? 15.5), form = (q.get('form') ?? 'galleon') as FormName;
const CAPTAINS: [string, readonly [RGB, RGB]][] = [['Saetta', [P.vermilion, P.black]], ['Meridiana', [P.ultramarine, P.gold]], ['Marea', [P.teal, P.cream]]];

const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas), style = pipeline.style;
pipeline.pinScale(1);
style.setHour(hour);
style.uniforms.uSun.value.set(-0.55, 0.62, 0.56).normalize();
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), illustratedMaterial(style, { pigment: PIGMENTS.ultramarine, density: 0.3, hatch: { axis: [0, 0, 1] } }));
scene.add(sea);

const animated: { ship: Ship; state: RigState }[] = [];
function place(f: FormName, pigments: readonly [RGB, RGB], x: number, z: number, yaw: number, detail = 1, edit?: (s: RigState) => void): Ship {
  const ship = new Ship(style, { form: f, pigments, detail });
  ship.position.set(x, 0, z);
  ship.rotation.y = yaw;
  const state = ship.rig.state('plain', 2.2, 0.7);
  edit?.(state);
  ship.setRig(state);
  animated.push({ ship, state });
  scene.add(ship);
  return ship;
}

if (view === 'sheet' || view === 'far') {
  const far = view === 'far';
  CAPTAINS.forEach(([, pig], j) => FORM_NAMES.forEach((f, i) => place(f, pig, (i - 1.5) * 8, -j * 10, -0.75, far ? 0.35 : 1)));
  camera.position.set(0, far ? 46 : 11, far ? 150 : 25);
  camera.lookAt(0, 1.5, -9);
  pipeline.ink.fadeStart = far ? 120 : 30;
  pipeline.ink.fadeEnd = far ? 520 : 260;
} else if (view === 'hero') {
  place(form, CAPTAINS[0][1], 0, 0, -0.95, 1, (s) => s.sails.forEach((x) => (x.set = 1)));
  camera.position.set(9.5, 3.1, 7.5);
  camera.lookAt(0, 2.4, 0);
  pipeline.ink.fadeStart = 30;
  pipeline.ink.fadeEnd = 260;
} else {
  // full and drawing, plain and billowing, reefed and flat, shivering, slack and torn, furled
  const moods: ((s: RigState) => void)[] = [
    (s) => s.sails.forEach((x) => Object.assign(x, { set: 1, fill: 0.65 })),
    (s) => s.sails.forEach((x) => (x.fill = 1)),
    (s) => s.sails.forEach((x) => Object.assign(x, { fill: 0.08, reef: 2 })),
    (s) => s.sails.forEach((x) => Object.assign(x, { fill: 0.55, shiver: 1 })),
    (s) => s.sails.forEach((x) => Object.assign(x, { fill: 0.5, slack: 0.9, torn: 0.55 })),
    (s) => s.sails.forEach((x) => Object.assign(x, { set: 0.0 })),
  ];
  moods.forEach((m, i) => place(form, CAPTAINS[i % 3][1], ((i % 3) - 1) * 9, -Math.floor(i / 3) * 11, -0.8, 1, m));
  camera.position.set(0, 10, 25);
  camera.lookAt(0, 2, -6);
  pipeline.ink.fadeStart = 30;
  pipeline.ink.fadeEnd = 260;
}

function resize(): void {
  pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
let frames = 0, last = performance.now(), t = 0;
const hook = { ready: false, triangles: 0, calls: 0 };
(window as unknown as { __ships: typeof hook }).__ships = hook;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  for (const a of animated) if (a.state.sails.some((s) => s.shiver > 0)) a.ship.setRig(a.state, t);
  pipeline.render(scene, camera, dt);
  if (++frames === 3) Object.assign(hook, { ready: true, triangles: pipeline.stats.triangles, calls: pipeline.stats.calls });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

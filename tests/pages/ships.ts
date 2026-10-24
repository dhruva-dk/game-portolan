// The shipwright's sheets (tests/pages/ships.html, outside the game build). Query view=:
//   turntable  the four forms in three captains' pigments, each turned to its own heading (lod=hero|far, hour=)
//   hero       one form (form=) from the bow and from the stern quarter: carving, fittings, flags, the leader's pennant
//   stern      one form (form=) close on its stern ornament
//   states     the sail states            emblems  the 31 emblems in their captains' pigments
//   fleet      the 31 captains' ships, each with its emblem on the mainsail     atlas  the chart silhouettes
//   ten        ten ships receding from a chase camera, their levels chosen by fleetLods
// window.__ships drives it from tests/pages/ships.shots.ts.
import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { illustratedMaterial, inkMaterial, linearVec, transmittanceVec } from '../../src/style/glsl.ts';
import { NAMED_PIGMENTS as P, PIGMENTS, type RGB } from '../../src/style/palette.ts';
import { FORM_NAMES, type FormName } from '../../src/render/ships/forms.ts';
import { Ship, fleetLods, type Lod } from '../../src/render/ships/shipwright.ts';
import { EMBLEMS, emblemRect, emblemTexture } from '../../src/render/ships/emblems.ts';
import { silhouetteRect, silhouetteTexture } from '../../src/render/ships/silhouettes.ts';
import type { RigState } from '../../src/render/ships/rig.ts';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'turntable', hour = Number(q.get('hour') ?? 15.5), form = (q.get('form') ?? 'galleon') as FormName, lod = (q.get('lod') ?? 'hero') as Lod;
// the thirty captains (PROMPT.md, "The captains") and the player, in EMBLEMS order: pigments and preferred form
const HERALDRY: [RGB, RGB, FormName][] = [
  [P.vermilion, P.black, 'caravel'], [P.ironGrey, P.gold, 'carrack'], [P.umber, P.white, 'pinnace'], [P.crimson, P.ochre, 'galleon'], [P.black, P.verdigris, 'carrack'],
  [P.ultramarine, P.gold, 'galleon'], [P.teal, P.cream, 'carrack'], [P.roseMadder, P.gold, 'caravel'], [P.indigo, P.silver, 'galleon'], [P.ochre, P.ultramarine, 'carrack'],
  [P.black, P.white, 'pinnace'], [P.orange, P.umber, 'caravel'], [P.vermilion, P.white, 'pinnace'], [P.ash, P.verdigris, 'caravel'], [P.purple, P.gold, 'pinnace'],
  [P.mossGreen, P.ochre, 'galleon'], [P.stoneGrey, P.vermilion, 'galleon'], [P.navy, P.white, 'carrack'], [P.brickRed, P.cream, 'carrack'], [P.sage, P.silver, 'galleon'],
  [P.slate, P.ochre, 'carrack'], [P.charcoal, P.indigo, 'caravel'], [P.umber, P.cream, 'caravel'], [P.black, P.bone, 'galleon'], [P.verdigris, P.gold, 'pinnace'],
  [P.gold, P.vermilion, 'galleon'], [P.crimson, P.black, 'caravel'], [P.stormBlue, P.white, 'carrack'], [P.gold, P.indigo, 'pinnace'], [P.saffron, P.teal, 'caravel'],
  [P.ultramarine, P.cream, 'galleon'],
];
const THREE_CAPTAINS = [0, 5, 6]; // Saetta, Meridiana, Marea

const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas), style = pipeline.style;
pipeline.pinScale(1);
style.setHour(hour);
style.uniforms.uSun.value.set(-0.55, 0.62, 0.56).normalize();
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000);
const flat = view === 'emblems' || view === 'atlas';
if (!flat) scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), illustratedMaterial(style, { pigment: PIGMENTS.ultramarine, density: 0.3, hatch: { axis: [0, 0, 1] } })));
pipeline.ink.fadeStart = 30;
pipeline.ink.fadeEnd = 260;

const animated: { ship: Ship; state: RigState }[] = [];
function place(f: FormName, k: number, x: number, z: number, yaw: number, lods: readonly Lod[] | undefined, edit?: (s: RigState) => void, wind = 2.2): Ship {
  const [a, b] = HERALDRY[k], ship = new Ship(style, { form: f, pigments: [a, b], lods });
  ship.setEmblem(EMBLEMS[k]);
  ship.position.set(x, 0, z);
  ship.rotation.y = yaw;
  const state = ship.rig.state('plain', wind, 0.7);
  edit?.(state);
  ship.setRig(state);
  animated.push({ ship, state });
  scene.add(ship);
  return ship;
}
// flat sheets: atlas cells on quads, tinted as the chart and the results will tint them
const SPRITE_VERT = /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SPRITE_FRAG = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
uniform sampler2D tAtlas;
uniform vec4 uCell;
uniform vec3 uPrimary;
uniform vec3 uPrimaryT;
uniform vec3 uAccent;
uniform vec3 uAccentT;
void main() {
  vec4 e = texture(tAtlas, uCell.xy + vUv * uCell.zw);
  if (e.a < 0.5) discard;
  Paper q = paperAt(vWorld, vec3(0.0, 0.0, 1.0), 0.3);
  vec3 paper = parchment(q), col = mix(paper, mix(glaze(paper, uPrimaryT, 0.95, 0.0, q), uPrimary, 0.35), e.r);
  col = mix(col, mix(glaze(paper, uAccentT, 0.95, 0.0, q), uAccent, 0.5), e.g);
  writeInk(mix(col, hatchInk(0.85), e.b), vec3(0.0, 0.0, 1.0));
}`;
function sprite(tex: THREE.Texture, cell: THREE.Vector4, [a, b]: readonly [RGB, RGB, FormName?], x: number, y: number, size: number, angle = 0): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), inkMaterial(style, {
    vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, id: 200,
    uniforms: { tAtlas: { value: tex }, uCell: { value: cell }, uPrimary: { value: linearVec(a) }, uPrimaryT: { value: transmittanceVec(a) }, uAccent: { value: linearVec(b) }, uAccentT: { value: transmittanceVec(b) } },
  }));
  m.position.set(x, y, 0);
  m.rotation.z = angle;
  scene.add(m);
}
let sheet: { w: number; h: number } | null = null;
const fleet: Ship[] = [];

if (view === 'turntable') {
  const far = lod === 'far';
  THREE_CAPTAINS.forEach((k, j) => FORM_NAMES.forEach((f, i) => place(f, k, (i - 1.5) * 8, -j * 10, ((i * 3 + j) * Math.PI) / 6, [lod])));
  camera.position.set(0, far ? 46 : 11, far ? 150 : 25);
  camera.lookAt(0, 1.5, -9);
  if (far) Object.assign(pipeline.ink, { fadeStart: 120, fadeEnd: 520 });
} else if (view === 'hero') {
  const all = (s: RigState) => s.sails.forEach((x) => (x.set = 1));
  place(form, 0, -4.4, 0, 0.5, ['hero'], all);
  place(form, 6, 4.4, 0, Math.PI - 0.55, ['hero'], all).setLeader(true);
  camera.position.set(0, 3.6, 15.5);
  camera.lookAt(0, 2.6, 0);
} else if (view === 'stern') {
  // close on the transom and quarter: the carver's scrollwork, knots, waves and sunburst, the gallery and the lights
  const ship = place(form, 6, 0, 0, Math.PI - 0.6, ['hero'], (s) => s.sails.forEach((x) => (x.set = 1)));
  ship.setLeader(true);
  ship.updateMatrixWorld();
  const p = ship.panels.find((x) => x.kind === 'transom')!, c = p.centre.clone().applyMatrix4(ship.matrixWorld), n = p.normal.clone().transformDirection(ship.matrixWorld);
  camera.position.copy(c).addScaledVector(n, 4.4).add(new THREE.Vector3(1.4, 1.0, 0));
  camera.lookAt(c.x, c.y + 0.3, c.z);
} else if (view === 'states') {
  // full and drawing, plain and billowing, reefed and flat, shivering, slack and torn, furled
  const moods: ((s: RigState) => void)[] = [
    (s) => s.sails.forEach((x) => Object.assign(x, { set: 1, fill: 0.65 })),
    (s) => s.sails.forEach((x) => (x.fill = 1)),
    (s) => s.sails.forEach((x) => Object.assign(x, { fill: 0.08, reef: 2 })),
    (s) => s.sails.forEach((x) => Object.assign(x, { fill: 0.55, shiver: 1 })),
    (s) => s.sails.forEach((x) => Object.assign(x, { fill: 0.5, slack: 0.9, torn: 0.55 })),
    (s) => s.sails.forEach((x) => Object.assign(x, { set: 0.0 })),
  ];
  moods.forEach((m, i) => place(form, THREE_CAPTAINS[i % 3], ((i % 3) - 1) * 9, -Math.floor(i / 3) * 11, -0.8, ['hero'], m));
  camera.position.set(0, 10, 25);
  camera.lookAt(0, 2, -6);
} else if (view === 'emblems') {
  EMBLEMS.forEach((e, k) => sprite(emblemTexture(), emblemRect(e), HERALDRY[k], ((k % 8) - 3.5) * 2.5, (1.5 - Math.floor(k / 8)) * 2.5, 2.3));
  sheet = { w: 20, h: 10 };
} else if (view === 'atlas') {
  // each form: its profile in three captains' pigments, then its plan turned through eight headings
  FORM_NAMES.forEach((f, row) => {
    const y = (1.5 - row) * 2.6;
    THREE_CAPTAINS.forEach((k, i) => sprite(silhouetteTexture(), silhouetteRect(f, 'profile'), HERALDRY[k], -10.4 + i * 3.2, y, 3));
    for (let h = 0; h < 8; h++) sprite(silhouetteTexture(), silhouetteRect(f, 'plan'), HERALDRY[THREE_CAPTAINS[h % 3]], -1.5 + h * 1.8, y, 2.4, (h * Math.PI) / 4);
  });
  sheet = { w: 24.5, h: 10.5 };
} else if (view === 'fleet') {
  HERALDRY.forEach(([, , f], k) => place(f, k, ((k % 8) - 3.5) * 7.5, -Math.floor(k / 8) * 10, Math.PI + 0.3, ['mid'], undefined, Math.PI));
  camera.position.set(0, 10, 24);
  camera.lookAt(0, 3, -15);
} else {
  // the player's ship ahead of a chase camera, nine rivals strung out to the horizon
  for (let k = 0; k < 10; k++) fleet.push(place(HERALDRY[k][2], k, k ? (k % 2 ? -1 : 1) * (3 + k * 2.5) : 0, -k * 16, Math.PI + 0.3 * ((k % 3) - 1), undefined));
  camera.position.set(0, 4.2, 11);
  camera.lookAt(0, 2.6, -8);
}

function resize(): void {
  pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (sheet) camera.position.set(0, 0, (Math.max(sheet.h, sheet.w / camera.aspect) / (2 * Math.tan((18 * Math.PI) / 180))) * 1.04);
}
addEventListener('resize', resize);
resize();
let frames = 0, last = performance.now(), t = 0;
const hook = { ready: false, triangles: 0, calls: 0, levels: '' };
(window as unknown as { __ships: typeof hook }).__ships = hook;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  for (const a of animated) {
    if (a.state.sails.some((s) => s.shiver > 0)) a.ship.setRig(a.state, t);
    a.ship.setWind(Math.PI - 0.5, 0.8, t);
  }
  if (fleet.length) fleetLods(fleet, camera, innerHeight, frames ? dt : 1);
  pipeline.render(scene, camera, dt);
  if (++frames === 3) Object.assign(hook, { ready: true, triangles: pipeline.stats.triangles, calls: pipeline.stats.calls, levels: fleet.map((s) => s.lod[0]).join('') });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

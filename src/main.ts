// Entry point: boots the world, runs the fixed-step match loop, reads the player's controls, drives
// the chase camera and the day clock, and hands every module a Frame each animation frame.
import * as THREE from 'three';
import { Sim, TICK, R, type SimEvent, type Ship } from './sim.ts';
import { createWorld, type World } from './world.ts';
import { Bots, steer } from './bots.ts';
import { Pipeline } from './post.ts';
import { Sky, CYCLE_SECONDS, type Env } from './sky.ts';
import { Territory } from './territory.ts';
import { Terrain } from './terrain.ts';
import { Ocean, swell } from './ocean.ts';
import { Flora } from './flora.ts';
import { Structures } from './structures.ts';
import { Ships, type ShipPose } from './ships.ts';
import { Fx } from './fx.ts';
import { Chart, Loader, hudLayout } from './chart.ts';
import { Audio } from './audio.ts';

/** Everything a module may need. Modules are constructed in field order; a constructor may only use earlier fields. */
export interface Ctx {
  seed: number;
  scene: THREE.Scene;
  pipeline: Pipeline;
  world: World;
  sim: Sim;
  keys: Set<string>; // codes of the keys held down, kept by the controls below
  sky: Sky;
  territory: Territory;
  terrain: Terrain;
  ocean: Ocean;
  flora: Flora;
  structures: Structures;
  ships: Ships;
  fx: Fx;
  chart: Chart;
  audio: Audio;
}

/** Per-frame state handed to every module's update(). */
export interface Frame {
  t: number; // render clock, seconds; keeps running while paused so water and foliage stay alive
  dt: number; // seconds since the previous frame, clamped
  simTime: number; // interpolated match time, seconds
  alpha: number; // interpolation between the previous and the current sim tick
  cycle: number; // day/night phase 0..1, sky.hourOf() maps it to an hour
  paused: boolean; // globe menu open
  camera: THREE.PerspectiveCamera;
  focus: THREE.Vector3; // sea-level point the camera follows: the player's ship, or the glide to its respawn
  env: Env; // valid after sky.update()
  poses: ShipPose[]; // valid after ships.update()
  events: SimEvent[]; // simulation events since the previous frame
}

/** The hour the game opens on: the storm has passed and the golden hour arrives as the camera swoops down. */
const OPENING_HOUR = 17.1;

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) >>> 0;

const loader = new Loader();
await loader.shown; // paint the loading screen before the heavy synchronous build below
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const pipeline = new Pipeline(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.2, 4000);

const world = createWorld(seed);
const sim = new Sim({ seed, world });
const bots = new Bots(sim);

THREE.DefaultLoadingManager.itemStart('boot');
const ctx = { seed, scene, pipeline, world, sim, keys: new Set<string>() } as Ctx;
ctx.sky = new Sky(ctx);
ctx.territory = new Territory(ctx);
ctx.terrain = new Terrain(ctx);
ctx.ocean = new Ocean(ctx);
ctx.flora = new Flora(ctx);
ctx.structures = new Structures(ctx);
ctx.ships = new Ships(ctx);
ctx.fx = new Fx(ctx);
ctx.chart = new Chart(ctx);
ctx.audio = new Audio(ctx);

const frame: Frame = {
  t: 0, dt: 0, simTime: 0, alpha: 0, cycle: ctx.sky.phaseOf(OPENING_HOUR), paused: false, camera,
  focus: new THREE.Vector3(), env: ctx.sky.env, poses: ctx.ships.poses, events: [],
};

const { clamp, smoothstep } = THREE.MathUtils;
/** Fraction of the remaining distance an exponential follower covers this frame; rate in 1/s. */
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

// ---------------------------------------------------------------------------------------------
// Controls. The ship is always under way; the player only works the helm, one rudder value per tick.
//   A/D, ←/→  port / starboard: a tap nudges, holding swings the helm hard over
//   W, ↑      ease the helm: alone it checks the swing and holds the course, with a turn key it turns gently
//   S, ↓      hard over: alone it tightens the current turn, with a turn key it turns at full rudder at once
//   mouse     the ship steers for the sea under the cursor; dragging orbits the camera, the wheel zooms
//   M globe menu, N mute, hold T to run the day clock fast
const keys = ctx.keys;
const HELM_KEYS = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const pointer = { x: 0, y: 0, steer: false, drag: false, lastX: 0, lastY: 0 };
const DECK_DIST = 6.5, CHASE_DIST = 20, MAX_DIST = 640;
const PITCH_MIN = 0.02, PITCH_MAX = 1.5;
const orbit = { yaw: 0, pitch: 0.42, dist: CHASE_DIST }; // where the player has put the camera: yaw from astern
let idle = 0; // seconds since the player last dragged the view; the drift fades in and the yaw recentres

addEventListener('keydown', (e) => {
  ctx.audio.resume();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyM') ctx.chart.toggle();
  else if (e.code === 'KeyN') ctx.audio.toggleMute();
  else if (HELM_KEYS.has(e.code)) pointer.steer = false;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (e) => {
  ctx.audio.resume();
  if (ctx.chart.open) return;
  pointer.drag = true;
  pointer.lastX = e.clientX;
  pointer.lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
const release = () => (pointer.drag = false);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => (pointer.steer = false));
canvas.addEventListener('pointermove', (e) => {
  if (pointer.drag) {
    orbit.yaw -= (e.clientX - pointer.lastX) * 0.005;
    orbit.pitch = clamp(orbit.pitch + (e.clientY - pointer.lastY) * 0.004, PITCH_MIN, PITCH_MAX);
    idle = 0;
  } else {
    const hud = hudLayout(innerWidth, innerHeight);
    pointer.steer = !ctx.chart.open && Math.hypot(e.clientX - hud.x, e.clientY - hud.y) > hud.r;
  }
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  pointer.lastX = e.clientX;
  pointer.lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault(); // trackpad pinches arrive as ctrl+wheel and would zoom the page
  if (ctx.chart.open) return;
  orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * (e.deltaMode ? 0.06 : 0.002)), DECK_DIST, MAX_DIST);
}, { passive: false });

const ray = new THREE.Raycaster();
const planet = new THREE.Sphere(new THREE.Vector3(), R);
const ndc = new THREE.Vector2();
const shipUp = new THREE.Vector3(), shipFwd = new THREE.Vector3(), shipPort = new THREE.Vector3(), aim = new THREE.Vector3();
const DEAD_ZONE = 7; // cursor this close to the ship holds the course instead of spinning on the spot
let held = 0; // ticks a turn key has been held
let lastSide = 1; // side of the last mouse turn, so a cursor right astern does not flip-flop

/** Counter-rudder that checks the ship's swing. */
const steady = (s: Ship) => clamp(-s.turn * 1.5, -1, 1);

function helm(): number {
  const s = sim.ships[0];
  const side = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const ease = keys.has('KeyW') || keys.has('ArrowUp'), hard = keys.has('KeyS') || keys.has('ArrowDown');
  held = side ? held + 1 : 0;
  if (side) return side * (hard ? 1 : ease ? 0.35 : Math.min(1, 0.45 + held * 0.08));
  if (hard) return s.turn < -0.05 ? -1 : 1;
  if (ease) return steady(s);
  if (!pointer.steer || pointer.drag) return 0;
  shipUp.set(s.pos.x, s.pos.y, s.pos.z);
  shipFwd.set(s.fwd.x, s.fwd.y, s.fwd.z);
  shipPort.crossVectors(shipUp, shipFwd);
  ray.setFromCamera(ndc.set(pointer.x, pointer.y), camera);
  let reach = Infinity;
  // a cursor on the sky steers along the ray's bearing
  if (ray.ray.intersectSphere(planet, aim)) reach = aim.addScaledVector(shipUp, -R).length();
  else aim.copy(ray.ray.direction);
  let bearing = Math.atan2(aim.dot(shipPort), aim.dot(shipFwd));
  if (Math.abs(bearing) > 2.6) bearing = lastSide * Math.abs(bearing);
  lastSide = Math.sign(bearing) || lastSide;
  const pd = clamp(steer(bearing, s), -1, 1);
  return THREE.MathUtils.lerp(steady(s), pd, smoothstep(reach, DEAD_ZONE, DEAD_ZONE * 2));
}

const inputs = new Float32Array(sim.ships.length);
let recorded = new Int8Array(1 << 16); // the player's rudder per tick: replaying it replays the match
let pilot: ((s: Sim) => number) | null = null; // scripted helm (tests and captures)

function tick(): void {
  if (sim.tick >= recorded.length) {
    const grown = new Int8Array(recorded.length * 2);
    grown.set(recorded);
    recorded = grown;
  }
  recorded[sim.tick] = Math.round(clamp(pilot ? pilot(sim) : helm(), -1, 1) * 127);
  inputs[0] = recorded[sim.tick] / 127;
  bots.decide(sim, inputs);
  sim.step(inputs);
}

// ---------------------------------------------------------------------------------------------
// Camera. A chase rig orbiting the player's ship in its local frame; zooming out re-targets it to the
// planet centre for the orbital view. Everything is damped, and hard limits keep it above the swell,
// out of the islands, and the ship in sight.
const eye = { ...orbit }; // follows orbit smoothly
let lift = 0; // extra pitch that keeps islands and trees out of the line of sight
let heave = 0; // low-passed swell under the ship
let floor = R; // lowest radius the camera may take; it rises at once but sinks gently
let glide = 1; // progress of a glide to a new focus (after a respawn), 1 = locked on the ship
let glideArc = 0; // how far that glide climbs, world units
let snap = true; // place the rig without damping on the next frame
let swoop = 1; // the opening move, from high over the ship down into the chase: 1 → 0
const focusDir = new THREE.Vector3(), glideFrom = new THREE.Vector3(), heading = new THREE.Vector3();
const shipDir = new THREE.Vector3(), tmp = new THREE.Vector3(), q = new THREE.Quaternion(), qPart = new THREE.Quaternion();
const back = new THREE.Vector3(), dir = new THREE.Vector3(), target = new THREE.Vector3(), shipEye = new THREE.Vector3();
const side1 = new THREE.Vector3(), side2 = new THREE.Vector3(), probe = new THREE.Vector3(), sea = new THREE.Vector4();

/** Where the camera looks from this frame: the interpolated ship, or a glide across the sphere to it. */
function updateFocus(dt: number): void {
  const s = sim.ships[0];
  shipDir.set(s.prevPos.x, s.prevPos.y, s.prevPos.z).lerp(tmp.set(s.pos.x, s.pos.y, s.pos.z), frame.alpha).normalize();
  if (snap) {
    focusDir.copy(shipDir);
    glide = 1;
  }
  const jump = focusDir.angleTo(shipDir);
  if (glide >= 1 && jump > 0.03) {
    glideFrom.copy(focusDir);
    glideArc = Math.min(220, jump * 110);
    glide = 0;
  }
  if (glide < 1) {
    glide = Math.min(1, glide + dt / (1 + glideArc / 220));
    q.setFromUnitVectors(glideFrom, shipDir);
    focusDir.copy(glideFrom).applyQuaternion(qPart.identity().slerp(q, glide * glide * (3 - 2 * glide)));
  } else focusDir.copy(shipDir);
  frame.focus.copy(focusDir).multiplyScalar(R);
}

/** What the camera must stay above at a unit direction: the ground, and on land the tree crowns and rock ledges. */
function solid(at: THREE.Vector3): number {
  const h = world.height(at);
  return h + 6 * clamp((h + 0.5) / 2, 0, 1);
}

/** Highest solid near a unit direction, sloped off with distance so the limit surface stays smooth. */
function ground(at: THREE.Vector3): number {
  side1.crossVectors(at, heading).normalize();
  side2.crossVectors(at, side1);
  let h = solid(at);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    probe.copy(at).addScaledVector(side1, (Math.cos(a) * 3) / R).addScaledVector(side2, (Math.sin(a) * 3) / R).normalize();
    h = Math.max(h, solid(probe) - 1.5);
  }
  return h;
}

/** Does anything solid (plus clearance) cut the segment between two world points? */
function blocked(a: THREE.Vector3, b: THREE.Vector3, clearance: number): boolean {
  for (let i = 1; i < 12; i++) {
    probe.lerpVectors(a, b, i / 12);
    const r = probe.length();
    if (solid(probe.divideScalar(r)) + clearance > r - R) return true;
  }
  return false;
}

/** Camera position for the current target at a given pitch and distance. */
function eyeAt(pitch: number, dist: number, out: THREE.Vector3): THREE.Vector3 {
  dir.copy(back).multiplyScalar(Math.cos(pitch)).addScaledVector(focusDir, Math.sin(pitch));
  return out.copy(target).addScaledVector(dir, dist);
}

function updateCamera(dt: number): void {
  const p = ctx.ships.poses[0];
  const k = (rate: number) => (snap ? 1 : damp(rate, dt));
  const up = focusDir;

  // heading: carried along the sphere, then swung toward the ship's so turns show off its side
  heading.addScaledVector(up, -heading.dot(up));
  if (snap || heading.lengthSq() < 1e-8) heading.copy(p.fwd);
  heading.addScaledVector(up, -heading.dot(up)).normalize();
  tmp.copy(p.fwd).addScaledVector(up, -p.fwd.dot(up)).normalize();
  heading.applyAxisAngle(up, Math.atan2(side1.crossVectors(heading, tmp).dot(up), heading.dot(tmp)) * k(3.5));

  idle += dt;
  orbit.yaw = Math.atan2(Math.sin(orbit.yaw), Math.cos(orbit.yaw));
  if (idle > 6) orbit.yaw *= 1 - k(0.5);
  eye.yaw += (orbit.yaw - eye.yaw) * k(10);
  eye.pitch += (orbit.pitch - eye.pitch) * k(10);
  eye.dist = Math.exp(THREE.MathUtils.lerp(Math.log(eye.dist), Math.log(orbit.dist), k(3)));
  heave += (p.pos.length() - R - heave) * k(1.5);

  // a slow cinematic drift, a pull back while the ship goes down, and an arc over the sea on a glide
  const drift = smoothstep(idle, 0, 4), t = frame.t, arc = glide < 1 ? Math.sin(Math.PI * glide) : 0;
  swoop = Math.max(0, swoop - dt / 7);
  const high = swoop * swoop * (3 - 2 * swoop);
  const dist = eye.dist * (1 + 0.6 * p.sink + 2.5 * high) + arc * glideArc;
  const o = smoothstep(dist, 45, 420); // 0 chase … 1 orbital
  const yaw = eye.yaw + drift * (0.1 * Math.sin(t * 0.037) + 0.05 * Math.sin(t * 0.091));
  // looking down from high above keeps the ship on the near side of the globe
  const pitch = Math.max(eye.pitch + drift * 0.03 * Math.sin(t * 0.053) + 0.25 * p.sink + 0.7 * arc + 0.4 * high, 1.25 * o);

  back.copy(heading).negate().applyAxisAngle(up, yaw);
  shipEye.copy(up).multiplyScalar(R + 0.4 * heave + 2);
  target.copy(shipEye).addScaledVector(back, -0.12 * dist).lerp(tmp.set(0, 0, 0), o);

  // keep islands out of the line of sight: rise early (generous clearance), settle back slowly
  let need = 0;
  while (need < 1.2 && blocked(shipEye, eyeAt(pitch + need, dist, tmp), 1.5)) need += 0.1;
  lift += (need - lift) * k(need > lift ? 6 : 0.8);
  const climb = Math.min(pitch + lift, PITCH_MAX);
  const pos = eyeAt(climb, dist, camera.position);
  // if the climb is still under way, close in until the ship is clear
  for (let d = dist * 0.85; d > DECK_DIST && blocked(shipEye, pos, 0.2); d *= 0.85) eyeAt(climb, d, pos);

  // hard floor: above the swell and above any ground around the camera
  const r = pos.length();
  tmp.copy(pos).divideScalar(r);
  const altitude = r - R;
  const limit = R + Math.max(altitude < 40 ? swell(tmp, frame.t, frame.simTime, sea).w + 0.7 : 0, ground(tmp) + 0.9);
  floor = snap ? limit : Math.max(limit, floor - 4 * dt);
  if (r < floor) pos.setLength(floor);

  // the camera's up is the local vertical tipped by its pitch, so the horizon stays level at every angle
  camera.up.copy(up).multiplyScalar(Math.cos(climb)).addScaledVector(back, -Math.sin(climb));
  // never let the ship leave the frame: not while the aim slides toward the planet centre, nor on a glide to it
  dir.subVectors(target, pos).normalize();
  tmp.copy(p.up).multiplyScalar(R + 2).sub(pos).normalize();
  const off = dir.angleTo(tmp), edge = THREE.MathUtils.degToRad(camera.fov) * 0.36;
  if (off > edge) {
    qPart.identity().slerp(q.setFromUnitVectors(dir, tmp), 1 - edge / off);
    target.copy(pos).add(dir.applyQuaternion(qPart));
  }
  camera.lookAt(target);
  camera.near = clamp(Math.min(pos.length() - floor + 0.9, pos.distanceTo(shipEye)) * 0.05, 0.08, 30);
  camera.far = pos.length() + R * 4;
  camera.updateProjectionMatrix();
  snap = false;
}

// ---------------------------------------------------------------------------------------------
let acc = 0;
let last = 0;
let frameStep = 1; // render every n-th animation frame (tests use it to change the frame rate)
let frameCount = 0;
let daySpeed = 1; // day-clock rate, eased so fast-forward starts and stops smoothly
const frameTimes = new Float64Array(600); // recent frame times, a ring for the fps test hook
let frameTimeSum = 0;
let frames = 0;

function resize(): void {
  pipeline.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/** Everything but the drawing: match ticks, clock, camera and every module's update. */
function update(dt: number): void {
  frame.paused = ctx.chart.open;
  if (!frame.paused) {
    acc += dt;
    for (let n = 0; acc >= TICK && n < 8; n++) {
      tick();
      acc -= TICK;
    }
    acc = Math.min(acc, TICK);
  }
  // the day clock is not part of the match: T runs it fast, the menu stops it
  daySpeed += ((keys.has('KeyT') ? 30 : frame.paused ? 0 : 1) - daySpeed) * damp(4, dt);
  frame.cycle = (frame.cycle + (dt * daySpeed) / CYCLE_SECONDS) % 1;
  frame.t += dt;
  frame.dt = dt;
  frame.alpha = acc / TICK;
  frame.simTime = (sim.tick - 1 + frame.alpha) * TICK;
  frame.events = sim.events;
  sim.events = [];
  updateFocus(dt);
  ctx.sky.update(frame);
  ctx.ships.update(frame);
  updateCamera(dt);
  ctx.territory.update(frame);
  ctx.terrain.update(frame);
  ctx.ocean.update(frame);
  ctx.flora.update(frame);
  ctx.structures.update(frame);
  ctx.fx.update(frame);
  ctx.chart.update(frame);
  ctx.audio.update(frame);
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  if (++frameCount % frameStep) return;
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); // the first rAF stamp can predate `last`
  last = now;
  const slot = frames++ % frameTimes.length;
  frameTimeSum += dt - frameTimes[slot];
  frameTimes[slot] = dt;
  update(dt);
  pipeline.render(scene, camera, frame);
}

// ---------------------------------------------------------------------------------------------
// Hooks for the acceptance tests and screenshot captures (tests/*.ts).
const hooks = {
  ready: false,
  sim,
  ctx,
  setHour: (h: number) => (frame.cycle = ctx.sky.phaseOf(h)),
  /** Place the camera at once (yaw/pitch in radians relative to astern, dist in world units). */
  setCamera: (c: Partial<typeof orbit>) => {
    Object.assign(orbit, c);
    idle = swoop = 0;
    snap = true;
  },
  setFrameStep: (n: number) => (frameStep = Math.max(1, n | 0)),
  /** Replace the player's helm with a function of the match state, or null to hand it back. */
  setPilot: (fn: ((s: Sim) => number) | null) => (pilot = fn),
  /** Run the match forward by `seconds` of sim time immediately. */
  advance: (seconds: number) => {
    for (let i = Math.round(seconds / TICK); i > 0; i--) tick();
    snap = true;
  },
  recording: () => Array.from(recorded.subarray(0, sim.tick)),
  fps: () => Math.min(frames, frameTimes.length) / Math.max(1e-3, frameTimeSum),
};
(window as unknown as { __game: typeof hooks }).__game = hooks;

THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => loader.progress(loaded / total);
const loaded = new Promise<void>((done) => (THREE.DefaultLoadingManager.onLoad = done));
THREE.DefaultLoadingManager.itemEnd('boot');
await loaded;

// Warm every shader the game will use, behind the loading screen. Post draws the world into render targets, so
// materials compile with one bound; then the world is drawn facing each way in the storm, at night and at the
// opening hour with nothing hidden or culled, which compiles shadow casters, post passes and weather variants too.
{
  const r = pipeline.renderer, bound = new THREE.WebGLRenderTarget(1, 1);
  update(0);
  r.setRenderTarget(bound);
  await r.compileAsync(scene, camera);
  r.setRenderTarget(null);
  bound.dispose();
  const saved: [THREE.Object3D, boolean, boolean, number][] = [];
  // instanced draws with no instances yet (wreckage, flotsam) draw nothing, so they get one for the warm-up
  const instances = (o: THREE.Object3D, n?: number): number => {
    const geo = (o as THREE.Mesh).geometry as THREE.InstancedBufferGeometry | undefined;
    if (o instanceof THREE.InstancedMesh) return n === undefined ? o.count : (o.count = n);
    if (geo?.isInstancedBufferGeometry) return n === undefined ? geo.instanceCount : (geo.instanceCount = n);
    return -1;
  };
  for (const h of [15, 23, OPENING_HOUR]) {
    frame.cycle = ctx.sky.phaseOf(h);
    for (let i = 0; i < 4; i++) {
      orbit.yaw = (i * Math.PI) / 2;
      snap = true;
      update(0);
      scene.traverse((o) => {
        const count = instances(o);
        saved.push([o, o.visible, o.frustumCulled, count]);
        o.visible = true;
        o.frustumCulled = false;
        if (count === 0) instances(o, 1);
      });
      pipeline.render(scene, camera, frame);
      for (const [o, visible, culled, count] of saved) {
        [o.visible, o.frustumCulled] = [visible, culled];
        if (count >= 0) instances(o, count);
      }
      saved.length = 0;
    }
  }
}

// Opening shot: from high over the ship, looking past it toward the nearest rival, the camera swoops down into the chase.
{
  const me = sim.ships[0];
  shipUp.set(me.pos.x, me.pos.y, me.pos.z);
  shipFwd.set(me.fwd.x, me.fwd.y, me.fwd.z);
  shipPort.crossVectors(shipUp, shipFwd);
  let best = -2;
  for (const s of sim.ships) {
    const d = tmp.set(s.pos.x, s.pos.y, s.pos.z);
    if (s.id && d.dot(shipUp) > best) {
      best = d.dot(shipUp);
      d.sub(shipUp);
      orbit.yaw = Math.atan2(d.dot(shipPort), d.dot(shipFwd));
    }
  }
}
snap = true;
update(0);
pipeline.render(scene, camera, frame);
loader.done();
hooks.ready = true;
last = performance.now();
requestAnimationFrame(loop);

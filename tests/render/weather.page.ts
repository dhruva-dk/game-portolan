// The weather test page (tests/render/weather.html, outside the game build): the game's own render path (WorldView,
// every registered module) over real headless matches. Query scene=fog|squall|calm|bruise|outside|inside|ring:
//   fog      the scripted match played until a ship sails into a fog bank; the eye outside it, lanterns shown only where the sim's sight
//            (veiled) lets the eye see them
//   squall   the first seed whose blue hour comes within 400 s, played to it; its strongest squall (capture 29),
//            a fog bank beyond it if any
//   calm     a seed with a calm in its prime; the eye low at its heart
//   bruise   the scripted match 2 s in, the eye behind the player on the Great Current, facing the storm's origin
//   outside  the scripted match 350 s in (phase 3 held), the eye in the calm before the wall
//   inside   the same, the eye in the storm looking back at the calm
//   ring     the scripted match 556 s in (the final calm), the eye high over it
// window.__weather: ready, scene, seed, hour, stats(), strike() (draws the next lightning strike).
import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { skies } from '../../src/render/sky.ts';
import { storms } from '../../src/render/storm.ts';
import { fogAngle, weathers } from '../../src/render/weather.ts';
import { WorldView } from '../../src/render/world.ts';
import { seaFor } from '../../src/sim/environment.ts';
import { idleInput } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { R } from '../../src/sim/sphere.ts';
import { createMatch, TICK, type MatchState, type Spell } from '../../src/sim/state.ts';
import { calmNow } from '../../src/sim/storm.ts';
import { DAY, SPELL } from '../../src/sim/tables.ts';
import { hourOf, inFog, veiled, vigour } from '../../src/sim/weather.ts';
import { unarmed, world } from '../sim/vectors.ts';
import { helm, SEED } from './territory.match.ts';

const scene = new URLSearchParams(location.search).get('scene') ?? 'fog';
const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const W = world(), view = new WorldView(pipeline, W), camera = view.camera;
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
view.layout(innerWidth, innerHeight);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const dirOf = (p: { x: number; y: number; z: number }) => V(p.x, p.y, p.z).normalize();
/** a moved from toward b by `u` u along the great circle (away from b when u < 0). */
function toward(a: THREE.Vector3, b: THREE.Vector3, u: number): THREE.Vector3 {
  const t = b.clone().addScaledVector(a, -a.dot(b));
  if (t.lengthSq() < 1e-12) t.set(a.y, -a.x, 0.3).addScaledVector(a, -a.dot(t));
  t.normalize();
  return a.clone().multiplyScalar(Math.cos(u / R)).addScaledVector(t, Math.sin(u / R)).normalize();
}
function place(eye: THREE.Vector3, height: number, at: THREE.Vector3, atHeight: number): void {
  camera.position.copy(eye).multiplyScalar(R + height);
  camera.up.copy(eye);
  camera.lookAt(at.clone().multiplyScalar(R + atHeight));
}
/**
 * The first seed (from 1) whose match, its first tick played (the weather is brewed then), passes `test`, which returns
 * the spell it found; `pre` screens the unplayed match cheaply first.
 */
function findSeed(test: (s: MatchState) => Spell | null, pre: (s: MatchState) => boolean = () => true, limit = 4000): { seed: number; state: MatchState; spell: Spell } {
  for (let seed = 1; seed <= limit; seed++) {
    const state = createMatch({ seed });
    if (!pre(state)) continue;
    step(seaFor(W, seed), state, idleInput());
    const spell = test(state);
    if (spell) return { seed, state, spell };
  }
  throw new Error(`no seed for ${scene}`);
}
/** The scripted match played until a ship lies deep in a fog bank: the match then, and the bank. */
function fogMatch(): { seed: number; state: MatchState; spell: Spell } {
  const s = unarmed(createMatch({ seed: SEED })), sea = seaFor(W, SEED);
  while (s.tick < Math.round(400 / TICK)) {
    step(sea, s, helm(s));
    if (s.tick % 15 !== 0) continue;
    const ship = s.ships.find((sh) => inFog(s, sh.pos));
    const spell = ship && s.weather.find((w) => fogAngle(w) > 0 && dirOf(w.at).angleTo(dirOf(ship.pos)) < fogAngle(w));
    if (spell) return { seed: SEED, state: s, spell };
  }
  throw new Error('no ship in fog');
}
const prime = (kind: number, v: number) => (s: MatchState) => s.weather.find((w) => w.kind === kind && vigour(w) >= v) ?? null;

let state: MatchState, clock = 0, seed = SEED;
function play(ticks: number, input: (s: MatchState) => ReturnType<typeof idleInput>): void {
  const sea = seaFor(W, seed);
  for (let k = 0; k < ticks; k++) {
    step(sea, state, input(state));
    clock = state.tick * TICK;
    if (k % 30 === 29) view.frame({ state, dt: 1, clock, alpha: 1 });
  }
}
const lamps: THREE.Vector3[] = [];
/** The first seed whose blue hour (19.4) comes within 400 s, played to it, and its strongest squall then. */
function blueHour(): { seed: number; state: MatchState; spell: Spell } {
  for (let s = 1; s <= 400; s++) {
    const m = createMatch({ seed: s }), wait = ((19.4 - hourOf(m) + 24) % 24) / DAY.rate;
    if (wait > 400) continue;
    seed = s;
    state = m;
    play(Math.round(wait / TICK), () => idleInput());
    let best: Spell | null = null;
    for (const w of state.weather) if (w.kind === SPELL.squall && (!best || vigour(w) > vigour(best))) best = w;
    if (best && vigour(best) > 0.3) return { seed: s, state, spell: best };
  }
  throw new Error('no blue-hour squall');
}

if (scene === 'fog' || scene === 'squall' || scene === 'calm') {
  const found = scene === 'fog'
    ? fogMatch()
    : scene === 'squall'
      ? blueHour()
      : findSeed(prime(SPELL.calm, 0.9));
  seed = found.seed;
  state = found.state;
  play(30, () => idleInput());
  const sp = found.spell, c = dirOf(sp.at);
  if (scene === 'fog') {
    const inside = state.ships.find((sh) => inFog(state, sh.pos)) ?? state.ships[0], ship = dirOf(inside.pos);
    const eye = toward(c, ship, fogAngle(sp) * R + 16);
    place(eye, 4, ship, 2);
    for (const sh of state.ships) if (!veiled(W.geo, state, eye, sh.pos)) lamps.push(dirOf(sh.pos));
  } else if (scene === 'squall') {
    const fog = state.weather.find((w) => fogAngle(w) > 0 && dirOf(w.at).angleTo(c) * R < 220);
    const eye = fog ? toward(c, dirOf(fog.at), -(0.8 * sp.r + 30)) : toward(c, V(0, 1, 0), 0.8 * sp.r + 30);
    place(eye, 4, c, 9);
  } else place(c, 3, toward(c, V(0, 1, 0), 40), 1);
} else {
  state = unarmed(createMatch({ seed }));
  const until = { bruise: 2, outside: 350, inside: 350, ring: 556 }[scene] ?? 2;
  play(Math.round(until / TICK), helm);
  const calm = calmNow(state), at = dirOf(calm.at), ship = dirOf(state.ships[0].pos);
  if (scene === 'bruise') {
    const origin = at.clone().negate(), eye = toward(ship, origin, -9);
    place(eye, 3.5, toward(ship, origin, 60), 6);
  } else if (scene === 'ring') {
    const eye = toward(at, ship, -calm.r * R * 1.4 - 10);
    place(eye, 34, at, 0);
  } else {
    const edge = toward(at, ship, calm.r * R);
    if (scene === 'outside') place(toward(at, ship, calm.r * R - 60), 6, edge, 20);
    else place(toward(at, ship, calm.r * R + 14), 5, toward(at, ship, calm.r * R - 30), 4);
  }
}
const lights = skies.get(view.scene)!.lights;
for (const d of lamps) lights.add({ pos: d.clone().multiplyScalar(R + 3), reach: 9 });

function draw(): void {
  view.frame({ state, dt: 0, clock, alpha: 1 });
  pipeline.render(view.scene, camera, 1 / 60);
}
const weather = weathers.get(view.scene)!, storm = storms.get(view.scene)!;
const hook = {
  ready: false, scene, seed, hour: +hourOf(state).toFixed(2), tick: state.tick, lamps: lamps.length,
  stats: () => ({
    calls: pipeline.stats.calls, triangles: pipeline.stats.triangles, weatherTris: weather.triangles, stormTris: storm.triangles,
    storm: +storm.storm.toFixed(2), textureMB: +(pipeline.stats.textureBytes / 2 ** 20).toFixed(1),
  }),
  strike() {
    clock = Math.min(storm.lightning.next(clock, 2.6), weather.lightning.next(clock, 4.5)) + 0.03;
    draw();
    return hook.stats();
  },
};
(window as unknown as { __weather: typeof hook }).__weather = hook;
draw();
hook.ready = true;

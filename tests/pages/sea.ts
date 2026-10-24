// The sea test page (tests/pages/sea.html, outside the game build): the WP13 sea and WP15 terrain over the real geography, ships
// riding the swell under the WP14 sky, and a free camera. Query: view=deck|high|orbit|coast|hull|seam|pole|curve|light|harbour|floor|lane|wake|crown|fjord|mark|basalt|weave|kelp|kelpdeck (WP16: the Crown Light from the pack, up the Falls Fjord, the Arch over the Basalt Stacks' walls, down a lane of their maze, a landmark from high above with region=), kind=rock|coral|sand|kelp (floor), lane=<i> (lane), region=<name> (deck, high, orbit), off=<u offshore> (deck, high), height=<u> and pitch=<rad> (deck, high),
// hour=<0–24>, wind=<0–1.4>, squall=<0–1>, calm=<0–1>, tide=<u>, sail=<u/s> (ships under way with their wakes), clock=<s>; for view=light also off=<u offshore>, height=<u>, pitch=<rad> (holds the render clock for repeatable captures). Drag to look round, wheel to climb, WASD or arrows to
// sail. window.__sea drives it from tests/pages/sea.shots.ts.
import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { Sea } from '../../src/render/sea.ts';
import { Terrain } from '../../src/render/terrain.ts';
import type { Riding } from '../../src/render/swell.ts';
import { Ship } from '../../src/render/ships/shipwright.ts';
import type { FormName } from '../../src/render/ships/forms.ts';
import { Sky } from '../../src/render/sky.ts';
import { BEAM, type Lamp } from '../../src/render/light.ts';
import { Structures } from '../../src/render/structures.ts';
import { Flora } from '../../src/render/flora.ts';
import { IceCrown } from '../../src/render/regions/iceCrown.ts';
import { Fjords } from '../../src/render/regions/fjords.ts';
import { BasaltStacks } from '../../src/render/regions/basaltStacks.ts';
import { KelpShallows } from '../../src/render/regions/kelpShallows.ts';
import { NAMED_PIGMENTS as P, type RGB } from '../../src/style/palette.ts';
import { advance, cellOf, localFrame, R, TERRITORY } from '../../src/sim/sphere.ts';
import { buildGeography, coastAt, heightAt, toWorld } from '../../src/sim/world/geography.ts';
import { FLOOR, REGIONS } from '../../src/sim/world/regions.ts';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'deck', wind = Number(q.get('wind') ?? 0.9), place = q.get('region');
let hour = Number(q.get('hour') ?? 15.5);
const hold = q.has('clock') ? Number(q.get('clock')) : null;
const sail = Number(q.get('sail') ?? (view === 'wake' ? 3 : 0));
type V = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas), style = pipeline.style;
pipeline.pinScale(1);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
let t0 = performance.now();
const geo = buildGeography();
const geoMs = performance.now() - t0;
t0 = performance.now();
const sea = new Sea(pipeline, geo);
const seaMs = performance.now() - t0;
scene.add(sea.mesh, sea.wake);
t0 = performance.now();
const terrain = new Terrain(pipeline, geo, sea.swell);
const terrainMs = performance.now() - t0;
scene.add(terrain.mesh);

// the sky: the hour's wash, clouds, the sun or the moon and stars, the light every material reads, lamps and beams
const sky = new Sky(style, geo);
scene.add(sky.group);

// lighthouses on their headlands and the harbours' moorings, stood on the terrain, their lamps in the sky's registry
const structures = new Structures(style, geo, terrain.field, sky.lights, sky.beams);
const flora = new Flora(pipeline.style, geo, terrain.field, sea.swell);
scene.add(flora.group);
scene.add(structures.group);
const ice = new IceCrown(style, terrain.field, sea.swell, sky), fjords = new Fjords(style, terrain.field);
const basalt = new BasaltStacks(style, terrain.field, sea.swell);
const kelpShallows = new KelpShallows(style, terrain.field, sea.swell);
scene.add(ice.group, fjords.group, basalt.group, kelpShallows.group);

// the camera: a foot on the sphere, a compass heading, a height and a pitch
const cam = { foot: V(0, 1, 0), heading: 0, height: 4, pitch: -0.05 };
const E = V(), N = V(), F = V(), UP = V(), tmp = V();
function frameAt(p: V, heading: number): V {
  localFrame(p, E, N);
  return F.copy(N).multiplyScalar(Math.cos(heading)).addScaledVector(E, Math.sin(heading));
}
function headingToward(p: V, target: V): number {
  localFrame(p, E, N);
  tmp.copy(target).addScaledVector(p, -p.dot(target));
  return Math.atan2(tmp.dot(E), tmp.dot(N));
}
function aim(): void {
  UP.copy(cam.foot).normalize();
  frameAt(UP, cam.heading);
  camera.position.copy(UP).multiplyScalar(R + cam.height);
  camera.up.copy(UP);
  camera.lookAt(tmp.copy(camera.position).addScaledVector(F, Math.cos(cam.pitch)).addScaledVector(UP, Math.sin(cam.pitch)));
}

/** A point in `region`'s waters `want` u off the coast, and a point on the land it faces. */
function spot(region: string, want: number): { at: V; land: V } {
  const ri = REGIONS.findIndex((r) => r.name.includes(region)), p = V();
  for (let r = 10; r < 140; r++) {
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2 + r * 0.37, x = r * Math.cos(a), y = r * Math.sin(a);
      toWorld(ri, x, y, p);
      if (Math.abs(coastAt(geo, p) - want) > 0.5 || heightAt(geo, p) > -2) continue;
      return { at: p.clone(), land: landward(ri, x, y, want) };
    }
  }
  throw new Error(`no water ${want} u off a coast in ${region}`);
}

/** The point `want` u up the coast-distance slope from chart point (x, y) of region ri: toward the nearest land. */
function landward(ri: number, x: number, y: number, want: number): V {
  const g = V();
  const gx = coastAt(geo, toWorld(ri, x + 1, y, g)) - coastAt(geo, toWorld(ri, x - 1, y, g));
  const gy = coastAt(geo, toWorld(ri, x, y + 1, g)) - coastAt(geo, toWorld(ri, x, y - 1, g));
  const l = Math.hypot(gx, gy) || 1;
  return toWorld(ri, x - (gx / l) * want, y - (gy / l) * want, V()) as V;
}

/** Shallows 1–3.5 u deep over a floor of `kind`, 2–8 u off a coast: in the region known for it first, then anywhere. */
const HOME: Partial<Record<keyof typeof FLOOR, string>> = { kelp: 'Kelp', coral: 'Coral', sand: 'Amber' };
function floorSpot(kind: keyof typeof FLOOR): { at: V; land: V } {
  const home = HOME[kind] ?? '\u0000', p = V();
  const order = [...REGIONS.keys()].sort((a, b) => Number(!REGIONS[a].name.includes(home)) - Number(!REGIONS[b].name.includes(home)));
  for (const ri of order) {
    for (let r = 6; r < 140; r += 0.5) {
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2 + r * 0.37, x = r * Math.cos(a), y = r * Math.sin(a), c = coastAt(geo, toWorld(ri, x, y, p));
        const h = heightAt(geo, p);
        if (geo.floor[cellOf(TERRITORY, p)] !== FLOOR[kind] || c < 2 || c > 8 || h > -1 || h < -3.5) continue;
        return { at: p.clone(), land: landward(ri, x, y, c) };
      }
    }
  }
  throw new Error(`no shallows over ${kind}`);
}

// ships riding the swell
const CAPTAINS: (readonly [RGB, RGB])[] = [[P.vermilion, P.black], [P.ultramarine, P.gold], [P.teal, P.cream]];
const FORMS: FormName[] = ['caravel', 'galleon', 'carrack', 'pinnace'];
const afloat: { ship: Ship; at: V; fwd: V; lantern: Lamp }[] = [];
/** A ship `ahead` u along the camera's heading and `aside` u to its right, sailing `turn` rad off that heading. */
function launch(ahead: number, aside: number, turn: number, detail = 1): void {
  const i = afloat.length, up = cam.foot.clone().normalize(), fwd = frameAt(up, cam.heading).clone();
  const at = up.clone().multiplyScalar(R).addScaledVector(fwd, ahead).addScaledVector(tmp.crossVectors(fwd, up), aside).normalize();
  const ship = new Ship(style, { form: FORMS[i % 4], pigments: CAPTAINS[i % 3], detail });
  ship.setRig(ship.rig.state('plain', 2.2, 0.7));
  scene.add(ship);
  const lantern = sky.lights.add({ pos: V(), reach: 4.5 }), heading = frameAt(at, headingToward(at, fwd.clone().add(up)) + turn).clone();
  afloat.push({ ship, at, fwd: heading, lantern });
  // under way: the wake it left over the last 20 s
  for (let k = 40; k >= 1 && sail > 0; k--) {
    const p = V(), t = V();
    advance(at, heading, -sail * k * 0.5, p, t);
    sea.wakes.feed(i, p, t, sail, (hold ?? 0) - k * 0.5);
  }
}

function look(foot: V, toward: V | number, height: number, pitch: number): void {
  cam.foot.copy(foot).normalize();
  cam.heading = typeof toward === 'number' ? toward : headingToward(cam.foot, toward);
  cam.height = height;
  cam.pitch = pitch;
}
if (view === 'deck') {
  const off = Number(q.get('off') ?? 11), s = spot(place ?? 'Coral', off);
  look(s.at, s.land, Number(q.get('height') ?? 3.2), Number(q.get('pitch') ?? -0.07));
  launch(9, 4, 1.3);
  if (off <= 11) { launch(24, -7, -0.6); launch(40, 9, 2.2, 0.35); }
} else if (view === 'light') {
  // offshore of the lighthouse whose seaward view looks back most nearly west, over three ships with lanterns
  // off=curve: as far off as leaves only the lantern over the curve from the camera's height (hull-down)
  const WEST = -1.75, height = Number(q.get('height') ?? 6), curve = q.get('off') === 'curve';
  const reachFor = (lamp: V) => (curve
    ? Math.sqrt(2 * R * height) + 0.85 * Math.sqrt(2 * R * (Math.max(heightAt(geo, lamp), 0) + BEAM.tower))
    : Number(q.get('off') ?? 45));
  let best = { off: Infinity, at: V(), lamp: V(), reach: 45, i: 0 };
  for (const [i, l] of geo.lights.entries()) {
    const lamp = V(l.pos.x, l.pos.y, l.pos.z).normalize(), at = V(), reach = reachFor(lamp);
    advance(lamp, V(l.facing.x, l.facing.y, l.facing.z), reach, at, V());
    const d = headingToward(at, lamp) - WEST, off = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    if (heightAt(geo, at) < -2 && off < best.off) best = { off, at, lamp, reach, i };
  }
  // pitch=lamp: looking up to the lighthouse's lantern, which sits a little above the middle of the frame
  const pitch = q.get('pitch') === 'lamp'
    ? Math.atan2(structures.towers[best.i].lamp.length() - R - height, best.reach) - 0.08
    : Number(q.get('pitch') ?? -0.15);
  look(best.at, best.lamp, height, pitch);
  const o = Math.min(best.reach / 45, 1.4);
  launch(12 * o, -5, 1.2); launch(20 * o, 7, -0.7); launch(31 * o, -11, 2.4, 0.6);
} else if (view === 'harbour') {
  // from outside the harbour's mouth, looking in over the mole and its lamp at a ship moored at the anchorage
  const ri = REGIONS.findIndex((r) => r.name.includes(place ?? 'Spice'));
  const h = structures.harbours.find((x) => x.region === ri) ?? structures.harbours[0], at = V();
  advance(h.pos.clone(), h.mouth.clone(), h.r * 1.6, at, V());
  look(at, h.pos, Number(q.get('height') ?? 5), Number(q.get('pitch') ?? -0.2));
  launch(h.r * 1.6, 1, 1.3);
} else if (view === 'high') {
  const s = spot(place ?? 'Coral', Number(q.get('off') ?? 40));
  look(s.at, s.land, Number(q.get('height') ?? 34), Number(q.get('pitch') ?? -0.5));
  launch(30, 2, 0.9);
} else if (view === 'orbit') {
  const s = spot(place ?? 'Spice', 45);
  look(s.at, s.land, 120, -0.9);
} else if (view === 'coast') {
  const s = spot('Spice', 9);
  look(s.at, s.land, 13, -0.72);
} else if (view === 'hull') {
  const s = spot('Glass', 40);
  look(s.at, headingToward(s.at.clone().normalize(), s.land) + Math.PI, 2.5, 0.0);
  [[14, 5], [30, -10], [48, 7], [66, -10], [84, 5]].forEach(([d, x], i) => launch(d, x, 1.6 + i, d > 40 ? 0.35 : 1));
} else if (view === 'floor') {
  const s = floorSpot((q.get('kind') ?? 'sand') as keyof typeof FLOOR);
  look(s.at, s.land, Number(q.get('height') ?? 7), Number(q.get('pitch') ?? -0.95));
} else if (view === 'lane') {
  const l = geo.lanes[Number(q.get('lane') ?? 0)];
  look(V(l.a.x + l.b.x, l.a.y + l.b.y, l.a.z + l.b.z), V(l.b.x, l.b.y, l.b.z), Number(q.get('height') ?? 16), Number(q.get('pitch') ?? -0.6));
  launch(14, 3, 0.2);
} else if (view === 'wake') {
  const s = spot('Glass', 40);
  look(s.at, headingToward(s.at.clone().normalize(), s.land) + Math.PI, 9, -0.42);
  launch(18, 0, 0.5);
} else if (view === 'seam') {
  look(V(1, 1, 1), V(0, 1, 0), 24, -0.55); // a cube corner
} else if (view === 'kelp' || view === 'kelpdeck') {
  const ri = REGIONS.findIndex((r) => r.id === 'kelpShallows'), from = V(), to = V();
  if (view === 'kelp') { toWorld(ri, 3, -24, from); toWorld(ri, 0, 4, to); } // the Kelp Cathedral through clear water, a ship in the kelp (capture 20)
  else { toWorld(ri, 15, 19, from); toWorld(ri, 24, 26, to); } // at deck among the canopy
  look(from, to, Number(q.get('height') ?? (view === 'kelp' ? 22 : 3.2)), Number(q.get('pitch') ?? (view === 'kelp' ? -0.75 : -0.06)));
  if (view === 'kelp') launch(19.8, 7.6, 1.1); // at the door among the piers
  else launch(10, 0.5, 0.25);
} else if (view === 'basalt' || view === 'weave') {
  const ri = REGIONS.findIndex((r) => r.id === 'basaltStacks'), from = V(), to = V();
  if (view === 'basalt') { toWorld(ri, -6, -40, from); toWorld(ri, 0, 0, to); } // the Arch over the maze's walls (capture 19)
  else { toWorld(ri, -8, -21.5, from); toWorld(ri, 8, -21.5, to); } // down the lane between the inner walls
  look(from, to, Number(q.get('height') ?? (view === 'basalt' ? 26 : 3.2)), Number(q.get('pitch') ?? (view === 'basalt' ? -0.38 : 0.05)));
  if (view === 'weave') launch(14, 0, 0.1);
} else if (view === 'crown' || view === 'fjord' || view === 'mark') {
  const ri = view === 'crown' ? 0 : view === 'fjord' ? 1 : REGIONS.findIndex((r) => r.name.includes(place ?? 'Ice'));
  const m = REGIONS[ri].landmark, from = V(), to = V();
  if (view === 'fjord') { toWorld(ri, -52, 5.5, from); toWorld(ri, -24, 17, to); } // up the Falls Fjord to the Great Falls
  else if (view === 'crown') { toWorld(ri, m.x + 5, m.y - 25, from); toWorld(ri, m.x + 2, m.y, to); } // from the pack
  else { toWorld(ri, m.x, m.y - 60, from); toWorld(ri, m.x, m.y, to); } // high above
  const [height, pitch] = view === 'mark' ? [110, -1.1] : view === 'crown' ? [6, 0.02] : [3.4, 0.04];
  look(from, to, Number(q.get('height') ?? height), Number(q.get('pitch') ?? pitch));
  if (view === 'fjord') launch(15, 1.3, 0.1);
} else if (view === 'pole') {
  look(V(Math.cos(1.37), Math.sin(1.37), 0), V(0, 1, 0), 30, -0.5);
} else {
  look(spot('Weeping', 50).at, 0.6, 140, -0.38);
}
aim();
frameAt(UP, cam.heading + 1.1);
sea.setWind(UP, F, wind);
const calm = Number(q.get('calm') ?? 0), squall = Number(q.get('squall') ?? 0);
sea.setWeather({ rough: (1 + 1.5 * squall) * (1 - calm), calm, squall });
sea.swell.uniforms.uSeaLevel.value = Number(q.get('tide') ?? 0);
const weather = { wind: F.clone().multiplyScalar(wind), squall, calm };

// free camera
let drag: { x: number; y: number } | null = null;
const keys = new Set<string>();
canvas.addEventListener('pointerdown', (e) => (drag = { x: e.clientX, y: e.clientY }));
addEventListener('pointerup', () => (drag = null));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.heading += (e.clientX - drag.x) * 0.004;
  cam.pitch = Math.max(-1.5, Math.min(0.6, cam.pitch - (e.clientY - drag.y) * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('wheel', (e) => (cam.height = Math.max(0.8, Math.min(600, cam.height * Math.exp(e.deltaY * 0.001)))));
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const key = (...k: string[]) => (k.some((x) => keys.has(x)) ? 1 : 0);
const outP = V(), outT = V();

function resize(): void {
  pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
const ride: Riding = { position: V(), up: V() };
const basis = new THREE.Matrix4(), X = V(), Z = V();
let frames = 0, last = performance.now(), clock = hold ?? 0;
const hook = { ready: false, calls: 0, triangles: 0, seaTriangles: sea.triangles, skyTriangles: sky.triangles, geoMs, seaMs, terrainMs,
  terrainTriangles: 0, structureTriangles: 0, regionTriangles: 0, flora: flora.stats, chunks: terrain.chunks.length, terrainMB: terrain.bytes / 2 ** 20, textureMB: 0, targetMB: 0, setHour: (h: number) => (hour = h) };
(window as unknown as { __sea: typeof hook }).__sea = hook;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (hold === null) clock += dt;
  style.uniforms.uTime.value = clock;
  cam.heading += (key('d', 'arrowright') - key('a', 'arrowleft')) * dt * 1.2;
  const go = (key('w', 'arrowup') - key('s', 'arrowdown')) * dt * Math.max(4, cam.height);
  if (go) {
    advance(cam.foot.normalize(), frameAt(cam.foot, cam.heading), go, outP, outT);
    cam.foot.copy(outP);
  }
  aim();
  for (const [i, a] of afloat.entries()) {
    if (sail > 0 && hold === null) {
      advance(a.at, a.fwd, sail * dt, outP, outT);
      a.at.copy(outP);
      a.fwd.copy(outT);
    }
    sea.wakes.feed(i, a.at, a.fwd, sail, clock);
    sea.swell.ride(a.at, a.fwd, 6, 2, clock, ride);
    Z.copy(a.fwd).addScaledVector(ride.up, -ride.up.dot(a.fwd)).normalize();
    basis.makeBasis(X.crossVectors(ride.up, Z), ride.up, Z);
    a.ship.quaternion.setFromRotationMatrix(basis);
    a.ship.position.copy(ride.position);
    a.lantern.pos.copy(ride.position).addScaledVector(ride.up, 2.4).addScaledVector(Z, -2.6);
  }
  sky.update(hour, clock, camera.position, weather);
  structures.update(camera.position);
  flora.update(camera);
  ice.update(camera.position, clock, clock);
  fjords.update(camera.position);
  basalt.update(camera.position, clock);
  kelpShallows.update(camera.position, clock);
  pipeline.render(scene, camera, dt);
  Object.assign(hook, {
    ready: ++frames >= 3, triangles: pipeline.stats.triangles, calls: pipeline.stats.calls, terrainTriangles: terrain.triangles,
    structureTriangles: structures.triangles, regionTriangles: ice.triangles + fjords.triangles + basalt.triangles + kelpShallows.triangles, flora: flora.stats,
    terrainMB: terrain.bytes / 2 ** 20, textureMB: pipeline.stats.textureBytes / 2 ** 20, targetMB: pipeline.stats.targetBytes / 2 ** 20,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

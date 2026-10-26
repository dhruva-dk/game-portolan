// The sea test page (tests/pages/sea.html, outside the game build): the WP13 sea and WP15 terrain over the real geography, ships
// riding the swell under the WP14 sky, and a free camera. Query: view=deck|high|orbit|coast|hull|seam|pole|curve|light|harbour|floor|lane|wake|crown|fjord|mark|basalt|weave|kelp|kelpdeck|amber|amberpass|fire (WP16: the Crown Light from the pack, up the Falls Fjord, the Arch over the Basalt Stacks' walls, down a lane of their maze, a landmark from high above with region=), kind=rock|coral|sand|kelp (floor), lane=<i> (lane), region=<name> (deck, high, orbit), off=<u offshore> (deck, high), height=<u> and pitch=<rad> (deck, high),
// hour=<0–24>, wind=<0–1.4>, squall=<0–1>, calm=<0–1>, tide=<u>, sail=<u/s> (ships under way with their wakes), clock=<s>, turn=sun|<rad> (any view: faced to the sun's bearing, then aim=<rad> more); for view=light also off=<u offshore>, height=<u>, pitch=<rad> (holds the render clock for repeatable captures). Drag to look round, wheel to climb, WASD or arrows to
// sail. window.__sea drives it from tests/pages/sea.shots.ts.
import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { Sea } from '../../src/render/sea.ts';
import { Terrain } from '../../src/render/terrain.ts';
import type { Riding } from '../../src/render/swell.ts';
import { Ship } from '../../src/render/ships/shipwright.ts';
import type { FormName } from '../../src/render/ships/forms.ts';
import { Sky } from '../../src/render/sky.ts';
import { BEAM, newSkyLight, skyLight, type Lamp } from '../../src/render/light.ts';
import { Structures } from '../../src/render/structures.ts';
import { Flora } from '../../src/render/flora.ts';
import { IceCrown } from '../../src/render/regions/iceCrown.ts';
import { Fjords } from '../../src/render/regions/fjords.ts';
import { BasaltStacks } from '../../src/render/regions/basaltStacks.ts';
import { KelpShallows } from '../../src/render/regions/kelpShallows.ts';
import { AmberShoals } from '../../src/render/regions/amberShoals.ts';
import { WeepingIsle } from '../../src/render/regions/weepingIsle.ts';
import { CoralAtolls } from '../../src/render/regions/coralAtolls.ts';
import { SPICE_SHIPS, SpiceIsles } from '../../src/render/regions/spiceIsles.ts';
import { FireArchipelago, PERIOD as CALDERA_PERIOD } from '../../src/render/regions/fireArchipelago.ts';
import { CALDERA } from '../../src/sim/tables.ts';
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
const structures = new Structures(style, geo, terrain.field, sky.lights, sky.beams, sea.swell.uniforms.uSeaLevel);
const flora = new Flora(pipeline.style, geo, terrain.field, sea.swell);
scene.add(flora.group);
scene.add(structures.group);
const ice = new IceCrown(style, terrain.field, sea.swell, sky), fjords = new Fjords(style, terrain.field);
const basalt = new BasaltStacks(style, terrain.field, sea.swell);
const kelpShallows = new KelpShallows(style, terrain.field, sea.swell);
const amberShoals = new AmberShoals(style, terrain.field, sea.swell);
const weeping = new WeepingIsle(style, terrain.field, sea.swell);
scene.add(ice.group, fjords.group, basalt.group, kelpShallows.group, amberShoals.group, weeping.group);
const coral = new CoralAtolls(style, terrain.field, sea.swell); // WP17 part A
scene.add(coral.group);
const spice = new SpiceIsles(style, terrain.field, sea.swell); // WP17 part B
scene.add(spice.group);
// WP17 part C: the Caldera's cycle held at caldera=<s> (seconds into it; the sim's calderaTime), running on with the clock
const caldera = Number(q.get('caldera') ?? 40);
const fire = new FireArchipelago(style, terrain.field, sea.swell, sky.lights);
scene.add(fire.group);

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
/** A ship `ahead` u before the eye and `aside` u off its line, turned `turn` (or, given `moor`, at its unit `at` in
 *  navigable water, its bow toward `to`). */
function launch(ahead: number, aside: number, turn: number, detail = 1, moor?: { at: V; to: V; furl?: boolean }): void {
  const i = afloat.length, up = cam.foot.clone().normalize(), fwd = moor ? moor.to.clone().sub(moor.at) : frameAt(up, cam.heading).clone();
  const at = moor ? moor.at.clone().normalize() : up.clone().multiplyScalar(R).addScaledVector(fwd, ahead).addScaledVector(tmp.crossVectors(fwd, up), aside).normalize();
  if (moor) turn = 0;
  const ship = new Ship(style, { form: FORMS[i % 4], pigments: CAPTAINS[i % 3], detail });
  // moored at the quay or riding at anchor, her sails furled on bare yards; coming in, under reduced sail
  const rig = ship.rig.state(moor && moor.furl === false ? 'reefed' : 'plain', 2.2, 0.7);
  if (moor?.furl) for (const s of rig.sails) s.set = 0;
  ship.setRig(rig);
  scene.add(ship);
  const lantern = sky.lights.add({ pos: V(), reach: 4.5 }), heading = frameAt(at, headingToward(at, moor ? moor.to : fwd.clone().add(up)) + turn).clone();
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
  const at = q.get('at')?.split(',').map(Number); // (or straight down over the point at=x,y,z)
  const s = at ? { at: V(at[0], at[1], at[2]).normalize().multiplyScalar(R), land: 0 } : floorSpot((q.get('kind') ?? 'sand') as keyof typeof FLOOR);
  look(s.at, s.land, Number(q.get('height') ?? 7), Number(q.get('pitch') ?? (at ? -1.5 : -0.95)));
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
} else if (view === 'amber' || view === 'amberpass') {
  const ri = REGIONS.findIndex((r) => r.id === 'amberShoals'), from = V(), to = V();
  if (view === 'amber') { toWorld(ri, 31, -15, from); toWorld(ri, 40, 3, to); } // along the spit's inner flats to the Sandbar Light (capture 21)
  else { toWorld(ri, 12, 18, from); toWorld(ri, 23, 32, to); } // the north-east inlet's sill: dry and shut at low water, a passage at high
  look(from, to, Number(q.get('height') ?? (view === 'amber' ? 10 : 14)), Number(q.get('pitch') ?? (view === 'amber' ? -0.42 : -0.62)));
} else if (view === 'basalt' || view === 'weave') {
  const ri = REGIONS.findIndex((r) => r.id === 'basaltStacks'), from = V(), to = V();
  if (view === 'basalt') { toWorld(ri, -6, -40, from); toWorld(ri, 0, 0, to); } // the Arch over the maze's walls (capture 19)
  else { toWorld(ri, -8, -21.5, from); toWorld(ri, 8, -21.5, to); } // down the lane between the inner walls
  look(from, to, Number(q.get('height') ?? (view === 'basalt' ? 26 : 3.2)), Number(q.get('pitch') ?? (view === 'basalt' ? -0.38 : 0.05)));
  if (view === 'weave') launch(14, 0, 0.1);
} else if (view === 'weeping' || view === 'weepingshore') {
  const ri = REGIONS.findIndex((r) => r.id === 'weepingIsle'), from = V(), to = V();
  if (view === 'weeping') { toWorld(ri, 16, -80, from); toWorld(ri, 0, 0, to); } // from the loop at dawn: the mountain and its falls all round (capture 22)
  else { // at the foot of a great southern fall, the rim and its buttresses above
    const fall = weeping.plan.falls.filter((f) => f.sim).reduce((a, b) => (Math.abs(b.bearing - 3.3) < Math.abs(a.bearing - 3.3) ? b : a)), c = V();
    toWorld(ri, 0, 0, c);
    const out = fall.foot.clone().sub(c).normalize(), side = V().crossVectors(fall.foot, out).normalize();
    from.copy(fall.foot).addScaledVector(out, 20 / R).addScaledVector(side, 9 / R).normalize();
    to.copy(fall.lip);
  }
  look(from, to, Number(q.get('height') ?? (view === 'weeping' ? 7 : 3.2)), Number(q.get('pitch') ?? (view === 'weeping' ? 0.03 : 0.26)));
  launch(14, 0.5, 0.1);
} else if (view === 'coral' || view === 'coralshore') {
  const ri = REGIONS.findIndex((r) => r.id === 'coralAtolls'), from = V(), to = V();
  const ch = coral.plan.channels.find((c) => c.great)!, b = (ch.bearing * Math.PI) / 180;
  const ob = b + Number(q.get('swing') ?? 0), od = Number(q.get('off') ?? -7), aim = Number(q.get('aim') ?? 0);
  // capture 23: low inside the Great Lagoon at midday, 7 u in from its reef's crest, looking out down the single channel:
  // the lagoon's pale water fills the near and middle ground, the pass runs out as the one dark way between the reef's
  // two arms (their surf, the withies), to the open sea (from outside, a low eye sees the lagoon only as a sliver)
  if (view === 'coral') { toWorld(ri, ch.crest.x + od * Math.cos(ob), ch.crest.y + od * Math.sin(ob), from); toWorld(ri, ch.crest.x + 30 * Math.cos(b + aim * 0.01), ch.crest.y + 30 * Math.sin(b + aim * 0.01), to); }
  // the shore: low over the lagoon's edge inside the south-east motu, along its beach (the reef flat at low water, the
  // grove leaning out over it) to the windward motus across the lagoon; the hulk at the mouth stays behind the eye
  else { toWorld(ri, Number(q.get('fx') ?? 20.5), Number(q.get('fy') ?? -17.5), from); toWorld(ri, Number(q.get('tx') ?? 25.5), Number(q.get('ty') ?? -4.5), to); }
  look(from, to, Number(q.get('height') ?? (view === 'coral' ? 4 : 2.2)), Number(q.get('pitch') ?? (view === 'coral' ? -0.2 : -0.1)));
} else if (view === 'spice' || view === 'spiceshore') {
  const ri = REGIONS.findIndex((r) => r.id === 'spiceIsles'), from = V(), to = V(), m = REGIONS[ri].landmark;
  const ox = Number(q.get('ox') ?? 0), oy = Number(q.get('oy') ?? 0);
  // capture 24: Spice Harbour at golden hour from the sound, its quays and godowns under the flowering jungle, ships
  // crowding in through the mouth
  if (view === 'spice') { toWorld(ri, m.x + 3 + ox, m.y - 24 + oy, from); toWorld(ri, m.x - 1, m.y + 9, to); }
  else { toWorld(ri, 14 + ox, -10 + oy, from); toWorld(ri, 28, -4, to); } // low off the east island's jungle shore: the forest edge over the beach
  look(from, to, Number(q.get('height') ?? (view === 'spice' ? 10 : 2.6)), Number(q.get('pitch') ?? (view === 'spice' ? -0.2 : -0.02)));
  // ships at the quay's berths and coming in through the mouth, each where the sim floats it at every tide (regions test)
  if (view === 'spice') for (const [x, y, tx, ty, d] of SPICE_SHIPS) {
    const at = V(), to = V();
    toWorld(ri, x, y, at);
    toWorld(ri, tx, ty, to);
    launch(0, 0, 0, d, { at, to, furl: y > -10 }); // all but the ship in the mouth lie at the berths
  }
} else if (view === 'fire') {
  const ri = REGIONS.findIndex((r) => r.id === 'fireArchipelago'), from = V(), to = V();
  const ox = Number(q.get('ox') ?? 0), oy = Number(q.get('oy') ?? 0);
  // capture 25: the Caldera erupting at dusk from the sea off its south-east lava delta, the lava steaming into the sea,
  // a ship standing in the hot water where the gold falls
  toWorld(ri, 6 + ox, -55 + oy, from); toWorld(ri, 2, 0, to);
  look(from, to, Number(q.get('height') ?? 4.5), Number(q.get('pitch') ?? 0.02));
  launch(11, 3, 0.6);
} else if (view === 'crown' || view === 'fjord' || view === 'mark') {
  const ri = view === 'crown' ? 0 : view === 'fjord' ? 1 : REGIONS.findIndex((r) => r.name.includes(place ?? 'Ice'));
  const m = REGIONS[ri].landmark, from = V(), to = V();
  if (view === 'fjord') { toWorld(ri, -52, 5.5, from); toWorld(ri, -24, 17, to); } // up the Falls Fjord to the Great Falls
  else if (view === 'crown') { toWorld(ri, m.x + 5, m.y - 25, from); toWorld(ri, m.x + 2, m.y, to); } // from the pack
  else { toWorld(ri, m.x, m.y - Number(q.get('back') ?? 60), from); toWorld(ri, m.x, m.y, to); } // high above (back=<u> south of it)
  const [height, pitch] = view === 'mark' ? [110, -1.1] : view === 'crown' ? [6, 0.02] : [3.4, 0.04];
  look(from, to, Number(q.get('height') ?? height), Number(q.get('pitch') ?? pitch));
  if (view === 'fjord') launch(15, 1.3, 0.1);
} else if (view === 'pole') {
  look(V(Math.cos(1.37), Math.sin(1.37), 0), V(0, 1, 0), 30, -0.5);
} else {
  look(spot('Weeping', 50).at, 0.6, 140, -0.38);
}
// turn=sun swings any view round to the sun's bearing at the hour (the glitter path up the water toward a low sun),
// then by aim=<rad> more; turn=<rad> swings it by that much
const turn = q.get('turn');
if (turn === 'sun') cam.heading = headingToward(cam.foot, skyLight(hour, cam.foot, newSkyLight()).sun) + (view === 'coral' ? 0 : Number(q.get('aim') ?? 0));
else if (turn) cam.heading += Number(turn);
aim();
frameAt(UP, cam.heading + 1.1);
sea.setWind(UP, F, wind);
const calm = Number(q.get('calm') ?? 0), squall = Number(q.get('squall') ?? 0);
weeping.wet = squall;
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
// probe=heads (tests/render/sea.test.ts): the sea draws in red how much of each point a coral head covers, and
// __seaProbe.heads() renders a frame and gives the share of the view the heads cover
if (q.get('probe') === 'heads') {
  const m = sea.mesh.material as THREE.ShaderMaterial;
  m.defines = { ...m.defines, HEADS_PROBE: '' };
  m.needsUpdate = true;
}
(window as unknown as { __seaProbe: unknown }).__seaProbe = {
  heads(): number {
    pipeline.render(scene, camera, 0);
    const gl = pipeline.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let n = 0;
    for (let k = 0; k < w * h; k++) if (px[4 * k] > 128 && px[4 * k] > 2 * px[4 * k + 1]) n++;
    return n / (w * h);
  },
};
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
  kelpShallows.update(camera.position, clock); amberShoals.update(camera.position, clock); weeping.update(camera.position); coral.update(camera.position, camera); spice.update(camera.position, camera);
  const ct = (caldera + (hold === null ? clock : 0)) % CALDERA_PERIOD;
  fire.update(camera.position, clock, ct, ct < CALDERA.burst ? ct / CALDERA.burst : -1, weather.wind);
  pipeline.render(scene, camera, dt);
  Object.assign(hook, {
    ready: ++frames >= 3, triangles: pipeline.stats.triangles, calls: pipeline.stats.calls, terrainTriangles: terrain.triangles,
    structureTriangles: structures.triangles, regionTriangles: ice.triangles + fjords.triangles + basalt.triangles + (kelpShallows.triangles + amberShoals.triangles + weeping.triangles + coral.triangles + spice.triangles + fire.triangles), flora: flora.stats,
    terrainMB: terrain.bytes / 2 ** 20, textureMB: pipeline.stats.textureBytes / 2 ** 20, targetMB: pipeline.stats.targetBytes / 2 ** 20,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

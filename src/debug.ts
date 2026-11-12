// Every debug switch, read from the page's query, and the scaffolding they turn on. None of it runs in a release build
// unless the page asks with ?debug: off Vite's dev server (import.meta.env.DEV) and without ?debug the switches all
// read as their defaults and no scaffolding is made.
//
// ?t=hours sets the time of day (the same everywhere: world/sun.ts); ?wind=m/s the wind's speed, ?haze= the air's
// aerosol and ?cloud= the cloud cover (0–1) each hold at that instead of drifting (world/weather.ts); ?seed= the
// planet's (world/planet.ts; SEED by default). ?debug=charts colours the sea by its charts' weights, ?debug=wake shows
// the ships' marks on it (water/wake.ts).
// ?lat=&lon= degrees put the camera over a point of the planet and ?alt= metres above the sea; ?yaw=deg turns it
// (clockwise from north: 90 east) and ?look=deg pitches it. The planet is 554 m in radius, so a degree is 9.67 m.
// ?fly, or any of lat, lon and alt, flies the debug camera (fly.ts) instead of sailing, starting over where she would
// lie by default (for seed 3 the largest island's centre is at lat 8.7, lon −11.6, its coast about 69 m out).
// ?drive= sails a debug drive first (play/game.ts); ?gun=0…4 arms every ship with a gun of that rarity (sim/gun.ts). ?probe stands grey blocks and mirrors ahead (probe.ts). The meter
// (meter.ts) shows the frame's cost. ?safe=top,right,bottom,left px stands in for the phone's safe-area insets
// (iPhone 16 Pro Max in landscape: ?safe=0,62,21,62). ?screen= opens the UI at a screen (title, lobby, drop, match,
// spectate, won, result; ui/flow.ts): drop starts a match in the Gale (with ?dive, ?mark=lat,lon and ?ahead=seconds to
// see the glide); spectate sinks her by the first other ship (?ships=n), won sinks every other by her.
// `node tools/planet-map.ts <seed>` charts a planet and lists its islands.

import type { Environment } from './environment';
import { createFly } from './fly';
import type { createFrame } from './frame';
import type { Other } from './play/game';
import { addProbe } from './probe';
import { SEED } from './world/planet';
import { MEAN, SWING } from './world/weather';
import { R, add, cross, dot, frameAt, along, normalize, scale, type Vec3 } from './world/sphere';

type Frame = ReturnType<typeof createFrame>;

/** Whether debugging is on: the dev server, or ?debug in the query. */
export const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

const params = new URLSearchParams(DEBUG ? location.search : '');
const number = (name: string, fallback: number) => (params.has(name) ? Number(params.get(name)) : fallback);
const degrees = Math.PI / 180;

/** The switches as read (their defaults in a release build). */
export const switches = (() => {
  const mean = { ...MEAN }, swing = { ...SWING };
  for (const k of ['wind', 'cloud', 'haze'] as const) if (params.has(k)) [mean[k], swing[k]] = [number(k, 0), 0];
  return {
    seed: number('seed', SEED),
    time: params.has('t') ? number('t', 12) : null,
    storm: params.has('storm') ? number('storm', 0) : null,
    weather: { mean, swing },
    view: params.get('debug') ?? '',
    drive: params.get('drive') ?? '',
    flying: params.has('fly') || ['lat', 'lon', 'alt'].some((k) => params.has(k)),
    probe: params.has('probe'),
    meter: DEBUG,
    screen: params.get('screen'),
    /** ?ahead=seconds: the game run on that long before the first frame (a drop's glide, say); ?dive: she leaves the
     *  Gale as soon as it allows; ?mark=lat,lon (degrees): her mark for the glide. */
    ahead: number('ahead', 0),
    dive: params.has('dive'),
    mark: params.get('mark')?.split(',').map(Number) as [number, number] | undefined,
    /** ?gun=0…4: every ship armed with a gun of that rarity (until there is loot to find one in). */
    gun: params.has('gun') ? number('gun', 0) : null,
  };
})();

/** ?safe's insets, set on the UI's layer (ui/ui.ts). */
export function safeArea(layer: HTMLElement) {
  const insets = params.get('safe')?.split(',').map(Number);
  if (insets) ['top', 'right', 'bottom', 'left'].forEach((side, i) => layer.style.setProperty(`--safe-${side}`, `${insets[i] ?? 0}px`));
}

/** The debug camera, flown from over `start` (or ?lat/?lon), advancing the world's clock itself. */
export function flyer(frame: Frame, element: HTMLElement, env: Environment, start: Vec3) {
  const fly = createFly(frame.camera, element, {
    lat: params.has('lat') ? number('lat', 0) * degrees : Math.asin(start[1]),
    lon: params.has('lon') ? number('lon', 0) * degrees : Math.atan2(-start[2], start[0]),
    height: number('alt', 10),
    bearing: number('yaw', 0) * degrees,
    pitch: number('look', -6) * degrees,
  });
  return (dt: number) => {
    fly(dt);
    env.clock += dt;
  };
}

/**
 * SCAFFOLDING (ships demo, until ships are placed for real): ?ships=N sets N galleons on the sea ahead of `south`
 * (looking north) — 30, 60, 100, 150 m out and on past — on the mean sea, each on her own heading and in her own
 * colours. Sailing, they are the player's fleet-mates (play/game.ts), for her to ram: each makes ?way= m/s (0 by
 * default) on a straight course, her rudder amidships. Flying, they lie still, drawn as if making ?way=. ?lod=0…3
 * draws them all at one level of detail; ?heading=deg turns them all that much further (clockwise seen from above);
 * ?cloth=0 draws every ship's canvas as the wind fills it, simulating none.
 */
export function demoShips(frame: Frame, south: Vec3): Other[] {
  const others: Other[] = [];
  const flying = switches.flying;
  const ships = Math.min(number('ships', 0), flying ? 32 : 31), { up, north } = frameAt(south);
  const paints: Vec3[] = [[0.3, 0.03, 0.02], [0.03, 0.06, 0.2], [0.42, 0.28, 0.05], [0.03, 0.14, 0.06], [0.02, 0.02, 0.02]];
  const sails: Vec3[] = [[0.62, 0.57, 0.46], [0.7, 0.68, 0.6], [0.5, 0.38, 0.25]];
  for (let i = 0; i < ships; i++) {
    const out = [30, 60, 100, 150][i] ?? 150 + (i - 3) * 40, side = i < 4 ? [0, -12, 25, -40][i] : (i % 2 ? 1 : -1) * 30 * i;
    const p = along(along(up, north, out).p, cross(north, up), side).p, u = normalize(p);
    const t = normalize(add(north, u, -dot(north, u))), heading = [1.9, -0.6, 2.8, 0.9][i % 4] + i - number('heading', 0) * degrees;
    const forward = add(scale(t, Math.cos(heading)), cross(u, t), Math.sin(heading));
    others.push({ at: u, heading: forward, look: { paint: paints[i % paints.length], sail: sails[i % sails.length], band: i % 3 === 1 }, way: number('way', 0) });
  }
  if (flying) others.forEach((o, i) => frame.fleet.set(i, { position: scale(o.at, R), forward: o.heading, up: o.at }, o.look, scale(o.heading, o.way)));
  if (params.has('lod')) frame.fleet.pin(number('lod', 0));
  if (params.get('cloth') === '0') frame.fleet.simulate(false);
  return others;
}

/** ?probe's blocks and mirrors, ahead of where the camera starts. */
export function probe(frame: Frame) {
  if (switches.probe) addProbe(frame.scene, frame.sky.light, frame.camera.position);
}

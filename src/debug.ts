// Every debug switch, read from the page's query, and the scenario they set up. None of it runs in a release build
// unless the page asks with ?debug: off Vite's dev server (import.meta.env.DEV) and without ?debug the page is set up
// as released and opens at the title. The scenario drives the game, its referee and the screens' flow only through
// what they offer anyone (main.ts builds them; this only sets them going).
//
// ?t=hours sets the time of day (the same everywhere: world/sun.ts); ?wind=m/s the wind's speed, ?haze= the air's
// aerosol and ?cloud= the cloud cover (0–1) each hold at that instead of drifting (world/weather.ts); ?seed= the
// planet's (world/planet.ts; SEED by default). ?debug=charts colours the sea by its charts' weights, ?debug=wake shows
// the ships' marks on it (water/water.ts).
// ?lat=&lon= degrees put the camera over a point of the planet and ?alt= metres above the sea; ?yaw=deg turns it
// (clockwise from north: 90 east) and ?look=deg pitches it. The planet is 554 m in radius, so a degree is 9.67 m.
// ?fly, or any of lat, lon and alt, flies the debug camera (fly.ts) instead of sailing, starting over where she would
// lie by default (for seed 3 the largest island's centre is at lat 8.7, lon −11.6, its coast about 69 m out).
// ?drive=bearing,throttle,seconds;… sails her, her helm lashed to each leg in turn (bearings in degrees clockwise from
// north where she is), before the first frame; she holds the last until a hand takes the helm. ?gun=0…4 arms every
// ship with a gun of that rarity (sim/gun.ts); ?fire fires hers at the first step; ?storm=seconds holds the storm at
// that moment of its clock. ?probe stands grey blocks and mirrors ahead (probe.ts). The meter (meter.ts) shows the
// frame's cost. ?safe=top,right,bottom,left px stands in for the phone's safe-area insets (iPhone 16 Pro Max in
// landscape: ?safe=0,62,21,62). ?lod=0…3 draws every ship at that level of detail; ?cloth=0 draws every ship's canvas
// as the wind fills it, none simulated (ship/fleet.ts).
// ?screen= opens the UI at a screen (title, lobby, drop, match, spectate, won, result; ui/flow.ts; also map, rank and
// settings), at sea among ?ships=n others by default: drop starts a match in the Gale (with ?dive, ?mark=lat,lon and
// ?ahead=seconds to see the glide); spectate sinks her by the first other ship, won sinks every other by her. ?ships=
// sets them on the sea ahead of her (demoShips), ?way=m/s gives them a straight course at that speed, their helms
// lashed, and ?heading=deg turns them all.
// `node tools/planet-map.ts <seed>` charts a planet and lists its islands.

import type { Anchor } from './world/lattice';
import type { World } from './environment';
import type { FrameOptions } from './frame';
import { createFly } from './fly';
import type { Game } from './play/game';
import type { Referee } from './play/referee';
import { lookOf } from './play/colours';
import { startOf, type Matches } from './play/setup';
import { bearing, type Berth } from './play/state';
import { IDLE } from './player';
import { probeMeshes } from './probe';
import { STEP } from './sim/fixed';
import { SHIP } from './sim/handling';
import { PLAYER } from './sim/match';
import type { Cap } from './sim/storm';
import { FLEET, type ShipDraw, type Snapshot } from './snapshot';
import type { Flow } from './ui/flow';
import { uiLayer } from './ui/ui';
import type { Weather } from './world/weather';
import { R, add, cross, dot, frameAt, along, fromLatLon, normalize, scale, type Vec3 } from './world/sphere';

/** How the page is set up (main.ts RELEASE, or as the switches change it): the planet's seed, the weather's mean and
 *  swing (world/weather.ts) and the time of day (hours); how the frame draws; whether the meter shows the frame's cost;
 *  the seconds the storm is held at (null: it runs) and the rarity of gun every ship is armed with (null: none). */
export interface Setup {
  seed: number; mean: Weather; swing: Weather; hours: number;
  drawing: FrameOptions;
  meter: boolean;
  hold: number | null; gun: number | null;
}

/** The world on a setup, as main.ts builds it: the world, where she lies at the start, the canvas the world is drawn
 *  on, the sea's anchors and the ground's bake (frame.ts), the matches dealt; and the drawing begun, each frame from
 *  `next` (given the seconds since the last, the world as it is to be drawn), once the ground is baked. */
export interface Stage {
  world: World; start: { at: Vec3; bearing: number }; canvas: HTMLElement;
  anchors: readonly Anchor[]; ready: Promise<number>; matches: Matches;
  draw(next: (dt: number) => Snapshot): Promise<void>;
}

/** The game on a stage with its UI over it, as main.ts builds it: the game, its referee and the screens' flow; PLAY
 *  (a match dealt and dropped into); the full map opened (the HUD's tap); and a frame of it. */
export interface Played {
  game: Game; referee: Referee; flow: Flow;
  play(): void;
  map(): void;
  next(dt: number): Snapshot;
}

/** Whether debugging is on: the dev server, or ?debug in the query. */
const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

const params = new URLSearchParams(location.search);
const number = (name: string, fallback: number) => (params.has(name) ? Number(params.get(name)) : fallback);
const degrees = Math.PI / 180;
/** The debug camera flies instead of the game. */
const flying = params.has('fly') || ['lat', 'lon', 'alt'].some((k) => params.has(k));

/** The release's setup as the switches change it. */
function setupOf(release: Setup): Setup {
  const mean = { ...release.mean }, swing = { ...release.swing };
  for (const k of ['wind', 'cloud', 'haze'] as const) if (params.has(k)) [mean[k], swing[k]] = [number(k, 0), 0];
  const sea = params.get('debug');
  return {
    seed: number('seed', release.seed), mean, swing, hours: number('t', release.hours),
    drawing: {
      sea: sea === 'charts' || sea === 'wake' ? sea : release.drawing.sea,
      lod: params.has('lod') ? number('lod', 0) : release.drawing.lod,
      cloth: params.get('cloth') !== '0' && release.drawing.cloth,
      extras: params.has('probe') ? (light, world) => probeMeshes(light, startOf(world.planet).at) : release.drawing.extras,
    },
    meter: true,
    hold: params.has('storm') ? number('storm', 0) : release.hold,
    gun: params.has('gun') ? number('gun', 0) : release.gun,
  };
}

/**
 * The page set going: the stage and the game on it, built by main.ts's `stage` and `play` from `release`, or from
 * the setup the switches make of it; then, debugging, opened where the switches say (at sea among the demo ships by
 * default), or the flyer drawn instead of the game.
 */
export async function scenario(release: Setup, stage: (setup: Setup) => Promise<Stage>, play: (s: Stage) => Promise<Played>) {
  if (!DEBUG) {
    const s = await stage(release);
    return s.draw((await play(s)).next);
  }
  const s = await stage(setupOf(release));
  if (flying) return s.draw(flyer(s.canvas, s.start.at, demoShips(s.start.at, FLEET), s.matches.storm));
  const p = await play(s);
  safeArea(uiLayer());
  open(p, demoShips(s.start.at, FLEET - 1));
  return s.draw(p.next);
}

/** Opens the game where ?screen= says, among `others` at sea; then sails it on ?ahead= seconds. */
function open(p: Played, others: readonly Berth[]) {
  const { game, referee, flow } = p;
  const screen = params.get('screen') ?? 'match';
  if (screen === 'title' || screen === 'lobby') flow.go(screen);
  else if (screen === 'rank' || screen === 'settings') {
    flow.go('lobby');
    flow.open(screen);
  } else if (screen === 'drop') {
    p.play();
    flow.go('drop');
    if (params.has('dive')) game.dive();
    const mark = params.get('mark')?.split(',').map((d) => Number(d) * degrees);
    if (mark) game.mark(fromLatLon(mark[0], mark[1]));
  } else {
    game.atSea(others);
    drive(game, params.get('drive') ?? '');
    if (screen === 'result') flow.end(4);
    else {
      referee.begin(false);
      if (screen === 'spectate') game.sink(PLAYER, others.length ? 1 : null);
      if (screen === 'won') others.forEach((_, i) => game.sink(i + 1, PLAYER));
      flow.go(screen === 'spectate' || screen === 'won' ? screen : 'match');
    }
  }
  // ordered now, fired at her first step
  if (params.has('fire')) game.step(0, { ...IDLE, fire: true });
  for (let t = 0; t < number('ahead', 0); t += 0.1) {
    game.step(0.1, IDLE);
    referee.update(0.1);
  }
  if (screen === 'map') p.map();
}

/** ?drive's legs ("bearing,throttle,seconds;…"), each sailed with her helm lashed to it. */
function drive(game: Game, legs: string) {
  for (const leg of legs.split(';').filter(Boolean)) {
    const [b, throttle, seconds] = leg.split(',').map(Number);
    game.lash((s) => ({ course: bearing(s.at, b * degrees), throttle }));
    for (let i = 0; i < Math.round(seconds / STEP); i++) game.step(STEP, IDLE);
  }
}

/** ?safe's insets, set on the UI's layer (ui/ui.ts). */
function safeArea(layer: HTMLElement) {
  const insets = params.get('safe')?.split(',').map(Number);
  if (insets) ['top', 'right', 'bottom', 'left'].forEach((side, i) => layer.style.setProperty(`--safe-${side}`, `${insets[i] ?? 0}px`));
}

/** The debug camera, flown from over `start` (or ?lat/?lon), keeping the world's clock itself, over `others` lying
 *  still (drawn as if making ?way=) and the storm as it stands by that clock. */
function flyer(element: HTMLElement, start: Vec3, others: readonly Berth[], storm: (seconds: number) => Cap) {
  const fly = createFly(element, {
    lat: params.has('lat') ? number('lat', 0) * degrees : Math.asin(start[1]),
    lon: params.has('lon') ? number('lon', 0) * degrees : Math.atan2(-start[2], start[0]),
    height: number('alt', 10),
    bearing: number('yaw', 0) * degrees,
    pitch: number('look', -6) * degrees,
  });
  const ships: ShipDraw[] = others.map((o, i) => ({
    id: i, pose: { position: scale(o.at, R), forward: o.heading, up: o.at }, look: o.look, velocity: scale(o.heading, number('way', 0)), afloat: true,
  }));
  let clock = 0;
  return (dt: number): Snapshot => {
    const eye = fly(dt);
    clock += dt;
    return { eye, clock, storm: storm(clock), ships, own: null, balls: [], blasts: [] };
  };
}

/**
 * ?ships=n (at most `most`) galleons on the sea ahead of `south` (looking north) — 30, 60, 100, 150 m out and on
 * past — on the mean sea, each on her own heading and in her own colours (play/colours.ts): bots, or with ?way= m/s
 * their helms lashed to a straight course at that speed. ?heading=deg turns them all that much further (clockwise seen from above).
 */
function demoShips(south: Vec3, most: number): Berth[] {
  const others: Berth[] = [];
  const ships = Math.min(number('ships', 0), most), { up, north } = frameAt(south), way = number('way', 0);
  for (let i = 0; i < ships; i++) {
    const out = [30, 60, 100, 150][i] ?? 150 + (i - 3) * 40, side = i < 4 ? [0, -12, 25, -40][i] : (i % 2 ? 1 : -1) * 30 * i;
    const p = along(along(up, north, out).p, cross(north, up), side).p, u = normalize(p);
    const t = normalize(add(north, u, -dot(north, u))), heading = [1.9, -0.6, 2.8, 0.9][i % 4] + i - number('heading', 0) * degrees;
    const forward = add(scale(t, Math.cos(heading)), cross(u, t), Math.sin(heading));
    others.push({ at: u, heading: forward, look: lookOf(i), lashed: way > 0 ? { course: null, throttle: way / SHIP.top } : null });
  }
  return others;
}

// Every debug switch, read from the page's query, and the scenario they set up. None of it runs in a release build
// unless the page asks with ?debug: off Vite's dev server (import.meta.env.DEV) and without ?debug the page is set up
// as released and opens at the title. The scenario drives the game, its referee and the screens' flow only through
// what they offer anyone (main.ts builds them; this only sets them going).
//
// ?mood= puts the whole look on one of the art direction's alternates (docs/art-direction.md): warm, a low evening sun
// over a deeper sea; noon, a high sun, bright and saturated (MOODS: the hour and the haze; the grade, light shafts and
// haze follow the sun's height). ?t=hours sets the time of day (the same everywhere: world/sun.ts); ?wind=m/s the wind's speed, ?haze= the air's
// aerosol and ?cloud= the cloud cover (0–1) each hold at that instead of drifting (world/weather.ts); ?seed= the
// planet's (world/planet.ts; SEED by default). ?debug=charts colours the sea by its charts' weights, ?debug=wake shows
// the ships' marks on it (water/water.ts).
// ?lat=&lon= degrees put the camera over a point of the planet and ?alt= metres above the sea; ?yaw=deg turns it
// (clockwise from north: 90 east) and ?look=deg pitches it. The planet is 554 m in radius, so a degree is 9.67 m.
// ?fly, or any of lat, lon and alt, flies the debug camera (fly.ts) instead of sailing, starting over where she would
// lie by default (for seed 3 the largest island's centre is at lat 52.8, lon −170.1, its coast about 54 m out).
// ?drive=bearing,throttle,seconds;… sails her, her helm lashed to each leg in turn (bearings in degrees clockwise from
// north where she is), before the first frame; she holds the last until a hand takes the helm. ?gun=0…4 arms every
// ship with a gun of that rarity (sim/gun.ts); ?fire fires hers at the first step, ?fire=seconds so many seconds into the
// frames drawn; ?storm=seconds holds the storm at
// that moment of its clock. ?probe stands grey blocks and mirrors ahead (probe.ts). The meter (meter.ts) shows the
// frame's cost. ?safe=top,right,bottom,left px stands in for the phone's safe-area insets (iPhone 16 Pro Max in
// landscape: ?safe=0,62,21,62). ?lod=0…3 draws every ship at that level of detail; ?cloth=0 draws every ship's canvas
// as the wind fills it, none simulated (ship/fleet.ts).
// ?screen= opens the UI at a screen (title, lobby, match, spectate, won, result; ui/flow.ts; also map, rank and
// settings), at sea among ?ships=n others by default: play starts a match as PLAY does (every ship at her berth, the
// eye coming down from space: play/arrival.ts); spectate sinks her by the first other ship (?by=storm: by the storm),
// won sinks every other by her. ?ships= sets them on the sea ahead of her (demoShips), ?way=m/s gives them a straight
// course at that speed, their helms lashed, and ?heading=deg turns them all. ?ahead=seconds sails the game on that
// long before the first frame, and ?pause holds it there from then on (the frame still draws: the arrival's stills).
// The ships in a match are sim/match.ts SHIPS; the frame has room for that many, or for ?ships= more.
// At sea, ?kit puts stores under her for her to sweep up (a gun, unless ?gun arms her, and three slots of stores), with
// a better gun beside them, offered; ?use=1…3,seconds sets her mending from that slot so many seconds into the frames
// drawn, ?gust=seconds spends a gust then and ?fire=seconds fires then; ?loot strews a piece of each rarity in a fan ahead
// of her, 25 m out to 420 m; ?swing=px,px holds a finger on the look, dragged that far right and down (the look then
// stays where it is put); ?slow=k runs the game at k of its speed (for catching a ball in flight).
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
import { IDLE, type Hands } from './player';
import { probeMeshes } from './probe';
import { STEP } from './sim/fixed';
import { SHIP } from './sim/handling';
import { PLAYER, SHIPS } from './sim/match';
import type { Cap } from './sim/storm';
import type { ShipDraw, Snapshot } from './snapshot';
import type { Flow } from './ui/flow';
import { uiLayer } from './ui/ui';
import type { Weather } from './world/weather';
import { R, add, cross, dot, frameAt, along, normalize, scale, type Vec3 } from './world/sphere';

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
  draw(next: (dt: number) => Snapshot, drawn?: (canvas: HTMLCanvasElement) => void): Promise<void>;
}

/** The game on a stage with its UI over it, as main.ts builds it: the game, its referee and the screens' flow; PLAY
 *  (a match dealt, every ship at her berth); the full map opened (the HUD's tap); a frame of it, and what follows once it is drawn (the canvas then holds it). */
export interface Played {
  game: Game; referee: Referee; flow: Flow;
  play(): void;
  map(): void;
  next(dt: number): Snapshot;
  drawn(canvas: HTMLCanvasElement): void;
}

/** Whether debugging is on: the dev server, or ?debug in the query. */
const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

const params = new URLSearchParams(location.search);
const number = (name: string, fallback: number) => (params.has(name) ? Number(params.get(name)) : fallback);
const degrees = Math.PI / 180;
/** The debug camera flies instead of the game. */
const flying = params.has('fly') || ['lat', 'lon', 'alt'].some((k) => params.has(k));

/** The art direction's alternates (?mood=): the hour, and the haze's mean as a share of the release's. */
const MOODS: Record<string, { hours: number; haze: number }> = { warm: { hours: 17.4, haze: 1.2 }, noon: { hours: 12.6, haze: 0.8 } };

/** The release's setup as the switches change it. */
function setupOf(release: Setup): Setup {
  const mood = MOODS[params.get('mood') ?? ''];
  const mean = { ...release.mean, haze: release.mean.haze * (mood?.haze ?? 1) }, swing = { ...release.swing };
  for (const k of ['wind', 'cloud', 'haze'] as const) if (params.has(k)) [mean[k], swing[k]] = [number(k, 0), 0];
  const sea = params.get('debug');
  return {
    seed: number('seed', release.seed), mean, swing, hours: number('t', mood?.hours ?? release.hours),
    drawing: {
      sea: sea === 'charts' || sea === 'wake' ? sea : release.drawing.sea,
      // (room for ?ships= past a match's, for judging the frame with more)
      fleet: Math.max(release.drawing.fleet, number('ships', 0) + 1),
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
    const p = await play(s);
    return s.draw(p.next, p.drawn);
  }
  const s = await stage(setupOf(release));
  const room = Math.max(SHIPS, number('ships', 0) + 1);
  if (flying) return s.draw(flyer(s.canvas, s.start.at, demoShips(s.start.at, room), s.matches.storm));
  const p = await play(s);
  safeArea(uiLayer());
  open(p, demoShips(s.start.at, room - 1));
  const paused = params.has('pause'), slow = number('slow', 1);
  // ?swing: a finger held on the look after each frame, so it never eases back
  const swing = params.get('swing')?.split(',').map(Number);
  if (swing) p.game.step(0, { ...IDLE, look: { x: swing[0] || 0, y: swing[1] || 0, held: true } });
  // ?use: the slot tapped twice (chosen, then used); ?gust and ?fire pressed; so many seconds in
  const [slot, use] = (params.get('use') ?? '').split(',').map(Number);
  const timed: { at: number; hands: Partial<Hands> }[] = [
    ...(slot > 0 ? [{ at: use || 0, hands: { tap: slot } }, { at: use || 0, hands: { tap: slot } }] : []),
    ...(params.has('gust') ? [{ at: number('gust', 0), hands: { gust: true } }] : []),
    ...(params.get('fire') ? [{ at: number('fire', 0), hands: { fire: true } }] : []),
  ];
  let drawn = 0;
  return s.draw((real) => {
    const dt = paused ? 0 : real * slow, frame = p.next(dt);
    for (const t of timed) if (drawn <= t.at && drawn + dt > t.at) p.game.step(STEP, { ...IDLE, ...t.hands });
    drawn += dt;
    if (swing) p.game.step(0, { ...IDLE, look: { x: 0, y: 0, held: true } });
    return frame;
  }, p.drawn);
}

/** Opens the game where ?screen= says, among `others` at sea; then sails it on ?ahead= seconds. */
function open(p: Played, others: readonly Berth[]) {
  const { game, referee, flow } = p;
  const screen = params.get('screen') ?? 'match';
  if (screen === 'title' || screen === 'lobby') flow.go(screen);
  else if (screen === 'rank' || screen === 'settings') {
    flow.go('lobby');
    flow.open(screen);
  } else if (screen === 'play') {
    p.play();
    flow.go('match');
  } else {
    game.atSea(others);
    drive(game, params.get('drive') ?? '');
    if (screen === 'result') flow.end(4);
    else {
      referee.begin();
      if (screen === 'spectate') game.sink(PLAYER, others.length && params.get('by') !== 'storm' ? 1 : null);
      if (screen === 'won') others.forEach((_, i) => game.sink(i + 1, PLAYER));
      flow.go(screen === 'spectate' || screen === 'won' ? screen : 'match');
    }
  }
  if (screen === 'match') stock(game);
  // ordered now, fired at her first step
  if (params.get('fire') === '') game.step(0, { ...IDLE, fire: true });
  for (let t = 0; t < number('ahead', 0); t += 0.1) {
    game.step(0.1, IDLE);
    referee.update(0.1);
  }
  if (screen === 'map') p.map();
}

/** ?kit and ?loot: her stores and the loot about her, through what the game offers anyone. */
function stock(game: Game) {
  type Goods = Parameters<Game['strew']>[1][number];
  const { at, heading } = game.status();
  const step = () => game.step(STEP, IDLE);
  if (params.has('kit')) {
    const under: Goods[] = [
      { kind: 'gun', rarity: 2 }, { kind: 'smallShield', count: 3 }, { kind: 'bigShield', count: 2 }, { kind: 'repairKit', count: 2 },
    ];
    game.strew(at, under);
    step();
    game.strew(along(at, heading, 3).p, [{ kind: 'gun', rarity: 4 }]);
    step();
  }
  if (params.has('loot')) {
    // a fan ahead of her, clear of her own hull: the rarities worst to best near to far, then again further out
    [25, 50, 90, 140, 200, 250, 300, 350, 420].forEach((m, i) => {
      const side = (i % 2 ? 1 : -1) * (0.45 - 0.035 * i), turned = normalize(add(heading, cross(at, heading), side));
      game.strew(along(at, turned, m).p, [i === 1 ? { kind: 'smallShield', count: 1 } : { kind: 'gun', rarity: i % 5 }]);
    });
  }
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
    return { eye, clock, storm: storm(clock), ships, own: null, balls: [], loot: [], blasts: [] };
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
    others.push({ at: u, heading: forward, look: lookOf(i + 1), lashed: way > 0 ? { course: null, throttle: way / SHIP.top } : null });
  }
  return others;
}

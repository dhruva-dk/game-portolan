// Every debug switch, read from the page's query, and the scenario they set up.
// None of it runs, or is even fetched, in a release build unless the page asks
// with ?debug: off Vite's dev server (import.meta.env.DEV) and without ?debug
// main.ts sets the page up as released, opening at the title, and never loads
// this. The scenario drives the game, its referee
// and the screens' flow only through what they offer anyone (main.ts builds
// them; this only sets them going).
//
// The look and the weather. ?mood= puts the whole look on one of its
// alternates: dawn, a low morning sun in a rose mist; warm, a low evening sun
// over a deeper sea; noon, a high sun, bright and saturated (MOODS: the hour
// and the haze; the grade and the haze follow the sun's height). ?t=hours sets
// the time of day (the same everywhere: world/sun.ts); ?wind=m/s the wind's
// speed, ?haze= the air's aerosol and ?cloud= the cloud cover (0–1) each hold
// at that instead of drifting (world/weather.ts); ?seed= the race's, any text
// (address.ts; on a debug page environment.ts SEED by default). ?debug=charts colours the sea by its
// charts' weights, ?debug=wake shows the ships' marks on it (water/water.ts).
//
// The debug camera. ?lat=&lon= degrees put the camera over a point of the
// planet and ?alt= metres above the sea; ?yaw=deg turns it (clockwise from
// north: 90 east) and ?look=deg pitches it. The planet is 554 m in radius, so a
// degree is 9.67 m. ?fly, or any of lat, lon and alt, flies the debug camera
// (fly.ts) instead of sailing, starting over where she would lie by default;
// there ?kind= puts a gun of that kind on every ship's plinth (?kind=all: each
// ship the next kind), and ?rarity= of that rarity (0 common to 4; ?rarity=all:
// each the next, after each kind). ?wall=m flies it m metres short of the storm's edge, in
// the calm (with ?storm=, the cap held then; negative: in the storm), on the
// line from the cap's centre toward where she would lie, looking out across the
// edge (?yaw= turns from that). ?bolt holds the storm's lightning lit
// (sky/storm-bolt.ts), for a still of it.
//
// Her course and her hands. ?drive=bearing,throttle,seconds;… sails her, her
// helm lashed to each leg in turn (bearings in degrees clockwise from north
// where she is), before the first frame; she holds the last until a hand takes
// the helm. ?gun=0…4 arms every ship with a gun of that rarity, ?kind= (cannon,
// scatter, repeater, harpoon, mortar) of that kind (sim/gun.ts; a common cannon
// by default with either); ?fire fires hers at the first step, ?fire=seconds so
// many seconds into the frames drawn, ?fire=seconds,held holds its trigger that
// long; ?tap=slot,seconds taps that slot of the hotbar then (0–1 her guns', 2–4
// her items': a swap, or a reload); ?storm=seconds holds the storm at that
// moment of its clock.
//
// The frame. ?probe stands grey blocks and mirrors ahead (probe.ts). The meter
// (meter.ts) shows the frame's cost. ?safe=top,right,bottom,left px stands in
// for the device's safe-area insets (the iPad Air in landscape: ?safe=0,0,20,0,
// the home indicator's). ?lod=0…3 draws every ship at that level of detail;
// ?cloth=0 draws every ship's canvas as the wind fills it, none simulated
// (ship/fleet.ts).
//
// The screens. ?screen= opens the UI at a screen (title, lobby, settings,
// seed: the seed panel over the lobby, on the page's ?seed=; livery: her
// livery's folio, her ship turned broadside above it; match, sunk,
// spectate, won, result; ui/ways.ts; also map), at sea among
// ?ships=n others by default: play starts a match as PLAY does (every ship at
// her berth, the eye coming down from space: play/arrival.ts); sunk sinks her
// by the first other ship (?by=storm: by the storm) and the screens follow her
// end as the match would bring it (the camera's beat, then her result);
// spectate sinks her and watches; won sinks every other, the last by her;
// result sinks her and all but one other, so the match is over. ?sink=seconds
// sinks her so many seconds into the frames drawn, ?win=seconds every other
// ship then, so she wins; ?leave=seconds taps LEAVE then (home, a new page on
// a new seed under the title, where her screen has that way: ui/passage.ts).
//
// The sea about her. ?ships= sets them on the sea ahead of her (demoShips;
// ?pack: in rows of ten, a fan of them filling the view),
// ?way=m/s gives them a straight course at that speed, their helms lashed, and
// ?heading=deg turns them all. ?livery=dye,pattern puts her in that livery
// (play/colours.ts DYES, player.ts PATTERNS, by index), the others dealt
// round it. ?ahead=seconds sails the game on that long before the first
// frame, and ?pause holds it there from then on (the frame still draws: the
// arrival's stills). The ships in a match are sim/match.ts
// SHIPS; the frame has room for that many, or for ?ships= more. At sea, ?kit
// (?kit=seconds: then) puts stores under her for her to sweep up (two guns, a
// cannon and a scatter, unless ?gun arms her, and three slots of stores), with
// a better gun beside them, a mortar, offered; ?use=1…3,seconds sets her
// mending from that slot so many seconds into the frames drawn, ?gust=seconds
// spends a gust then, ?fire=seconds fires then and ?down=seconds sinks one by
// her then; ?arm gives every other ship a legendary gun (the kinds in turn), so
// with ?ahead they are fighting; ?loot strews a piece of each kind and rarity in a fan ahead of her,
// 25 m out to 420 m (?loot=m: every kind of gun, each of another rarity, and
// the stores, in a row across the look m metres out); ?swing=px,px,seconds
// drags the look that far right and down and lets it go, so many seconds into
// the frames drawn (0 by default; the look stays where it is put:
// play/chase.ts); ?slow=k runs the game at k of its speed (for catching a ball
// in flight).
//
// A race. ?race starts a race sailed by a card (play/race.ts: a field of spec
// ships in teams of four, ?race=n teams of them, 20 by default), her hands on
// ship 0 and the eye coming down from space as PLAY's does, so the race's HUD
// has its data (player.ts Status.race); ?pit=seconds asks a pit stop of every
// job so many seconds into the frames drawn (it begins if she lies in her
// team's water, as at her berth she does, and her hands are on her ship: once
// the eye is down, so ?pit=7 or with ?ahead), and ?call=name,seconds changes her
// team's call then (free, attack, hold, form). The race as its HUD reads it is
// set on the page each second drawn, for the tools (the body's data-race, as
// JSON).
//
// Damage. ?zones=r,u,w,d sets her zones' shares of her hull's damage (rigging,
// rudder, waterline, deck: player.ts ZONES), ?faults=a,b,c,d their faults (0
// none, 1 minor, 2 major) on her and every ship, ?wear=0…2 every ship's wear
// (her smoke), ?mend her water mending her; held over the match's own
// (game.ts debug.wear), from ?worn=seconds into the frames drawn (0 by
// default: from the first; later, a fault comes on in view).
//
// Her loop. ?flood=seconds, after ?drive='s legs, steers her back to where she
// began until her loop closes (her strip back against her older water), then sails
// on that many seconds more (?inward=seconds, after the legs, sails her that
// long toward the middle of the storm's next circle, then lies to): with
// ?pause, the flood stopped mid-sweep. ?homeward, after the legs, steers her
// back to where she began in the frames drawn, her loop closing in view. ?map
// opens the full map once ?ahead= has run (with screen=play, the whole match's
// water from space).
//
// `node tools/terrain-map.ts <seeds>` charts planets' land.

import type { Anchor } from './world/lattice.ts';
import type { World } from './environment.ts';
import type { FrameOptions } from './frame.ts';
import { createFly } from './fly.ts';
import type { DebugDamage, Game } from './play/game.ts';
import { raceOf, specField } from './play/race.ts';
import type { Referee } from './play/referee.ts';
import { dealt, lookOf, worn } from './play/colours.ts';
import type { Matches } from './play/setup.ts';
import type { Berth } from './play/state.ts';
import {
  CALLS,
  HOTBAR,
  IDLE,
  JOBS,
  type Hands,
  type Livery,
} from './player.ts';
import { probeMeshes } from './probe.ts';
import { STEP } from './sim/fixed.ts';
import { KINDS, SOUND, type Fault, type GunKind } from './kinds.ts';
import { GUN, SHIP } from './sim/handling.ts';
import { PLAYER, SHIPS } from './sim/match.ts';
import type { ShipDraw, Snapshot, StormDraw } from './snapshot.ts';
import type { Flow } from './ui/flow.ts';
import { uiLayer } from './ui/ui.ts';
import type { Weather } from './world/weather.ts';
import {
  R,
  add,
  bearingAt,
  cross,
  dot,
  frameAt,
  along,
  normalize,
  scale,
  type Vec3,
} from './world/sphere.ts';

/**
 * How the page is set up (main.ts RELEASE, or as the switches change it): the
 * planet's seed, the weather's mean and swing (world/weather.ts) and the time
 * of day (hours); how the frame draws; whether the meter always shows the
 * frame's cost, split by pass (the debug page's; else only as the settings'
 * stats switch has it); the seconds the storm is held at (null: it runs) and
 * the gun every ship is armed with (null: none).
 */
export interface Setup {
  seed: number;
  /** The seed as named (address.ts): what the number came from. */
  name: string;
  mean: Weather;
  swing: Weather;
  hours: number;
  drawing: FrameOptions;
  meter: boolean;
  hold: number | null;
  gun: { kind: GunKind; rarity: number } | null;
}

/** ?kind's gun kind, a cannon by default. */
const kindOf = (name: string | null): GunKind =>
  KINDS.find((k) => k === name) ?? 'cannon';

/**
 * The world on a setup, as main.ts builds it: the world, where she lies at the
 * start, the canvas the world is drawn on, the sea's anchors and the ground's
 * bake (frame.ts), the matches dealt; and the drawing begun, each frame from
 * `next` (given the seconds since the last, the world as it is to be drawn),
 * once the ground is baked.
 */
export interface Stage {
  world: World;
  /** The seed the page sails, as named. */
  name: string;
  start: { at: Vec3; bearing: number };
  canvas: HTMLElement;
  anchors: readonly Anchor[];
  ready: Promise<number>;
  matches: Matches;
  /**
   * Shows the frame's cost in its corner, or hides it (always shown when the
   * setup's meter is).
   */
  stats(on: boolean): void;
  draw(
    next: (dt: number) => Snapshot,
    drawn?: (canvas: HTMLCanvasElement) => void
  ): Promise<void>;
}

/**
 * The game on a stage with its UI over it, as main.ts builds it: the game, its
 * referee and the screens' flow; PLAY (a match dealt, every ship at her berth);
 * the full map opened (the HUD's tap); a frame of it, and what follows once it
 * is drawn (the canvas then holds it).
 */
export interface Played {
  game: Game;
  referee: Referee;
  flow: Flow;
  play(): void;
  map(): void;
  next(dt: number): Snapshot;
  drawn(canvas: HTMLCanvasElement): void;
}

const params = new URLSearchParams(location.search);
const number = (name: string, fallback: number) =>
  params.has(name) ? Number(params.get(name)) : fallback;
/** ?livery=dye,pattern: hers (player.ts Livery), held to the set; else hers by default. */
const asked: Livery = (() => {
  const [dye, pattern] = (params.get('livery') ?? '').split(',').map(Number);
  return worn({ dye: dye || 0, pattern: pattern || 0 });
})();
const degrees = Math.PI / 180;
/** The debug camera flies instead of the game. */
const flying =
  params.has('fly') || ['lat', 'lon', 'alt', 'wall'].some((k) => params.has(k));

/** A list switch's nth number (?zones=r,u,w,d), within 0…hi (0 where not given). */
const nth = (name: string, i: number, hi: number) => {
  const v = Number((params.get(name) ?? '').split(',')[i]);
  return Math.min(hi, Math.max(0, Number.isFinite(v) ? v : 0));
};
/** A fault or a wear as a switch gives it: 0, 1 or 2. */
const grade = (v: number): Fault => (v >= 1.5 ? 2 : v >= 0.5 ? 1 : 0);
/** The damage ?zones, ?faults, ?wear and ?mend set (null with none of them). */
const damage: DebugDamage | null = ['zones', 'faults', 'wear', 'mend'].some(
  (k) => params.has(k)
)
  ? {
      zones: [
        nth('zones', 0, 1),
        nth('zones', 1, 1),
        nth('zones', 2, 1),
        nth('zones', 3, 1),
      ],
      faults: [
        grade(nth('faults', 0, 2)),
        grade(nth('faults', 1, 2)),
        grade(nth('faults', 2, 2)),
        grade(nth('faults', 3, 2)),
      ],
      mending: params.has('mend'),
      wear: grade(number('wear', 0)),
    }
  : null;

/**
 * The art direction's alternates (?mood=): the hour, and the haze's mean as a
 * share of the release's.
 */
const MOODS: Record<string, { hours: number; haze: number }> = {
  dawn: { hours: 6.8, haze: 1.6 },
  warm: { hours: 17.4, haze: 1.2 },
  noon: { hours: 12.6, haze: 0.7 },
};

/** The release's setup as the switches change it. */
function setupOf(release: Setup): Setup {
  const mood = MOODS[params.get('mood') ?? ''];
  const mean = { ...release.mean, haze: release.mean.haze * (mood?.haze ?? 1) },
    swing = { ...release.swing };
  for (const k of ['wind', 'cloud', 'haze'] as const)
    if (params.has(k)) [mean[k], swing[k]] = [number(k, 0), 0];
  const sea = params.get('debug');
  return {
    // (?seed= is the release's too, read before this: address.ts)
    seed: release.seed,
    name: release.name,
    mean,
    swing,
    hours: number('t', mood?.hours ?? release.hours),
    drawing: {
      sea: sea === 'charts' || sea === 'wake' ? sea : release.drawing.sea,
      // (room for ?ships= past a match's, for judging the frame with more)
      fleet: Math.max(release.drawing.fleet, number('ships', 0) + 1),
      lod: params.has('lod') ? number('lod', 0) : release.drawing.lod,
      cloth: params.get('cloth') !== '0' && release.drawing.cloth,
      bolt: params.has('bolt') || release.drawing.bolt,
      extras: params.has('probe')
        ? (light, world) => probeMeshes(light, world.planet.start.at)
        : release.drawing.extras,
    },
    meter: true,
    hold: params.has('storm') ? number('storm', 0) : release.hold,
    gun:
      params.has('gun') || params.has('kind')
        ? { kind: kindOf(params.get('kind')), rarity: number('gun', 0) }
        : release.gun,
  };
}

/**
 * The page set going, debugging (main.ts loads this only then): the stage and
 * the game on it, built by main.ts's `stage` and `play` from the setup the
 * switches make of `release`; then opened where the switches say (at sea among
 * the demo ships by default), or the flyer drawn instead of the game. `title`
 * is the title the page painted first: the game's flow takes it down; the
 * flyer, which has no flow, takes it down itself once the ground is baked.
 */
export async function scenario(
  release: Setup,
  stage: (setup: Setup) => Promise<Stage>,
  play: (s: Stage) => Promise<Played>,
  title: { show(on: boolean): void }
) {
  const s = await stage(setupOf(release));
  const room = Math.max(SHIPS, number('ships', 0) + 1);
  if (flying) {
    void s.ready.then(() => title.show(false));
    return s.draw(
      flyer(
        s.canvas,
        s.start.at,
        demoShips(s.start.at, room, s.world.seed, asked),
        s.matches.storm
      )
    );
  }
  const p = await play(s);
  safeArea(uiLayer());
  // ?livery: hers, worn before the sea about her is laid (else hers as the
  // device keeps it, as the flow found it); the others dealt round it
  if (params.has('livery')) p.game.wear(asked);
  open(
    p,
    demoShips(s.start.at, room - 1, s.world.seed, p.game.worn()),
    s.world
  );
  const paused = params.has('pause'),
    slow = number('slow', 1);
  // ?use: the item's slot tapped twice (chosen, then used); ?tap's slot tapped;
  // ?gust and ?fire pressed; ?swing's drag; so many seconds in
  const swing = params.get('swing')?.split(',').map(Number),
    item = HOTBAR.guns - 1;
  const [slot, use] = (params.get('use') ?? '').split(',').map(Number),
    tap = params.get('tap')?.split(',').map(Number);
  const [fireAt, held] = (params.get('fire') ?? '').split(',').map(Number);
  const [named, callAt] = (params.get('call') ?? '').split(','),
    call = CALLS.find((c) => c === named);
  const timed: { at: number; hands: Partial<Hands> }[] = [
    ...(slot > 0
      ? [
          { at: use || 0, hands: { tap: item + slot } },
          { at: use || 0, hands: { tap: item + slot } },
        ]
      : []),
    ...(tap ? [{ at: tap[1] || 0, hands: { tap: tap[0] || 0 } }] : []),
    ...(params.has('gust')
      ? [{ at: number('gust', 0), hands: { gust: true } }]
      : []),
    ...(params.get('fire') ? [{ at: fireAt || 0, hands: { fire: true } }] : []),
    ...(params.has('pit')
      ? [{ at: number('pit', 0), hands: { pit: JOBS } }]
      : []),
    ...(call ? [{ at: Number(callAt) || 0, hands: { call } }] : []),
    ...(swing
      ? [
          {
            at: swing[2] || 0,
            hands: {
              look: { x: swing[0] || 0, y: swing[1] || 0, held: false },
            },
          },
        ]
      : []),
  ];
  // ?sink and ?win: her end, and ?down: one sunk by her, so many seconds into
  // the frames drawn; ?leave: her tap on LEAVE
  const ends = [
    ...(params.has('leave')
      ? [{ at: number('leave', 0), act: () => p.flow.tap('leave') }]
      : []),
    ...(params.has('sink')
      ? [{ at: number('sink', 0), act: () => sinkHer(p.game) }]
      : []),
    ...(params.has('win')
      ? [{ at: number('win', 0), act: () => winHer(p.game) }]
      : []),
    ...(params.has('down')
      ? [{ at: number('down', 0), act: () => downOne(p.game) }]
      : []),
    ...(params.get('kit')
      ? [{ at: number('kit', 0), act: () => kit(p.game) }]
      : []),
    ...(damage && number('worn', 0) > 0
      ? [{ at: number('worn', 0), act: () => p.game.debug.wear(damage) }]
      : []),
  ];
  if (damage && !(number('worn', 0) > 0)) p.game.debug.wear(damage);
  let drawn = 0;
  return s.draw((real) => {
    const dt = paused ? 0 : real * slow,
      frame = p.next(dt);
    for (const t of timed)
      if (drawn <= t.at && drawn + dt > t.at)
        p.game.step(STEP, { ...IDLE, ...t.hands });
    // ?fire's trigger held: pressed for the frames' next steps
    if (held > 0 && drawn > fireAt && drawn <= fireAt + held)
      p.game.step(0, { ...IDLE, fire: true });
    for (const e of ends) if (drawn <= e.at && drawn + dt > e.at) e.act();
    // ?race: the race as its HUD reads it, set on the page each second drawn
    // for the tools to read (the body's data-race, as JSON)
    if (params.has('race') && Math.floor(drawn + dt) > Math.floor(drawn))
      document.body.dataset.race = JSON.stringify(p.game.status().race);
    drawn += dt;
    return frame;
  }, p.drawn);
}

/**
 * Opens the game where ?screen= says, among `others` at sea (or, with ?race, in
 * a carded race on `world`); then sails it on ?ahead= seconds.
 */
function open(p: Played, others: readonly Berth[], world: World) {
  const { game, referee, flow } = p;
  const screen = params.get('screen') ?? 'match';
  if (
    screen === 'title' ||
    screen === 'lobby' ||
    screen === 'settings' ||
    screen === 'seed' ||
    screen === 'livery'
  )
    flow.go(screen);
  else if (params.has('race')) {
    // a carded race of spec ships, her hands on ship 0 (play/race.ts)
    const teams = number('race', 0) || undefined;
    game.start(raceOf(specField(world.seed, teams, true), world.planet));
    referee.begin();
    flow.go('match');
  } else if (screen === 'play') {
    p.play();
    flow.go('match');
  } else {
    game.debug.atSea(others);
    drive(game, params.get('drive') ?? '');
    referee.begin();
    // her end, as the match's own course would bring it: the screens follow it
    // from the match (ui/ways.ts)
    if (screen === 'sunk' || screen === 'spectate' || screen === 'result')
      sinkHer(game);
    if (screen === 'result')
      others.forEach((_, i) => i > 0 && game.debug.sink(i + 1, 1));
    if (screen === 'won') winHer(game);
    flow.go('match');
    if (screen === 'spectate') {
      referee.update(0);
      referee.watch();
      flow.go('spectate');
    }
  }
  if (screen === 'match') stock(game);
  // ordered now, fired at her first step
  if (params.get('fire') === '') game.step(0, { ...IDLE, fire: true });
  for (let t = 0; t < number('ahead', 0); t += 0.1) {
    game.step(0.1, IDLE);
    referee.update(0.1);
  }
  if (screen === 'map' || params.has('map')) p.map();
}

/** Sinks her by the first other ship afloat (?by=storm: by the Storm). */
function sinkHer(game: Game) {
  const by = game.alive().find((id) => id !== PLAYER);
  game.debug.sink(
    PLAYER,
    by !== undefined && params.get('by') !== 'storm' ? by : null
  );
}

/** The first other ship afloat, sunk by her. */
function downOne(game: Game) {
  const one = game.alive().find((id) => id !== PLAYER);
  if (one !== undefined) game.debug.sink(one, PLAYER);
}

/** Sinks every other ship afloat, the last by her, so she wins. */
function winHer(game: Game) {
  const others = game.alive().filter((id) => id !== PLAYER);
  others.forEach((id, i) =>
    game.debug.sink(
      id,
      i === others.length - 1 ? PLAYER : others[others.length - 1]
    )
  );
}

/** A piece the game's debug strews on the sea: a gun or stores. */
type Goods = Parameters<Game['debug']['strew']>[1][number];

/**
 * ?kit: her stores strewn under her (two guns and three slots of stores), a
 * better gun beside them, and her first steps to sweep them up.
 */
function kit(game: Game) {
  const { at, heading } = game.status(),
    step = () => game.step(STEP, IDLE);
  const under: Goods[] = [
    { kind: 'cannon', rarity: 2 },
    { kind: 'smallShield', count: 3 },
    { kind: 'bigShield', count: 2 },
    { kind: 'repairKit', count: 2 },
  ];
  game.debug.strew(at, under);
  step();
  game.debug.strew(at, [{ kind: 'scatter', rarity: 1 }]);
  step();
  game.debug.strew(along(at, heading, 3).p, [{ kind: 'mortar', rarity: 4 }]);
  step();
}

/**
 * ?kit and ?loot: her stores and the loot about her, through what the game
 * offers anyone.
 */
function stock(game: Game) {
  const { at, heading, facing } = game.status();
  if (params.get('kit') === '') kit(game);
  if (params.has('arm')) {
    // every other ship a legendary gun under her, the kinds in turn, swept up
    // at her next step: once they fight (?ahead), every kind of shot is in the
    // air (tools/browser.ts --budget, worst)
    for (const s of game.ships())
      if (s.id !== PLAYER && s.afloat)
        game.debug.strew(s.at, [
          { kind: KINDS[s.id % KINDS.length], rarity: 4 },
        ]);
    game.step(STEP, IDLE);
  }
  const row = params.has('loot') ? number('loot', 0) : 0;
  if (row > 0) {
    // a row across her bow: the guns, each kind of another rarity, worst to
    // best, then the stores, a few degrees apart
    const all: Goods[] = [
      ...KINDS.map((kind, rarity): Goods => ({ kind, rarity })),
      { kind: 'smallShield', count: 1 },
      { kind: 'bigShield', count: 1 },
      { kind: 'repairKit', count: 1 },
      { kind: 'fullRepair', count: 1 },
    ];
    all.forEach((g, i) => {
      const side = Math.tan(((i - (all.length - 1) / 2) * 7 * Math.PI) / 180);
      game.debug.strew(
        along(at, normalize(add(facing, cross(at, facing), side)), row).p,
        [g]
      );
    });
  } else if (params.has('loot')) {
    // a fan ahead of her, clear of her own hull: the rarities worst to best
    // near to far, then again further out
    [25, 50, 90, 140, 200, 250, 300, 350, 420].forEach((m, i) => {
      const side = (i % 2 ? 1 : -1) * (0.45 - 0.035 * i),
        turned = normalize(add(heading, cross(at, heading), side));
      const piece: Goods =
        i === 1
          ? { kind: 'smallShield', count: 1 }
          : { kind: KINDS[i % 5], rarity: i % 5 };
      game.debug.strew(along(at, turned, m).p, [piece]);
    });
  }
}

/**
 * ?drive's legs ("bearing,throttle,seconds;…"), each sailed with her helm
 * lashed to it.
 */
function drive(game: Game, legs: string) {
  const began = game.status().at;
  for (const leg of legs.split(';').filter(Boolean)) {
    const [b, throttle, seconds] = leg.split(',').map(Number);
    game.debug.lash((s) => ({
      course: bearingAt(s.at, b * degrees),
      throttle,
    }));
    for (let i = 0; i < Math.round(seconds / STEP); i++) game.step(STEP, IDLE);
  }
  if (params.has('inward')) {
    // toward the middle of the circle the storm next closes to (or its calm)
    const { next, eye } = game.status(),
      goal = (next ?? eye).centre;
    game.debug.lash((s) => ({
      course: add(goal, s.at, -dot(goal, s.at)),
      throttle: 1,
    }));
    for (let i = 0; i < Math.round(number('inward', 0) / STEP); i++)
      game.step(STEP, IDLE);
    game.debug.lash((s) => ({ course: s.heading, throttle: 0 }));
  }
  // ?homeward: back toward where she began in the frames drawn, so her loop
  // closes and floods in view
  if (params.has('homeward'))
    game.debug.lash((s) => ({ course: add(began, s.at, -1), throttle: 1 }));
  if (!params.has('flood')) return;
  game.debug.lash((s) => ({ course: add(began, s.at, -1), throttle: 1 }));
  const closed = () =>
    game
      .snapshot()
      .sea?.changes.some((k) => k.kind === 'claim' && k.ship === PLAYER);
  for (let i = 0; i < 30 / STEP && !closed(); i++) game.step(STEP, IDLE);
  for (let i = 0; i < Math.round(number('flood', 0) / STEP); i++)
    game.step(STEP, IDLE);
}

/** ?safe's insets, set on the UI's layer (ui/ui.ts). */
function safeArea(layer: HTMLElement) {
  const insets = params.get('safe')?.split(',').map(Number);
  if (insets)
    ['top', 'right', 'bottom', 'left'].forEach((side, i) =>
      layer.style.setProperty(`--safe-${side}`, `${insets[i] ?? 0}px`)
    );
}

/** The debug camera, flown from over `start` (or ?lat/?lon), keeping the world's clock itself, over `others` lying
 *  still (drawn as if making ?way=) and the storm as it stands by that clock. */
function flyer(
  element: HTMLElement,
  start: Vec3,
  others: readonly Berth[],
  storm: (seconds: number) => StormDraw
) {
  // ?wall: over the storm's edge, looking out across it
  const cap = storm(0),
    c = cap.centre,
    out = normalize(add(start, c, -dot(start, c))),
    a = cap.radius - number('wall', 0) / R;
  const over = params.has('wall')
    ? add(scale(c, Math.cos(a)), out, Math.sin(a))
    : start;
  const away = add(scale(out, Math.cos(a)), c, -Math.sin(a)),
    { north, east } = frameAt(over);
  const fly = createFly(element, {
    lat: params.has('lat') ? number('lat', 0) * degrees : Math.asin(over[1]),
    lon: params.has('lon')
      ? number('lon', 0) * degrees
      : Math.atan2(-over[2], over[0]),
    height: number('alt', 10),
    bearing:
      number('yaw', 0) * degrees +
      (params.has('wall') ? Math.atan2(dot(away, east), dot(away, north)) : 0),
    pitch: number('look', -6) * degrees,
  });
  // ?kind arms each with a gun of that kind (?kind=all: each the next kind), laid over her starboard bow; ?rarity of
  // that rarity (0 common, the default, to 4; ?rarity=all: each the next, through the kinds first)
  const kind = params.get('kind'),
    rarity = params.get('rarity'),
    armed = (i: number, o: Berth): ShipDraw['gun'] =>
      kind === null
        ? null
        : {
            kind: kind === 'all' ? KINDS[i % KINDS.length] : kindOf(kind),
            rarity:
              rarity === 'all'
                ? Math.floor(i / KINDS.length) % GUN.rarities.length
                : number('rarity', 0),
            aim: normalize(add(o.heading, cross(o.heading, o.at), 0.6)),
          };
  const ships: ShipDraw[] = others.map((o, i) => ({
    id: i,
    pose: { position: scale(o.at, R), forward: o.heading, up: o.at },
    look: o.look,
    velocity: scale(o.heading, number('way', 0)),
    afloat: true,
    gun: armed(i, o),
    wear: damage?.wear ?? 0,
    faults: damage?.faults ?? SOUND,
  }));
  let clock = 0;
  return (dt: number): Snapshot => {
    const eye = fly(dt);
    clock += dt;
    return {
      eye,
      clock,
      storm: storm(clock),
      ships,
      own: null,
      balls: [],
      loot: [],
      blasts: [],
    };
  };
}

/**
 * ?ships=n (at most `most`) galleons on the sea ahead of `south` (looking
 * north), 30, 60, 100, 150 m out and on past, on the mean sea, each on her
 * own heading and in her colours as `seed` deals them round `hers`
 * (play/colours.ts dealt): bots, or with ?way= m/s their helms lashed to a
 * straight course at that speed. ?heading=deg turns them all that much further
 * (clockwise seen from above).
 */
function demoShips(
  south: Vec3,
  most: number,
  seed: number,
  hers: Livery
): Berth[] {
  const others: Berth[] = [];
  const ships = Math.min(number('ships', 0), most),
    { up, north } = frameAt(south),
    way = number('way', 0);
  const pack = params.has('pack');
  for (let i = 0; i < ships; i++) {
    // packed: rows of ten in a fan ahead of her, 40 m out and on every 40
    const row = Math.floor(i / 10),
      col = (i % 10) - 4.5;
    const out = pack
        ? 40 + 40 * row
        : ([30, 60, 100, 150][i] ?? 150 + (i - 3) * 40),
      side = pack
        ? col * (12 + 4 * row)
        : i < 4
          ? [0, -12, 25, -40][i]
          : (i % 2 ? 1 : -1) * 30 * i;
    const p = along(along(up, north, out).p, cross(north, up), side).p,
      u = normalize(p);
    const t = normalize(add(north, u, -dot(north, u))),
      heading =
        [1.9, -0.6, 2.8, 0.9][i % 4] + i - number('heading', 0) * degrees;
    const forward = add(
      scale(t, Math.cos(heading)),
      cross(u, t),
      Math.sin(heading)
    );
    others.push({
      at: u,
      heading: forward,
      look: lookOf(dealt(seed, i + 1, hers)),
      lashed: way > 0 ? { course: null, throttle: way / SHIP.top } : null,
    });
  }
  return others;
}

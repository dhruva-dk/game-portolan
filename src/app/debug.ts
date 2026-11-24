import type { Anchor } from '../world/lattice.ts';
import type { World } from '../world/environment.ts';
import type { FrameOptions } from '../render/frame.ts';
import { createFly } from './fly.ts';
import { specimen } from './specimen.ts';
import type { DebugDamage, Game } from '../play/game.ts';
import { raceOf, specField } from '../play/race.ts';
import type { Referee } from '../play/referee.ts';
import { dealt, lookOf, worn } from '../play/colors.ts';
import type { Matches } from '../play/setup.ts';
import type { Berth } from '../play/state.ts';
import { HOTBAR, IDLE, type Hands } from '../play/player.ts';
import type { Livery } from '../world/livery.ts';
import { probeMeshes } from './probe.ts';
import { STEP } from '../sim/fixed.ts';
import { KINDS, type GunKind } from '../sim/kinds.ts';
import { GUN, SHIP } from '../sim/handling.ts';
import { PLAYER, SHIPS } from '../sim/match.ts';
import type { ShipDraw, Snapshot, StormDraw } from '../render/snapshot.ts';
import type { Flow } from './flow.ts';
import { uiLayer } from '../ui/base/ui.ts';
import type { Weather } from '../world/weather.ts';
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
} from '../world/sphere.ts';

export interface Setup {
  seed: number;
  name: string;
  mean: Weather;
  swing: Weather;
  hours: number;
  drawing: FrameOptions;
  meter: boolean;
  hold: number | null;
  gun: { kind: GunKind; rarity: number } | null;
}

const kindOf = (name: string | null): GunKind =>
  KINDS.find((k) => k === name) ?? 'cannon';

export interface Stage {
  world: World;
  name: string;
  start: { at: Vec3; bearing: number };
  canvas: HTMLElement;
  anchors: readonly Anchor[];
  ready: Promise<number>;
  matches: Matches;
  stats(on: boolean): void;
  draw(
    next: (dt: number) => Snapshot,
    drawn?: (canvas: HTMLCanvasElement) => void
  ): Promise<void>;
}

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
const asked: Livery = (() => {
  const [dye, pattern] = (params.get('livery') ?? '').split(',').map(Number);
  return worn({ dye: dye || 0, pattern: pattern || 0 });
})();
const degrees = Math.PI / 180;
const flying =
  params.has('fly') || ['lat', 'lon', 'alt', 'wall'].some((k) => params.has(k));

const grade = (v: number): DebugDamage['wear'] =>
  v >= 1.5 ? 2 : v >= 0.5 ? 1 : 0;
const damage: DebugDamage | null = params.has('wear')
  ? { wear: grade(number('wear', 0)) }
  : null;

const MOODS: Record<string, { hours: number; haze: number }> = {
  dawn: { hours: 6.8, haze: 1.6 },
  warm: { hours: 17.4, haze: 1.2 },
  noon: { hours: 12.6, haze: 0.7 },
};

function setupOf(release: Setup): Setup {
  const mood = MOODS[params.get('mood') ?? ''];
  const mean = { ...release.mean, haze: release.mean.haze * (mood?.haze ?? 1) },
    swing = { ...release.swing };
  for (const k of ['wind', 'cloud', 'haze'] as const)
    if (params.has(k)) [mean[k], swing[k]] = [number(k, 0), 0];
  const sea = params.get('debug');
  return {
    seed: release.seed,
    name: release.name,
    mean,
    swing,
    hours: number('t', mood?.hours ?? release.hours),
    drawing: {
      sea: sea === 'charts' || sea === 'wake' ? sea : release.drawing.sea,
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

export async function scenario(
  release: Setup,
  stage: (setup: Setup) => Promise<Stage>,
  play: (s: Stage) => Promise<Played>,
  title: { show(on: boolean): void }
) {
  if (params.get('screen') === 'glyphs') return specimen(number('page', 1));
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
  if (params.has('livery')) p.game.wear(asked);
  open(
    p,
    demoShips(s.start.at, room - 1, s.world.seed, p.game.worn()),
    s.world
  );
  const paused = params.has('pause'),
    slow = number('slow', 1);
  const swing = params.get('swing')?.split(',').map(Number),
    item = HOTBAR.guns - 1;
  const [slot, use] = (params.get('use') ?? '').split(',').map(Number),
    tap = params.get('tap')?.split(',').map(Number);
  const [fireAt, held] = (params.get('fire') ?? '').split(',').map(Number);
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
    if (held > 0 && drawn > fireAt && drawn <= fireAt + held)
      p.game.step(0, { ...IDLE, fire: true });
    for (const e of ends) if (drawn <= e.at && drawn + dt > e.at) e.act();
    if (params.has('race') && Math.floor(drawn + dt) > Math.floor(drawn))
      document.body.dataset.race = JSON.stringify(p.game.status().race);
    drawn += dt;
    return frame;
  }, p.drawn);
}

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
  if (params.get('fire') === '') game.step(0, { ...IDLE, fire: true });
  for (let t = 0; t < number('ahead', 0); t += 0.1) {
    game.step(0.1, IDLE);
    referee.update(0.1);
  }
  if (screen === 'map' || params.has('map')) p.map();
}

function sinkHer(game: Game) {
  const by = game.alive().find((id) => id !== PLAYER);
  game.debug.sink(
    PLAYER,
    by !== undefined && params.get('by') !== 'storm' ? by : null
  );
}

function downOne(game: Game) {
  const one = game.alive().find((id) => id !== PLAYER);
  if (one !== undefined) game.debug.sink(one, PLAYER);
}

function winHer(game: Game) {
  const others = game.alive().filter((id) => id !== PLAYER);
  others.forEach((id, i) =>
    game.debug.sink(
      id,
      i === others.length - 1 ? PLAYER : others[others.length - 1]
    )
  );
}

type Goods = Parameters<Game['debug']['strew']>[1][number];

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

function stock(game: Game) {
  const { at, heading, facing } = game.status();
  if (params.get('kit') === '') kit(game);
  if (params.has('arm')) {
    for (const s of game.ships())
      if (s.id !== PLAYER && s.afloat)
        game.debug.strew(s.at, [
          { kind: KINDS[s.id % KINDS.length], rarity: 4 },
        ]);
    game.step(STEP, IDLE);
  }
  const row = params.has('loot') ? number('loot', 0) : 0;
  if (row > 0) {
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
    const { next, eye } = game.status(),
      goal = (next ?? eye).center;
    game.debug.lash((s) => ({
      course: add(goal, s.at, -dot(goal, s.at)),
      throttle: 1,
    }));
    for (let i = 0; i < Math.round(number('inward', 0) / STEP); i++)
      game.step(STEP, IDLE);
    game.debug.lash((s) => ({ course: s.heading, throttle: 0 }));
  }
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

function safeArea(layer: HTMLElement) {
  const insets = params.get('safe')?.split(',').map(Number);
  if (insets)
    ['top', 'right', 'bottom', 'left'].forEach((side, i) =>
      layer.style.setProperty(`--safe-${side}`, `${insets[i] ?? 0}px`)
    );
}

function flyer(
  element: HTMLElement,
  start: Vec3,
  others: readonly Berth[],
  storm: (seconds: number) => StormDraw
) {
  const cap = storm(0),
    c = cap.center,
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

function demoShips(
  south: Vec3,
  most: number,
  seed: number,
  livery: Livery
): Berth[] {
  const others: Berth[] = [];
  const ships = Math.min(number('ships', 0), most),
    { up, north } = frameAt(south),
    way = number('way', 0);
  const pack = params.has('pack');
  for (let i = 0; i < ships; i++) {
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
      look: lookOf(dealt(seed, i + 1, livery)),
      lashed: way > 0 ? { course: null, throttle: way / SHIP.top } : null,
    });
  }
  return others;
}

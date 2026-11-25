import type { Anchor } from '../world/lattice.ts';
import type { World } from '../world/environment.ts';
import type { FrameOptions } from '../render/frame.ts';
import { createFly } from './fly.ts';
import { ashore } from './ashore.ts';
import { rehearsed } from './rehearse.ts';
import { memoryStore } from './save.ts';
import { planetSeed } from '../career/fit.ts';
import { seedOf } from '../world/seeds.ts';
import { specimen } from './specimen.ts';
import type { DebugDamage, Game } from '../play/game.ts';
import type { Referee } from '../play/referee.ts';
import { dealt, lookOf, worn } from '../play/colors.ts';
import type { Berth } from '../play/state.ts';
import { IDLE, type Thumbs } from '../play/player.ts';
import type { Livery } from '../world/livery.ts';
import { probeMeshes } from './probe.ts';
import { STEP } from '../sim/fixed.ts';
import { KINDS, RARITIES, type GunKind } from '../sim/kinds.ts';
import { PLAYER } from '../sim/match.ts';
import { SETUP, type Rig } from '../sim/engine.ts';
import type { MatchSetup } from '../sim/setup.ts';
import { createStorm } from '../sim/storm.ts';
import { RACE_SHIP, RACE_STORM, raceSetup, teamLiveries } from './race.ts';
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
  gun: GunKind;
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
  rig: Rig | null;
  gun: GunKind;
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
  race: MatchSetup;
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
    gun: params.has('kind') ? kindOf(params.get('kind')) : release.gun,
  };
}

export async function scenario(
  release: Setup,
  stage: (setup: Setup) => Promise<Stage>,
  play: (s: Stage) => Promise<Played>,
  title: { show(on: boolean): void }
) {
  if (params.get('screen') === 'glyphs') return specimen(number('page', 1));
  const career = CAREER_SCREENS.find((c) => c === params.get('screen'));
  if (career) return harbor(career, release, stage, title);
  const setup = setupOf(release);
  const s = await stage(setup);
  const room = Math.max(SETUP.most, number('ships', 0) + 1);
  if (flying) {
    void s.ready.then(() => title.show(false));
    const closing = createStorm(
      s.world.seed,
      (p) => -s.world.planet.height(p),
      RACE_STORM
    );
    return s.draw(
      flyer(
        s.canvas,
        s.start.at,
        demoShips(s.start.at, room, s.world.seed, asked),
        (t) => closing(setup.hold ?? t)
      )
    );
  }
  const p = await play(s);
  safeArea(uiLayer());
  if (params.has('livery')) p.game.wear(asked);
  open(p, demoShips(s.start.at, room - 1, s.world.seed, p.game.worn()), s);
  const paused = params.has('pause'),
    slow = number('slow', 1);
  const swing = params.get('swing')?.split(',').map(Number);
  const [slot, use] = (params.get('use') ?? '').split(',').map(Number),
    gusts = params.get('gust')?.split(',').map(Number) ?? [];
  const [hurt, hurtAt] = (params.get('hurt') ?? '').split(',').map(Number);
  const [fireAt, held] = (params.get('fire') ?? '').split(',').map(Number);
  const timed: { at: number; hands: Partial<Thumbs> }[] = [
    ...(slot > 0 ? [{ at: use || 0, hands: { heal: slot - 1 } }] : []),
    ...(params.has('gust')
      ? gusts.map((at) => ({ at: at || 0, hands: { gust: true } }))
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
      ? [{ at: number('sink', 0), act: () => sinkPlayerShip(p.game) }]
      : []),
    ...(params.has('win')
      ? [{ at: number('win', 0), act: () => winPlayerShip(p.game) }]
      : []),
    ...(params.has('down')
      ? [{ at: number('down', 0), act: () => downOne(p.game) }]
      : []),
    ...(params.get('kit')
      ? [{ at: number('kit', 0), act: () => kit(p.game) }]
      : []),
    ...(hurt > 0
      ? [{ at: hurtAt || 0, act: () => p.game.debug.hurt(PLAYER, hurt) }]
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

const CAREER_SCREENS = ['lobby', 'team'] as const;

async function harbor(
  screen: (typeof CAREER_SCREENS)[number],
  release: Setup,
  stage: (setup: Setup) => Promise<Stage>,
  title: { show(on: boolean): void }
) {
  const races = Math.max(0, Math.floor(number('races', 0)));
  const career = rehearsed(params.get('seed') ?? undefined, races);
  const planet = planetSeed(career);
  const s = await stage({
    ...setupOf(release),
    seed: seedOf(planet),
    name: planet,
    meter: params.has('meter'),
  });
  safeArea(uiLayer());
  const shore = await ashore(s, career, {
    store: memoryStore(),
    ready: () => title.show(false),
    sailed() {
      const at = new URL(location.href);
      at.searchParams.set('races', String(races + 1));
      location.replace(at.href);
    },
  });
  if (screen === 'team') shore.open('team');
}

function open(p: Played, others: readonly Berth[], s: Stage) {
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
    const teams = number('race', 0) || undefined,
      race = raceSetup(s.name, s.world.seed, teams, s.gun),
      liveries = teamLiveries(race, game.worn());
    game.start(race, liveries);
    if (s.rig) game.debug.rig(s.rig, race, liveries);
    referee.begin();
    flow.go('match');
  } else if (screen === 'play') {
    p.play();
    flow.go('match');
  } else {
    game.debug.atSea(p.race, others, s.rig ?? undefined);
    drive(game, params.get('drive') ?? '');
    referee.begin();
    if (screen === 'sunk' || screen === 'spectate' || screen === 'result')
      sinkPlayerShip(game);
    if (screen === 'result')
      others.forEach((_, i) => i > 0 && game.debug.sink(i + 1, 1));
    if (screen === 'won') winPlayerShip(game);
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

function sinkPlayerShip(game: Game) {
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

function winPlayerShip(game: Game) {
  const others = game.alive().filter((id) => id !== PLAYER);
  others.forEach((id, i) =>
    game.debug.sink(
      id,
      i === others.length - 1 ? PLAYER : others[others.length - 1]
    )
  );
}

function kit(game: Game) {
  const { at, heading } = game.status(),
    step = () => game.step(STEP, IDLE);
  game.debug.strew(at, ['common', 'rare', 'epic']);
  step();
  game.debug.strew(along(at, heading, 3).p, ['legendary']);
  step();
}

function stock(game: Game) {
  const { at, heading, facing } = game.status();
  if (params.get('kit') === '') kit(game);
  const row = params.has('loot') ? number('loot', 0) : 0;
  if (row > 0) {
    RARITIES.forEach((g, i) => {
      const side = Math.tan(
        ((i - (RARITIES.length - 1) / 2) * 7 * Math.PI) / 180
      );
      game.debug.strew(
        along(at, normalize(add(facing, cross(at, facing), side)), row).p,
        [g]
      );
    });
  } else if (params.has('loot')) {
    [25, 50, 90, 140, 200, 250, 300, 350, 420].forEach((m, i) => {
      const side = (i % 2 ? 1 : -1) * (0.45 - 0.035 * i),
        turned = normalize(add(heading, cross(at, heading), side));
      game.debug.strew(along(at, turned, m).p, [RARITIES[i % RARITIES.length]]);
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
    armed = (i: number, o: Berth): ShipDraw['gun'] =>
      kind === null
        ? null
        : {
            kind: kind === 'all' ? KINDS[i % KINDS.length] : kindOf(kind),
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
      lashed:
        way > 0 ? { course: null, throttle: way / RACE_SHIP.topSpeed } : null,
    });
  }
  return others;
}

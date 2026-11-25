import type { Command, Reason } from '../career/commands.ts';
import { matchSetup, planetSeed } from '../career/fit.ts';
import { planetView } from '../career/views/planet.ts';
import { assigned } from '../sim/spawn.ts';
import { rulesOf } from '../sim/rules.ts';
import { planStorm } from '../sim/storm.ts';
import { R } from '../world/sphere.ts';
import { YOURS, type CareerState, type Role } from '../career/state.ts';
import type { Edit } from '../career/views/negotiation.ts';
import { lobbyView } from '../career/views/lobby.ts';
import { dealView } from '../career/views/deal.ts';
import { negotiationView } from '../career/views/negotiation.ts';
import { teamView } from '../career/views/team.ts';
import { paintView, type PaintEdit } from '../career/views/paint.ts';
import { shipView } from '../career/views/ship.ts';
import { sponsorsView } from '../career/views/sponsors.ts';
import { opponentsView, teamSheetView } from '../career/views/opponents.ts';
import { paperView } from '../career/views/paper.ts';
import {
  peopleView,
  tableView,
  winterView,
} from '../career/views/offseason.ts';
import { moneyView, resultView } from '../career/views/result.ts';
import { lookOf } from '../play/colors.ts';
import { createGame } from '../play/game.ts';
import { PARTS, openingPose, type Framing } from '../play/anchorage.ts';
import { sunAt } from '../world/sun.ts';
import type { Chart, PlanetMarks } from '../play/player.ts';
import { surveyor } from '../play/preview.ts';
import { watersOf, type Berther } from '../play/setup.ts';
import { rise } from '../ui/base/sheet.ts';
import { MOTION } from '../ui/base/house.ts';
import { fade, uiLayer } from '../ui/base/ui.ts';
import { createLobby } from '../ui/lobby/lobby.ts';
import { createDeal } from '../ui/lobby/deal.ts';
import { createNegotiation } from '../ui/lobby/negotiation.ts';
import type {
  LobbyPort,
  ScreenArgument,
  ScreenName,
} from '../ui/lobby/port.ts';
import { createPaint } from '../ui/lobby/paint.ts';
import { createShip } from '../ui/lobby/ship.ts';
import { createSponsors } from '../ui/lobby/sponsors.ts';
import { createPlanet } from '../ui/lobby/planet.ts';
import { createOpponents } from '../ui/lobby/opponents.ts';
import { createOffseason } from '../ui/lobby/offseason.ts';
import { createPaper } from '../ui/lobby/paper.ts';
import { createResult } from '../ui/lobby/result.ts';
import { createTeam } from '../ui/lobby/team.ts';
import { createSettingsScreen } from '../ui/lobby/settings.ts';
import { createNewCareer } from '../ui/lobby/new-career.ts';
import { newCareerView } from '../career/views/new-career.ts';
import type { NewCareerPort } from '../ui/lobby/port.ts';
import type { Settings } from '../ui/base/settings.ts';
import { PLAIN } from '../play/colors.ts';
import { rolled } from '../world/seeds.ts';
import { createAudio } from '../audio/audio.ts';
import type { Hearing } from '../audio/listen.ts';
import { view } from '../ui/base/ui.ts';
import { onPressed } from '../ui/base/touch.ts';
import { deviceStore, keepSettings, keptSettings } from './kept.ts';
import { begun, type Founded } from './launch.ts';
import { createInput } from '../ui/sea/input.ts';
import type { Stage } from './debug.ts';
import { painter } from './painter.ts';
import { RACE_SHIP } from './race.ts';
import { saveQueue, sendAndSave, type Store } from './save.ts';

const LIFTED: Framing = { center: [0, -0.5], size: 0.86 };
const ASIDE: Framing = { center: [-0.3, 0.02], size: 0.82 };
const BESIDE: Framing = { center: [0.34, -0.04], size: 0.66 };

export type Ashore = {
  open(screen: ScreenName, argument?: ScreenArgument): void;
  state(): CareerState;
  settled: Promise<void>;
};

export async function anchorage(s: Stage, two: boolean) {
  const { waters, berth } = await watersOf(s.world.seed, s.world.land);
  const { climate } = s.world,
    sun = sunAt(climate.sunPlaces, climate.timeOfDay, s.start.at);
  const opening = openingPose(s.start.at, s.world.wind(s.start.at), sun);
  const start = { at: s.start.at, bearing: opening.bearing };
  const game = createGame(s.world, s.anchors, waters, start, RACE_SHIP);
  game.moor(two, opening.side);
  const input = createInput(s.canvas, () => game.steering());
  return { game, input, berth };
}

async function markedOn(
  s: Stage,
  state: CareerState,
  berth: Berther
): Promise<PlanetMarks> {
  const setup = matchSetup(state, { hands: 'player' });
  const { spawns } = await berth(setup.match, setup.ships.length);
  const at = assigned(spawns, setup.match, setup.ships);
  const ours = setup.ships.flatMap((ship, id) =>
    ship.team === YOURS && at[id] ? [at[id].at] : []
  );
  const table = rulesOf(setup.storm).storm,
    first = table.phases[0];
  const center = planStorm(
    setup.match,
    (p) => -s.world.planet.height(p),
    table
  )[0];
  const home = ours[0] ?? s.start.at;
  return {
    berths: [home, ours[1] ?? home],
    storm: { center, radius: first.radius / R },
  };
}

export async function ashore(
  s: Stage,
  career: CareerState,
  o: {
    store: Store;
    sailed(state: CareerState): void;
    ready(): void;
    founded?(founded: Founded): void;
  }
): Promise<Ashore> {
  const { game, input, berth } = await anchorage(s, true);
  const repaint = painter(
    (look) => game.paint(look),
    lookOf(career.teams[YOURS].livery)
  );
  game.wear(career.teams[YOURS].livery);
  game.arm(career.teams[YOURS].ships[0].gun);
  uiLayer();

  const queue = saveQueue(o.store);
  let state = career,
    chart: Chart | null = null,
    marks: PlanetMarks | null = null,
    aloft = false,
    open: ScreenName | null = null,
    dealt: Role | null = null,
    talking: number | null = null,
    painting = false,
    founding: { el: HTMLElement } | null = null,
    flowing: 'result' | 'offseason' | 'paper' | null =
      career.unread && career.lastRace !== null ? 'result' : null,
    built = false;

  const pricing = (person: number) => (edit: Edit | null) =>
    negotiationView(state, person, edit);

  let held = false;
  const redraw = () => {
    if (!held && flowing === null) lobby.show(lobbyView(state));
    if (flowing === 'paper') paper.update(sheetOf);
    if (open === 'team') team.show(teamView(state));
    if (dealt !== null) deal.show(dealView(state, dealt));
    if (talking !== null) negotiation.show(pricing(talking));
    if (open === 'ship') ship.show((line) => shipView(state, line));
    if (open === 'sponsors') sponsors.show(sponsorsView(state));
    if (open === 'planet') planet.show(planetView(state));
    if (open === 'opponents') opponents.show(opponentsView(state), sheetOf);
    if (painting)
      paint.show((edit: PaintEdit | null) => paintView(state, edit));
  };

  const sheetOf = (team: number) => teamSheetView(state, team);

  const atStop = (index: number) => {
    const focus = PARTS[index] ?? null;
    game.stage({ framing: ASIDE, focus }, true);
  };

  const port: LobbyPort = {
    send(command: Command): Reason | null {
      const { applied, saved } = sendAndSave(queue, state, command);
      if (!applied.ok) return applied.reason;
      state = applied.state;
      if (command.type === 'FitGun') game.arm(state.teams[YOURS].ships[0].gun);
      if (command.type === 'Offer') {
        held = true;
        window.setTimeout(() => {
          held = false;
          redraw();
        }, MOTION.suspense.ms);
      }
      if (command.type === 'MarkRead' && flowing !== null) ended();
      redraw();
      if (state.phase === 'racing') void saved.then(() => o.sailed(state));
      return null;
    },
    open(name, argument) {
      const role = argument?.role;
      const person = argument?.person;
      if (flowing !== null) {
        flow(name, argument);
        return;
      }
      if (open === 'team' && talking === null && name === 'negotiation') {
        if (person === undefined) return;
        talking = person;
        negotiation.show(pricing(person));
        rise(negotiation.el, true);
        fade(dealt === null ? team.el : deal.el, false);
        return;
      }
      if (open === 'team' && dealt === null && name === 'deal' && role) {
        dealt = role;
        deal.open();
        deal.show(dealView(state, role));
        rise(deal.el, true);
        fade(team.el, false);
        return;
      }
      if (open === 'ship' && !painting && name === 'paint') {
        painting = true;
        paint.open();
        paint.show((edit) => paintView(state, edit));
        rise(paint.el, true);
        fade(ship.el, false);
        game.stage({ framing: BESIDE }, true);
        return;
      }
      if (open === null && name === 'ship') {
        open = name;
        ship.open(argument?.stop ?? 0);
        ship.show((line) => shipView(state, line));
        rise(ship.el, true);
        lobby.cover(true);
        atStop(ship.stop());
        return;
      }
      if (open === null && name === 'planet') {
        open = name;
        planet.show(planetView(state));
        planet.open();
        lobby.cover(true);
        return;
      }
      if (open === 'opponents' && name === 'teamSheet') {
        const team = argument?.team;
        if (team === undefined || team < 0 || team >= state.teams.length)
          return;
        opponents.sheet(team, {
          person: argument?.person,
          seat: argument?.role,
        });
        return;
      }
      if (open === null && name === 'opponents') {
        open = name;
        opponents.open();
        opponents.show(opponentsView(state), sheetOf);
        rise(opponents.el, true);
        lobby.cover(true);
        game.stage({ framing: BESIDE }, true);
        return;
      }
      if (open === null && name === 'sponsors') {
        open = name;
        sponsors.open();
        sponsors.show(sponsorsView(state));
        rise(sponsors.el, true);
        lobby.cover(true);
        game.stage({ framing: LIFTED }, true);
        return;
      }
      if (open === null && name === 'settings') {
        open = name;
        settingsScreen.open();
        lobby.cover(true);
        return;
      }
      if (open === null && name === 'team') {
        open = name;
        team.show(teamView(state));
        rise(team.el, true);
        lobby.cover(true);
        game.stage({ framing: LIFTED }, true);
      }
    },
    close() {
      if (flowing === 'paper') {
        paper.back();
        return;
      }
      if (flowing !== null || founding !== null) return;
      if (open === 'settings') {
        open = null;
        settingsScreen.close();
        lobby.cover(false);
        return;
      }
      if (painting) {
        painting = false;
        rise(paint.el, false);
        repaint(lookOf(state.teams[YOURS].livery));
        fade(ship.el, true);
        atStop(ship.stop());
        return;
      }
      if (open === 'ship') {
        open = null;
        rise(ship.el, false);
        ship.reset();
        lobby.cover(false);
        game.stage(null, true);
        return;
      }
      if (open === 'planet') {
        planet.close(() => {
          if (open !== 'planet') return;
          open = null;
          lobby.cover(false);
        });
        return;
      }
      if (open === 'opponents') {
        if (opponents.back()) return;
        open = null;
        rise(opponents.el, false);
        opponents.reset();
        lobby.cover(false);
        game.stage(null, true);
        return;
      }
      if (open === 'sponsors') {
        open = null;
        rise(sponsors.el, false);
        sponsors.reset();
        lobby.cover(false);
        game.stage(null, true);
        return;
      }
      if (talking !== null) {
        talking = null;
        rise(negotiation.el, false);
        negotiation.reset();
        if (dealt !== null && state.teams[YOURS].deals[dealt] !== null) {
          fade(deal.el, true);
          return;
        }
        if (dealt !== null) {
          dealt = null;
          rise(deal.el, false, true);
        }
        fade(team.el, true);
        return;
      }
      if (dealt !== null) {
        if (deal.back()) return;
        dealt = null;
        rise(deal.el, false);
        fade(team.el, true);
        return;
      }
      if (open === null || team.back()) return;
      open = null;
      rise(team.el, false);
      team.reset();
      lobby.cover(false);
      game.stage(null, true);
    },
    scene: {
      stop(index) {
        if (index === null) game.stage(null, true);
        else atStop(index);
      },
      wear(livery) {
        repaint(lookOf(livery ?? state.teams[YOURS].livery));
      },
      planet(on) {
        aloft = on;
      },
      jolt(kind) {
        game.jolt(kind);
        if (kind === 'painted')
          repaint(lookOf(state.teams[YOURS].livery), true);
      },
    },
    chart: () => chart,
    marks: () => marks,
  };

  const lobby = createLobby(port);
  const team = createTeam(port);
  const deal = createDeal(port);
  const negotiation = createNegotiation(port);
  const ship = createShip(port);
  const paint = createPaint(port);
  const sponsors = createSponsors(port);
  const planet = createPlanet(port);
  const opponents = createOpponents(port);
  const device = deviceStore();
  let settings: Settings = keptSettings(device);
  const settingsScreen = createSettingsScreen(
    {
      get: () => settings,
      set(next) {
        settings = next;
        keepSettings(device, next);
      },
      heard(id) {
        if (id === 'sound') audio.sample();
      },
    },
    { seed: state.seed, newCareer: startOver }
  );

  function startOver() {
    if (founding !== null) return;
    const ncPort: NewCareerPort = {
      start(options) {
        o.founded?.(begun(options));
      },
      close() {
        if (founding === null) return;
        const leaving = founding.el;
        founding = null;
        rise(leaving, false);
        window.setTimeout(() => leaving.remove(), MOTION.sheet.leave);
        repaint(lookOf(state.teams[YOURS].livery));
        game.stage(null, true);
        fade(lobby.el, true);
        settingsScreen.open();
      },
      scene: {
        wear(livery) {
          repaint(livery === null ? PLAIN : lookOf(livery));
        },
      },
    };
    const screen = createNewCareer(ncPort),
      seed = rolled(Math.random);
    founding = { el: screen.el };
    settingsScreen.close();
    fade(lobby.el, false);
    game.stage({ framing: BESIDE }, true);
    screen.show((form) =>
      newCareerView(form, { rolled: seed, existing: true })
    );
  }

  const result = createResult(port);
  const offseason = createOffseason(port);
  const paper = createPaper(port);
  redraw();

  function flow(name: ScreenName, argument?: ScreenArgument) {
    const race = resultView(state),
      money = moneyView(state);
    if (flowing === 'result' && name === 'result' && race && money) {
      result.show(race, money, argument?.step ?? 1);
      return;
    }
    const pages = winterPages();
    if (flowing === 'result' && name === 'paper' && pages) {
      flow('offseason', { page: 1 });
      return;
    }
    const page = argument?.page ?? 1;
    if (
      (flowing === 'result' || flowing === 'offseason') &&
      name === 'offseason' &&
      pages &&
      page < 4
    ) {
      flowing = 'offseason';
      result.hide();
      offseason.show(pages, Math.max(1, page));
      return;
    }
    if (
      (flowing === 'result' || flowing === 'offseason') &&
      (name === 'paper' || name === 'offseason')
    ) {
      flowing = 'paper';
      result.hide();
      offseason.hide();
      paper.show(paperView(state));
      if (built) paper.ready();
      return;
    }
    const team = argument?.team;
    if (
      flowing === 'paper' &&
      name === 'teamSheet' &&
      team !== undefined &&
      team >= 0 &&
      team < state.teams.length
    )
      paper.sheet(sheetOf(team), {
        person: argument?.person,
        seat: argument?.role,
      });
  }

  function winterPages() {
    if (state.phase !== 'offseason') return null;
    const table = tableView(state),
      people = peopleView(state),
      winter = winterView(state);
    return table && people && winter ? { table, people, winter } : null;
  }

  function ended() {
    flowing = null;
    result.hide();
    offseason.hide();
    paper.hide();
    rise(lobby.el, true);
  }

  if (flowing === 'result') flow('result');

  const marked = markedOn(s, state, berth).then((m) => {
    marks = m;
  });

  void surveyor()(planetSeed(state)).then((c) => {
    chart = c;
    redraw();
  });

  if (flowing !== null) o.ready();
  else void s.ready.then(() => o.ready());
  const audio = createAudio(s.world.planet.height);
  const status = Object.assign({}, game.status(), game.kit());
  const hearing: Hearing = {
    scene: game.snapshot(),
    status,
    screen: 'lobby',
    map: false,
    covered: 0,
  };
  onPressed(uiLayer(), () => audio.tap(hearing.screen));
  void s.draw((dt) => {
    game.step(dt, input.read());
    const scene = game.snapshot();
    const sky = aloft ? planet.step(dt, scene.eye) : null;
    if (sky) scene.eye = sky;
    hearing.scene = scene;
    hearing.status = Object.assign(
      status,
      game.status(view.w, view.h),
      game.kit()
    );
    hearing.screen = open === 'settings' ? 'settings' : 'lobby';
    audio.update(hearing, settings.sound, dt);
    return scene;
  });

  const settled = Promise.all([marked, s.ready]).then(() => {
    built = true;
    if (flowing === 'paper') paper.ready();
  });

  return {
    open: (name, argument) => port.open(name, argument),
    state: () => state,
    settled,
  };
}

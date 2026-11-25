import type { Command, Reason } from '../career/commands.ts';
import { planetSeed } from '../career/fit.ts';
import { YOURS, type CareerState, type Role } from '../career/state.ts';
import type { Edit } from '../career/views/negotiation.ts';
import { lobbyView } from '../career/views/lobby.ts';
import { dealView } from '../career/views/deal.ts';
import { negotiationView } from '../career/views/negotiation.ts';
import { teamView } from '../career/views/team.ts';
import { paintView, type PaintEdit } from '../career/views/paint.ts';
import { shipView } from '../career/views/ship.ts';
import { sponsorsView } from '../career/views/sponsors.ts';
import { lookOf } from '../play/colors.ts';
import { createGame } from '../play/game.ts';
import { PARTS, openingPose, type Framing } from '../play/anchorage.ts';
import { sunAt } from '../world/sun.ts';
import type { Chart } from '../play/player.ts';
import { surveyor } from '../play/preview.ts';
import { watersOf } from '../play/setup.ts';
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
import { createTeam } from '../ui/lobby/team.ts';
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
};

export async function anchorage(s: Stage, two: boolean) {
  const { waters } = await watersOf(s.world.seed, s.world.land);
  const { climate } = s.world,
    sun = sunAt(climate.sunPlaces, climate.timeOfDay, s.start.at);
  const opening = openingPose(s.start.at, s.world.wind(s.start.at), sun);
  const start = { at: s.start.at, bearing: opening.bearing };
  const game = createGame(s.world, s.anchors, waters, start, RACE_SHIP);
  game.moor(two, opening.side);
  const input = createInput(s.canvas, () => game.steering());
  return { game, input };
}

export async function ashore(
  s: Stage,
  career: CareerState,
  o: { store: Store; sailed(state: CareerState): void; ready(): void }
): Promise<Ashore> {
  const { game, input } = await anchorage(s, true);
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
    open: ScreenName | null = null,
    dealt: Role | null = null,
    talking: number | null = null,
    painting = false;

  const pricing = (person: number) => (edit: Edit | null) =>
    negotiationView(state, person, edit);

  let held = false;
  const redraw = () => {
    if (!held) lobby.show(lobbyView(state));
    if (open === 'team') team.show(teamView(state));
    if (dealt !== null) deal.show(dealView(state, dealt));
    if (talking !== null) negotiation.show(pricing(talking));
    if (open === 'ship') ship.show((line) => shipView(state, line));
    if (open === 'sponsors') sponsors.show(sponsorsView(state));
    if (painting)
      paint.show((edit: PaintEdit | null) => paintView(state, edit));
  };

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
      redraw();
      if (state.phase === 'racing') void saved.then(() => o.sailed(state));
      return null;
    },
    open(name, argument) {
      const role = argument?.role;
      const person = argument?.person;
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
      if (open === null && name === 'sponsors') {
        open = name;
        sponsors.open();
        sponsors.show(sponsorsView(state));
        rise(sponsors.el, true);
        lobby.cover(true);
        game.stage({ framing: LIFTED }, true);
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
      planet() {},
      jolt(kind) {
        game.jolt(kind);
        if (kind === 'painted')
          repaint(lookOf(state.teams[YOURS].livery), true);
      },
    },
    chart: () => chart,
    marks: () => null,
  };

  const lobby = createLobby(port);
  const team = createTeam(port);
  const deal = createDeal(port);
  const negotiation = createNegotiation(port);
  const ship = createShip(port);
  const paint = createPaint(port);
  const sponsors = createSponsors(port);
  redraw();

  void surveyor()(planetSeed(state)).then((c) => {
    chart = c;
    redraw();
  });

  void s.ready.then(() => o.ready());
  void s.draw((dt) => {
    game.step(dt, input.read());
    return game.snapshot();
  });

  return {
    open: (name, argument) => port.open(name, argument),
    state: () => state,
  };
}

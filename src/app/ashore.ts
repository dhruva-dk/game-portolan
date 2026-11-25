import type { Command, Reason } from '../career/commands.ts';
import { planetSeed } from '../career/fit.ts';
import { YOURS, type CareerState } from '../career/state.ts';
import { lobbyView } from '../career/views/lobby.ts';
import { teamView } from '../career/views/team.ts';
import { createGame } from '../play/game.ts';
import { PARTS, WHOLE, litBearing, type Framing } from '../play/anchorage.ts';
import { sunAt } from '../world/sun.ts';
import type { Chart } from '../play/player.ts';
import { surveyor } from '../play/preview.ts';
import { watersOf } from '../play/setup.ts';
import { rise } from '../ui/base/sheet.ts';
import { uiLayer } from '../ui/base/ui.ts';
import { createLobby } from '../ui/lobby/lobby.ts';
import type { LobbyPort, ScreenName } from '../ui/lobby/port.ts';
import { createTeam } from '../ui/lobby/team.ts';
import { createInput } from '../ui/sea/input.ts';
import type { Stage } from './debug.ts';
import { RACE_SHIP } from './race.ts';
import { saveQueue, sendAndSave, type Store } from './save.ts';

const LIFTED: Framing = { center: [0, -0.5], size: 0.86 };

export type Ashore = { open(screen: ScreenName): void; state(): CareerState };

export async function ashore(
  s: Stage,
  career: CareerState,
  o: { store: Store; sailed(state: CareerState): void; ready(): void }
): Promise<Ashore> {
  const { waters } = await watersOf(s.world.seed, s.world.land);
  const { climate } = s.world,
    sun = sunAt(climate.sunPlaces, climate.timeOfDay, s.start.at);
  const start = { at: s.start.at, bearing: litBearing(sun, s.start.at) };
  const game = createGame(s.world, s.anchors, waters, start, RACE_SHIP);
  game.wear(career.teams[YOURS].livery);
  game.moor(true);
  const input = createInput(s.canvas, () => game.steering());
  uiLayer();

  const queue = saveQueue(o.store);
  let state = career,
    chart: Chart | null = null,
    open: ScreenName | null = null;

  const redraw = () => {
    lobby.show(lobbyView(state));
    if (open === 'team') team.show(teamView(state));
  };

  const port: LobbyPort = {
    send(command: Command): Reason | null {
      const { applied, saved } = sendAndSave(queue, state, command);
      if (!applied.ok) return applied.reason;
      state = applied.state;
      redraw();
      if (state.phase === 'racing') void saved.then(() => o.sailed(state));
      return null;
    },
    open(name) {
      if (open === null && name === 'team') {
        open = name;
        team.show(teamView(state));
        rise(team.el, true);
        lobby.cover(true);
        game.stage({ framing: LIFTED }, true);
      }
    },
    close() {
      if (open === null) return;
      open = null;
      rise(team.el, false);
      team.reset();
      lobby.cover(false);
      game.stage(null, true);
    },
    scene: {
      stop(index) {
        const focus = index === null ? null : (PARTS[index] ?? null);
        game.stage(focus === null ? null : { framing: WHOLE, focus }, true);
      },
      wear(livery) {
        game.wear(livery ?? state.teams[YOURS].livery);
      },
      planet() {},
    },
    chart: () => chart,
    marks: () => null,
  };

  const lobby = createLobby(port);
  const team = createTeam(port);
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

  return { open: (name) => port.open(name), state: () => state };
}

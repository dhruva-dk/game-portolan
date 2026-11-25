import type { Chart, PlanetMarks } from '../../play/player.ts';
import type { Command, Livery, Reason, Role } from '../../career/commands.ts';

export type ScreenName =
  | 'ship'
  | 'paint'
  | 'team'
  | 'deal'
  | 'negotiation'
  | 'sponsors'
  | 'opponents'
  | 'teamSheet'
  | 'planet'
  | 'settings';

export type ScreenArgument = { role?: Role; person?: number; team?: number };

export type LobbyPort = {
  send(command: Command): Reason | null;
  open(screen: ScreenName, argument?: ScreenArgument): void;
  close(): void;
  scene: {
    stop(index: number | null): void;
    wear(livery: Livery | null, emblem: number | null): void;
    planet(on: boolean): void;
  };
  chart(): Chart | null;
  marks(): PlanetMarks | null;
};

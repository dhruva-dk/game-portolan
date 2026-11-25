import type { Chart, PlanetMarks } from '../../play/player.ts';
import type { Command, Livery, Reason, Role } from '../../career/commands.ts';

export type Jolt = 'built' | 'focused' | 'painted';

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
  | 'settings'
  | 'result'
  | 'paper';

export type ScreenArgument = {
  role?: Role;
  person?: number;
  team?: number;
  stop?: number;
  step?: number;
};

export type LobbyPort = {
  send(command: Command): Reason | null;
  open(screen: ScreenName, argument?: ScreenArgument): void;
  close(): void;
  scene: {
    stop(index: number | null): void;
    wear(livery: Livery | null, emblem: number | null): void;
    planet(on: boolean): void;
    jolt(kind: Jolt): void;
  };
  chart(): Chart | null;
  marks(): PlanetMarks | null;
};

export type NewCareerPort = {
  start(options: {
    seed: string;
    name: string;
    livery: Livery;
    emblem: number;
  }): void;
  close(): void;
  scene: { wear(livery: Livery | null, emblem: number | null): void };
};

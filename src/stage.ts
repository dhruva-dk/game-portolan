// What main.ts and debug.ts hand each other: the page's setup, the stage the world is drawn on, and the game played on
// it with its UI over it. Types only.

import type { Anchor } from './world/lattice';
import type { World } from './environment';
import type { FrameOptions } from './frame';
import type { Game } from './play/game';
import type { Referee } from './play/referee';
import type { Matches } from './play/setup';
import type { GunKind } from './kinds';
import type { Snapshot } from './snapshot';
import type { Flow } from './ui/flow';
import type { Weather } from './world/weather';
import type { Building, Rookery } from './world/rookery';
import type { Vec3 } from './world/sphere';

/** How the page is set up (main.ts RELEASE, or as the switches change it): the planet's seed, the weather's mean and
 *  swing (world/weather.ts) and the time of day (hours); how the frame draws; whether the meter shows the frame's cost;
 *  the seconds the storm is held at (null: it runs) and the gun every ship is armed with (null: none). */
export interface Setup {
  seed: number; mean: Weather; swing: Weather; hours: number;
  drawing: FrameOptions;
  meter: boolean;
  hold: number | null; gun: { kind: GunKind; rarity: number } | null;
}

/** The world on a setup, as main.ts builds it: the world, where she lies at the start, the canvas the world is drawn
 *  on, the sea's anchors and the ground's bake (frame.ts), the matches dealt; and the drawing begun, each frame from
 *  `next` (given the seconds since the last, the world as it is to be drawn), once the ground is baked. */
export interface Stage {
  readonly world: World; readonly start: { at: Vec3; bearing: number }; canvas: HTMLElement;
  readonly anchors: readonly Anchor[]; readonly ready: Promise<number>; readonly matches: Matches;
  draw(next: (dt: number) => Snapshot | null, drawn?: (canvas: HTMLCanvasElement) => void): Promise<void>;
  /** The planet put away and one of `seed` made in its place (the world and all above read anew), `then` (the game on
   *  it) made, and the drawing taken up once its ground is baked; `campus`: a crew's campus planet (world/rookery.ts),
   *  on which no match is dealt (start and matches are the last race planet's). */
  restage(seed: number, then: () => Promise<void>, campus?: boolean): Promise<void>;
  /** The GPU's geometries and textures held now (three's renderer.info.memory). */
  memory(): { geometries: number; textures: number };
}

/** The game on a stage with its UI over it, as main.ts builds it: the game, its referee and the screens' flow (the
 *  office's among them); PLAY (a match dealt, every ship at her berth); the full map opened (the HUD's tap); a frame of
 *  it, and what follows once it is drawn (the canvas then holds it). */
export interface Played {
  readonly game: Game; readonly referee: Referee; flow: Flow;
  play(): void;
  map(): void;
  /** A new planet in this one's place, as the way home makes it, without the parchment: the next of the page's, or one
   *  of `seed`. */
  restage(seed?: number): Promise<void>;
  /** (null: nothing drawn this frame, the world covered: Skip's parchment) */
  next(dt: number): Snapshot | null;
  drawn(canvas: HTMLCanvasElement): void;
  /** A crew's rookery in 3D (play/rookery.ts), for the rookery's screen. */
  rookery: {
    /** Shows a crew's rookery: its campus planet staged under the passage if it is not already (resolves once it is
     *  drawn), its view drawn in place of the game's from then on. */
    open(r: Rookery): Promise<void>;
    /** The rookery changed (levels, what is under way, the days left, colours): drawn as it now is. */
    show(r: Rookery): void;
    /** Selects a building, the view easing to it; null, back out over the whole campus. */
    select(b: Building | null): void;
    readonly selected: Building | null;
    /** Each building standing or under way, where it is on the screen now (CSS px). */
    anchors(): { building: Building; x: number; y: number }[];
    /** The building a tap at (x, y) picks: the nearest anchor within 60 px, or null. */
    pick(x: number, y: number): Building | null;
    /** The view no longer shown (the campus kept staged, for opening again at once). */
    close(): void;
    readonly shown: boolean;
  };
  /** A race planet staged again in the campus's place, if the campus is staged (a race needs one: before PLAY). */
  racing(): Promise<void>;
}

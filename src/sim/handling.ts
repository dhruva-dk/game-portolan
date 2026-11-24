import type { GunKind } from './kinds.ts';

export const SHIP = {
  drag: 0.5,
  answer: 4.5,
  bite: 0.55,
  fullBite: 0.32,
  steer: 1.2,
  draft: 2.2,
  length: 26,
  beam: 6.5,
  rig: 21.5,
} as const;

export const RAM = {
  least: 7.72,
  damage: 1.994,
  past: 5.517,
  most: 45,
  bear: 0.3,
  bow: 0.5,
  side: 1,
  stern: 0.75,
  stem: 0.87,
  bounce: 0.2,
  grip: 0.2,
  sway: 2,
  gyration: 0.3 * SHIP.length,
  ease: 1.5,
  still: 0.01,
  skin: 0.01,
  rearm: 3,
} as const;

export const GUST = {
  speed: 12.1,
  accel: 26,
  shed: 4.2,
  turn: 1.35,
  spread: 1.6,
  hop: 6.3,
  gravity: 9.8,
} as const;

interface Bore {
  damage: number;
  pellets: number;
  interval: number;
  mag: number;
  reload: number;
  windup: number;
  speed: number;
  carry: number;
  range: number;
  lob: number;
  least: number;
  spread: number;
  splash: number;
  falls: boolean;
  cuts: number;
}

export const RIGGING = 0.5;

export const GUNS: Readonly<Record<GunKind, Bore>> = {
  cannon: {
    damage: 20,
    pellets: 1,
    interval: 0.42,
    mag: 8,
    reload: 1.9,
    windup: 0,
    speed: 154,
    carry: 200,
    range: 200,
    lob: 0,
    least: 0,
    spread: 0.03,
    splash: 0,
    falls: true,
    cuts: 0,
  },
  scatter: {
    damage: 8,
    pellets: 8,
    interval: 1,
    mag: 4,
    reload: 2.3,
    windup: 0,
    speed: 126,
    carry: 110,
    range: 70,
    lob: 0,
    least: 0,
    spread: 0.09,
    splash: 0,
    falls: true,
    cuts: 4,
  },
  repeater: {
    damage: 7,
    pellets: 1,
    interval: 0.1,
    mag: 30,
    reload: 2,
    windup: 0,
    speed: 172,
    carry: 360,
    range: 150,
    lob: 0,
    least: 0,
    spread: 0.05,
    splash: 0,
    falls: true,
    cuts: 0,
  },
  harpoon: {
    damage: 80,
    pellets: 1,
    interval: 1.4,
    mag: 1,
    reload: 2.1,
    windup: 0.75,
    speed: 279,
    carry: 900,
    range: 240,
    lob: 0,
    least: 0,
    spread: 0,
    splash: 0,
    falls: false,
    cuts: 0,
  },
  mortar: {
    damage: 75,
    pellets: 1,
    interval: 1.3,
    mag: 2,
    reload: 2.8,
    windup: 0.6,
    speed: 157,
    carry: 254,
    range: 220,
    lob: Math.PI / 3,
    least: 30,
    spread: 0.02,
    splash: 11,
    falls: false,
    cuts: 0,
  },
};

export const FALLOFF = { hold: 0.6, floor: 0.5, edge: 0.6 } as const;

export const GUN = {
  nearer: 0.5,
  ahead: -1.44,
  up: 2.63,
  freeboard: 4,
  probe: 0.25,
  life: 8,
} as const;

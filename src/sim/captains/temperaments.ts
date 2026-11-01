import { hash32 } from '../math.ts';
import { KNOW, type Ship } from '../state.ts';
import { FITTING, HOME } from '../tables.ts';

type Captain = Ship['captain'];

export interface Style {
  loop: number;
  stretch: number;
  wheel: number;
  fight: number;
  raid: number;
  run: number;
  mend: number;
  margin: number;
  loot: number;
  bold: number;
  standoff: number;
  stalk: number;
  edge: number;
  guard: number;
  commit: number;
  bolt: boolean;
  gold: number;
}

const BASE = { wheel: 2.4, stalk: 0, edge: 0, guard: 0, commit: 0, bolt: false, gold: 1 };

export const GENTLE: Style = { ...BASE, loop: 15, stretch: 0.2, fight: 0.15, raid: 0, run: 0.6, mend: 0.6, margin: 18, loot: 0.7, bold: 0, standoff: 1 };

export const STYLES: readonly Style[] = [
  { ...BASE, loop: 11, stretch: 0.75, fight: 0.6, raid: 0.65, run: 0.5, mend: 0.7, margin: 18, loot: 0.2, bold: 0.5, standoff: 0.6, stalk: 1 },
  { ...BASE, loop: 36, stretch: 0.1, wheel: 1.0, fight: 0.05, raid: 0, run: 0.7, mend: 0.65, margin: 16, loot: 0, bold: 0.15, standoff: 0.85 },
  { ...BASE, loop: 16, stretch: 0.45, fight: 0.25, raid: 2, run: 0.6, mend: 0.5, margin: 14, loot: 0.55, bold: 0.8, standoff: 0.95, bolt: true },
  { ...BASE, loop: 7, stretch: 0.1, wheel: 0.6, fight: 0.2, raid: 0.1, run: 0.45, mend: 0.6, margin: 18, loot: 0.45, bold: 0.05, standoff: 0.75, guard: 0.5 },
  { ...BASE, loop: 12, stretch: 0.35, fight: 0.1, raid: 0.25, run: 0.45, mend: 0.55, margin: 14, loot: 1, bold: 0.3, standoff: 1, stalk: 0.35, edge: 1.6 },
  { ...BASE, loop: 56, stretch: 0.6, wheel: 2.9, fight: 0.35, raid: 0.15, run: 0.2, mend: 0.2, margin: 8, loot: 0.45, bold: 0.9, standoff: 0.6, commit: 1.4, gold: 6 },
];

const IDS = 64;
const unit = (x: number): number => Math.max(0, Math.min(1, x));

function signature(t: Style, id: number): Style {
  const u = (k: number): number => (hash32(0x51a7e, id * 16 + k) & 0xffff) / 0xffff;
  return {
    ...t,
    loop: t.loop * (0.8 + 0.4 * u(0)),
    stretch: Math.min(0.9, unit(t.stretch + 0.24 * (u(1) - 0.5))),
    standoff: t.standoff * (0.85 + 0.3 * u(2)),
    edge: t.edge * (0.85 + 0.3 * u(2)),
    run: unit(t.run + 0.14 * (u(3) - 0.5)),
    wheel: t.wheel * (0.8 + 0.4 * u(4)) * (u(5) < 0.5 ? -1 : 1),
    margin: t.margin * (0.8 + 0.4 * u(6)),
    bold: unit(t.bold + 0.2 * (u(7) - 0.5)),
  };
}

const OVER: Partial<Style>[] = [];
const signAll = (): Style[] => STYLES.flatMap((t, k) => Array.from({ length: IDS }, (_, id) => signature({ ...t, ...OVER[k] }, id)));
let SIGNED: readonly Style[] = signAll();
export function restyle(t: number, o: Partial<Style>): void {
  OVER[t] = o;
  SIGNED = signAll();
}

export const styleOf = (ship: Ship): Style => (ship.captain.gentle ? GENTLE : SIGNED[ship.captain.temperament * IDS + (ship.pigment % IDS)]);

export const wary = (c: Captain): number => ((c.knows & KNOW.raids) !== 0 ? unit(c.raids / 20) : 0);

export const reachOf = (c: Captain, style: Style): number => style.loop * (1 - 0.3 * wary(c));

export const PATROL = { wide: 20, beyond: 1.5, step: 0.6 } as const;

export const patrolOf = (c: Captain, style: Style): number =>
  style.stalk >= 0.8 && (c.knows & KNOW.loop) !== 0 && c.loop >= PATROL.wide ? HOME.radius + PATROL.beyond * c.loop : 0;

const WARY: Readonly<Record<number, number>> = {
  [FITTING.stemPost]: 0.15, [FITTING.ironRam]: 0.2, [FITTING.cutwater]: 0.1, [FITTING.swivelGuns]: 0.2, [FITTING.longGuns]: -0.2, [FITTING.mortar]: -0.15,
};

export function standoff(c: Captain, style: Style, j: number): number {
  let s = style.standoff;
  if (j === 0) for (let k = 0; k < Math.min(2, c.fittings.length); k++) s += WARY[c.fittings[k]] ?? 0;
  return Math.max(0.35, Math.min(1.2, s));
}

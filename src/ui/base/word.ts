import { FIGURES, INK } from './ink.ts';

export const WORDS = [
  'Ship',
  'Team',
  'Sponsors',
  'Opponents',
  'SAIL',
  'Sails',
  'Rigging',
  'Rudder',
  'Hull',
  'Keel',
  'Mounts',
  'Gun',
  'Owner',
  'Driver',
  'Designer',
  'Mechanic',
  'Gunnery',
  'Helm',
  'Nerve',
  'Territory',
  'Stormcraft',
  'Lookout',
  'Shield',
  'Heal speed',
  'Heal amount',
  'Thrift',
  'Upkeep',
  'Build',
  'Focus',
  'Paint',
  'Report',
  'Approach',
  'Negotiate',
  'Offer',
  'Renew',
  'Release',
  'Wage',
  'Seasons',
  'Fee',
  'Clause',
  'Storm',
  'Heals',
  'Watch',
  'Result',
  'Resume',
  'Forfeit',
  'Settings',
  'Sound',
  'Music',
  'Left-handed',
  'Sensitivity',
  'Seed',
  'New Career',
  'Name',
  'Start',
  'Age',
  'Continue',
] as const;

export type Word = (typeof WORDS)[number];

export const FACE = FIGURES;

interface TextStyle {
  anchor?: 'start' | 'middle' | 'end';
  fill?: string;
  opacity?: number;
  weight?: number;
  spacing?: number;
  italic?: boolean;
  halo?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r2 = (n: number) => Math.round(n * 100) / 100;

function text(x: number, y: number, s: string, size: number, o: TextStyle) {
  const op =
    o.opacity != null && o.opacity < 1 ? ` opacity="${o.opacity}"` : '';
  const halo = o.halo
    ? ` stroke="${o.halo}" stroke-width="${r2(size * 0.28)}" paint-order="stroke" stroke-linejoin="round"`
    : '';
  return (
    `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" font-family='${FACE}'` +
    ` font-style="${o.italic ? 'italic' : 'normal'}" font-weight="${o.weight ?? 500}"` +
    ` letter-spacing="${r2((o.spacing ?? 0.02) * size)}" fill="${o.fill ?? INK.iron}"` +
    ` text-anchor="${o.anchor ?? 'middle'}" dominant-baseline="central"${op}${halo}>${esc(s)}</text>`
  );
}

export const word = (
  x: number,
  y: number,
  w: Word,
  size: number,
  o: TextStyle = {}
) => text(x, y, w, size, o);

export const label = (
  x: number,
  y: number,
  name: string,
  size: number,
  o: TextStyle = {}
) => text(x, y, name, size, { weight: 600, spacing: 0, ...o });

export const spoken = (
  x: number,
  y: number,
  line: string,
  size: number,
  o: TextStyle = {}
) => text(x, y, line, size, { italic: true, weight: 400, spacing: 0, ...o });

let ruler: CanvasRenderingContext2D | null = null;

export function measured(
  s: string,
  size: number,
  o: { weight?: number; italic?: boolean; spacing?: number } = {}
): number {
  ruler ??= document.createElement('canvas').getContext('2d');
  const spacing = (o.spacing ?? 0) * size * s.length;
  if (!ruler) return s.length * size * 0.52 + spacing;
  ruler.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 500} ${size}px ${FACE}`;
  return ruler.measureText(s).width + spacing;
}

export function fitted(name: string, size: number, room: number): number {
  const w = measured(name, size, { weight: 600 });
  return w <= room ? size : Math.max(size * 0.72, (size * room) / w);
}

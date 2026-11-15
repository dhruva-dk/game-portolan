// What a gull wears in their headshot (ui/gull.ts): the dress of their role in their crew's two colours with its
// emblem on the chest, and one accessory of twelve. Drawn in the headshot's 240 box.

import type { Role } from '../office.ts';
import { emblem } from './emblem.ts';
import { INK, PAPER, PLUMAGE } from './ink.ts';

/** Where the head lies, and what the garb is coloured with. */
export interface Garb {
  hx: number; hy: number; rx: number; ry: number;
  ear: [number, number]; beak: [number, number];
  first: string; second: string; line: number; emblem: number | null;
}

const BODY = 'M22 240C24 206 52 186 88 180L152 180C188 186 216 206 218 240Z';

/** The dress of `role`. */
export function dress(role: Role, g: Garb): string {
  const s = `stroke="${INK.iron}" stroke-width="${g.line}" stroke-linejoin="round"`;
  const fill = (c: string, d: string) => `<path d="${d}" fill="${c}" ${s}/>`;
  const buttons = (xs: readonly number[], ys: readonly number[], c: string = PLUMAGE.brass) => xs.flatMap((x) => ys.map((y) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${c}" stroke="${INK.iron}" stroke-width="${g.line * 0.6}"/>`)).join('');
  /** The crew's emblem on the left of the chest, on a ground of `on` in `ink`. */
  const badge = (on: string, ink: string, x = 92, y = 214) => (g.emblem === null ? '' : emblem(g.emblem, x, y, 22, { ink, ground: on }));
  switch (role) {
    case 'captain':
      return fill(g.first, BODY) + fill(g.second, 'M96 180L120 226L102 236L84 186Z') + fill(g.second, 'M144 180L120 226L138 236L156 186Z')
        + fill(PLUMAGE.brass, 'M40 200Q58 186 82 184L84 194Q60 196 46 208Z') + fill(PLUMAGE.brass, 'M200 200Q182 186 158 184L156 194Q180 196 194 208Z')
        + buttons([110, 130], [222, 234]) + badge(g.first, g.second, 70, 216);
    case 'bosun':
      return fill(g.second, BODY) + fill(g.first, 'M86 198H154V240H86Z') + `<path d="M90 198L76 184M150 198L164 184" fill="none" ${s} stroke="${g.first}" stroke-width="7"/>`
        + buttons([92, 148], [204]) + badge(g.first, g.second, 120, 220);
    case 'shipwright':
      return fill(g.first, BODY) + fill(g.second, 'M82 190Q120 200 158 190L166 240H74Z') + fill(g.second, 'M104 214H136V232H104Z')
        + `<path d="M126 210L130 238M122 208h10" fill="none" stroke="${INK.sepia}" stroke-width="4" stroke-linecap="round"/>` + badge(g.second, g.first, 100, 202);
    case 'scout':
      return fill(g.first, BODY) + fill(g.second, 'M78 182Q120 168 162 182L158 200Q120 188 82 200Z') + `<path d="M120 196V240" fill="none" ${s}/>`
        + [206, 222].map((y) => `<rect x="114" y="${y}" width="12" height="5" fill="${PLUMAGE.brass}" ${s}/>`).join('') + badge(g.first, g.second);
    case 'flight':
      return fill(g.first, BODY) + fill(g.second, 'M92 180L120 196L148 180L152 190L120 206L88 190Z') + `<path d="M120 206V240" fill="none" stroke="${g.second}" stroke-width="4"/>`
        + `<path d="M150 214l10 -5l10 5l-10 3Z" fill="${PLUMAGE.brass}" ${s}/>` + badge(g.first, g.second);
    case 'manager':
      return fill(g.first, BODY) + fill(PAPER, 'M98 180L120 230L142 180Z') + fill(g.second, 'M115 186H125L128 228L120 236L112 228Z')
        + fill(g.first, 'M98 180L120 230L104 236L86 188Z') + fill(g.first, 'M142 180L120 230L136 236L154 188Z') + fill(g.second, 'M150 206L166 204L166 212L150 213Z')
        + badge(g.first, g.second, 70, 218);
    case 'elder':
      return fill(g.first, BODY) + fill(g.second, 'M88 180Q96 210 92 240H110Q112 206 104 182Z') + fill(g.second, 'M152 180Q144 210 148 240H130Q128 206 136 182Z')
        + `<path d="M98 186Q120 222 142 186" fill="none" stroke="${PLUMAGE.brass}" stroke-width="3" stroke-dasharray="4 2"/><circle cx="120" cy="208" r="7" fill="${PLUMAGE.brass}" ${s}/>`
        + badge(g.first, g.second, 70, 218);
  }
}

/** How many accessories there are. */
export const ACCESSORIES = 12;
/** Their names, by index. */
export const ACCESSORY_NAMES = ['tricorn', 'bandana', 'earring', 'pipe', 'scarf', 'headset', 'goggles', 'feather', 'monocle chain', 'medal', 'flat cap', 'pencil'] as const;

/** Accessory `k`: what is drawn behind the head, and what over it. */
export function accessory(k: number, g: Garb): { behind: string; over: string } {
  const { hx, hy, rx, ry, line } = g, crown = hy - ry, s = `stroke="${INK.iron}" stroke-width="${line}" stroke-linejoin="round"`;
  const [ex, ey] = g.ear, [bx, by] = g.beak;
  const over = (o: string) => ({ behind: '', over: o });
  switch (k) {
    case 0: return over(`<path d="M${hx - rx - 10} ${crown + 18}Q${hx} ${crown - 6} ${hx + rx + 10} ${crown + 16}Q${hx + 20} ${crown - 38} ${hx - 6} ${crown - 34}Q${hx - 36} ${crown - 36} ${hx - rx - 10} ${crown + 18}Z" fill="${INK.iron}" ${s}/>`
      + `<path d="M${hx - rx - 6} ${crown + 14}Q${hx} ${crown - 8} ${hx + rx + 6} ${crown + 12}" fill="none" stroke="${PLUMAGE.brass}" stroke-width="3"/>`);
    case 1: return { behind: `<path d="M${hx - rx + 4} ${crown + 22}l-26 10l6 -14l-12 -8Z" fill="${g.second}" ${s}/>`, over: `<path d="M${hx - rx + 2} ${crown + 26}Q${hx - rx} ${crown - 6} ${hx + 8} ${crown - 4}Q${hx + rx - 10} ${crown + 2} ${hx + rx - 4} ${crown + 22}Q${hx} ${crown + 12} ${hx - rx + 2} ${crown + 26}Z" fill="${g.second}" ${s}/>`
      + [[-20, 8], [0, 4], [18, 10], [-34, 16]].map(([dx, dy]) => `<circle cx="${hx + dx}" cy="${crown + dy}" r="2.6" fill="${PAPER}"/>`).join('') };
    case 2: return over(`<circle cx="${ex - 2}" cy="${ey + 22}" r="7" fill="none" stroke="${PLUMAGE.brass}" stroke-width="3.5"/>`);
    case 3: return over(`<path d="M${bx + 6} ${by + 8}L${bx + 18} ${by + 24}" fill="none" stroke="${INK.sepia}" stroke-width="4.5" stroke-linecap="round"/><path d="M${bx + 12} ${by + 22}h16v14q-8 6 -16 0Z" fill="${INK.sepia}" ${s}/><path d="M${bx + 16} ${by + 16}q4 -10 0 -18q-4 -8 2 -14" fill="none" stroke="${PLUMAGE.shade}" stroke-width="2" opacity=".7"/>`);
    case 4: return over(`<path d="M${hx - 40} ${hy + 50}Q${hx} ${hy + 64} ${hx + 34} ${hy + 48}L${hx + 36} ${hy + 64}Q${hx} ${hy + 80} ${hx - 42} ${hy + 66}Z" fill="${g.second}" ${s}/><path d="M${hx + 18} ${hy + 64}L${hx + 26} ${hy + 104}L${hx + 40} ${hy + 100}L${hx + 32} ${hy + 60}Z" fill="${g.second}" ${s}/>`);
    case 5: return over(`<path d="M${ex - 4} ${ey + 2}Q${hx - 10} ${crown - 14} ${hx + 26} ${crown + 4}" fill="none" stroke="${INK.iron}" stroke-width="5"/><rect x="${ex - 14}" y="${ey - 10}" width="20" height="26" fill="${g.first}" ${s}/><path d="M${ex} ${ey + 14}Q${hx + 20} ${hy + 44} ${bx - 2} ${by + 18}" fill="none" stroke="${INK.iron}" stroke-width="2.5"/><circle cx="${bx - 2}" cy="${by + 18}" r="4" fill="${INK.iron}"/>`);
    case 6: return over(`<path d="M${hx - rx + 2} ${hy - 30}Q${hx} ${hy - 44} ${hx + rx - 4} ${hy - 36}" fill="none" stroke="${INK.sepia}" stroke-width="6"/>`
      + [[hx + 16, hy - 40], [hx + 40, hy - 40]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${INK.blue}" fill-opacity=".6" stroke="${PLUMAGE.brass}" stroke-width="4"/>`).join(''));
    case 7: return { behind: `<path d="M${hx - 24} ${crown + 10}Q${hx - 60} ${crown - 40} ${hx - 44} ${crown - 70}Q${hx - 36} ${crown - 30} ${hx - 14} ${crown + 6}Z" fill="${g.first}" ${s}/><path d="M${hx - 20} ${crown + 8}Q${hx - 44} ${crown - 30} ${hx - 44} ${crown - 68}" fill="none" stroke="${INK.iron}" stroke-width="${line}"/>`, over: '' };
    case 8: return over(`<path d="M${ex + 4} ${ey + 4}Q${hx - 30} ${hy + 70} ${hx + 30} ${hy + 104}" fill="none" stroke="${PLUMAGE.brass}" stroke-width="2.5" stroke-dasharray="3 2"/><circle cx="${hx + 30}" cy="${hy + 104}" r="4" fill="${PLUMAGE.brass}"/>`);
    case 9: return over(`<path d="M${hx + 36} ${hy + 92}h14l-3 16h-8Z" fill="${g.second}" ${s}/><circle cx="${hx + 43}" cy="${hy + 116}" r="9" fill="${PLUMAGE.brass}" ${s}/><path d="M${hx + 43} ${hy + 110}l2 5h5l-4 3l2 5l-5 -3l-5 3l2 -5l-4 -3h5Z" fill="${INK.iron}" opacity=".6"/>`);
    case 10: return over(`<path d="M${hx - rx} ${crown + 22}Q${hx - rx + 4} ${crown - 10} ${hx + 6} ${crown - 8}Q${hx + rx} ${crown - 4} ${hx + rx + 18} ${crown + 18}L${hx + rx - 6} ${crown + 22}Q${hx} ${crown + 10} ${hx - rx} ${crown + 22}Z" fill="${g.second}" ${s}/><path d="M${hx - 30} ${crown}Q${hx} ${crown - 10} ${hx + 30} ${crown + 4}" fill="none" stroke="${INK.iron}" stroke-width="${line * 0.7}"/>`);
    default: return over(`<g transform="rotate(-38 ${ex} ${ey})"><rect x="${ex - 34}" y="${ey - 4}" width="56" height="8" fill="${PLUMAGE.beak}" ${s}/><path d="M${ex + 22} ${ey - 4}l12 4l-12 4Z" fill="${PAPER}" ${s}/><rect x="${ex - 40}" y="${ey - 4}" width="7" height="8" fill="${INK.rubric}" ${s}/></g>`);
  }
}

// A gull's headshot (Phase C section 4): SVG, drawn from the gull's seed alone with their role, age and crew. The
// seed picks their head (three shapes), beak (four, yellow with the red spot), brow tufts (four), crest (three), a
// mark (none, a scar, freckles, a plaster), the tilt of the head (five), their sunglasses (six shapes, seven tints of
// the inks) and one accessory of twelve (garb.ts); 1,451,520 drawings in all. Their age sets the plumage: mottled
// brown under 20, white grown, grey and thinner past 45; the folded wings' black tips show at the shoulders. Their
// role sets the dress (garb.ts), in their crew's two colours with its emblem on the chest; the whole on a cartouche
// washed in the crew's first colour (paper, for a free agent).
//
// Drawn in a 240 box and scaled: 40 for a line, 96 for a card, 240 for a profile.

import type { Face } from '../office.ts';
import { random } from '../world/random.ts';
import { accessory, dress, ACCESSORIES, type Garb } from './garb.ts';
import { INK, PAPER, PLUMAGE, crewInk, crewWash } from './ink.ts';

/** The sizes a headshot is drawn at. */
export type FaceSize = 40 | 96 | 240;

/** What the seed picks. */
export interface Traits { head: number; beak: number; brow: number; crest: number; mark: number; tilt: number; glasses: number; tint: number; accessory: number }
const COUNTS: Readonly<Record<keyof Traits, number>> = { head: 3, beak: 4, brow: 4, crest: 3, mark: 4, tilt: 5, glasses: 6, tint: 7, accessory: ACCESSORIES };

/** The sunglasses' shapes, and their lenses' tints (the inks). */
export const GLASSES = ['aviator', 'wayfarer', 'round', 'shield', 'cat-eye', 'visor'] as const;
const TINTS = [INK.iron, INK.blue, INK.green, INK.storm, INK.rubric, INK.gold, INK.sepia];

/** The traits a seed picks, each in its range. */
export function traits(seed: number): Traits {
  const r = random((seed >>> 0) * 2654435761 + 97);
  // (a few draws first, to part neighbouring seeds)
  r(); r();
  const t = {} as Record<keyof Traits, number>;
  for (const k of Object.keys(COUNTS) as (keyof Traits)[]) t[k] = Math.floor(r() * COUNTS[k]);
  return t;
}

const r2 = (n: number) => Math.round(n * 10) / 10;

/** The head's outline: a superellipse about (cx, cy), flatter on top by `top` (2 is round). */
function headPath(cx: number, cy: number, rx: number, ry: number, top: number) {
  let d = '';
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), n = s < 0 ? top : 2;
    const x = cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n), y = cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n);
    d += `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`;
  }
  return `${d}Z`;
}

/** The plumage by age: its feathers, the tufts' colour, and whether it is mottled (young) or thinning (old). */
function plumage(age: number) {
  if (age < 20) return { feather: PLUMAGE.young, tuft: PLUMAGE.fleck, young: true, old: false };
  if (age > 45) return { feather: PLUMAGE.grey, tuft: PLUMAGE.shade, young: false, old: true };
  return { feather: PLUMAGE.white, tuft: PLUMAGE.shade, young: false, old: false };
}

/** The beaks: length, depth, hook. */
const BEAKS = [[40, 18, 4], [62, 15, 12], [52, 22, 7], [62, 11, 3]] as const;

function beak(k: number, bx: number, by: number, line: number) {
  const [len, d, hook] = BEAKS[k];
  const upper = `M${bx} ${r2(by - d / 2)}Q${r2(bx + len * 0.6)} ${r2(by - d / 2 - 2)} ${bx + len} ${r2(by + hook * 0.2)}`
    + `Q${r2(bx + len + 1)} ${r2(by + hook)} ${r2(bx + len - 5)} ${r2(by + hook)}L${bx} ${by + 2}Z`;
  const lower = `M${bx} ${by + 2}L${bx + len - 8} ${by + 4}Q${r2(bx + len * 0.72)} ${r2(by + d * 0.8)} ${r2(bx + len * 0.55)} ${r2(by + d * 0.7)}L${bx} ${r2(by + d * 0.62)}Z`;
  return `<path d="${lower}" fill="${PLUMAGE.beak}" stroke="${INK.iron}" stroke-width="${line}" stroke-linejoin="round"/>`
    + `<circle cx="${r2(bx + len * 0.68)}" cy="${r2(by + d * 0.5)}" r="${r2(d * 0.17 + 1)}" fill="${PLUMAGE.spot}"/>`
    + `<path d="${upper}" fill="${PLUMAGE.beak}" stroke="${INK.iron}" stroke-width="${line}" stroke-linejoin="round"/>`
    + `<path d="M${bx - 4} ${by + 1}q4 4 9 1" fill="none" stroke="${INK.iron}" stroke-width="${line}" stroke-linecap="round"/>`;
}

/** The sunglasses, shape `k` tinted `tint`, their near lens about (nx, ny) and far lens about (fx, fy). */
function glasses(k: number, tint: string, n: [number, number], f: [number, number], ear: [number, number], line: number) {
  const [nx, ny] = n, [fx, fy] = f, frame = `stroke="${INK.iron}" stroke-width="${r2(line * 1.4)}" stroke-linejoin="round"`;
  const lens = `fill="${tint}" fill-opacity=".9"`;
  const glint = (x: number, y: number, s: number) => `<path d="M${r2(x - s * 0.5)} ${r2(y - s * 0.2)}q${r2(s * 0.3)} ${r2(-s * 0.35)} ${r2(s * 0.7)} ${r2(-s * 0.3)}" fill="none" stroke="${PLUMAGE.glint}" stroke-width="${r2(line * 1.2)}" stroke-linecap="round"/>`;
  const arm = `<path d="M${nx - 14} ${ny - 4}L${ear[0]} ${ear[1]}" fill="none" ${frame}/>`;
  /** One lens of shape k, w across, centred on (x, y). */
  const one = (x: number, y: number, w: number) => {
    const h = w * 0.72;
    switch (k) {
      case 0: return `M${r2(x - w / 2)} ${r2(y - h / 2)}H${r2(x + w / 2)}Q${r2(x + w / 2 + 2)} ${r2(y + h * 0.7)} ${r2(x)} ${r2(y + h * 0.6)}Q${r2(x - w / 2 - 1)} ${r2(y + h / 2)} ${r2(x - w / 2)} ${r2(y - h / 2)}Z`;
      case 1: return `M${r2(x - w / 2 - 2)} ${r2(y - h / 2)}H${r2(x + w / 2 + 2)}L${r2(x + w / 2 - 2)} ${r2(y + h / 2)}H${r2(x - w / 2 + 2)}Z`;
      case 2: return `M${r2(x - w / 2.2)} ${r2(y)}a${r2(w / 2.2)} ${r2(w / 2.2)} 0 1 0 ${r2(w / 1.1)} 0a${r2(w / 2.2)} ${r2(w / 2.2)} 0 1 0 ${r2(-w / 1.1)} 0Z`;
      case 4: return `M${r2(x - w / 2)} ${r2(y - h * 0.2)}Q${r2(x)} ${r2(y - h * 0.65)} ${r2(x + w / 2 + 5)} ${r2(y - h * 0.75)}Q${r2(x + w / 2)} ${r2(y + h * 0.6)} ${r2(x - w * 0.1)} ${r2(y + h * 0.45)}Q${r2(x - w / 2)} ${r2(y + h * 0.3)} ${r2(x - w / 2)} ${r2(y - h * 0.2)}Z`;
      default: return '';
    }
  };
  let body: string;
  if (k === 3) {
    // shield: one wrapped lens across both eyes
    body = `<path d="M${nx - 20} ${ny - 12}Q${r2((nx + fx) / 2)} ${ny - 18} ${fx + 14} ${fy - 12}L${fx + 12} ${fy + 6}Q${r2((nx + fx) / 2)} ${ny + 18} ${nx - 18} ${ny + 8}Z" ${lens} ${frame}/>`;
  } else if (k === 5) {
    // visor: a slim band
    body = `<path d="M${nx - 20} ${ny - 7}L${fx + 14} ${fy - 9}L${fx + 13} ${fy + 3}L${nx - 19} ${ny + 6}Z" ${lens} ${frame}/>`;
  } else {
    const bridge = `<path d="M${nx + 13} ${ny - 4}Q${r2((nx + fx) / 2)} ${ny - 9} ${fx - 9} ${fy - 4}" fill="none" ${frame}/>`;
    body = `<path d="${one(fx, fy, 20)}" ${lens} ${frame}/>${bridge}<path d="${one(nx, ny, 28)}" ${lens} ${frame}/>`
      + (k === 1 ? `<path d="M${nx - 16} ${ny - 10}H${nx + 16}M${fx - 12} ${fy - 8}H${fx + 12}" ${frame} stroke-width="${r2(line * 3)}"/>` : '');
  }
  return arm + body + glint(nx - 2, ny - 2, 12) + glint(fx, fy - 2, 8);
}

/** The brow tufts, kind `k`, over the lenses. */
function brows(k: number, n: [number, number], f: [number, number], ink: string, line: number) {
  const s = `fill="none" stroke="${ink}" stroke-width="${r2(line * 2.2)}" stroke-linecap="round"`;
  const [nx, ny] = n, [fx, fy] = f;
  const at = (x: number, y: number, w: number) => {
    switch (k) {
      case 0: return `M${x - w / 2} ${y}Q${x} ${y - 6} ${x + w / 2} ${y - 4}M${x + w / 2 - 4} ${y - 5}l6 -7`;
      case 1: return `M${x - w / 2} ${y - 2}L${x + w / 2} ${y - 4}M${x - w / 2} ${y + 1}L${x + w / 2} ${y - 1}`;
      case 2: return `M${x + w / 2} ${y - 2}Q${x} ${y - 4} ${x - w / 2 - 10} ${y - 12}M${x + w / 4} ${y - 4}Q${x - w / 4} ${y - 8} ${x - w / 2 - 6} ${y - 18}`;
      default: return `M${x - w / 2} ${y}l4 -7l4 6l4 -8l4 7l4 -7l3 6`;
    }
  };
  return `<path d="${at(nx, ny - 17, 26)}${at(fx, fy - 15, 18)}" ${s}/>`;
}

/** The head's mark, kind `k`, on the cheek under the near lens. */
function mark(k: number, x: number, y: number, line: number) {
  if (k === 1) return `<path d="M${x - 14} ${y + 22}L${x + 4} ${y + 6}M${x - 11} ${y + 14}l5 4M${x - 5} ${y + 9}l5 4" fill="none" stroke="${INK.sepia}" stroke-width="${r2(line * 1.4)}" stroke-linecap="round"/>`;
  if (k === 2) return [[-6, 18], [2, 22], [-14, 24], [8, 16], [-2, 28]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="2" fill="${PLUMAGE.fleck}"/>`).join('');
  if (k === 3) return `<g transform="translate(${x - 34} ${y - 44}) rotate(-24)"><rect x="-12" y="-5" width="24" height="10" fill="${PAPER}" stroke="${INK.iron}" stroke-width="${line}"/><path d="M-3 -2l6 4M3 -2l-6 4" stroke="${INK.sepia}" stroke-width="${line}"/></g>`;
  return '';
}

/** The headshot of `face`, `size` across, as SVG markup. */
export function headshot(face: Face, size: FaceSize): string {
  const t = traits(face.seed), p = plumage(face.age);
  const line = size <= 40 ? 3.2 : size <= 96 ? 2 : 1.4;
  const first = face.colours ? crewInk(face.colours.first) : INK.sepia, second = face.colours ? crewInk(face.colours.second) : PAPER;
  const ground = face.colours ? crewWash(face.colours.first) : PAPER;
  // the head
  const thin = p.old ? 0.9 : 1, rx = [54, 58, 55][t.head] * thin, ry = [48, 42, 47][t.head], top = [2, 2.2, 3.4][t.head];
  const hx = 108, hy = 100, tilt = (t.tilt - 2) * 3;
  const near: [number, number] = [hx + 22, hy - 8], far: [number, number] = [hx + 50, hy - 11], ear: [number, number] = [hx - 30, hy - 2];
  const g: Garb = { hx, hy, rx, ry, ear, beak: [hx + rx * 0.84, hy + 10], first, second, line, emblem: face.emblem };
  const stroke = `stroke="${INK.iron}" stroke-width="${line}" stroke-linejoin="round"`;
  const acc = accessory(t.accessory, g);
  let head = acc.behind;
  head += `<path d="M${hx - 38} ${hy + 22}Q${hx - 44} ${hy + 56} ${hx - 50} ${hy + 76}L${hx + 38} ${hy + 76}Q${hx + 32} ${hy + 52} ${hx + 30} ${hy + 30}Z" fill="${p.feather}" ${stroke}/>`;
  head += `<path d="${headPath(hx, hy, rx, ry, top)}" fill="${p.feather}" ${stroke}/>`;
  head += `<ellipse cx="${hx - 8}" cy="${hy + 30}" rx="${r2(rx * 0.7)}" ry="12" fill="${PLUMAGE.shade}" opacity=".25"/>`;
  if (p.young) {
    const r = random(face.seed + 7);
    for (let i = 0; i < 16; i++) head += `<ellipse cx="${r2(hx - rx * 0.8 + r() * rx * 1.5)}" cy="${r2(hy - ry * 0.7 + r() * ry * 1.4)}" rx="3" ry="2" fill="${PLUMAGE.fleck}" opacity=".7"/>`;
  }
  if (p.old) head += `<path d="M${hx - 20} ${hy - ry + 2}q-4 -14 -14 -16M${hx - 6} ${hy - ry}q0 -14 -8 -20M${hx + 8} ${hy - ry + 1}q4 -12 0 -18" fill="none" stroke="${p.tuft}" stroke-width="${r2(line * 1.2)}" stroke-linecap="round"/>`;
  // the crest: smooth, ruffled at the back, a cowlick at the front
  if (t.crest === 1) head += `<path d="M${hx - rx + 6} ${hy - 22}l-10 -8l12 2l-4 -12l12 10" fill="${p.feather}" ${stroke}/>`;
  if (t.crest === 2) head += `<path d="M${hx + 6} ${hy - ry + 3}q10 -18 22 -10q-8 0 -10 8" fill="${p.feather}" ${stroke}/>`;
  head += mark(t.mark, near[0], near[1], line);
  head += beak(t.beak, g.beak[0], g.beak[1], line);
  head += brows(t.brow, near, far, p.tuft, line);
  head += glasses(t.glasses, TINTS[t.tint], near, far, ear, line);
  head += acc.over;
  // the folded wings behind the shoulders, their black tips
  const wing = (s: number) => {
    const x = (v: number) => r2(120 + s * v);
    return `<path d="M${x(-70)} 238L${x(-104)} 170L${x(-112)} 150L${x(-98)} 166L${x(-56)} 200Z" fill="${PLUMAGE.wing}" ${stroke}/>`
      + `<path d="M${x(-104)} 170L${x(-112)} 150L${x(-98)} 166L${x(-96)} 180Z" fill="${PLUMAGE.tip}"/>`
      + `<circle cx="${x(-105)} " cy="160" r="2.5" fill="${PLUMAGE.white}"/>`;
  };
  const body = wing(1) + wing(-1) + dress(face.role, g);
  const cartouche = `<path d="M10 2H230Q230 10 238 10V230Q230 230 230 238H10Q10 230 2 230V10Q10 10 10 2Z" fill="${ground}" stroke="${INK.iron}" stroke-width="${r2(line * 1.2)}"/>`
    + (size > 40 ? `<rect x="10" y="10" width="220" height="220" fill="none" stroke="${INK.iron}" stroke-width=".8" opacity=".5"/>` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="k-face" viewBox="0 0 240 240" width="${size}" height="${size}" role="img">`
    + `${cartouche}<clipPath id="gc"><rect x="4" y="4" width="232" height="232"/></clipPath><g clip-path="url(#gc)">${body}`
    + `<g transform="translate(${hx} ${hy + 62}) rotate(${tilt}) scale(1.14) translate(${-hx} ${-hy - 62})">${head}</g></g></svg>`;
}

/** The drawing's identity: what a seed's headshot is told apart by (the distinctness test reads it). */
export const traitKey = (seed: number) => Object.values(traits(seed)).join('.');

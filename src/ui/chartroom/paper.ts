// Paper, cut by hand: what the chartroom's sheets, buttons and slips are made
// of. A paper's cut edge is one drawn tile sliced nine ways and laid round the
// element as a border image, so it runs on unbroken at any size and nothing is
// measured: its silhouette masks the paper's fill, its ink is drawn over it,
// and its shadow lies on a layer of its own under it, so a pressed paper can
// lose its shadow and keep its edge (UI-TOKENS.md, States). Data is not paper:
// it is ruled (data.ts).

import { hash01 } from '../../world/random.ts';
import { el, type Kid } from '../kit/part.ts';
import { keep, onTap } from '../touch.ts';
import { TONE, u } from './tokens.ts';

/**
 * The edge's tile, in its own units: its side; how far in the cut runs (room
 * for its wander and its shadow); a plain paper's slices and a formal one's
 * (deep enough to hold its two rules). Two tile units are one drawn unit.
 */
export const TILE = { side: 64, in: 4, slice: 16, formal: 28 } as const;
/** Where the cut turns along each side; those at a slice's edge lie straight, so the slices meet unbroken. */
const AT = [4, 10, 16, 22, 28, 32, 36, 42, 48, 54] as const;
const STILL = new Set([16, 28, 36, 48]);

/**
 * The cut's outline round the tile, wandering by `wander` tile units at most
 * either way, straight where the tile is sliced (and at its corners).
 */
export function cutPath(seed: number, wander = 1.4) {
  const { side: s, in: c } = TILE,
    pts: string[] = [];
  const along = (edge: number, at: (a: number, off: number) => string) =>
    AT.forEach((a, i) =>
      pts.push(
        at(
          a,
          i === 0 || STILL.has(a)
            ? 0
            : (hash01(edge * 32 + i, seed) - 0.5) * wander
        )
      )
    );
  const p = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  along(0, (a, o) => p(a, c + o));
  along(1, (a, o) => p(s - c + o, a));
  along(2, (a, o) => p(s - a, s - c + o));
  along(3, (a, o) => p(c + o, s - a));
  return `M${pts.join('L')}Z`;
}

/** An SVG tile the side of TILE, as a CSS image. */
const image = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE.side}" height="${TILE.side}">${body}</svg>`
  )}")`;

/** A rule inside the cut, `by` tile units in from it. */
const ruled = (by: number, colour: string, width: number, opacity = 1) => {
  const at = TILE.in + by,
    w = TILE.side - 2 * at;
  return `<rect x="${at}" y="${at}" width="${w}" height="${w}" fill="none" stroke="${colour}" stroke-width="${width}" opacity="${opacity}"/>`;
};

/** The tiles of one cut: its silhouette (fine and bold), its inks, its shadow. */
export function tiles(seed: number) {
  const d = cutPath(seed);
  const outline = (width: number) =>
    `<path d="${d}" fill="none" stroke="${TONE.ink}" stroke-width="${width}" stroke-linejoin="round"/>`;
  const silhouette = (width: number) =>
    image(
      `<path d="${d}" fill="${TONE.ink}" stroke="${TONE.ink}" stroke-width="${width}" stroke-linejoin="round"/>`
    );
  return {
    mask: silhouette(1.8),
    maskBold: silhouette(3.2),
    ink: image(outline(1.8) + ruled(6, TONE.ink, 0.9, 0.55)),
    inkOn: image(outline(1.8) + ruled(6, TONE.onInk, 0.9, 0.55)),
    inkBold: image(outline(3.2) + ruled(6, TONE.ink, 0.9, 0.55)),
    formal: image(
      outline(3.2) + ruled(16, TONE.ink, 2.4) + ruled(22, TONE.ink, 1)
    ),
    shadow: image(
      `<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
        `<path d="${d}" transform="translate(0 3)" fill="${TONE.shadow}" opacity=".42" filter="url(#s)"/>`
    ),
  };
}

const CUT = tiles(7);
/** How a slice of the tile is laid: its slices, as deep as drawn (two tile units a drawn unit), repeated whole. */
const laid = (slice: number, filled = '') =>
  `${slice}${filled} / ${u(slice / 2)} round`;

export const PAPER_CSS = `
.cr { --cut-mask: ${CUT.mask}; --cut-mask-bold: ${CUT.maskBold}; --cut-ink: ${CUT.ink}; --cut-ink-on: ${CUT.inkOn};
  --cut-ink-bold: ${CUT.inkBold}; --cut-formal: ${CUT.formal}; --cut-shadow: ${CUT.shadow}; }
.cr-paper { position: relative; isolation: isolate; --edge: var(--cut-ink); --edge-mask: var(--cut-mask); }
/* a paper with a breakdown or a menu open over it lies over the papers round it */
.cr-paper:has(.cr-pop, .cr-menu) { z-index: 30; }
.cr-paper::before, .cr-paper::after { content: ''; position: absolute; inset: ${u(-TILE.in / 2)}; z-index: -1;
  pointer-events: none; }
.cr-paper::before { border-image: var(--cut-shadow) ${laid(TILE.slice, ' fill')}; transition: opacity var(--press); }
.cr-paper::after { background: var(--fill, var(--parchment)); border-image: var(--edge) ${laid(TILE.slice)};
  -webkit-mask-box-image: var(--edge-mask) ${laid(TILE.slice)}; mask-border: var(--edge-mask) ${laid(TILE.slice)}; }
.cr-paper.filled { --edge: var(--cut-ink-on); }
.cr-paper.bold { --edge: var(--cut-ink-bold); --edge-mask: var(--cut-mask-bold); }
.cr-paper.formal::after { border-image: var(--cut-formal) ${laid(TILE.formal)};
  -webkit-mask-box-image: var(--cut-mask-bold) ${laid(TILE.formal)}; mask-border: var(--cut-mask-bold) ${laid(TILE.formal)}; }
.cr-paper.formal::before { border-image: var(--cut-shadow) ${laid(TILE.formal, ' fill')}; }
.cr-paper.flat::before { opacity: 0; }
/* pressed: down a unit onto where its shadow lay, the shadow gone */
.cr-paper.press { transition: translate var(--press); }
.cr-paper.press:active { translate: 0 var(--u); }
.cr-paper.press:active::before { opacity: 0; }
.cr .off { opacity: .42; }

.cr-sheet { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: var(--s1) var(--s2) var(--s4); }
.cr-sheet.formal { padding: var(--s5) var(--s6) var(--s5); }
/* a sheet with no head: as much paper over its body as under it (a head brings its own) */
.cr-sheet.headless { padding-top: var(--s4); }
/* the title centred; an aside in the room at its right, never over it */
.cr-head { flex: none; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: baseline; column-gap: var(--s2);
  padding: var(--s3) var(--s4) var(--s2); font: 700 var(--t-head)/1.1 var(--face); letter-spacing: .12em;
  text-transform: uppercase; white-space: nowrap; }
.cr-head > :first-child { grid-column: 2; }
.cr-head > .cr-aside { grid-column: 3; justify-self: end; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  font: italic 500 var(--t-label) var(--face); letter-spacing: 0; text-transform: none; color: var(--ink-2); }
.cr-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--s3); padding: 0 var(--s4); }
.cr-plate { background: var(--plate); color: var(--plate-ink); padding: var(--s2) var(--s4);
  font: 700 var(--t-title)/1 var(--face); letter-spacing: .14em; text-transform: uppercase; }

.cr-dim { position: absolute; z-index: 40; inset: 0; display: grid; place-items: center; background: var(--dim);
  animation: cr-in var(--fade); }
.cr-folio { width: ${u(330)}; max-width: 90%; }
.cr-folio .cr-foot { display: flex; justify-content: flex-end; gap: var(--s4); padding: var(--s4) var(--s4) 0; }
@keyframes cr-in { from { opacity: 0; } }
`;

/** The fills dark enough that a paper of one is ruled inside in the light ink. */
const INKED = new Set(['act', 'harm', 'good', 'storm', 'note', 'plate']);

/** What a paper is cut from and how it is inked. */
interface Cut {
  /** Its fill, a token's name (the parchment if none). */
  fill?: string;
  /** A heavier edge (a button, a raised sheet). */
  bold?: boolean;
  /** A formal paper's two rules inside (a folio, a contract). */
  formal?: boolean;
  /** No shadow: it lies on the paper under it. */
  flat?: boolean;
}

/** Makes `made` a paper cut by hand, as `how` says. */
export function paper<T extends HTMLElement>(made: T, how: Cut = {}): T {
  made.classList.add('cr-paper');
  if (how.fill) {
    made.style.setProperty('--fill', `var(--${how.fill})`);
    if (INKED.has(how.fill)) made.classList.add('filled');
  }
  if (how.bold) made.classList.add('bold');
  if (how.formal) made.classList.add('formal');
  if (how.flat) made.classList.add('flat');
  return made;
}

/** A sheet: a paper, its head in spaced capitals (an aside at its right), its body. */
export function sheet(
  title: string | null,
  body: readonly Kid[],
  how: Cut & { aside?: Kid; cls?: string } = {}
) {
  const head =
    title !== null &&
    el(
      'header',
      'cr-head',
      el('span', '', title),
      how.aside ? el('span', 'cr-aside', how.aside) : null
    );
  return paper(
    el(
      'section',
      `cr-sheet${how.formal ? ' formal' : ''}${head ? '' : ' headless'} ${how.cls ?? ''}`.trim(),
      head,
      el('div', 'cr-body', ...body)
    ),
    how
  );
}

/** A plate: words on ink laid solid. */
export const plate = (...kids: Kid[]) => el('div', 'cr-plate', ...kids);

/**
 * A folio over the dimmed page: a formal sheet, its body and its ways on at
 * its foot; a tap on the dim round it puts it away (`close`). Its holder sets
 * it in and takes it out.
 */
export function folio(
  title: string,
  body: readonly Kid[],
  foot: readonly Kid[],
  close: () => void
) {
  const leaf = sheet(title, [...body, el('div', 'cr-foot', ...foot)], {
    formal: true,
    cls: 'cr-folio',
  });
  keep(leaf);
  const dim = el('div', 'cr-dim press', leaf);
  onTap(dim, close);
  return dim;
}

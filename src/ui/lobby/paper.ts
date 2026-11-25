import type { TeamSheetView } from '../../career/views/opponents.ts';
import type {
  PaperHeadline,
  PaperView,
  Run,
  WorkshopStrip,
} from '../../career/views/paper.ts';
import { pressable, ribbon } from '../base/button.ts';
import { uncleFace } from '../base/bubble.ts';
import { gullHead } from '../base/gull.ts';
import { FAINT, MOTION, SPACE, TYPE } from '../base/house.ts';
import {
  FIGURES,
  INK,
  figure,
  galleon,
  glyph,
  r2,
  svgNode,
} from '../base/ink.ts';
import { STAT, least } from '../base/lexicon.ts';
import { fade, piece, placed, screen } from '../base/ui.ts';
import { label, measured, word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';
import { TEAM_SHEET, createTeamSheet, type Pick } from './team-sheet.ts';

const PAGE = { w: 568, h: 372, pad: 16 } as const;
const NEWSPRINT = {
  face: '#ede5d1',
  edge: '#d9ccae',
  grain: '#b9a98a',
} as const;
const MAST = {
  title: 40,
  size: 46,
  squeeze: 0.84,
  ear: 66,
  earH: 48,
  top: 12,
} as const;
const DATE = { top: 70, h: 20, size: 11.5 } as const;
const LEAD = { size: 27, line: 31, lines: 3, gap: 12 } as const;
const COLUMN = {
  count: 3,
  gap: 14,
  size: 14.5,
  line: 17.5,
  grey: 6.4,
  bar: 2.1,
  after: 8,
} as const;
const SPECIAL = { size: 50, line: 56, room: 500 } as const;
const STRIP = { h: 84, glyph: 30, bar: 7 } as const;
const CONTINUE = { gap: 24, w: 176, ring: 7.5, size: TYPE.ribbon - 2 } as const;
const HIT = 26;
const UNCLE_PEEK = { size: 84, out: 26, turn: 8 } as const;

const INNER = PAGE.w - 2 * PAGE.pad;
const BODY = { w: PAGE.w + 24, h: PAGE.h + CONTINUE.gap + 34 } as const;

type Fragment = { text: string; link: number | null };
type Segment = Fragment & { x: number; w: number };
type Lined = { segments: Segment[]; w: number };

function words(runs: readonly Run[]): Fragment[][] {
  const out: Fragment[][] = [];
  let current: Fragment[] = [];
  runs.forEach((run, i) => {
    const link = run.team === null ? null : i;
    for (const part of run.text.split(/(\s+)/)) {
      if (part === '') continue;
      if (/^\s+$/.test(part)) {
        if (current.length > 0) out.push(current);
        current = [];
        continue;
      }
      current.push({ text: part, link });
    }
  });
  if (current.length > 0) out.push(current);
  return out;
}

function segmented(line: Fragment[][], size: number, weight: number): Lined {
  const merged: Fragment[] = [];
  line.forEach((w, wi) => {
    w.forEach((f, fi) => {
      const last = merged.at(-1);
      const space = wi > 0 && fi === 0 ? ' ' : '';
      if (last && last.link === f.link) {
        last.text += space + f.text;
        return;
      }
      if (space && last && last.link === null) {
        last.text += space;
        merged.push({ ...f });
        return;
      }
      if (space) merged.push({ text: space, link: null });
      merged.push({ ...f });
    });
  });
  let x = 0;
  const segments = merged.map((f) => {
    const w = measured(f.text, size, { weight });
    const s = { ...f, x, w };
    x += w;
    return s;
  });
  return { segments, w: x };
}

function wrapped(
  runs: readonly Run[],
  size: number,
  weight: number,
  room: number
): Lined[] {
  const lines: Fragment[][][] = [];
  let line: Fragment[][] = [];
  const width = (l: Fragment[][]) =>
    measured(l.map((w) => w.map((f) => f.text).join('')).join(' '), size, {
      weight,
    });
  for (const w of words(runs)) {
    if (line.length > 0 && width([...line, w]) > room) {
      lines.push(line);
      line = [];
    }
    line.push(w);
  }
  if (line.length > 0) lines.push(line);
  return lines.map((l) => segmented(l, size, weight));
}

type Links = { runs: Run[]; next: number };

function set(
  lines: readonly Lined[],
  o: {
    x: number;
    y: number;
    line: number;
    size: number;
    weight: number;
    align: 'start' | 'middle';
    runs: readonly Run[];
    links: Links;
  }
) {
  const ids = new Map<number, number>();
  return lines
    .map((l, i) => {
      const cy = o.y + o.line * (i + 0.5),
        left = o.align === 'middle' ? o.x - l.w / 2 : o.x;
      return l.segments
        .map((s) => {
          const text = label(left + s.x, cy, s.text, o.size, {
            anchor: 'start',
            weight: o.weight,
          });
          if (s.link === null) return text;
          const run = o.runs[s.link];
          let id = ids.get(s.link);
          if (id === undefined) {
            id = o.links.next++;
            ids.set(s.link, id);
            o.links.runs[id] = run;
          }
          const under = cy + o.size * 0.56,
            lead = s.text.length - s.text.trimStart().length,
            skip = lead > 0 ? measured(' ', o.size, { weight: o.weight }) : 0;
          return (
            `<g class="link" data-link="${id}">` +
            `<rect x="${r2(left + s.x)}" y="${r2(cy - HIT / 2)}" width="${r2(s.w)}" height="${HIT}" fill="transparent"/>` +
            text +
            `<path class="under" d="M${r2(left + s.x + skip)} ${r2(under)}H${r2(left + s.x + s.w)}" stroke="${INK.iron}" stroke-width="1.2" stroke-linecap="round"/>` +
            '</g>'
          );
        })
        .join('');
    })
    .join('');
}

function newsprint() {
  const { w, h } = PAGE;
  let grain = '';
  for (let i = 0; i < 70; i++) {
    const x = (i * 97.31) % w,
      y = (i * 53.77) % h;
    grain += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(0.35 + (i % 3) * 0.2)}" fill="${NEWSPRINT.grain}" opacity=".35"/>`;
  }
  return (
    `<defs><radialGradient id="newsprint" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${NEWSPRINT.face}"/><stop offset=".78" stop-color="${NEWSPRINT.face}"/><stop offset="1" stop-color="${NEWSPRINT.edge}"/></radialGradient></defs>` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#newsprint)" stroke="${INK.iron}" stroke-width=".8" stroke-opacity=".55" filter="url(#sh)"/>` +
    grain +
    `<path d="M${w / 2} 3V${h - 3}" stroke="${INK.iron}" stroke-width="1.4" opacity=".06"/>` +
    `<path d="M${w / 2 + 1.5} 3V${h - 3}" stroke="#fff" stroke-width="1" opacity=".35"/>`
  );
}

function masthead(v: PaperView) {
  const cx = PAGE.w / 2,
    y = MAST.title,
    t = MAST.top,
    ear = (x: number, inner: string) =>
      `<rect x="${x}" y="${t}" width="${MAST.ear}" height="${MAST.earH}" fill="none" stroke="${INK.iron}" stroke-width=".7"/>` +
      `<rect x="${x + 2.5}" y="${t + 2.5}" width="${MAST.ear - 5}" height="${MAST.earH - 5}" fill="none" stroke="${INK.iron}" stroke-width=".35"/>` +
      inner;
  const titled = (paint: string) =>
    `<text x="0" y="0" font-size="${MAST.size}" font-family='${FIGURES}' font-weight="700" letter-spacing="-.4" text-anchor="middle" dominant-baseline="central" stroke-linejoin="miter" ${paint}>${v.title}</text>`;
  const half =
    measured(v.title, MAST.size, { weight: 700 }) * MAST.squeeze * 0.5;
  const diamond = (x: number) =>
    `<path d="M${r2(x)} ${y - 5}L${r2(x + 5)} ${y}L${r2(x)} ${y + 5}L${r2(x - 5)} ${y}Z" fill="${INK.rubric}" stroke="${INK.iron}" stroke-width=".6"/>`;
  const left = PAGE.pad,
    right = PAGE.w - PAGE.pad - MAST.ear,
    head = 40;
  return (
    `<g class="printed" style="--i:0">` +
    ear(
      left,
      `<g transform="translate(${r2(left + MAST.ear / 2 - head / 2)} ${t + 4})">${gullHead(head)}</g>`
    ) +
    ear(right, galleon(right + MAST.ear / 2, t + MAST.earH / 2, 44)) +
    `<g transform="translate(${cx} ${y}) scale(${MAST.squeeze} 1)">` +
    titled(`fill="${INK.iron}" stroke="${INK.iron}" stroke-width="2.2"`) +
    titled(`fill="none" stroke="${NEWSPRINT.face}" stroke-width=".55"`) +
    '</g>' +
    diamond(cx - half - 14) +
    diamond(cx + half + 14) +
    '</g>'
  );
}

function dateline(v: PaperView) {
  const { top, h } = DATE,
    l = PAGE.pad,
    r = PAGE.w - PAGE.pad,
    cy = top + h / 2,
    said =
      measured(v.dateline, DATE.size, { weight: 500, italic: true }) / 2 + 12;
  return (
    `<g class="printed" style="--i:1">` +
    `<path d="M${l} ${top}H${r}" stroke="${INK.iron}" stroke-width="2.2"/>` +
    `<path d="M${l} ${top + 3.2}H${r}" stroke="${INK.iron}" stroke-width=".6"/>` +
    `<path d="M${l} ${top + h}H${PAGE.w / 2 - said}M${PAGE.w / 2 + said} ${top + h}H${r}" stroke="${INK.iron}" stroke-width=".6"/>` +
    `<path d="M${l} ${cy}H${PAGE.w / 2 - said}M${PAGE.w / 2 + said} ${cy}H${r}" stroke="${INK.iron}" stroke-width=".35" stroke-dasharray="1 2.5"/>` +
    label(PAGE.w / 2, cy + 0.5, v.dateline, DATE.size, {
      weight: 500,
      italic: true,
    }) +
    '</g>'
  );
}

function greyed(x: number, y: number, w: number, rows: number, seed: number) {
  let s = '';
  for (let i = 0; i < rows; i++) {
    const end = i === rows - 1 ? 0.35 + ((seed * 7 + i) % 5) * 0.1 : 1,
      indent = i === 0 ? 8 : 0;
    s += `<rect x="${r2(x + indent)}" y="${r2(y + i * COLUMN.grey)}" width="${r2((w - indent) * end)}" height="${COLUMN.bar}" rx="1" fill="${INK.iron}" opacity=".16"/>`;
  }
  return s;
}

function strip(shop: WorkshopStrip, x: number, y: number, w: number) {
  const g =
      'line' in shop.focus
        ? STAT[shop.focus.line].glyph
        : (`weapon.${shop.focus.gun}` as const),
    cy = y + 30,
    arrowX = x + w / 2 + 10,
    barY = y + STRIP.h - 18,
    bw = w - 24,
    fill = (n: number) =>
      r2((bw * Math.max(0, Math.min(shop.whole, n))) / shop.whole);
  return (
    `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${STRIP.h}" fill="${NEWSPRINT.face}" stroke="${INK.iron}" stroke-width="1.4"/>` +
    `<rect x="${r2(x + 3)}" y="${r2(y + 3)}" width="${r2(w - 6)}" height="${STRIP.h - 6}" fill="none" stroke="${INK.iron}" stroke-width=".5"/>` +
    [
      [x + 3, y + 3],
      [x + w - 3, y + 3],
      [x + 3, y + STRIP.h - 3],
      [x + w - 3, y + STRIP.h - 3],
    ]
      .map(
        ([px, py]) =>
          `<path d="M${r2(px)} ${r2(py - 3)}L${r2(px + 3)} ${r2(py)}L${r2(px)} ${r2(py + 3)}L${r2(px - 3)} ${r2(py)}Z" fill="${INK.rubric}"/>`
      )
      .join('') +
    glyph(g, x + 12 + STRIP.glyph / 2, cy, STRIP.glyph) +
    figure(arrowX - 14, cy + 0.5, shop.before, TYPE.figure, { anchor: 'end' }) +
    glyph('arrow', arrowX, cy, least('arrow')) +
    figure(arrowX + 12, cy + 0.5, shop.after, TYPE.figure + 2, {
      anchor: 'start',
      weight: 700,
    }) +
    `<rect x="${r2(x + 12)}" y="${r2(barY - STRIP.bar / 2)}" width="${r2(bw)}" height="${STRIP.bar}" rx="2" fill="none" stroke="${INK.iron}" stroke-width=".7"/>` +
    `<rect x="${r2(x + 12)}" y="${r2(barY - STRIP.bar / 2)}" width="${fill(shop.after)}" height="${STRIP.bar}" rx="2" fill="${INK.blue}" opacity=".75"/>` +
    `<rect x="${r2(x + 12)}" y="${r2(barY - STRIP.bar / 2)}" width="${fill(shop.before)}" height="${STRIP.bar}" rx="2" fill="${INK.iron}" opacity=".55"/>`
  );
}

function raceEdition(v: PaperView, links: Links) {
  const [lead, ...rest] = v.headlines;
  let s = '',
    y = DATE.top + DATE.h + 10,
    i = 2;
  if (lead) {
    const lines = wrapped(lead.runs, LEAD.size, 700, INNER).slice(
      0,
      LEAD.lines
    );
    s +=
      `<g class="printed" style="--i:${i++}">` +
      set(lines, {
        x: PAGE.w / 2,
        y,
        line: LEAD.line,
        size: LEAD.size,
        weight: 700,
        align: 'middle',
        runs: lead.runs,
        links,
      }) +
      '</g>';
    y += LEAD.line * lines.length + LEAD.gap / 2;
    s += `<path d="M${PAGE.pad} ${r2(y)}H${PAGE.w - PAGE.pad}" stroke="${INK.iron}" stroke-width=".9"/>`;
    y += LEAD.gap;
  }
  const colW = (INNER - (COLUMN.count - 1) * COLUMN.gap) / COLUMN.count,
    bottom = PAGE.h - PAGE.pad,
    open = v.workshop ? COLUMN.count - 1 : COLUMN.count,
    columns: PaperHeadline[][] = Array.from({ length: COLUMN.count }, () => []);
  rest.forEach((h, n) => columns[n % open].push(h));
  columns.forEach((stories, c) => {
    const x = PAGE.pad + c * (colW + COLUMN.gap);
    if (c > 0)
      s += `<path d="M${r2(x - COLUMN.gap / 2)} ${r2(y)}V${bottom}" stroke="${INK.iron}" stroke-width=".5" opacity=".6"/>`;
    let at = y;
    const room = bottom - y;
    const shop = c === COLUMN.count - 1 ? v.workshop : null;
    const share =
      stories.length > 0
        ? (room - (shop ? STRIP.h + COLUMN.after : 0)) / stories.length
        : 0;
    stories.forEach((story, k) => {
      const lines = wrapped(story.runs, COLUMN.size, 700, colW);
      const top = at;
      s +=
        `<g class="printed" style="--i:${i++}">` +
        set(lines, {
          x,
          y: at,
          line: COLUMN.line,
          size: COLUMN.size,
          weight: 700,
          align: 'start',
          runs: story.runs,
          links,
        });
      at += COLUMN.line * lines.length + 4;
      const rows = Math.max(
        0,
        Math.floor((top + share - at - COLUMN.after) / COLUMN.grey)
      );
      s += greyed(x, at, colW, Math.min(rows, 6), c * 3 + k) + '</g>';
      at = top + share;
    });
    if (shop) {
      const top = stories.length === 0 ? y : at;
      s += `<g class="printed" style="--i:${i++}">${strip(shop, x, top, colW)}`;
      const after = top + STRIP.h + COLUMN.after,
        rows = Math.floor((bottom - after) / COLUMN.grey);
      s += greyed(x, after, colW, Math.min(rows, 9), c + 5) + '</g>';
    } else if (stories.length === 0) {
      s += `<g class="printed" style="--i:${i++}">${greyed(x, y, colW, Math.floor(room / COLUMN.grey), c)}</g>`;
    }
  });
  return s;
}

function specialEdition(v: PaperView, links: Links) {
  const lead = v.headlines[0];
  if (!lead) return '';
  const top = DATE.top + DATE.h + 10,
    bottom = PAGE.h - PAGE.pad,
    lines = wrapped(lead.runs, SPECIAL.size, 700, SPECIAL.room),
    h = lines.length * SPECIAL.line,
    y = top + (bottom - top - h) / 2;
  return (
    `<path d="M${PAGE.pad} ${top + 2}H${PAGE.w - PAGE.pad}" stroke="${INK.iron}" stroke-width="5"/>` +
    `<path d="M${PAGE.pad} ${bottom - 2}H${PAGE.w - PAGE.pad}" stroke="${INK.iron}" stroke-width="5"/>` +
    `<g class="stamp-in slam" style="--d:${Math.round(MOTION.repossessed.ms * MOTION.repossessed.lands)}ms">` +
    set(lines, {
      x: PAGE.w / 2,
      y,
      line: SPECIAL.line,
      size: SPECIAL.size,
      weight: 700,
      align: 'middle',
      runs: lead.runs,
      links,
    }) +
    '</g>'
  );
}

function survivor() {
  const size = UNCLE_PEEK.size;
  return (
    `<g class="said" transform="translate(${PAGE.w - size + UNCLE_PEEK.out} ${PAGE.h - size + UNCLE_PEEK.out}) rotate(${UNCLE_PEEK.turn} ${size / 2} ${size / 2})">` +
    `<g class="sitter peek">${uncleFace(0, 0, size)}</g></g>`
  );
}

function continueFace(waiting: boolean) {
  const cx = BODY.w / 2,
    cy = PAGE.h + CONTINUE.gap,
    said = measured('Continue', CONTINUE.size, { weight: 600 }),
    ring = 2 * CONTINUE.ring + SPACE.hair,
    left = cx - (said + (waiting ? ring : 0)) / 2;
  const turning = waiting
    ? `<g class="turning"><circle cx="${r2(left + CONTINUE.ring)}" cy="${cy - 1}" r="${CONTINUE.ring}" fill="none" stroke="${INK.iron}" stroke-width="2" stroke-dasharray="${r2(CONTINUE.ring * 4.2)} ${r2(CONTINUE.ring * 2.2)}" stroke-linecap="round"/></g>`
    : '';
  return (
    `<g id="continue"${waiting ? ` opacity="${FAINT + 0.18}"` : ''}>` +
    ribbon(
      cx,
      cy,
      CONTINUE.w,
      turning +
        word(left + (waiting ? ring : 0), cy - 1, 'Continue', CONTINUE.size, {
          anchor: 'start',
          weight: 600,
        })
    ) +
    '</g>'
  );
}

export function createPaper(port: LobbyPort) {
  const el = screen();
  const body = piece(el, 'center', false, true);
  body.style.top = '50%';
  body.style.translate = '-50% -50%';
  body.style.width = `${BODY.w}px`;
  body.style.height = `${BODY.h}px`;
  const host = piece(el, 'bottom center', false, true);
  host.style.width = `${TEAM_SHEET.w}px`;
  host.style.height = `${TEAM_SHEET.h}px`;
  host.hidden = true;
  const sheets = createTeamSheet(port, host, { closable: true });

  let view: PaperView | null = null,
    waiting = true,
    paper: HTMLElement | null = null,
    button: HTMLElement | null = null,
    runs: Run[] = [];

  function refuse(target: Element | null) {
    if (!target) return;
    target.classList.remove('refuse');
    void target.getBoundingClientRect();
    target.classList.add('refuse');
  }

  function drawContinue() {
    button?.remove();
    const next = placed(body, 0, 0, BODY.w, BODY.h);
    const svg = svgNode(BODY.w, BODY.h, continueFace(waiting));
    next.append(svg);
    const face = svg.querySelector<SVGElement>('#continue');
    pressable(
      face,
      () => {
        if (waiting) {
          refuse(face);
          return;
        }
        port.send({ type: 'MarkRead', team: 0 });
      },
      'continue'
    );
    button = next;
    return face;
  }

  function draw(v: PaperView) {
    paper?.remove();
    const links: Links = { runs: [], next: 0 };
    const inner =
      v.kind === 'special' ? specialEdition(v, links) : raceEdition(v, links);
    runs = links.runs;
    const next = placed(body, (BODY.w - PAGE.w) / 2, 0, PAGE.w, PAGE.h);
    next.append(
      svgNode(
        PAGE.w,
        PAGE.h,
        `<rect class="puff" x="-8" y="-6" width="${PAGE.w + 16}" height="${PAGE.h + 14}" rx="10" fill="${INK.iron}" opacity="0" style="transform-origin:${PAGE.w / 2}px ${PAGE.h / 2}px; filter: blur(6px)"/>` +
          newsprint() +
          masthead(v) +
          dateline(v) +
          inner +
          (v.kind === 'special' ? survivor() : '')
      )
    );
    next.classList.add('thrown');
    next.classList.toggle('heavy', v.kind === 'special');
    body.classList.remove('quaking');
    if (v.kind === 'special') {
      void body.getBoundingClientRect();
      body.classList.add('quaking');
    }
    next.querySelectorAll<SVGElement>('.link').forEach((link) => {
      const id = Number(link.dataset.link),
        run = runs[id];
      if (!run || run.team === null) return;
      const team = run.team,
        person = run.person;
      pressable(
        link,
        () =>
          port.open('teamSheet', {
            team,
            ...(person === null ? {} : { person }),
          }),
        `link-${id}`
      );
    });
    paper = next;
  }

  return {
    el,
    show(v: PaperView) {
      view = v;
      el.hidden = false;
      fade(body, true, 0);
      draw(v);
      drawContinue();
    },
    ready() {
      if (!waiting) return;
      waiting = false;
      if (view) drawContinue()?.classList.add('waking');
    },
    sheet(v: TeamSheetView, pick: Pick) {
      fade(body, false);
      sheets.open(v, pick);
    },
    update(next: (team: number) => TeamSheetView) {
      sheets.update(next);
    },
    back(): boolean {
      if (!sheets.back()) return false;
      if (sheets.team() === null) fade(body, true);
      return true;
    },
    hide() {
      sheets.reset();
      button?.remove();
      button = null;
      paper?.classList.remove('thrown');
      paper?.classList.add('tossed');
      window.setTimeout(() => {
        el.hidden = true;
      }, MOTION.tossed.ms);
    },
  };
}

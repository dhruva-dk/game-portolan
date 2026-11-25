import type {
  OpponentsView,
  StandingRow,
  TeamSheetView,
} from '../../career/views/opponents.ts';
import { pressable } from '../base/button.ts';
import { emblemAt, liveryColors } from '../base/emblem.ts';
import { MOTION, SPACE, TYPE } from '../base/house.ts';
import { GILT, INK, figure, glyph, svgNode } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import { createList } from '../base/list.ts';
import { LEVELS, rangeBar } from '../base/rangebar.ts';
import { sheet } from '../base/sheet.ts';
import { piece, placed, screen } from '../base/ui.ts';
import { fitted, label } from '../base/word.ts';
import { grouped } from '../base/grouped.ts';
import type { LobbyPort } from './port.ts';
import { TEAM_SHEET, createTeamSheet, type Pick } from './team-sheet.ts';

const PAD = SPACE.pad - 2;
const GAP = SPACE.gap;
const H = TEAM_SHEET.h;
const STAND = { w: 648 - TEAM_SHEET.w - GAP, h: H } as const;
const SIDE = TEAM_SHEET;
const ROW = 26;
const LIST = {
  x: PAD,
  y: PAD,
  w: STAND.w - 2 * PAD,
  h: STAND.h - 2 * PAD,
} as const;
const COLS = {
  place: 24,
  move: 34,
  emblem: 76,
  emblemSize: 19,
  name: 90,
  points: 232,
  bar: 258,
  barH: 7,
  end: LIST.w - 16,
} as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

function arrow(moved: number, x: number, cy: number) {
  if (moved === 0) return '';
  const up = moved > 0,
    a = least('arrow');
  return (
    `<g class="moved" style="--hop:${up ? MOTION.moved.hop : -MOTION.moved.hop}px">` +
    `<g transform="rotate(${up ? -90 : 90} ${r2(x + a / 2)} ${r2(cy)})">${glyph('arrow', x + a / 2, cy, a, { ink: up ? undefined : 'rubric' })}</g>` +
    figure(x + a + 1, cy, Math.abs(moved), TYPE.word + 1, {
      anchor: 'start',
      weight: 600,
      fill: up ? INK.iron : INK.rubric,
    }) +
    '</g>'
  );
}

function rowArt(row: StandingRow, mean: number) {
  const cy = ROW / 2,
    w = LIST.w,
    burst = least('starburst');
  let s = `<rect x="0" y="0" width="${w}" height="${ROW}" fill="transparent"/>`;
  if (row.yours) {
    const [dye] = liveryColors(row.livery);
    s +=
      `<rect x="1" y="1.5" width="${w - 2}" height="${ROW - 3}" rx="3" fill="${GILT}" opacity=".85"/>` +
      `<rect x="1" y="1.5" width="4" height="${ROW - 3}" rx="1.5" fill="${dye}" stroke="${INK.iron}" stroke-width=".6"/>`;
  }
  s +=
    `<g class="chosen"><rect x="1" y="1.5" width="${w - 2}" height="${ROW - 3}" rx="3" fill="none" stroke="${INK.iron}" stroke-width="1.1"/>` +
    `<path class="point" d="M${w - 9} ${cy - 5}L${w - 4} ${cy}L${w - 9} ${cy + 5}" fill="none" stroke="${INK.iron}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  s += `<path d="M6 ${ROW - 0.5}H${w - 6}" stroke="${INK.iron}" stroke-width=".5" opacity=".18"/>`;
  s += figure(COLS.place, cy + 0.5, row.place, TYPE.name + 1, {
    anchor: 'end',
    weight: 700,
  });
  s += arrow(row.moved, COLS.move, cy);
  s += emblemAt(
    row.emblem,
    liveryColors(row.livery),
    COLS.emblem,
    cy,
    COLS.emblemSize
  );
  const room = COLS.points - COLS.name - 34;
  s += label(COLS.name, cy + 0.5, row.name, fitted(row.name, TYPE.name, room), {
    anchor: 'start',
  });
  s +=
    figure(COLS.points, cy + 0.5, grouped(row.points), TYPE.name + 1, {
      anchor: 'end',
      weight: 600,
    }) + glyph('starburst', COLS.points + 3 + burst / 2, cy, burst);
  const bw = COLS.end - COLS.bar;
  s +=
    `<g class="drawn">${rangeBar(COLS.bar, cy, bw, COLS.barH, { scale: LEVELS, lo: row.strength.lo, hi: row.strength.hi, notches: 4 })}</g>` +
    `<path class="ticked-in" d="M${r2(COLS.bar + 1.4 + ((bw - 2.8) * mean) / 100)} ${r2(cy - COLS.barH / 2 - 2.5)}v${COLS.barH + 5}" stroke="${INK.iron}" stroke-width="1.8" stroke-linecap="round"/>`;
  return s;
}

const rowsKey = (v: OpponentsView) => JSON.stringify(v);

function shake(el: Element | null) {
  if (!el) return;
  el.classList.remove('refuse');
  void el.getBoundingClientRect();
  el.classList.add('refuse');
}

export function createOpponents(port: LobbyPort) {
  const el = screen();
  el.hidden = true;
  const left = piece(el, 'bottom left', false, true);
  left.style.width = `${STAND.w}px`;
  left.style.height = `${STAND.h}px`;
  placed(left, 0, 0, STAND.w, STAND.h).append(
    svgNode(STAND.w, STAND.h, sheet(0, 0, STAND.w, STAND.h, { seed: 37 }))
  );
  const list = createList(left, LIST, ROW);
  const right = piece(el, 'bottom right', false, true);
  right.style.width = `${SIDE.w}px`;
  right.style.height = `${SIDE.h}px`;

  let standings: OpponentsView | null = null,
    key = '',
    rows: HTMLElement[] = [],
    sheetOf: ((team: number) => TeamSheetView) | null = null,
    fresh = true;
  const sheets = createTeamSheet(port, right);

  function choose(team: number | null) {
    standings?.rows.forEach((row, i) =>
      rows[i]?.classList.toggle('on', row.team === team)
    );
  }

  function still(div: HTMLElement) {
    div
      .querySelectorAll('.drawn, .moved, .ticked-in')
      .forEach((e) => e.classList.remove('drawn', 'moved', 'ticked-in'));
  }

  function drawRows(v: OpponentsView) {
    const next = rowsKey(v);
    if (next === key) return;
    key = next;
    const inking = fresh;
    rows = v.rows.map((row) => {
      const div = document.createElement('div');
      div.className = 'row';
      const svg = svgNode(
        LIST.w,
        ROW,
        `<g id="row-${row.place}">${rowArt(row, v.mean)}</g>`
      );
      div.append(svg);
      pressable(
        svg.querySelector<SVGElement>(`#row-${row.place}`),
        () => tapRow(row.team, div),
        `row-${row.place}`
      );
      return div;
    });
    list.show(rows);
    if (inking) list.to(v.open, true);
    if (inking) {
      const first = rows.findIndex((_, i) => list.near(i));
      rows.forEach((div, i) => {
        if (!list.near(i)) {
          still(div);
          return;
        }
        const svg = div.firstElementChild;
        if (!(svg instanceof SVGElement)) return;
        const d = MOTION.rows.after + (i - first) * MOTION.rows.stagger;
        svg.classList.add('inked-row');
        svg.style.setProperty('--d', `${d}ms`);
      });
    } else rows.forEach(still);
    choose(sheets.team());
  }

  function tapRow(team: number, div: HTMLElement) {
    if (sheets.team() === team) {
      shake(div.firstElementChild);
      return;
    }
    choose(team);
    port.open('teamSheet', { team });
  }

  function open(team: number, pick: Pick) {
    if (!sheetOf) return;
    sheets.open(sheetOf(team), pick);
    choose(team);
    const row = standings?.rows.findIndex((r) => r.team === team) ?? -1;
    if (row >= 0 && !list.near(row)) list.to(row);
  }

  return {
    el,
    show(v: OpponentsView, next: (team: number) => TeamSheetView) {
      standings = v;
      sheetOf = next;
      drawRows(v);
      fresh = false;
      sheets.update(next);
    },
    sheet(team: number, pick: Pick = {}) {
      open(team, pick);
    },
    open() {
      fresh = true;
      key = '';
    },
    reset() {
      sheets.reset();
      choose(null);
    },
    back(): boolean {
      if (!sheets.back()) return false;
      if (sheets.team() === null) choose(null);
      return true;
    },
  };
}

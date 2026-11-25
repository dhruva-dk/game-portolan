import type { CardView } from '../../career/views/card.ts';
import type {
  OpponentsView,
  SheetCard,
  SheetSeat,
  StandingRow,
  TeamSheetView,
} from '../../career/views/opponents.ts';
import { pressable } from '../base/button.ts';
import {
  CANDIDATE,
  CARD,
  cardCandidate,
  cardFront,
  framed,
  paper,
  starRow,
  type Candidacy,
} from '../base/card.ts';
import { emblemAt, liveryColors } from '../base/emblem.ts';
import { growFrom, shrinkBack } from '../base/enlarge.ts';
import { MOTION, SPACE, TYPE } from '../base/house.ts';
import { GILT, INK, figure, glyph, svgNode } from '../base/ink.ts';
import { ROLE, STAT, least } from '../base/lexicon.ts';
import { createList } from '../base/list.ts';
import { laurel } from '../base/marks.ts';
import { LEVELS, rangeBar } from '../base/rangebar.ts';
import { sheet } from '../base/sheet.ts';
import { piece, placed, screen } from '../base/ui.ts';
import { fitted, label, word } from '../base/word.ts';
import { grouped } from '../base/grouped.ts';
import { actionRow, bindActs, resolving, type Acting } from './candidate.ts';
import type { LobbyPort } from './port.ts';

const PAD = SPACE.pad - 2;
const GAP = SPACE.gap;
const H = 360;
const STAND = { w: 352, h: H } as const;
const SIDE = { w: 648 - STAND.w - GAP, h: H } as const;
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
const HEAD = { h: 28, emblem: 24, wreath: 12 } as const;
const LINE = least('part.sails');
const SHIP = {
  top: PAD + HEAD.h + 6,
  glyph: LINE,
  bar: 7,
  gun: least('weapon.cannon'),
} as const;
const SMALL = {
  w: (SIDE.w - 2 * PAD - GAP) / 2,
  h: 62,
  shot: 34,
  gap: 6,
} as const;
const CARDS = { top: SHIP.top + 7 * LINE + 8 } as const;
const ACT = { h: 40 } as const;
const BIG = {
  x: (SIDE.w - CARD.w) / 2,
  y: PAD + HEAD.h + 6,
  w: CARD.w,
  h: CARD.h,
} as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

const columnX = (slot: number) => {
  const left = PAD + SHIP.glyph + 6,
    w = (SIDE.w - PAD - left - GAP) / 2;
  return { x: left + slot * (w + GAP), w };
};

const smallAt = (i: number) => ({
  x: PAD + (i % 2) * (SMALL.w + GAP),
  y: CARDS.top + Math.floor(i / 2) * (SMALL.h + SMALL.gap),
});

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

function header(v: TeamSheetView) {
  const cy = PAD + HEAD.h / 2,
    wreathX = SIDE.w - PAD - HEAD.wreath - 4,
    nameX = PAD + HEAD.emblem + 6,
    room = wreathX - HEAD.wreath * 1.3 - nameX - 4;
  return (
    emblemAt(
      v.emblem,
      liveryColors(v.livery),
      PAD + HEAD.emblem / 2 + 2,
      cy,
      HEAD.emblem
    ) +
    label(nameX, cy, v.name, fitted(v.name, TYPE.name + 2, room), {
      anchor: 'start',
    }) +
    laurel(wreathX, cy + 1, HEAD.wreath) +
    figure(wreathX, cy + 0.5, v.place, v.place >= 10 ? 12 : 14, {
      weight: 700,
    }) +
    `<path d="M${PAD + 2} ${PAD + HEAD.h + 1}H${SIDE.w - PAD - 2}" stroke="${INK.iron}" stroke-width=".6" opacity=".4"/>`
  );
}

function ships(v: TeamSheetView) {
  let s = '';
  const lines = v.ships[0]?.lines ?? [];
  lines.forEach((row, i) => {
    const cy = SHIP.top + LINE * (i + 0.5);
    s += glyph(STAT[row.line].glyph, PAD + LINE / 2, cy, LINE);
    if (i > 0)
      s += `<path d="M${PAD} ${r2(SHIP.top + LINE * i)}H${SIDE.w - PAD}" stroke="${INK.iron}" stroke-width=".4" opacity=".14"/>`;
  });
  v.ships.forEach((ship, slot) => {
    const col = columnX(slot),
      bw = col.w - SHIP.gun - 4;
    ship.lines.forEach((row, i) => {
      const cy = SHIP.top + LINE * (i + 0.5);
      s +=
        `<g class="drawn" style="--d:${(slot * 7 + i) * MOTION.drawn.stagger}ms">` +
        rangeBar(col.x, cy, bw, SHIP.bar, {
          scale: LEVELS,
          lo: row.level.lo,
          hi: row.level.hi,
          notches: 4,
        }) +
        '</g>' +
        `<path class="ticked-in" style="--d:${(slot * 7 + i) * MOTION.drawn.stagger}ms" d="M${r2(col.x + 1.4 + ((bw - 2.8) * row.yours) / 100)} ${r2(cy - SHIP.bar / 2 - 2.5)}v${SHIP.bar + 5}" stroke="${INK.iron}" stroke-width="1.8" stroke-linecap="round"/>`;
      if (row.line === 'gun')
        s += glyph(
          `weapon.${ship.gun}`,
          col.x + col.w - SHIP.gun / 2,
          cy,
          SHIP.gun
        );
    });
  });
  return s;
}

const seatRole = (seat: SheetSeat) => ROLE[seat];

function small(c: SheetCard, i: number) {
  const { w, h, shot } = SMALL,
    seed = 11 + i * 7;
  if (c.helm)
    return (
      paper(w, h, seed) +
      glyph('role.owner', w / 2 - 22, h / 2, least('role.owner') + 8) +
      word(w / 2 + 6, h / 2, ROLE.owner.word, TYPE.word + 1, {
        anchor: 'start',
        weight: 600,
      })
    );
  if (!c.card)
    return (
      paper(w, h, seed, true) +
      glyph(seatRole(c.seat).glyph, w / 2 - 20, h / 2, least('role.driver'), {
        opacity: 0.5,
      }) +
      word(w / 2 - 4, h / 2, seatRole(c.seat).word, TYPE.word, {
        anchor: 'start',
        opacity: 0.55,
      })
    );
  const face = c.card,
    right = 6 + shot + 6,
    g = least('role.driver'),
    starX = right + (w - 4 - right) / 2;
  return (
    paper(w, h, seed) +
    label(6, 12, face.name, fitted(face.name, TYPE.word + 1, w - 12), {
      anchor: 'start',
    }) +
    framed(face, 9, 22, shot - 6) +
    starRow(starX, 30, face.stars) +
    glyph(ROLE[face.role].glyph, right + g / 2, 48, g) +
    word(right + g + 3, 48.5, ROLE[face.role].word, TYPE.small, {
      anchor: 'start',
    }) +
    (c.pinned ? glyph('pin', w - 9, 9, 16) : '')
  );
}

const candidacy = (c: SheetCard): Candidacy => ({
  pinned: c.pinned,
  rival: c.rival,
  holder: c.holder,
});

const acting = (c: SheetCard): Acting => ({
  report: c.report,
  approach: c.approach,
  negotiate: null,
});

const enlargeable = (c: SheetCard) => c.card !== null;

const rowsKey = (v: OpponentsView) => JSON.stringify(v);

export type Pick = { person?: number; seat?: SheetSeat };

const picked = (v: TeamSheetView, pick: Pick) => {
  const i = v.cards.findIndex((c) =>
    pick.person !== undefined
      ? c.card?.person === pick.person
      : c.seat === pick.seat
  );
  return i < 0 || !enlargeable(v.cards[i]) ? null : i;
};

function shake(el: Element | null) {
  if (!el) return;
  el.classList.remove('refuse');
  void el.getBoundingClientRect();
  el.classList.add('refuse');
}

type Shown = {
  view: TeamSheetView;
  node: HTMLElement;
  under: HTMLElement[];
  smalls: HTMLElement[];
  large: HTMLElement;
  enlarged: number | null;
  tween: (() => void) | null;
};

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
    shown: Shown | null = null,
    fresh = true;

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
    if (shown) choose(shown.view.team);
  }

  function tapRow(team: number, div: HTMLElement) {
    if (shown?.view.team === team) {
      shake(div.firstElementChild);
      return;
    }
    choose(team);
    port.open('teamSheet', { team });
  }

  function largeArt(c: SheetCard, face: CardView) {
    if (c.report === null) return cardFront(face, 43);
    return cardCandidate(face, candidacy(c), 43);
  }

  function drawLarge(s: Shown) {
    const c = s.enlarged === null ? null : s.view.cards[s.enlarged];
    if (!c || !c.card) return;
    const acts = c.report !== null,
      h = acts ? CANDIDATE.h + GAP + ACT.h : CARD.h;
    const svg = svgNode(
      CARD.w,
      h,
      `<g id="large"><g class="art">${largeArt(c, c.card)}</g></g>` +
        (acts
          ? actionRow(acting(c), 'large', {
              x: 0,
              y: CANDIDATE.h + GAP,
              w: CANDIDATE.w,
              h: ACT.h,
            })
          : '')
    );
    s.large.replaceChildren(svg);
    s.large.style.height = `${h}px`;
    pressable(svg.querySelector<SVGElement>('#large'), () => shrink(), 'large');
    if (acts) bindActs(svg, acting(c), c.card.person, 'large', port);
  }

  const enlarging = (s: Shown) => ({ large: s.large, under: () => s.under });

  function enlarge(i: number) {
    const s = shown;
    if (!s) return;
    s.enlarged = i;
    drawLarge(s);
    const at = smallAt(i);
    growFrom(
      enlarging(s),
      { x: at.x + SMALL.w / 2 - BIG.x, y: at.y + SMALL.h / 2 - BIG.y },
      SMALL.w
    );
  }

  function shrink(instant = false) {
    const s = shown;
    if (!s || s.enlarged === null) return;
    s.enlarged = null;
    s.tween?.();
    shrinkBack(enlarging(s), SMALL.w, instant, () => s.enlarged !== null);
  }

  function drawSmalls(s: Shown, dealing: boolean) {
    s.view.cards.forEach((c, i) => {
      const host = s.smalls[i],
        svg = svgNode(
          SMALL.w,
          SMALL.h,
          `<g id="small-${c.seat}">${small(c, i)}</g>`
        );
      host.replaceChildren(svg);
      if (enlargeable(c))
        pressable(
          svg.querySelector<SVGElement>(`#small-${c.seat}`),
          () => enlarge(i),
          `card-${c.seat}`
        );
      host.classList.remove('dealt');
      if (!dealing) return;
      const at = smallAt(i),
        { after, stagger } = MOTION.deal;
      void host.offsetWidth;
      host.classList.add('dealt');
      host.style.setProperty('--x', `${r2(PAD - at.x)}px`);
      host.style.setProperty('--y', `${r2(PAD - at.y)}px`);
      host.style.animationDelay = `${after + MOTION.swap.after + i * stagger}ms`;
    });
  }

  function build(v: TeamSheetView): Shown {
    const node = placed(right, 0, 0, SIDE.w, SIDE.h);
    node.append(
      svgNode(
        SIDE.w,
        SIDE.h,
        sheet(0, 0, SIDE.w, SIDE.h, { seed: 41 + v.team }) + header(v)
      )
    );
    const lines = placed(node, 0, 0, SIDE.w, SIDE.h);
    lines.append(svgNode(SIDE.w, SIDE.h, ships(v)));
    const smalls = v.cards.map((_, i) => {
      const at = smallAt(i);
      return placed(node, at.x, at.y, SMALL.w, SMALL.h);
    });
    const large = placed(node, BIG.x, BIG.y, BIG.w, BIG.h);
    large.hidden = true;
    const s: Shown = {
      view: v,
      node,
      under: [lines, ...smalls],
      smalls,
      large,
      enlarged: null,
      tween: null,
    };
    drawSmalls(s, true);
    return s;
  }

  function away(s: Shown, how: 'swap-out' | 'swap-away') {
    s.tween?.();
    s.node.classList.remove('swap-in');
    s.node.classList.add(how);
    window.setTimeout(() => s.node.remove(), MOTION.swap.leave);
  }

  function open(team: number, pick: Pick) {
    if (!sheetOf) return;
    const v = sheetOf(team);
    if (shown?.view.team === team) {
      const i = picked(v, pick);
      if (i !== null && shown.enlarged !== i) enlarge(i);
      return;
    }
    if (shown) away(shown, 'swap-out');
    const s = build(v);
    s.node.classList.add('swap-in');
    if (shown) s.node.style.setProperty('--d', `${MOTION.swap.after}ms`);
    shown = s;
    right.hidden = false;
    choose(team);
    const row = standings?.rows.findIndex((r) => r.team === team) ?? -1;
    if (row >= 0 && !list.near(row)) list.to(row);
    const i = picked(v, pick);
    if (i !== null) {
      s.enlarged = i;
      drawLarge(s);
      s.large.hidden = false;
      for (const u of s.under) {
        u.style.opacity = '0';
        u.style.pointerEvents = 'none';
      }
    }
  }

  function update(v: TeamSheetView) {
    const s = shown;
    if (!s) return;
    const before = s.view;
    s.view = v;
    drawSmalls(s, false);
    if (s.enlarged === null) return;
    const was = before.cards[s.enlarged],
      now = v.cards[s.enlarged];
    if (!now?.card) {
      shrink(true);
      return;
    }
    drawLarge(s);
    if (was?.card && !was.exact && now.exact) {
      const from = was.card,
        to = now.card;
      s.tween?.();
      s.tween = resolving(from, to, (face) => {
        const art = s.large.querySelector('#large .art');
        if (art) art.innerHTML = largeArt(now, face);
      });
    }
    if (was && !was.pinned && now.pinned)
      s.large.querySelector('#pin')?.classList.add('stamp');
  }

  return {
    el,
    show(v: OpponentsView, sheets: (team: number) => TeamSheetView) {
      standings = v;
      sheetOf = sheets;
      drawRows(v);
      fresh = false;
      if (shown) update(sheets(shown.view.team));
    },
    sheet(team: number, pick: Pick = {}) {
      open(team, pick);
    },
    open() {
      fresh = true;
      key = '';
    },
    reset() {
      if (shown) {
        shown.tween?.();
        shown.node.remove();
      }
      shown = null;
      choose(null);
    },
    back(): boolean {
      if (!shown) return false;
      if (shown.enlarged !== null) {
        shrink();
        return true;
      }
      away(shown, 'swap-away');
      shown = null;
      choose(null);
      return true;
    },
  };
}

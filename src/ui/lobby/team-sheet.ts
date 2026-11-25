import type { CardView } from '../../career/views/card.ts';
import type {
  SheetCard,
  SheetSeat,
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
import { MOTION, SIZE, SPACE, TYPE } from '../base/house.ts';
import { INK, figure, glyph, svgNode } from '../base/ink.ts';
import { ROLE, STAT, least } from '../base/lexicon.ts';
import { laurel } from '../base/marks.ts';
import { LEVELS, rangeBar } from '../base/rangebar.ts';
import { sheet } from '../base/sheet.ts';
import { placed } from '../base/ui.ts';
import { fitted, label, word } from '../base/word.ts';
import { actionRow, bindActs, resolving, type Acting } from './candidate.ts';
import type { LobbyPort } from './port.ts';

const PAD = SPACE.pad - 2;
const GAP = SPACE.gap;
export const TEAM_SHEET = { w: 648 - 352 - GAP, h: 360 } as const;
const SIDE = TEAM_SHEET;
const CLOSE = { x: SIDE.w - 6, y: 6, room: 2 * SIZE.close - 8 } as const;

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

function header(v: TeamSheetView, closable: boolean) {
  const cy = PAD + HEAD.h / 2,
    wreathX = SIDE.w - PAD - HEAD.wreath - 4 - (closable ? CLOSE.room : 0),
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

export type Pick = { person?: number; seat?: SheetSeat };

const picked = (v: TeamSheetView, pick: Pick) => {
  const i = v.cards.findIndex((c) =>
    pick.person !== undefined
      ? c.card?.person === pick.person
      : c.seat === pick.seat
  );
  return i < 0 || !enlargeable(v.cards[i]) ? null : i;
};

type Shown = {
  view: TeamSheetView;
  node: HTMLElement;
  under: HTMLElement[];
  smalls: HTMLElement[];
  large: HTMLElement;
  enlarged: number | null;
  tween: (() => void) | null;
};

export type TeamSheet = ReturnType<typeof createTeamSheet>;

export function createTeamSheet(
  port: LobbyPort,
  host: HTMLElement,
  o: { closable?: boolean } = {}
) {
  let shown: Shown | null = null;
  const closable = o.closable ?? false;
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
    const node = placed(host, 0, 0, SIDE.w, SIDE.h);
    node.append(
      svgNode(
        SIDE.w,
        SIDE.h,
        sheet(0, 0, SIDE.w, SIDE.h, {
          seed: 41 + v.team,
          ...(closable ? { close: 'sheet-close' } : {}),
        }) + header(v, closable)
      )
    );
    pressable(
      node.querySelector<SVGElement>('#sheet-close'),
      () => port.close(),
      'close'
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

  function open(v: TeamSheetView, pick: Pick) {
    if (shown?.view.team === v.team) {
      const i = picked(v, pick);
      if (i !== null && shown.enlarged !== i) enlarge(i);
      return;
    }
    if (shown) away(shown, 'swap-out');
    const s = build(v);
    s.node.classList.add('swap-in');
    if (shown) s.node.style.setProperty('--d', `${MOTION.swap.after}ms`);
    shown = s;
    host.hidden = false;
    const i = picked(v, pick);
    if (i === null) return;
    s.enlarged = i;
    drawLarge(s);
    s.large.hidden = false;
    for (const u of s.under) {
      u.style.opacity = '0';
      u.style.pointerEvents = 'none';
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
    open,
    team: (): number | null => shown?.view.team ?? null,
    update(sheets: (team: number) => TeamSheetView) {
      if (shown) update(sheets(shown.view.team));
    },
    reset() {
      if (shown) {
        shown.tween?.();
        shown.node.remove();
      }
      shown = null;
    },
    back(): boolean {
      if (!shown) return false;
      if (shown.enlarged !== null) {
        shrink();
        return true;
      }
      away(shown, 'swap-away');
      shown = null;
      return true;
    },
  };
}

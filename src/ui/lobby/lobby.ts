import type { LobbyButton, LobbyView } from '../../career/views/lobby.ts';
import { LINES, bubble } from '../base/bubble.ts';
import {
  bound,
  closeButton,
  dot,
  ribbon,
  roundButton,
} from '../base/button.ts';
import { gullHead } from '../base/gull.ts';
import { FAINT, MOTION, SIZE, SPACE, TYPE } from '../base/house.ts';
import { INK, figure, galleon, glyph, slip, svgNode } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import { laurel } from '../base/marks.ts';
import { rise } from '../base/sheet.ts';
import { boxOf, onResize, piece, screen } from '../base/ui.ts';
import { label, measured, word, type Word } from '../base/word.ts';
import { createOrb } from './orb.ts';
import type { LobbyPort, ScreenName } from './port.ts';
import { grouped } from '../base/grouped.ts';

const NEXT = { orb: 30, h: 82, text: 82 } as const;
const BUTTON = { r: SIZE.disc, step: 74, word: 13 } as const;
const SAIL = { w: 232, h: 96, ship: 58 } as const;
const STARS = 5;

const r2 = (n: number) => Math.round(n * 100) / 100;

const BUTTONS: Record<
  LobbyButton,
  { word: Word; screen: ScreenName; mark: (x: number, y: number) => string }
> = {
  ship: {
    word: 'Ship',
    screen: 'ship',
    mark: (x, y) => glyph('ship', x, y - 1, 32),
  },
  team: {
    word: 'Team',
    screen: 'team',
    mark: (x, y) =>
      `<g transform="translate(${x - 19} ${y - 20})">${gullHead(38)}</g>`,
  },
  sponsors: {
    word: 'Sponsors',
    screen: 'sponsors',
    mark: (x, y) => glyph('pennant', x + 1, y, 30),
  },
  opponents: {
    word: 'Opponents',
    screen: 'opponents',
    mark: (x, y) => glyph('table', x, y, 30),
  },
};

const figureWidth = (s: string, size: number) =>
  measured(s, size, { italic: true, weight: 600 });

function ratingRow(x: number, y: number, mark: string, rating: number) {
  const size = least('star'),
    step = size * 0.98;
  let s = mark;
  for (let i = 0; i < STARS; i++)
    s += glyph('star', x + i * step, y, size, {
      opacity: i < rating ? 1 : FAINT * 0.6,
    });
  return s;
}

function nextSlip(view: LobbyView) {
  const name = view.next.planet,
    nameSize = TYPE.name + 1;
  const mark = least('heal'),
    star = least('star'),
    stars = NEXT.text + mark + SPACE.gap + star / 2;
  const textW = Math.max(
    measured(name, nameSize, { weight: 600 }),
    mark + SPACE.gap + (STARS - 1) * star * 0.98 + star
  );
  const w = Math.ceil(NEXT.text + textW + SPACE.pad),
    h = NEXT.h,
    oy = 4;
  const gx = NEXT.text + mark / 2,
    rows = [oy + 44, oy + 66];
  const svg =
    `<g id="next">${slip(1, oy, w, h)}` +
    `<circle id="orb" cx="${SPACE.pad + NEXT.orb}" cy="${oy + h / 2}" r="${NEXT.orb}" fill="${INK.white}" stroke="none"/>` +
    `<circle cx="${SPACE.pad + NEXT.orb}" cy="${oy + h / 2}" r="${NEXT.orb + 1.2}" fill="none" stroke="${INK.iron}" stroke-width="1.6"/>` +
    `<circle cx="${SPACE.pad + NEXT.orb}" cy="${oy + h / 2}" r="${NEXT.orb + 3.6}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".6"/>` +
    label(NEXT.text, oy + 20, name, nameSize, { anchor: 'start' }) +
    ratingRow(
      stars,
      rows[0],
      glyph('storm', gx, rows[0], mark),
      view.next.storm
    ) +
    ratingRow(
      stars,
      rows[1],
      glyph('heal', gx, rows[1], mark),
      view.next.heals
    ) +
    '</g>';
  return { svg, w: w + 4, h: h + oy + 6 };
}

type Slip = { svg: string; w: number };

function moneySlip(view: LobbyView, shown: number): Slip {
  const debt = view.money.interest !== null,
    text = grouped(shown),
    size = TYPE.figure;
  const coin = least('coin') + 4;
  const w = Math.ceil(
    SPACE.pad + coin + 6 + Math.max(figureWidth(text, size), 40) + SPACE.pad
  );
  const h = debt ? 56 : SIZE.slip,
    ink = shown < 0 ? INK.rubric : INK.iron;
  const line = SIZE.slip / 2;
  return {
    w,
    svg:
      slip(0, 0, w, h) +
      glyph('coin', SPACE.pad + coin / 2, line, coin) +
      figure(w - SPACE.pad, line, text, size, {
        anchor: 'end',
        weight: 600,
        fill: ink,
      }).replace('<text ', '<text id="balance" ') +
      (debt
        ? `<path d="M${SPACE.pad} ${line + 15}H${w - SPACE.pad}" stroke="${INK.rubric}" stroke-width=".6" opacity=".5"/>` +
          glyph(
            'hourglass',
            SPACE.pad + coin / 2,
            line + 25,
            least('hourglass'),
            { opacity: 0.8 }
          ) +
          figure(
            w - SPACE.pad,
            line + 25,
            grouped(-(view.money.interest ?? 0)),
            TYPE.name,
            { anchor: 'end', weight: 600, fill: INK.rubric }
          )
        : ''),
  };
}

function standingSlip(view: LobbyView): Slip {
  const { place, moved } = view.standing,
    wreath = 14.5,
    up = moved > 0;
  const cx = SPACE.pad + wreath,
    line = SIZE.slip / 2,
    reach = cx + wreath * 1.2;
  const places = moved === 0 ? '' : `${Math.abs(moved)}`;
  const arrow = least('arrow'),
    ax = reach + SPACE.hair + arrow / 2;
  const w = Math.ceil(
    moved === 0
      ? reach + SPACE.pad - 2
      : ax + arrow / 2 + 1 + figureWidth(places, TYPE.name + 2) + SPACE.pad
  );
  return {
    w,
    svg:
      slip(0, 0, w, SIZE.slip) +
      laurel(cx, line + 1, wreath) +
      figure(cx, line + 0.5, place, place >= 10 ? 15 : 17, { weight: 700 }) +
      (moved === 0
        ? ''
        : `<g transform="rotate(${up ? -90 : 90} ${r2(ax)} ${line})">${glyph('arrow', ax, line, arrow, { ink: up ? undefined : 'rubric' })}</g>` +
          figure(ax + arrow / 2 + 1, line, places, TYPE.name + 2, {
            anchor: 'start',
            weight: 600,
            fill: up ? INK.iron : INK.rubric,
          })),
  };
}

function raceSlip(view: LobbyView): Slip {
  const line = SIZE.slip / 2,
    g = least('flag');
  if (view.race === null) {
    const w = SPACE.pad * 2 + g + 2;
    return {
      w,
      svg: slip(0, 0, w, SIZE.slip) + glyph('winter', w / 2, line, g + 2),
    };
  }
  const text = `${view.race.race}/${view.race.of}`;
  const w = Math.ceil(
    SPACE.pad + g + 4 + figureWidth(text, TYPE.figure) + SPACE.pad
  );
  return {
    w,
    svg:
      slip(0, 0, w, SIZE.slip) +
      glyph('flag', SPACE.pad + g / 2, line, g) +
      figure(w - SPACE.pad, line, text, TYPE.figure, {
        anchor: 'end',
        weight: 600,
      }),
  };
}

export function createLobby(port: LobbyPort) {
  const el = screen();
  const next = piece(el, 'top left', false, true),
    corner = piece(el, 'top right', false, true),
    buttons = piece(el, 'bottom left', false, true),
    sail = piece(el, 'bottom right', false, true);
  const orb = createOrb();
  orb.el.classList.remove('press');
  orb.el.style.pointerEvents = 'none';
  el.append(orb.el);

  let view: LobbyView | null = null,
    covered = false,
    shown = 0,
    tween = 0;

  const placeOrb = () => {
    const disc = next.querySelector('#orb');
    if (!disc || next.hidden) return;
    const b = boxOf(disc),
      host = boxOf(el);
    orb.place(b.left - host.left, b.top - host.top, b.width);
  };
  onResize(() => requestAnimationFrame(placeOrb));

  function drawNext(v: LobbyView) {
    const n = nextSlip(v);
    const svg = svgNode(n.w, n.h, n.svg);
    next.replaceChildren(svg);
    bound(svg, 'next', () => port.open('planet'), 'next');
    requestAnimationFrame(placeOrb);
    orb.show(port.chart(), port.chart() === null);
  }

  function drawCorner(v: LobbyView) {
    const slips = [moneySlip(v, shown), standingSlip(v), raceSlip(v)];
    const gap = SPACE.gap,
      disc = SIZE.disc - 2;
    const w = slips.reduce((a, s) => a + s.w + gap, 0) + disc * 2 + 4;
    let x = 0,
      s = '';
    const ids = ['money', 'standing', 'race'];
    slips.forEach((one, i) => {
      s += `<g id="${ids[i]}" transform="translate(${r2(x)} ${(disc * 2 - SIZE.slip) / 2})">${one.svg}</g>`;
      x += one.w + gap;
    });
    const cx = w - disc - 2,
      cy = disc;
    s += covered
      ? `<g id="close" class="pop">${closeButton(cx, cy, disc)}</g>`
      : `<g id="settings">${roundButton(cx, cy, disc, glyph('wheel', cx, cy, 30))}</g>`;
    const svg = svgNode(w, disc * 2 + 24, s);
    corner.replaceChildren(svg);
    if (v.standing.opens)
      bound(svg, 'standing', () => port.open('opponents'), 'standing');
    if (covered) bound(svg, 'close', () => port.close(), 'close');
    else bound(svg, 'settings', () => port.open('settings'), 'settings');
  }

  function drawButtons(v: LobbyView) {
    const r = BUTTON.r,
      top = 26;
    let s = '';
    let target: number | null = null;
    v.buttons.forEach((b, i) => {
      const cx = r + 4 + i * BUTTON.step,
        cy = top + r;
      const look = BUTTONS[b.id];
      s +=
        `<g id="b-${b.id}">` +
        roundButton(cx, cy, r, look.mark(cx, cy)) +
        word(cx, cy + r + BUTTON.word, look.word, TYPE.word, {
          weight: 600,
          halo: 'rgba(247,238,219,.92)',
        }) +
        (b.dot ? dot(cx + r * 0.74, cy - r * 0.74) : '') +
        '</g>';
      if (v.bubble === b.id) target = cx;
    });
    const w = BUTTON.step * 4,
      h = top + 2 * r + BUTTON.word + 14;
    let speech = '';
    if (v.bubble !== null && target !== null) {
      const line = LINES[v.bubble] ?? '',
        wide = bubble(line, 0.5).w;
      const b = bubble(line, Math.min(0.85, Math.max(0.08, target / wide)));
      const dx = target - b.tip[0],
        dy = top - 2 - b.tip[1];
      speech = `<g id="bubble"><g transform="translate(${r2(dx)} ${r2(dy)})">${b.svg}</g></g>`;
    }
    const svg = svgNode(w, h, s + speech);
    buttons.replaceChildren(svg);
    buttons.style.width = `${w}px`;
    for (const b of v.buttons)
      bound(svg, `b-${b.id}`, () => port.open(BUTTONS[b.id].screen), b.id);
    const said = v.bubble;
    if (said !== null)
      bound(
        svg,
        'bubble',
        () => {
          svg.querySelector('#bubble')?.classList.add('folding');
          window.setTimeout(
            () => port.send({ type: 'MarkSeen', team: 0, id: said }),
            MOTION.uncle.fold + MOTION.uncle.away
          );
        },
        'bubble'
      );
  }

  function drawSail(v: LobbyView) {
    const { w, h } = SAIL,
      ship = SAIL.ship,
      said = measured('SAIL', TYPE.ribbon, { weight: 700, spacing: 0.16 }),
      x0 = w / 2 - (ship + SPACE.hair + said) / 2 - 3;
    const s =
      `<g id="sail">` +
      ribbon(
        w / 2,
        h / 2,
        w - 10,
        galleon(x0 + ship / 2, h / 2 - 3, ship, { waves: true }) +
          word(x0 + ship + SPACE.hair, h / 2 + 1, 'SAIL', TYPE.ribbon, {
            anchor: 'start',
            weight: 700,
            spacing: 0.16,
          }),
        true
      ) +
      '</g>';
    const svg = svgNode(w, h, s);
    sail.replaceChildren(svg);
    bound(svg, 'sail', () => {
      for (const order of v.sail) port.send(order);
    });
  }

  function count(to: number) {
    cancelAnimationFrame(tween);
    const from = shown,
      start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / MOTION.number.ms),
        k = 1 - (1 - t) ** 3;
      shown = Math.round(from + (to - from) * k);
      const text = corner.querySelector('#balance');
      if (text) text.textContent = grouped(shown);
      if (t < 1) tween = requestAnimationFrame(step);
      else if (view) drawCorner(view);
    };
    tween = requestAnimationFrame(step);
  }

  function layout() {
    if (!view) return;
    rise(next, !covered);
    rise(buttons, !covered);
    rise(sail, !covered);
    orb.el.style.visibility = covered ? 'hidden' : '';
  }

  return {
    el,
    show(v: LobbyView) {
      const first = view === null;
      const before = view?.money.balance ?? v.money.balance;
      view = v;
      if (first) shown = v.money.balance;
      drawNext(v);
      drawCorner(v);
      drawButtons(v);
      drawSail(v);
      if (!first && before !== v.money.balance) count(v.money.balance);
      layout();
      el.hidden = false;
    },
    cover(on: boolean) {
      if (on === covered) return;
      covered = on;
      if (view) drawCorner(view);
      layout();
    },
  };
}

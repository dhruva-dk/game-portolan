import { pressable, roundButton, twoTap } from '../base/button.ts';
import { MOTION, TYPE } from '../base/house.ts';
import {
  DUSK,
  GILT,
  INK,
  alpha,
  glyph,
  paperDisc,
  svgNode,
} from '../base/ink.ts';
import { createSettingsSheet, type SettingsPort } from '../base/settings.ts';
import { rise, sheet } from '../base/sheet.ts';
import { piece, screen } from '../base/ui.ts';
import { word, type Word } from '../base/word.ts';

export const PAUSE = { w: 312, h: 156, r: 29, cy: 66, words: 118 } as const;

export type Paused = 'playing' | 'paused' | 'settings';

const SPOTS = [62, 156, 250] as const;

function button(id: string, cx: number, mark: string, said: Word) {
  return (
    `<g id="${id}">${roundButton(cx, PAUSE.cy, PAUSE.r, mark)}` +
    word(cx, PAUSE.words, said, TYPE.word + 2, { weight: 600 }) +
    '</g>'
  );
}

function forfeitFace(cx: number) {
  const { cy, r, words } = PAUSE;
  return (
    `<g id="forfeit" class="two">` +
    `<g class="unsure">${roundButton(cx, cy, r, glyph('flag', cx, cy, 30))}` +
    word(cx, words, 'Forfeit', TYPE.word + 2, { weight: 600 }) +
    '</g>' +
    `<g class="sure">${paperDisc(cx, cy, r, INK.rubric)}` +
    `<circle cx="${cx}" cy="${cy}" r="${r - 3.2}" fill="${GILT}"/>` +
    glyph('tick', cx, cy, 28) +
    word(cx, words, 'Confirm?', TYPE.word + 2, { weight: 600 }) +
    '</g></g>'
  );
}

function centered(parent: HTMLElement, w: number, h: number) {
  const el = piece(parent, 'center', false, true);
  el.style.top = '50%';
  el.style.translate = '-50% -50%';
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.hidden = true;
  return el;
}

export function createPause(
  port: SettingsPort,
  act: { resume(): void; forfeit(): void }
) {
  const el = screen(true);
  const dim = document.createElement('div');
  dim.style.cssText =
    `position:absolute;inset:0;background:${alpha(DUSK, MOTION.paused.dim)};` +
    `opacity:0;transition:opacity ${MOTION.paused.ms}ms ease`;
  el.append(dim);

  const card = centered(el, PAUSE.w, PAUSE.h);
  const art = svgNode(
    PAUSE.w,
    PAUSE.h,
    sheet(0, 0, PAUSE.w, PAUSE.h, { seed: 43 }) +
      button(
        'resume',
        SPOTS[0],
        glyph('arrow', SPOTS[0], PAUSE.cy, 28),
        'Resume'
      ) +
      button(
        'settings',
        SPOTS[1],
        glyph('wheel', SPOTS[1], PAUSE.cy, 30),
        'Settings'
      ) +
      forfeitFace(SPOTS[2])
  );
  card.append(art);

  const settings = createSettingsSheet(port, undefined, () => back());
  const sheetPiece = centered(el, settings.w, settings.h);
  sheetPiece.append(settings.el);

  let state: Paused = 'playing',
    timer = 0;

  const forfeit = art.querySelector<SVGElement>('#forfeit');
  const disarm = () => forfeit?.classList.remove('armed');

  function open() {
    if (state !== 'playing') return;
    state = 'paused';
    window.clearTimeout(timer);
    disarm();
    el.hidden = false;
    void dim.offsetWidth;
    dim.style.opacity = '1';
    rise(sheetPiece, false, true);
    rise(card, true);
  }
  function close(then: () => void) {
    if (state === 'playing') return;
    state = 'playing';
    disarm();
    rise(card, false);
    rise(sheetPiece, false);
    dim.style.opacity = '0';
    window.clearTimeout(timer);
    timer = window.setTimeout(
      () => {
        el.hidden = true;
      },
      Math.max(MOTION.paused.ms, MOTION.sheet.leave)
    );
    then();
  }
  function back() {
    if (state !== 'settings') return;
    state = 'paused';
    rise(sheetPiece, false);
    rise(card, true);
  }

  pressable(
    art.querySelector<SVGElement>('#resume'),
    () => close(() => act.resume()),
    'resume'
  );
  pressable(
    art.querySelector<SVGElement>('#settings'),
    () => {
      if (state !== 'paused') return;
      state = 'settings';
      disarm();
      settings.show();
      rise(card, false);
      rise(sheetPiece, true);
    },
    'settings'
  );
  twoTap(forfeit, () => close(() => act.forfeit()), 'forfeit');

  return {
    get state() {
      return state;
    },
    open,
    resume: () => close(() => act.resume()),
  };
}

export type Pause = ReturnType<typeof createPause>;

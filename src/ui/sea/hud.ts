import {
  GUST_NOTCH,
  HEAL_SLOTS,
  type GunKind,
  type Kit,
  type Status,
} from '../../play/player.ts';
import type { Sea } from '../../render/snapshot.ts';
import { clock } from '../base/clock.ts';
import { clamp, lerp } from '../../world/scalar.ts';
import type { Shores } from '../base/coasts.ts';
import { createChanged } from '../base/drawn.ts';
import { stormMark, type Glyph } from '../base/glyphs.ts';
import {
  DUSK,
  INK,
  WASH,
  alpha,
  figure,
  glyph,
  paperDisc,
  ring as sweep,
  slip,
  svg,
} from '../base/ink.ts';
import { createJuice } from './juice.ts';
import { createMinimap, type More } from './minimap.ts';
import { onHold, onTap } from '../base/touch.ts';
import { piece, show, view } from '../base/ui.ts';
import {
  FIRE,
  GUST,
  THUMB,
  gustButton,
  healSlot,
  healTapped,
  meterFill,
  slotBox,
  slotsWidth,
  SLOT,
  useFill,
  type Corner,
} from './controls.ts';
import { createVitals } from './vitals.ts';

export type HudState = Status & Kit;

interface HudActions {
  heal(slot: number): void;
  gust(): void;
  map(): void;
  fire(down: boolean): void;
}

const mark = (k: GunKind): Glyph => `weapon.${k}`;
const MINIMAP = 198;
const RETICLE = 10,
  LOCKED = 0.75,
  FALL = 4,
  SPREAD = 48;
const RIM = [0.35, 1] as const,
  RIM_DEEP = 80;
const FADE = 0.25;

export function createHud(layer: HTMLElement, shores: Shores, act: HudActions) {
  const root = document.createElement('div');
  root.className = 'screen';
  root.hidden = true;
  layer.appendChild(root);
  const body = document.createElement('div');
  body.className = 'screen';
  root.appendChild(body);

  const vitals = piece(body, 'top left', false, true);
  const face = document.createElement('div');
  vitals.appendChild(face);
  const drawVitals = createVitals(face);
  const readings = piece(body, 'top center', false, true);
  const map = piece(body, 'top right', true, true);
  const thumb = piece(body, 'right bottom', false, true);
  const corner = (c: Corner) =>
    `right:${c.right}px;bottom:${c.bottom}px;width:${c.width}px;height:${c.height}px`;
  thumb.style.width = `${THUMB.width}px`;
  thumb.style.height = `${THUMB.height}px`;
  const gust = piece(thumb, '', true);
  gust.style.cssText = corner(THUMB.gust);
  const fire = piece(thumb, '', true);
  fire.style.cssText = corner(THUMB.fire);
  const reticle = piece(body, 'mark');
  reticle.style.cssText = 'left:50%;top:50%';
  const fall = piece(body, 'mark');
  const rim = document.createElement('div');
  rim.style.cssText =
    'position:absolute;inset:0;pointer-events:none;opacity:0;' +
    `box-shadow:inset 0 0 calc(80px * var(--k)) calc(18px * var(--k)) ${alpha(DUSK, 0.6)}`;
  body.prepend(rim);
  onHold(fire, act.fire);
  const hotbar = piece(body, 'bottom center', false, true);

  const drawMap = createMinimap(map, MINIMAP, shores);
  onTap(map, () => act.map());
  onTap(gust, () => act.gust());

  let heals: HudState['heals'] = [];
  const slots = Array.from({ length: HEAL_SLOTS }, (_, i) => {
    const el = document.createElement('div'),
      box = slotBox(i);
    el.className = 'press';
    el.style.cssText = `position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px`;
    hotbar.appendChild(el);
    onTap(el, () => {
      const slot = healTapped(heals, i);
      if (slot !== null) act.heal(slot);
    });
    return el;
  });
  hotbar.style.width = `${slotsWidth(HEAL_SLOTS)}px`;
  hotbar.style.height = `${SLOT}px`;
  const juice = createJuice(body, { vitals: face, fire, gust, slots });

  const changed = createChanged<HTMLElement>();
  let strength = -1,
    wash = -1,
    fallX = NaN,
    fallY = NaN;
  const more: More = {};

  let watching = false;
  const aboard = [vitals, thumb, reticle, fall, hotbar, rim];

  return {
    root,
    watch(on: boolean) {
      watching = on;
      for (const el of aboard) show(el, !on);
      map.classList.toggle('press', !on);
    },
    update(s: HudState, sea?: Sea, own?: number | null, covered = false) {
      const shown = clamp(1 - s.arriving / FADE),
        now = Math.round(shown * 100);
      if (now !== strength) {
        strength = now;
        body.style.opacity = (now / 100).toFixed(2);
      }
      show(body, now > 0 && !covered);
      drawVitals.update(s);

      const closing = s.closing || s.storm < 30;
      if (changed(readings, Math.ceil(s.storm), s.afloat, closing, s.closing)) {
        const time = clock(s.storm);
        readings.innerHTML = svg(
          184,
          38,
          slip(1, 2, 88, 34) +
            glyph(stormMark(s.closing), 20, 19, 24, {
              ink: closing ? 'storm' : 'iron',
            }) +
            figure(60, 19, time, 23, { fill: closing ? INK.storm : INK.iron }) +
            slip(95, 2, 88, 34) +
            glyph('ship', 116, 19, 22) +
            figure(154, 19, s.afloat, 23)
        );
      }

      const ready = s.blowing || s.gust >= GUST_NOTCH;
      if (changed(gust, meterFill(s.gust), s.blowing, ready))
        gust.innerHTML = svg(
          2 * GUST.r,
          2 * GUST.r,
          gustButton(s.gust, GUST_NOTCH, s.blowing)
        );

      const g = s.gun,
        c = FIRE + 2,
        step = (v: number) => Math.floor(clamp(v) * 48);
      const loaded = g ? step(g.ready) : -1,
        wound = g && g.charge !== null ? step(g.charge) : -1;
      if (changed(fire, g?.kind, g?.rounds, loaded, wound)) {
        fire.innerHTML = svg(
          2 * c,
          2 * c,
          `<g opacity="${g ? 1 : 0.5}">${paperDisc(c, c, FIRE - 2)}` +
            glyph(
              g ? mark(g.kind) : 'weapon.cannon',
              c,
              g ? c - 5 : c,
              (g ? 1 : 1.2) * FIRE,
              { ink: g ? 'iron' : 'sepia' }
            ) +
            (g
              ? figure(c, c + FIRE - 15, g.rounds, 15, {
                  fill: g.rounds > 0 ? INK.iron : INK.rubric,
                })
              : '') +
            (!g
              ? `<path d="M${c - 24} ${c + 24}L${c + 24} ${c - 24}" stroke="${INK.rubric}" stroke-width="3" stroke-linecap="round"/>`
              : '') +
            (loaded >= 0 && loaded < 48
              ? sweep(c, c, FIRE - 1, loaded / 48, INK.rubric, 3.5)
              : '') +
            (wound >= 0
              ? sweep(c, c, FIRE - 1, wound / 48, WASH.gold, 4.5)
              : '') +
            '</g>'
        );
      }

      const k = view.k,
        lock =
          g && s.reticle
            ? g.locked
              ? 'locked'
              : s.reticle.reach
                ? 'free'
                : 'short'
            : 'none';
      const spread = s.reticle
        ? Math.round(Math.min(SPREAD, s.reticle.spread / k))
        : 0;
      const winding = lock !== 'none' && wound >= 0,
        reloading = lock !== 'none' && !winding && loaded >= 0 && loaded < 48;
      const twelfths = winding ? wound >> 2 : reloading ? loaded >> 2 : -1;
      if (changed(reticle, lock, spread, winding, twelfths)) {
        let html = '';
        if (lock !== 'none') {
          const out = Math.max(RETICLE, spread),
            h = out + 7,
            r = lock === 'locked' ? out * LOCKED : out,
            gap = Math.max(r * 0.32, r - RETICLE * 0.7);
          const arms = `M${h - r} ${h}H${h - gap}M${h + gap} ${h}H${h + r}M${h} ${h - r}V${h - gap}M${h} ${h + gap}V${h + r}`;
          const run =
            twelfths >= 0
              ? sweep(
                  h,
                  h,
                  Math.min(r, RETICLE) * 0.5 + 2,
                  twelfths / 12,
                  winding ? WASH.gold : INK.rubric,
                  2.2
                )
              : '';
          html = svg(
            2 * h,
            2 * h,
            `<g opacity="${lock === 'short' ? 0.45 : 1}"><path d="${arms}" stroke="${INK.iron}" stroke-width="2.6" opacity=".6" transform="translate(.6 .8)"/>` +
              `<path d="${arms}" stroke="${lock === 'locked' ? INK.gold : INK.white}" stroke-width="1.6" opacity=".92"/>${run}</g>`
          );
        }
        reticle.innerHTML = html;
      }
      const f = s.reticle?.fall,
        lob = !!s.reticle?.lob;
      const away = f
        ? lob ||
          Math.hypot(f.x - view.w / 2, f.y - view.h / 2) > RETICLE * 1.5 * k
        : false;
      const ring = !!f && away && lock !== 'none' && !watching;
      show(fall, ring);
      if (
        f &&
        ring &&
        (Math.round(f.x * 10) !== fallX || Math.round(f.y * 10) !== fallY)
      ) {
        fallX = Math.round(f.x * 10);
        fallY = Math.round(f.y * 10);
        fall.style.left = `${(fallX / 10).toFixed(1)}px`;
        fall.style.top = `${(fallY / 10).toFixed(1)}px`;
      }
      if (ring && changed(fall, lock, lob)) {
        const r = lob ? 3 * FALL : FALL,
          h = r + 3,
          ink = lock === 'locked' ? INK.gold : lob ? WASH.gold : INK.white;
        const cross = lob
          ? `<path d="M${h - r / 2} ${h}H${h + r / 2}M${h} ${h - r / 2}V${h + r / 2}" stroke="${ink}" stroke-width="1.4"/>`
          : '';
        fall.innerHTML = svg(
          2 * h,
          2 * h,
          `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${INK.iron}" stroke-width="2.4" opacity=".6" transform="translate(.6 .8)"/>` +
            `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${ink}" stroke-width="1.4" opacity=".92"${lob ? ' stroke-dasharray="3 2"' : ''}/>${cross}`
        );
      }

      heals = s.heals;
      for (let i = 0; i < HEAL_SLOTS; i++) {
        const heal = s.heals[i] ?? null,
          done = s.using?.slot === i ? useFill(s.using.done) : null;
        if (changed(slots[i], heal, done))
          slots[i].innerHTML = svg(SLOT, SLOT, healSlot(heal, done));
      }

      juice.update(s, !watching && s.arriving <= 0);

      const deep =
        s.outside > 0 && !watching
          ? Math.round(
              lerp(RIM[0], RIM[1], Math.min(1, s.outside / RIM_DEEP)) * 100
            )
          : 0;
      if (deep !== wash) {
        wash = deep;
        rim.style.opacity = (deep / 100).toFixed(2);
      }

      more.gilt = watching;
      more.calm = s.eye;
      more.next = s.next;
      more.sea = sea;
      more.own = own;
      drawMap(s.at, s.heading, more);
    },
  };
}

export type Hud = ReturnType<typeof createHud>;

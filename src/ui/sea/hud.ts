import { fireDrag } from './aim.ts';
import {
  GUST_NOTCH,
  HEAL_SLOTS,
  type GunKind,
  type Kit,
  type Status,
} from '../../play/player.ts';
import type { Sea } from '../../render/snapshot.ts';
import { clamp, lerp } from '../../world/scalar.ts';
import type { Shores } from '../base/coasts.ts';
import { createChanged } from '../base/drawn.ts';
import type { Glyph } from '../base/glyphs.ts';
import {
  DUSK,
  INK,
  WASH,
  alpha,
  figure,
  glyph,
  paperDisc,
  ring as sweep,
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
  glints,
  gustButton,
  gustReady,
  healSlot,
  healTapped,
  meterFill,
  meterRing,
  setRing,
  slotBox,
  slotsWidth,
  SLOT,
  useFill,
  type Corner,
} from './controls.ts';
import { createReadings } from './readings.ts';
import { VITALS, createVitals } from './vitals.ts';

export type HudState = Status & Kit;

interface HudActions {
  heal(slot: number): void;
  gust(): void;
  map(): void;
  fire(down: boolean): void;
  aim(dx: number, dy: number, held: boolean): void;
  pause(): void;
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
  readings.style.left = `calc(50% + ${(VITALS.w - MINIMAP) / 2}px * var(--k))`;
  const drawReadings = createReadings(
    readings,
    { portrait: null },
    { pause: () => act.pause() }
  );
  const map = piece(body, 'top right', true, true);
  const thumb = piece(body, 'right bottom', false, true);
  const corner = (c: Corner, left: boolean) =>
    `${left ? 'left' : 'right'}:${c.right}px;bottom:${c.bottom}px;width:${c.width}px;height:${c.height}px`;
  thumb.style.width = `${THUMB.width}px`;
  thumb.style.height = `${THUMB.height}px`;
  const gust = piece(thumb, '', true);
  const fire = piece(thumb, '', true);
  const hand = (left: boolean) => {
    thumb.classList.toggle('left', left);
    thumb.classList.toggle('right', !left);
    thumb.style.transformOrigin = `${left ? '0' : '100%'} 100%`;
    gust.style.cssText = corner(THUMB.gust, left);
    fire.style.cssText = corner(THUMB.fire, left);
  };
  hand(false);
  const reticle = piece(body, 'mark');
  reticle.style.cssText = 'left:50%;top:50%';
  const fall = piece(body, 'mark');
  const rim = document.createElement('div');
  rim.style.cssText =
    'position:absolute;inset:0;pointer-events:none;opacity:0;' +
    `box-shadow:inset 0 0 calc(80px * var(--k)) calc(18px * var(--k)) ${alpha(DUSK, 0.6)}`;
  body.prepend(rim);
  onHold(fire, act.fire);
  fire.setAttribute('data-tap', 'fire');
  const drag = fireDrag();
  fire.addEventListener('pointerdown', (e) => drag.down(e.clientX, e.clientY));
  fire.addEventListener('pointermove', (e) => {
    const d = drag.move(e.clientX, e.clientY);
    if (d) act.aim(d[0], d[1], true);
  });
  for (const lift of [
    'pointerup',
    'pointercancel',
    'lostpointercapture',
  ] as const)
    fire.addEventListener(lift, () => {
      drag.up();
      act.aim(0, 0, false);
    });
  const hotbar = piece(body, 'bottom center', false, true);

  const drawMap = createMinimap(map, MINIMAP, shores);
  onTap(map, () => act.map());
  onTap(gust, () => act.gust());

  let heals: HudState['heals'] = [],
    busy = false;
  const shake = (el: Element) => {
    el.classList.remove('refuse');
    void el.getBoundingClientRect();
    el.classList.add('refuse');
  };
  const slots = Array.from({ length: HEAL_SLOTS }, (_, i) => {
    const el = document.createElement('div'),
      box = slotBox(i);
    el.className = 'press slot';
    el.setAttribute('data-tap', `heal-${i + 1}`);
    el.style.cssText = `position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px`;
    hotbar.appendChild(el);
    onTap(el, () => {
      const slot = healTapped(heals, i, busy);
      if (slot !== null) act.heal(slot);
      else shake(el);
    });
    return el;
  });
  hotbar.insertAdjacentHTML('afterbegin', svg(0, 0, glints()));
  hotbar.style.width = `${slotsWidth(HEAL_SLOTS)}px`;
  hotbar.style.height = `${SLOT}px`;
  gust.classList.add('gust');
  gust.innerHTML = svg(2 * GUST.r, 2 * GUST.r, gustButton(GUST_NOTCH));
  const meter = gust.querySelector('.meter');
  const juice = createJuice(body, { vitals: face, fire, gust, slots });

  const changed = createChanged<HTMLElement>();
  const rings = new Map<HTMLElement, number>();
  const ringTo = (host: HTMLElement, cls: string, fill: number) => {
    const key = host.querySelector(`.${cls}`);
    if (!key) return;
    const was = rings.get(host);
    if (was === fill) return;
    rings.set(host, fill);
    setRing(key, fill);
  };
  let filled = -1,
    blowing: boolean | null = null,
    ready: boolean | null = null,
    reload = -1,
    wind = -1;
  let strength = -1,
    wash = -1,
    fallX = NaN,
    fallY = NaN;
  const more: More = {};

  let watching = false;
  const aboard = [vitals, thumb, reticle, fall, hotbar, rim];

  return {
    root,
    hand,
    wingman: (seed: number | null) => drawReadings.portrait(seed),
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
      drawReadings.update(s);

      const fill = meterFill(s.gust),
        lit = gustReady(s.gust, GUST_NOTCH, s.blowing);
      if (fill !== filled) {
        filled = fill;
        setRing(meter, fill);
      }
      if (s.blowing !== blowing) {
        blowing = s.blowing;
        gust.classList.toggle('blowing', blowing);
      }
      if (lit !== ready) {
        if (lit && ready === false && !s.blowing) juice.wake(gust);
        ready = lit;
        gust.classList.toggle('ready', lit);
      }

      const g = s.gun,
        c = FIRE + 2,
        step = (v: number) => Math.floor(clamp(v) * 48);
      const loaded = g ? step(g.ready) : -1,
        wound = g && g.charge !== null ? step(g.charge) : -1;
      if (changed(fire, g?.kind, g?.rounds)) {
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
            meterRing('reload', c, c, FIRE - 1, INK.rubric, 3.5) +
            meterRing('charge', c, c, FIRE - 1, WASH.gold, 4.5) +
            '</g>'
        );
        reload = wind = -1;
      }
      const spin = loaded >= 0 && loaded < 48 ? loaded : 0,
        coil = wound >= 0 ? wound : 0;
      if (spin !== reload) {
        reload = spin;
        setRing(fire.querySelector('.reload'), spin / 48);
      }
      if (coil !== wind) {
        wind = coil;
        setRing(fire.querySelector('.charge'), coil / 48);
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
      busy = s.using !== null || s.hull >= s.hullMax;
      for (let i = 0; i < HEAL_SLOTS; i++) {
        const heal = s.heals[i] ?? null,
          using = s.using?.slot === i;
        if (changed(slots[i], heal, using)) {
          slots[i].innerHTML = svg(SLOT, SLOT, healSlot(heal, using));
          rings.delete(slots[i]);
        }
        ringTo(slots[i], 'use', using && s.using ? useFill(s.using.done) : 0);
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

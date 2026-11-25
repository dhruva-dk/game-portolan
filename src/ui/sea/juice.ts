import {
  PLAYER_SHIP,
  blowOf,
  felt,
  type Moment,
  type Status,
} from '../../play/player.ts';
import { rankOf } from '../../sim/kinds.ts';
import { clamp } from '../../world/scalar.ts';
import { createFlash, PICKUP, SCREEN } from './flash.ts';
import { createHits } from './hits.ts';
import { LIGHT, glyph, svgNode } from '../base/ink.ts';
import type { Glyph } from '../base/glyphs.ts';
import { boxOf, view } from '../base/ui.ts';
import { MOTION } from '../base/house.ts';
import { INK } from '../base/ink.ts';

interface Parts {
  vitals: HTMLElement;
  fire: HTMLElement;
  gust: HTMLElement;
  slots: readonly HTMLElement[];
}

const FLY = { burst: 0.24, flight: 0.56, scale: [0.35, 1.15, 0.7] } as const;

const FIRED_APART = 180;

const DEALT = {
  broke: { cross: 'break', look: SCREEN.shieldBreak },
  hull: { cross: 'hit', look: SCREEN.hit },
  shield: { cross: 'shield', look: SCREEN.shieldHit },
} as const;

export function createJuice(body: HTMLElement, parts: Parts) {
  const flash = createFlash(body),
    hits = createHits(body);
  let heard = 0,
    then = performance.now(),
    fired = -Infinity,
    using: number | null = null;

  const pop = (el: HTMLElement, k: number, ms = 260) =>
    el.animate(
      [{ scale: '1' }, { scale: String(k), offset: 0.3 }, { scale: '1' }],
      {
        duration: ms,
        easing: 'cubic-bezier(.3,1.6,.5,1)',
        composite: 'replace',
      }
    );
  const jolt = (el: HTMLElement) =>
    el.animate(
      [
        { translate: '0 0' },
        { translate: '-4px 2px', offset: 0.15 },
        { translate: '3px -1px', offset: 0.45 },
        { translate: '-1px 0', offset: 0.75 },
        { translate: '0 0' },
      ],
      { duration: 250, easing: 'cubic-bezier(.2,.7,.3,1)' }
    );

  const kick = (el: HTMLElement) => {
    const { ms, ease, give, back } = MOTION.kick;
    el.animate(
      [
        { scale: '1', translate: '0 0' },
        { scale: String(give), translate: `${back}px ${back}px`, offset: 0.25 },
        { scale: '1', translate: '0 0' },
      ],
      { duration: ms, easing: ease, composite: 'replace' }
    );
  };
  const drop = (slot: HTMLElement) => {
    const { ms, drop: d, glint } = MOTION.pickup;
    slot.animate(
      [
        { translate: `0 ${-d}px`, scale: '1.12' },
        { translate: '0 0', scale: '0.94', offset: 0.45 },
        { translate: `0 ${-d * 0.25}px`, scale: '1.03', offset: 0.7 },
        { translate: '0 0', scale: '1' },
      ],
      { duration: ms, easing: 'ease-out' }
    );
    slot
      .querySelector('.glint')
      ?.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }],
        { duration: glint, delay: ms * 0.3, easing: 'ease-in-out' }
      );
  };
  const puff = (slot: HTMLElement) => {
    const { ms, ease, reach, motes } = MOTION.puff,
      size = 2 * reach + 20,
      c = size / 2;
    const away = Array.from({ length: motes }, (_, i) => {
      const a = (i / motes) * 2 * Math.PI + 0.4;
      return [Math.cos(a) * reach, Math.sin(a) * reach];
    });
    const el = svgNode(
      size,
      size,
      away
        .map(
          (_, i) =>
            `<circle cx="${c}" cy="${c}" r="${4 + (i % 3)}" fill="${INK.white}" stroke="${INK.green}" stroke-width="1.4" style="transform-box:fill-box;transform-origin:center"/>`
        )
        .join('')
    );
    el.style.cssText = `position:absolute;left:50%;top:50%;margin:${-c}px 0 0 ${-c}px;pointer-events:none`;
    slot.appendChild(el);
    let left = motes;
    el.querySelectorAll<SVGCircleElement>('circle').forEach((dot, i) => {
      const [x, y] = away[i];
      dot.animate(
        [
          { transform: 'translate(0px, 0px) scale(.6)', opacity: 0.95 },
          {
            transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(1.3)`,
            opacity: 0,
          },
        ],
        { duration: ms, easing: ease }
      ).onfinish = () => {
        if (--left === 0) el.remove();
      };
    });
  };

  const fly = (
    name: Glyph,
    from: { x: number; y: number } | null,
    slot: HTMLElement
  ) => {
    const there = boxOf(slot),
      home = boxOf(body),
      k = view.k;
    const to = {
      x: there.left - home.left + there.width / 2,
      y: there.top - home.top + there.height / 2,
    };
    const start = from ?? { x: home.width / 2, y: home.height * 0.6 };
    const el = svgNode(44, 44, glyph(name, 22, 22, 34));
    el.style.cssText = 'position:absolute;left:0;top:0;margin:-22px 0 0 -22px';
    body.appendChild(el);
    const at = (p: { x: number; y: number }, s: number) => ({
      transform: `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) scale(${(s * k).toFixed(3)})`,
    });
    const up = { x: start.x, y: start.y - 40 * k },
      all = (FLY.burst + FLY.flight) * 1000;
    const a = el.animate(
      [
        { ...at(start, FLY.scale[0]), opacity: 0 },
        {
          ...at(up, FLY.scale[1]),
          opacity: 1,
          offset: FLY.burst / (FLY.burst + FLY.flight),
        },
        { ...at(to, FLY.scale[2]), opacity: 1 },
      ],
      { duration: all, easing: 'cubic-bezier(.4,0,.6,1)' }
    );
    a.onfinish = () => {
      el.remove();
      drop(slot);
    };
  };

  const answer = (m: Moment) => {
    const { w, h, k } = view,
      middle = { x: w / 2, y: h / 2 },
      above = 18 * k;
    switch (m.kind) {
      case 'fired':
        if (m.ship !== PLAYER_SHIP || then - fired < FIRED_APART) return;
        fired = then;
        flash.flash(SCREEN.fire.flash);
        kick(parts.fire);
        return;
      case 'struck': {
        const points = m.shield + m.hull;
        if (m.by === PLAYER_SHIP && m.ship !== PLAYER_SHIP) {
          const { cross, look: r } = DEALT[blowOf(m)];
          hits.cross(cross, middle.x, middle.y);
          if (m.seen)
            hits.figure(
              m.ship,
              points,
              m.hull <= 0,
              false,
              m.seen.x,
              m.seen.y - above
            );
          flash.flash(r.flash, m.broke ? 1 : felt.dealt(points));
          if ('vignette' in r) flash.vignette(r.vignette);
        } else if (m.ship === PLAYER_SHIP && points > 0) {
          const r = {
            broke: SCREEN.shieldLost,
            hull: SCREEN.hurt,
            shield: null,
          }[blowOf(m)];
          const weight = m.broke ? 1 : felt.taken(points),
            whence = m.whence ?? m.bearing;
          if (m.whence !== null) hits.struck(m.whence, weight);
          if (r) {
            flash.flash(r.flash, weight);
            flash.vignette(r.vignette, weight, whence);
          }
          jolt(parts.vitals);
        }
        return;
      }
      case 'sank':
        if (m.by !== PLAYER_SHIP || m.ship === PLAYER_SHIP) return;
        hits.cross('kill', middle.x, middle.y);
        if (m.seen)
          hits.figure(m.ship, 0.0001, false, true, m.seen.x, m.seen.y - above);
        flash.flash(SCREEN.sink.flash);
        return;
      case 'took': {
        if (m.ship !== PLAYER_SHIP) return;
        const slot = parts.slots[m.slot];
        if (slot) fly('heal', m.seen, slot);
        const r = clamp(rankOf(m.heal) + 1, 0, 4);
        if (PICKUP.flash[r] > 0)
          flash.flash({
            color: LIGHT.white,
            alpha: PICKUP.flash[r],
            decay: PICKUP.decay[r],
          });
        if (PICKUP.vignette[r] > 0)
          flash.vignette({
            color: LIGHT.gold,
            alpha: PICKUP.vignette[r],
            reach: 0.45,
            decay: PICKUP.fades[r],
          });
        return;
      }
      case 'mended': {
        if (m.ship !== PLAYER_SHIP) return;
        flash.flash(SCREEN.repair.flash);
        flash.vignette(SCREEN.repair.vignette);
        pop(parts.vitals, 1.08, 300);
        if (using !== null && parts.slots[using]) puff(parts.slots[using]);
        return;
      }
      case 'gust':
        if (m.ship !== PLAYER_SHIP) return;
        flash.vignette(SCREEN.gust.vignette);
        pop(parts.gust, 1.2, 300);
        return;
      default:
        return;
    }
  };

  return {
    wake(el: HTMLElement) {
      pop(el, MOTION.wake.swell * 1.1, MOTION.wake.ms);
    },
    update(s: Status & { using?: { slot: number } | null }, shown: boolean) {
      const t = performance.now(),
        dt = Math.min(0.1, (t - then) / 1000);
      then = t;
      for (const m of s.moments) {
        if (m.seq <= heard) continue;
        heard = m.seq;
        if (shown) answer(m);
      }
      using = s.using?.slot ?? using;
      if (!shown) hits.clear();
      hits.show(shown);
      flash.update(
        dt,
        s.hullMax > 0 ? s.hull / s.hullMax : 1,
        shown && !s.sunk
      );
    },
  };
}

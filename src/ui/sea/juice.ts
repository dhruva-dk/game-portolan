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
    fired = -Infinity;

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
      pop(slot, 1.25, 320);
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
        pop(parts.fire, 0.86, 220);
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
    update(s: Status, shown: boolean) {
      const t = performance.now(),
        dt = Math.min(0.1, (t - then) / 1000);
      then = t;
      for (const m of s.moments) {
        if (m.seq <= heard) continue;
        heard = m.seq;
        if (shown) answer(m);
      }
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

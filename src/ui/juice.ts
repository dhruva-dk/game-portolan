// The HUD's answer to what happens (player.ts Moment): 0117's juice (app/juice.ts react, its recipes' screen and HUD
// parts), as far as this game has what it answered. Each moment is answered once (by its seq), and only those that
// befall her or that she dealt; the camera's part is the game's (play/shake.ts), the sound's the sound's.
//   her gun fired       a warm flash; the Fire disc knocked in
//   her ball home       the cross round the reticle (hits.ts) and the figure rising off the ship; a flash, the
//                       stronger where it broke a shield
//   a blow on her       the arc toward who dealt it; rubric (or azure, on her shield) at the rim toward it; the vitals
//                       slip shaken
//   her sinking of one  the gold cross and the gold figure
//   took up             the piece's mark flies from where it lay to its slot, which pops; a flash and a rim of
//                       light the rarer it is
//   mended              azure or green at the rim, the vitals popped
//   gust                a pale rim, the Gust disc popped
//   her hull low        the heartbeat at the rim (flash.ts)
// No words; numerals only.

import { HER, type Moment, type Status } from '../player';
import { createFlash, PICKUP, SCREEN } from './flash';
import { createHits } from './hits';
import { glyph, svg } from './ink';
import type { Glyph } from './glyphs';

/** The HUD's pieces it moves: the vitals slip, the Fire and Gust discs, and the hotbar's slots (gun's first). */
export interface Parts { vitals: HTMLElement; fire: HTMLElement; gust: HTMLElement; slots: readonly HTMLElement[] }

/** A piece's flight to its slot (0117's FLY): its burst out, its flight, and its size along the way. */
export const FLY = { burst: 0.24, flight: 0.56, scale: [0.35, 1.15, 0.7] } as const;

/** How strongly a blow of `points` is felt (0117's: dealt, and taken). */
const dealt = (points: number) => Math.min(1.3, 0.6 + points / 40), taken = (points: number) => Math.min(1.3, 0.4 + points / 40);

export function createJuice(body: HTMLElement, parts: Parts) {
  const flash = createFlash(body), hits = createHits(body);
  let heard = 0, then = performance.now();

  /** A piece knocked: scaled to `k` and back on a spring, or shaken side to side. */
  const pop = (el: HTMLElement, k: number, ms = 260) =>
    el.animate([{ scale: '1' }, { scale: String(k), offset: 0.3 }, { scale: '1' }], { duration: ms, easing: 'cubic-bezier(.3,1.6,.5,1)', composite: 'replace' });
  const shake = (el: HTMLElement) =>
    el.animate([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 320, easing: 'ease-out' });

  /** The piece's mark flown from `from` (CSS px) to the slot. */
  const fly = (name: Glyph, from: { x: number; y: number } | null, slot: HTMLElement) => {
    const box = slot.getBoundingClientRect(), home = body.getBoundingClientRect();
    const to = { x: box.left - home.left + box.width / 2, y: box.top - home.top + box.height / 2 };
    const start = from ?? { x: home.width / 2, y: home.height * 0.6 };
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;pointer-events:none`;
    el.innerHTML = svg(44, 44, glyph(name, 22, 22, 34));
    body.appendChild(el);
    const at = (p: { x: number; y: number }, s: number) => ({ transform: `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) scale(${s})` });
    const up = { x: start.x, y: start.y - 40 }, all = (FLY.burst + FLY.flight) * 1000;
    const a = el.animate([
      { ...at(start, FLY.scale[0]), opacity: 0 },
      { ...at(up, FLY.scale[1]), opacity: 1, offset: FLY.burst / (FLY.burst + FLY.flight) },
      { ...at(to, FLY.scale[2]), opacity: 1 },
    ], { duration: all, easing: 'cubic-bezier(.4,0,.6,1)' });
    a.onfinish = () => {
      el.remove();
      pop(slot, 1.25, 320);
    };
  };

  const answer = (m: Moment, w: number, h: number) => {
    const middle = { x: w / 2, y: h / 2 };
    switch (m.kind) {
      case 'fired':
        if (m.ship !== HER) return;
        flash.flash(SCREEN.fire.flash);
        pop(parts.fire, 0.86, 220);
        return;
      case 'struck': {
        const points = m.shield + m.hull;
        if (m.by === HER && m.ship !== HER) {
          hits.cross(m.broke ? 'break' : m.hull > 0 ? 'hit' : 'shield', middle.x, middle.y);
          if (m.seen) hits.figure(m.ship, points, m.hull <= 0, false, m.seen.x, m.seen.y - 18);
          const r = m.broke ? SCREEN.shieldBreak : m.hull > 0 ? SCREEN.hit : SCREEN.shieldHit;
          flash.flash(r.flash, m.broke ? 1 : dealt(points));
          if ('vignette' in r) flash.vignette(r.vignette);
        } else if (m.ship === HER && points > 0) {
          const r = m.broke ? SCREEN.shieldLost : m.hull > 0 ? SCREEN.hurt : null;
          hits.arc(m.bearing, w, h, m.hull <= 0);
          if (r) {
            flash.flash(r.flash, m.broke ? 1 : taken(points));
            flash.vignette(r.vignette, m.broke ? 1 : taken(points), m.bearing);
          }
          shake(parts.vitals);
        }
        return;
      }
      case 'sank':
        if (m.by !== HER || m.ship === HER) return;
        hits.cross('kill', middle.x, middle.y);
        if (m.seen) hits.figure(m.ship, 0.0001, false, true, m.seen.x, m.seen.y - 18);
        flash.flash(SCREEN.sink.flash);
        return;
      case 'took': {
        if (m.ship !== HER) return;
        const slot = parts.slots[m.slot];
        if (slot) fly(m.piece === 'gun' ? 'weapon.cannon' : `item.${m.piece}`, m.seen, slot);
        const r = Math.max(0, Math.min(4, m.rarity));
        if (PICKUP.flash[r] > 0) flash.flash({ colour: '#fff3d0', alpha: PICKUP.flash[r], decay: PICKUP.decay[r] });
        if (PICKUP.vignette[r] > 0) flash.vignette({ colour: '#ffd36a', alpha: PICKUP.vignette[r], reach: 0.45, decay: PICKUP.fades[r] });
        return;
      }
      case 'mended': {
        if (m.ship !== HER) return;
        const r = m.piece === 'smallShield' || m.piece === 'bigShield' ? SCREEN.shield : SCREEN.repair;
        flash.flash(r.flash);
        flash.vignette(r.vignette);
        pop(parts.vitals, 1.08, 300);
        return;
      }
      case 'gust':
        if (m.ship !== HER) return;
        flash.vignette(SCREEN.gust.vignette);
        pop(parts.gust, 1.2, 300);
        return;
      default:
        return;
    }
  };

  return {
    /** Each frame: the match as reported, and whether the HUD shows her own (not watching another, nor the arrival). */
    update(s: Status, shown: boolean) {
      const t = performance.now(), dt = Math.min(0.1, (t - then) / 1000);
      then = t;
      const w = body.clientWidth, h = body.clientHeight;
      for (const m of s.moments) {
        if (m.seq <= heard) continue;
        heard = m.seq;
        if (shown) answer(m, w, h);
      }
      if (!shown) hits.clear();
      flash.update(dt, s.hullMax > 0 ? s.hull / s.hullMax : 1, shown && !s.sunk);
    },
  };
}

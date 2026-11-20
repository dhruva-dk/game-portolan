// The HUD's answer to what happens (player.ts Moment): the screen's and the HUD's part of it. Each moment is answered
// once (by its seq), and only those that befall her or that she dealt; the camera's part is the game's
// (play/shake.ts), the sound's the sound's.
//   her gun fired       a warm flash; the Fire disc knocked in (no oftener than FIRED_APART)
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

import { HER, blowOf, felt, isGun, type Moment, type Status } from '../player.ts';
import { clamp } from '../world/scalar.ts';
import { createFlash, PICKUP, SCREEN } from './flash.ts';
import { createHits } from './hits.ts';
import { LIGHT, glyph, svgNode } from './ink.ts';
import type { Glyph } from './glyphs.ts';
import { boxOf, view } from './ui.ts';

/** The HUD's pieces it moves: the vitals slip, the Fire and Gust discs, and the hotbar's slots (gun's first). */
interface Parts { vitals: HTMLElement; fire: HTMLElement; gust: HTMLElement; slots: readonly HTMLElement[] }

/** A piece's flight to its slot: its burst out, its flight, and its size along the way. */
const FLY = { burst: 0.24, flight: 0.56, scale: [0.35, 1.15, 0.7] } as const;

/** The fewest ms between answers to her firing: the repeater's run of shots (one every 100 ms) flashes and knocks
 *  the Fire disc at half its rate, not with every shot. */
const FIRED_APART = 180;

/** A blow she dealt: its cross over the reticle (hits.ts), and its look (flash.ts). */
const DEALT = {
  broke: { cross: 'break', look: SCREEN.shieldBreak },
  hull: { cross: 'hit', look: SCREEN.hit },
  shield: { cross: 'shield', look: SCREEN.shieldHit },
} as const;

export function createJuice(body: HTMLElement, parts: Parts) {
  const flash = createFlash(body), hits = createHits(body);
  /** The last moment answered; the page's clock (ms) at this frame, and when her firing was last answered. */
  let heard = 0, then = performance.now(), fired = -Infinity;

  /** A piece knocked: scaled to `k` and back on a spring, or shaken side to side. */
  const pop = (el: HTMLElement, k: number, ms = 260) =>
    el.animate([{ scale: '1' }, { scale: String(k), offset: 0.3 }, { scale: '1' }], { duration: ms, easing: 'cubic-bezier(.3,1.6,.5,1)', composite: 'replace' });
  const shake = (el: HTMLElement) =>
    el.animate([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 320, easing: 'ease-out' });

  /** The piece's mark flown from `from` (CSS px) to the slot, drawn at the drawn size and grown by the UI's size. */
  const fly = (name: Glyph, from: { x: number; y: number } | null, slot: HTMLElement) => {
    const there = boxOf(slot), home = boxOf(body), k = view.k;
    const to = { x: there.left - home.left + there.width / 2, y: there.top - home.top + there.height / 2 };
    const start = from ?? { x: home.width / 2, y: home.height * 0.6 };
    const el = svgNode(44, 44, glyph(name, 22, 22, 34));
    el.style.cssText = 'position:absolute;left:0;top:0;margin:-22px 0 0 -22px';
    body.appendChild(el);
    const at = (p: { x: number; y: number }, s: number) => ({ transform: `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) scale(${(s * k).toFixed(3)})` });
    const up = { x: start.x, y: start.y - 40 * k }, all = (FLY.burst + FLY.flight) * 1000;
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

  const answer = (m: Moment) => {
    const { w, h, k } = view, middle = { x: w / 2, y: h / 2 }, above = 18 * k;
    switch (m.kind) {
      case 'fired':
        if (m.ship !== HER || then - fired < FIRED_APART) return;
        fired = then;
        flash.flash(SCREEN.fire.flash);
        pop(parts.fire, 0.86, 220);
        return;
      case 'struck': {
        const points = m.shield + m.hull;
        if (m.by === HER && m.ship !== HER) {
          const { cross, look: r } = DEALT[blowOf(m)];
          hits.cross(cross, middle.x, middle.y);
          if (m.seen) hits.figure(m.ship, points, m.hull <= 0, false, m.seen.x, m.seen.y - above);
          flash.flash(r.flash, m.broke ? 1 : felt.dealt(points));
          if ('vignette' in r) flash.vignette(r.vignette);
        } else if (m.ship === HER && points > 0) {
          const r = { broke: SCREEN.shieldLost, hull: SCREEN.hurt, shield: null }[blowOf(m)];
          hits.arc(m.bearing, w, h, k, m.hull <= 0);
          if (r) {
            flash.flash(r.flash, m.broke ? 1 : felt.taken(points));
            flash.vignette(r.vignette, m.broke ? 1 : felt.taken(points), m.bearing);
          }
          shake(parts.vitals);
        }
        return;
      }
      case 'sank':
        if (m.by !== HER || m.ship === HER) return;
        hits.cross('kill', middle.x, middle.y);
        if (m.seen) hits.figure(m.ship, 0.0001, false, true, m.seen.x, m.seen.y - above);
        flash.flash(SCREEN.sink.flash);
        return;
      case 'took': {
        if (m.ship !== HER) return;
        const slot = parts.slots[m.slot];
        if (slot) fly(isGun(m.piece) ? `weapon.${m.piece}` : `item.${m.piece}`, m.seen, slot);
        const r = clamp(m.rarity, 0, 4);
        if (PICKUP.flash[r] > 0) flash.flash({ colour: LIGHT.white, alpha: PICKUP.flash[r], decay: PICKUP.decay[r] });
        if (PICKUP.vignette[r] > 0) flash.vignette({ colour: LIGHT.gold, alpha: PICKUP.vignette[r], reach: 0.45, decay: PICKUP.fades[r] });
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
      for (const m of s.moments) {
        if (m.seq <= heard) continue;
        heard = m.seq;
        if (shown) answer(m);
      }
      if (!shown) hits.clear();
      flash.update(dt, s.hullMax > 0 ? s.hull / s.hullMax : 1, shown && !s.sunk);
    },
  };
}

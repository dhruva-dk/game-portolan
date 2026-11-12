// The match's HUD, laid on the world as the chartmaker's slips (docs/ui-sheet, as the owner reworked it):
//   top left    the vitals slip: shield (azure) over hull, each with its numeral
//   top centre  the Storm's clock (its spiral, m:ss; in rubric under 30 s) and the ships afloat (a ship, a count)
//   top right   the minimap (minimap.ts); a tap opens the full map
//   right       under the right thumb, Fire (the old game's place, chart/layout.ts): the gun's mark on a paper disc,
//               while reloading a rubric ring running round its border, faint and struck through with no gun; Gust
//               above it, with a pip for each charge
//   centre      the old game's reticle, four arms round a gap, gilt and drawn in while the aim assist has a ship
//               (sim/gun.ts); none with no gun
//   bottom      the hotbar right of centre, out of the stick's side: the gun's slot, then three more
// No words. The stick (play/stick.ts) is drawn by the game; look drags take the rest of the screen.
//
// It reads a plain HudState each frame and redraws a piece only when what it shows has changed.

import type { Vec3 } from '../world/sphere';
import type { Coast } from './coasts';
import type { Glyph } from './glyphs';
import { INK, PAPER, WASH, bar, figure, glyph, paperDisc, ring as sweep, slip, svg } from './ink';
import { createMinimap, stormRing, type Storm } from './minimap';
import { onTap, piece } from './ui';

export interface Slot { glyph: Glyph; count?: number }

export interface HudState {
  hull: number; hullMax: number;
  shield: number; shieldMax: number;
  /** Seconds until the Storm closes in again. */
  storm: number;
  /** Where the Storm's calm lies, or none. */
  eye: Storm | null;
  /** Ships still afloat, hers among them. */
  afloat: number;
  /** The hotbar: the gun's slot first, then three; null for an empty slot. */
  slots: readonly [Slot | null, Slot | null, Slot | null, Slot | null];
  /** The slot in hand. */
  chosen: number;
  /** Gust's charges ready, of GUSTS. */
  gust: number;
  /** Her gun: its rarity (0–4), how far loaded (0…1, 1 ready), and whether the assist has a ship to lay on; null
   * with none. */
  gun: { rarity: number; ready: number; locked: boolean } | null;
  /** Where she is (unit sphere) and the way she heads (unit tangent). */
  at: Vec3; heading: Vec3;
}

export interface HudActions { slot(i: number): void; gust(): void; map(): void; fire(): void }

const GUSTS = 2;
const SLOT = 50, GAP = 6;
const MINIMAP = 132;
/** Fire's radius, px, and its centre from the safe area's right and bottom edges; Gust's centre from Fire's (the old
 * game's, chart/layout.ts: 802, 317 on the phone's 956 × 440). */
const FIRE = 40, FIRE_RIGHT = 92, FIRE_BOTTOM = 102, GUST_RIGHT = 6, GUST_UP = 86;
/** The reticle's radius, px (the old game's), and drawn in to this share of it with the assist on a ship. */
const RETICLE = 10, LOCKED = 0.75;

/** m:ss */
export const clock = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function createHud(layer: HTMLElement, coasts: readonly Coast[], act: HudActions) {
  const root = document.createElement('div');
  root.className = 'screen';
  layer.appendChild(root);

  const vitals = piece(root, 'top left');
  const readings = piece(root, 'top centre');
  const map = piece(root, 'top right', true);
  // (each piece stands 4 px in from the safe area's edge: ui.ts)
  const gust = piece(root, 'right bottom', true);
  gust.style.margin = `0 ${FIRE_RIGHT - GUST_RIGHT - 30 - 4}px ${FIRE_BOTTOM + GUST_UP - 30 - 4}px 0`;
  const fire = piece(root, 'right bottom', true);
  fire.style.cssText = `margin:0 ${FIRE_RIGHT - FIRE - 6}px ${FIRE_BOTTOM - FIRE - 6}px 0;width:${2 * FIRE + 4}px;height:${2 * FIRE + 4}px`;
  const reticle = piece(root, '');
  reticle.style.cssText = `left:50%;top:50%;transform:translate(-50%,-50%)`;
  // fired as the thumb comes down, as the old game's was, and the touch kept from the canvas
  fire.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    act.fire();
  });
  const hotbar = piece(root, 'bottom');
  hotbar.style.left = 'calc(50% + 14px)';

  const drawMap = createMinimap(map, MINIMAP, coasts);
  onTap(map, () => act.map());
  onTap(gust, () => act.gust());

  // the hotbar's slots, each its own target
  const slots = [0, 1, 2, 3].map((i) => {
    const el = document.createElement('div');
    el.className = 'press';
    el.style.cssText = `position:absolute;left:${i * (SLOT + GAP)}px;top:0;width:${SLOT}px;height:${SLOT}px`;
    hotbar.appendChild(el);
    onTap(el, () => act.slot(i));
    return el;
  });
  hotbar.style.width = `${4 * SLOT + 3 * GAP}px`;
  hotbar.style.height = `${SLOT}px`;

  const keys = new Map<HTMLElement, string>();
  /** Sets `el`'s markup when `key` (what it shows) has changed. */
  const draw = (el: HTMLElement, key: string, html: () => string) => {
    if (keys.get(el) === key) return;
    keys.set(el, key);
    el.innerHTML = html();
  };

  let eye: Storm | null = null, ring: Vec3[] | null = null;

  return {
    root,
    update(s: HudState) {
      const shield = Math.round(s.shield), hull = Math.round(s.hull);
      draw(vitals, `${shield}/${s.shieldMax} ${hull}/${s.hullMax}`, () => svg(214, 60,
        slip(1, 1, 212, 58)
        + bar(11, 20, 158, 15, shield / s.shieldMax, WASH.azure) + figure(176, 20, shield, 17, { anchor: 'start' })
        + bar(11, 41, 158, 15, hull / s.hullMax, WASH.hull) + figure(176, 41, hull, 17, { anchor: 'start' })));

      const time = clock(s.storm), closing = s.storm < 30;
      draw(readings, `${time} ${s.afloat}`, () => svg(184, 38,
        slip(1, 2, 88, 34) + glyph('hud.spiral', 20, 19, 22, { ink: closing ? 'rubric' : 'iron' })
        + figure(60, 19, time, 23, { fill: closing ? INK.rubric : INK.iron })
        + slip(95, 2, 88, 34) + glyph('hud.shipsLeft', 116, 19, 22) + figure(154, 19, s.afloat, 23)));

      draw(gust, `${s.gust}`, () => {
        let pips = '';
        for (let i = 0; i < GUSTS; i++) pips += `<circle cx="${30 + (i - (GUSTS - 1) / 2) * 10}" cy="44" r="2.8" fill="${i < s.gust ? INK.iron : PAPER}" stroke="${INK.iron}" stroke-width=".8"/>`;
        return svg(60, 60, `<g opacity="${s.gust > 0 ? 1 : 0.55}">${paperDisc(30, 30, 28)}${glyph('hud.gust', 30, 26, 32)}${pips}</g>`);
      });

      // the reload's sweep in steps of a 48th, so it is redrawn a few times a second at most
      const loaded = s.gun ? Math.floor(Math.min(1, s.gun.ready) * 48) : -1, c = FIRE + 2;
      draw(fire, `${loaded}`, () => svg(2 * c, 2 * c, `<g opacity="${loaded < 0 ? 0.5 : 1}">${paperDisc(c, c, FIRE - 2)}${glyph('weapon.cannon', c, c, 1.2 * FIRE)}`
        + (loaded < 0 ? `<path d="M${c - 24} ${c + 24}L${c + 24} ${c - 24}" stroke="${INK.rubric}" stroke-width="3" stroke-linecap="round"/>` : '')
        + (loaded >= 0 && loaded < 48 ? sweep(c, c, FIRE - 1, loaded / 48, INK.rubric, 3.5) : '') + '</g>'));

      // the reticle: iron under lead white, or gilt while the assist has a ship
      const lock = s.gun ? (s.gun.locked ? 'locked' : 'free') : 'none';
      draw(reticle, lock, () => {
        if (lock === 'none') return '';
        const h = RETICLE + 3, r = lock === 'locked' ? RETICLE * LOCKED : RETICLE, gap = r * 0.32;
        const arms = `M${h - r} ${h}H${h - gap}M${h + gap} ${h}H${h + r}M${h} ${h - r}V${h - gap}M${h} ${h + gap}V${h + r}`;
        return svg(2 * h, 2 * h, `<path d="${arms}" stroke="${INK.iron}" stroke-width="2.6" opacity=".6" transform="translate(.6 .8)"/>`
          + `<path d="${arms}" stroke="${lock === 'locked' ? INK.gold : INK.white}" stroke-width="1.6" opacity=".92"/>`);
      });

      s.slots.forEach((slot, i) => draw(slots[i], `${slot?.glyph} ${slot?.count} ${s.chosen === i}`, () => {
        const chosen = s.chosen === i;
        if (!slot) {
          // lead white over an iron halo, to hold on bright water
          return svg(SLOT, SLOT, `<rect x="2" y="2" width="${SLOT - 4}" height="${SLOT - 4}" fill="rgba(38,25,16,.12)" stroke="${INK.iron}" stroke-width="3" opacity=".45"/>`
            + `<rect x="2" y="2" width="${SLOT - 4}" height="${SLOT - 4}" fill="none" stroke="${INK.white}" stroke-width="1.2" opacity=".85"/>`);
        }
        return svg(SLOT, SLOT, slip(0, 0, SLOT, SLOT, { fill: chosen ? '#f3dfa8' : 'url(#pg)', bold: chosen })
          + (chosen ? `<rect x="2" y="2" width="${SLOT - 4}" height="${SLOT - 4}" fill="none" stroke="${WASH.gold}" stroke-width="1.6"/>` : '')
          + glyph(slot.glyph, SLOT / 2 - 3, SLOT / 2, 31)
          + (slot.count != null ? figure(SLOT / 2 + 18, SLOT / 2 + 12, slot.count, 17) : ''));
      }));

      if (s.eye !== eye) {
        eye = s.eye;
        ring = eye ? stormRing(eye) : null;
      }
      drawMap(s.at, s.heading, ring);
    },
  };
}

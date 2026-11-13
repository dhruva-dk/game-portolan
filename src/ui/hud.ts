// The match's HUD, laid on the world as the chartmaker's slips (docs/ui-sheet, as the owner reworked it):
//   top left    the vitals slip: shield (azure) over hull, each with its numeral
//   top centre  the Storm's clock (its spiral, m:ss; in the Storm's violet under 30 s) and the ships afloat (a ship, a count)
//   top right   the minimap (minimap.ts), north up: who holds the sea, the islands, the Storm's calm and the next, the
//               way in from outside it, her arrow (no other ship, no loot); a tap opens the full map
//   right       under the right thumb, Fire (the old game's place, chart/layout.ts): the mark of the gun in hand on a
//               paper disc, its rounds left under it; while reloading or taking it up a rubric ring running round its
//               border, while winding up a gold one; faint and struck through with no gun (she is unarmed); held, it
//               fires at the gun's interval. Gust above it, with a pip for each charge, the next filling as it comes
//               back, faint with none, gilt while one blows
//   reticle     the old game's, four arms round a gap, fixed in the middle of the screen where her gun is aimed
//               (play/chase.ts), set out to the spread its balls go off within; gilt and drawn in while the aim
//               assist has a ship (sim/gun.ts), faint when the ball falls short of what it is on; a rubric ring while
//               reloading and a gold one winding up, running round it; a small ring where the ball will come down, if
//               clear of it, and for a lobbed gun a cross in a wide ring, the mark to lay on its target; none with no gun
//   bottom      the hotbar right of centre, out of the stick's side: the two guns' slots (each its kind's mark, its
//               rarity's ink under it, its rounds; a rubric ring running round it while it reloads), a gap, then
//               three of stores; the one in hand gilt and raised, a gold ring running round it while it is used, and a
//               gold mark bobbing over the slot a tap would swap for what lies within reach (0117's hotbar). A tap on
//               the other gun takes it in hand; on the one in hand, reloads it
//   rim         washed the Storm's violet while she is outside its calm, the deeper the further out (0117's)
//   blows       what happens answered (juice.ts): the hit cross round the reticle, the figures off a struck ship, the
//               arcs toward a blow on her, the screen's flashes and rims, the pieces knocked, a piece taken up flown
//               to its slot
// No words. The stick is drawn under it (stick.ts); look drags take the rest of the screen.
// Once she has sunk it watches another ship (watch): only the Storm's clock, the ships afloat and the disc stay, her arrow gilt.
// While the eye comes down from space at a match's start (play/arrival.ts) none of it shows; it fades in over the last
// of the way down (FADE), as the game reports it (Status.arriving).
//
// It reads a plain HudState each frame and redraws a piece only when what it shows has changed.

import { HOTBAR, type GunKind, type Kit, type Status } from '../player';
import type { Sea } from '../snapshot';
import type { Coast } from './coasts';
import type { Glyph } from './glyphs';
import { INK, PAPER, WASH, bar, figure, glyph, paperDisc, ring as sweep, slip, svg } from './ink';
import { createJuice } from './juice';
import { createMinimap } from './minimap';
import { RARITY } from '../rarity';
import { onTap, piece } from './ui';

/** What the HUD shows: the match as the game reports it, and what she carries. */
export type HudState = Status & Kit;

export interface HudActions { slot(i: number): void; gust(): void; map(): void; fire(down: boolean): void }

/** A slot's side, the gap between slots and between the guns' and the stores', px. */
const SLOT = 50, GAP = 6, APART = 16;
/** Slots on the hotbar: each one's left, px. */
const SLOTS = HOTBAR.guns + HOTBAR.items, LEFT = (i: number) => i * (SLOT + GAP) + (i >= HOTBAR.guns ? APART - GAP : 0);
/** A gun's mark. */
const mark = (k: GunKind): Glyph => `weapon.${k}`;
const MINIMAP = 132;
/** Fire's radius, px, and its centre from the safe area's right and bottom edges; Gust's centre from Fire's (the old
 * game's, chart/layout.ts: 802, 317 on the phone's 956 × 440). */
const FIRE = 40, FIRE_RIGHT = 92, FIRE_BOTTOM = 102, GUST_RIGHT = 6, GUST_UP = 86;
/** The reticle's radius, px (the old game's), and drawn in to this share of it with the assist on a ship; the radius
 *  of the ring where the ball will come down. */
const RETICLE = 10, LOCKED = 0.75, FALL = 4;
/** The rim's wash outside the calm: its least and most strength, and the metres out it deepens over (0117's 0.35 +
 *  0.65 × how deep). */
const RIM = [0.35, 1] as const, RIM_DEEP = 80;
/** The share of the arrival (play/arrival.ts ARRIVAL.seconds, 2.8 s) over whose last the HUD fades in. */
const FADE = 0.25;
/** 0xrrggbb as css. */
const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

/** m:ss */
export const clock = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function createHud(layer: HTMLElement, coasts: readonly Coast[], act: HudActions) {
  const root = document.createElement('div');
  root.className = 'screen';
  layer.appendChild(root);
  // what fades in at the end of the arrival (the flow fades the root itself on a win)
  const body = document.createElement('div');
  body.className = 'screen';
  root.appendChild(body);

  const vitals = piece(body, 'top left');
  const readings = piece(body, 'top centre');
  const map = piece(body, 'top right', true);
  // (each piece stands 4 px in from the safe area's edge: ui.ts)
  const gust = piece(body, 'right bottom', true);
  gust.style.margin = `0 ${FIRE_RIGHT - GUST_RIGHT - 30 - 4}px ${FIRE_BOTTOM + GUST_UP - 30 - 4}px 0`;
  const fire = piece(body, 'right bottom', true);
  fire.style.cssText = `margin:0 ${FIRE_RIGHT - FIRE - 6}px ${FIRE_BOTTOM - FIRE - 6}px 0;width:${2 * FIRE + 4}px;height:${2 * FIRE + 4}px`;
  const reticle = piece(body, '');
  reticle.style.cssText = `left:50%;top:50%;transform:translate(-50%,-50%)`;
  const fall = piece(body, '');
  fall.style.transform = 'translate(-50%,-50%)';
  // the rim's wash outside the calm, under everything else
  const rim = document.createElement('div');
  rim.style.cssText = `position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 80px 18px rgba(62,24,96,.6);opacity:0`;
  body.prepend(rim);
  // fired as the thumb comes down, as the old game's was, and held till it lifts; the touch kept from the canvas
  fire.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    fire.setPointerCapture(e.pointerId);
    act.fire(true);
  });
  for (const lift of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) fire.addEventListener(lift, () => act.fire(false));
  const hotbar = piece(body, 'bottom');
  hotbar.style.left = 'calc(50% - 12px)';

  const drawMap = createMinimap(map, MINIMAP, coasts);
  onTap(map, () => act.map());
  onTap(gust, () => act.gust());

  // the hotbar's slots, each its own target
  const slots = Array.from({ length: SLOTS }, (_, i) => {
    const el = document.createElement('div');
    el.className = 'press';
    el.style.cssText = `position:absolute;left:${LEFT(i)}px;top:0;width:${SLOT}px;height:${SLOT}px`;
    hotbar.appendChild(el);
    onTap(el, () => act.slot(i));
    return el;
  });
  hotbar.style.width = `${LEFT(SLOTS - 1) + SLOT}px`;
  hotbar.style.height = `${SLOT}px`;
  const juice = createJuice(body, { vitals, fire, gust, slots });

  const keys = new Map<HTMLElement, string>();
  /** Sets `el`'s markup when `key` (what it shows) has changed. */
  const draw = (el: HTMLElement, key: string, html: () => string) => {
    if (keys.get(el) === key) return;
    keys.set(el, key);
    el.innerHTML = html();
  };

  /** She has sunk and the HUD watches another ship (0117 hud.ts spectate): only the Storm's clock, the count and the
   *  disc stay, her arrow on it gilt, and the disc takes no touch. */
  let watching = false;

  return {
    root,
    watch(on: boolean) {
      watching = on;
      for (const el of [vitals, gust, fire, reticle, fall, hotbar, rim]) el.style.display = on ? 'none' : '';
      map.classList.toggle('press', !on);
    },
    /** A frame: the match as reported, and who holds the sea (and her id in it) as the frame draws it. */
    update(s: HudState, sea?: Sea, own?: number | null) {
      const shown = Math.min(1, Math.max(0, 1 - s.arriving / FADE));
      body.style.opacity = shown.toFixed(2);
      body.style.visibility = shown > 0 ? '' : 'hidden';
      const shield = Math.round(s.shield), hull = Math.round(s.hull);
      draw(vitals, `${shield}/${s.shieldMax} ${hull}/${s.hullMax}`, () => svg(214, 60,
        slip(1, 1, 212, 58)
        + bar(11, 20, 158, 15, shield / s.shieldMax, WASH.azure) + figure(176, 20, shield, 17, { anchor: 'start' })
        + bar(11, 41, 158, 15, hull / s.hullMax, WASH.hull) + figure(176, 41, hull, 17, { anchor: 'start' })));

      const time = clock(s.storm), closing = s.closing || s.storm < 30;
      draw(readings, `${time} ${s.afloat}`, () => svg(184, 38,
        slip(1, 2, 88, 34) + glyph('hud.spiral', 20, 19, 22, { ink: closing ? 'storm' : 'iron' })
        + figure(60, 19, time, 23, { fill: closing ? INK.storm : INK.iron })
        + slip(95, 2, 88, 34) + glyph('hud.shipsLeft', 116, 19, 22) + figure(154, 19, s.afloat, 23)));

      // each charge a pip; the one coming back filling round, in steps of a 24th
      const charge = Math.floor(s.gust), back = Math.floor((s.gust - charge) * 24);
      draw(gust, `${charge} ${back} ${s.gusts} ${s.blowing}`, () => {
        let pips = '';
        for (let i = 0; i < s.gusts; i++) {
          const x = 30 + (i - (s.gusts - 1) / 2) * 10;
          pips += `<circle cx="${x}" cy="44" r="2.8" fill="${i < charge ? INK.iron : PAPER}" stroke="${INK.iron}" stroke-width=".8"/>`;
          if (i === charge && back > 0) pips += sweep(x, 44, 2.8, back / 24, INK.iron, 1.6);
        }
        return svg(60, 60, `<g opacity="${charge > 0 ? 1 : 0.55}">${paperDisc(30, 30, 28, s.blowing ? WASH.gold : INK.iron)}`
          + (s.blowing ? `<circle cx="30" cy="30" r="25" fill="none" stroke="${WASH.gold}" stroke-width="2.4"/>` : '')
          + `${glyph('hud.gust', 30, 26, 32)}${pips}</g>`);
      });

      // Fire: the gun in hand's mark and rounds; its reload, or its taking up, a rubric sweep and its winding a gold
      // one, each in steps of a 48th, so it is redrawn a few times a second at most
      const g = s.gun, c = FIRE + 2, step = (v: number) => Math.floor(Math.min(1, Math.max(0, v)) * 48);
      const loaded = g ? (g.swapping > 0 ? step(1 - g.swapping) : step(g.ready)) : -1, wound = g && g.charge !== null ? step(g.charge) : -1;
      draw(fire, `${g?.kind} ${g?.rounds} ${loaded} ${wound}`, () => svg(2 * c, 2 * c, `<g opacity="${g ? 1 : 0.5}">${paperDisc(c, c, FIRE - 2)}`
        + glyph(g ? mark(g.kind) : 'weapon.cannon', c, g ? c - 5 : c, (g ? 1 : 1.2) * FIRE, { ink: g ? 'iron' : 'sepia' })
        + (g ? figure(c, c + FIRE - 15, g.rounds, 15, { fill: g.rounds > 0 ? INK.iron : INK.rubric }) : '')
        + (!g ? `<path d="M${c - 24} ${c + 24}L${c + 24} ${c - 24}" stroke="${INK.rubric}" stroke-width="3" stroke-linecap="round"/>` : '')
        + (loaded >= 0 && loaded < 48 ? sweep(c, c, FIRE - 1, loaded / 48, INK.rubric, 3.5) : '')
        + (wound >= 0 ? sweep(c, c, FIRE - 1, wound / 48, WASH.gold, 4.5) : '') + '</g>'));

      // the reticle, in the middle where the gun is aimed, set out to its spread: iron under lead white, or gilt while
      // the assist has a ship, faint when the ball falls short of what it is on; reloading or winding, its sweep round it
      const lock = g && s.reticle ? (g.locked ? 'locked' : s.reticle.reach ? 'free' : 'short') : 'none';
      const spread = s.reticle ? Math.round(Math.min(48, s.reticle.spread)) : 0;
      // its sweep: winding or reloading, and how far, in steps of a 12th
      const busy: { wound: boolean; twelfths: number } | null = lock === 'none' ? null
        : wound >= 0 ? { wound: true, twelfths: wound >> 2 } : loaded >= 0 && loaded < 48 ? { wound: false, twelfths: loaded >> 2 } : null;
      draw(reticle, `${lock} ${spread} ${busy ? `${busy.wound} ${busy.twelfths}` : ''}`, () => {
        if (lock === 'none') return '';
        const out = Math.max(RETICLE, spread), h = out + 7, r = lock === 'locked' ? out * LOCKED : out, gap = Math.max(r * 0.32, r - RETICLE * 0.7);
        const arms = `M${h - r} ${h}H${h - gap}M${h + gap} ${h}H${h + r}M${h} ${h - r}V${h - gap}M${h} ${h + gap}V${h + r}`;
        const run = busy ? sweep(h, h, Math.min(r, RETICLE) * 0.5 + 2, busy.twelfths / 12, busy.wound ? WASH.gold : INK.rubric, 2.2) : '';
        return svg(2 * h, 2 * h, `<g opacity="${lock === 'short' ? 0.45 : 1}"><path d="${arms}" stroke="${INK.iron}" stroke-width="2.6" opacity=".6" transform="translate(.6 .8)"/>`
          + `<path d="${arms}" stroke="${lock === 'locked' ? INK.gold : INK.white}" stroke-width="1.6" opacity=".92"/>${run}</g>`);
      });
      // where it will come down, if clear of the reticle: a small ring; for a lobbed gun, a cross in a wide ring
      const f = s.reticle?.fall, lob = !!s.reticle?.lob;
      const away = f ? lob || Math.hypot(f.x - body.clientWidth / 2, f.y - body.clientHeight / 2) > RETICLE * 1.5 : false;
      if (f && away) [fall.style.left, fall.style.top] = [`${f.x.toFixed(1)}px`, `${f.y.toFixed(1)}px`];
      draw(fall, away ? `${lock} ${lob}` : 'none', () => {
        if (!away || lock === 'none') return '';
        const r = lob ? 3 * FALL : FALL, h = r + 3, ink = lock === 'locked' ? INK.gold : lob ? WASH.gold : INK.white;
        const cross = lob ? `<path d="M${h - r / 2} ${h}H${h + r / 2}M${h} ${h - r / 2}V${h + r / 2}" stroke="${ink}" stroke-width="1.4"/>` : '';
        return svg(2 * h, 2 * h, `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${INK.iron}" stroke-width="2.4" opacity=".6" transform="translate(.6 .8)"/>`
          + `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${ink}" stroke-width="1.4" opacity=".92"${lob ? ' stroke-dasharray="3 2"' : ''}/>${cross}`);
      });

      // the guns' slots hold her guns, each its rarity's ink under it and its rounds, reloading its rubric sweep; then
      // her items. The one being used has a gold ring running round it, in steps of a 32nd; the one a tap would swap
      // for loot a gold mark bobbing
      const held: ({ glyph: Glyph; count?: number; ink?: number; low?: boolean; reload?: number } | null)[] = [
        ...s.guns.map((k) => k && {
          glyph: mark(k.kind), count: k.rounds, ink: RARITY[k.rarity], low: k.rounds === 0, reload: k.reload === null ? undefined : Math.floor(k.reload * 32),
        }),
        ...s.items.map((k) => k && { glyph: k.item, count: k.count }),
      ];
      held.forEach((slot, i) => {
        const chosen = s.chosen === i, offer = s.offer === i;
        const used = chosen && s.using !== null ? Math.floor(s.using * 32) : slot?.reload ?? -1, gun = i < HOTBAR.guns;
        draw(slots[i], `${slot?.glyph} ${slot?.count} ${slot?.ink} ${chosen} ${used} ${offer}`, () => {
          const bob = offer ? `<g><path d="M${SLOT / 2 - 7} -15h14l-7 9z" fill="${WASH.gold}" stroke="${INK.iron}" stroke-width="1"/>`
            + `<animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="0.9s" repeatCount="indefinite"/></g>` : '';
          if (!slot) {
            // lead white over an iron halo, to hold on bright water; an empty gun slot shows a faint gun's ghost
            return svg(SLOT, SLOT, `<rect x="2" y="2" width="${SLOT - 4}" height="${SLOT - 4}" fill="rgba(38,25,16,.12)" stroke="${INK.iron}" stroke-width="3" opacity=".45"/>`
              + `<rect x="2" y="2" width="${SLOT - 4}" height="${SLOT - 4}" fill="none" stroke="${INK.white}" stroke-width="1.2" opacity=".85"/>`
              + (gun ? `<g opacity=".5">${glyph('weapon.cannon', SLOT / 2, SLOT / 2, 28, { ink: 'white' })}</g>` : '') + bob);
          }
          return svg(SLOT, SLOT, slip(0, 0, SLOT, SLOT, { fill: chosen ? '#f3dfa8' : 'url(#pg)', bold: chosen })
            + (chosen ? `<rect x="2" y="2" width="${SLOT - 4}" height="${SLOT - 4}" fill="none" stroke="${WASH.gold}" stroke-width="${gun ? 2.6 : 1.6}"/>` : '')
            + (slot.ink !== undefined ? `<rect x="9" y="${SLOT - 9}" width="${SLOT - 18}" height="4" fill="${css(slot.ink)}" stroke="${INK.iron}" stroke-width=".6"/>` : '')
            + glyph(slot.glyph, SLOT / 2 - 3, SLOT / 2 - (slot.ink !== undefined ? 3 : 0), 31)
            + (slot.count != null ? figure(SLOT - 4, SLOT / 2 + 12, slot.count, 17, { fill: slot.low ? INK.rubric : INK.iron, anchor: 'end' }) : '')
            + (used >= 0 ? sweep(SLOT / 2, SLOT / 2, SLOT / 2 - 6, used / 32, slot.reload !== undefined && !(chosen && s.using !== null) ? INK.rubric : WASH.gold, 3.5) : '')
            + bob);
        });
        // the gun in hand raised
        slots[i].style.transform = chosen && gun && slot ? 'translateY(-6px)' : '';
      });

      juice.update(s, !watching && s.arriving <= 0);

      // the rim's wash, outside the calm
      rim.style.opacity = s.outside > 0 && !watching ? (RIM[0] + (RIM[1] - RIM[0]) * Math.min(1, s.outside / RIM_DEEP)).toFixed(2) : '0';

      drawMap(s.at, s.heading, { gilt: watching, calm: s.eye, next: s.next, sea, own });
    },
  };
}

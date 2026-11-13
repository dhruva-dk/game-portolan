// The screen's answer to a blow: 0117's flash, vignette and low-hull heartbeat (juice/screen.ts, its recipes' screen
// parts). A flash washes the whole screen in a colour for a moment (`add` lightens what is under it, `tint` lays the
// colour over it); a vignette darkens the screen's rim in a colour, drawn toward where a blow came from; while her hull
// is low, a heartbeat of rubric beats at the rim, faster the lower it is.
//
// Photosensitivity (WCAG 2.3.1): no more than BIG flashes stronger than SAFE in any second; past that a flash is held
// to SAFE.
//
// A layer of the HUD under all its pieces (no touch); it runs on the page's clock.

/** A flash: its colour, strength at its peak (0…1), how long it holds there and fades (s), and how it is laid. */
export interface Flash { colour: string; alpha: number; hold?: number; decay: number; mode?: 'add' | 'tint' }
/** A vignette: its colour, strength (0…1), how far in it reaches (of the half-screen), its attack, hold and decay
 *  (s), and whether it is drawn toward the blow's bearing. */
export interface Vignette { colour: string; alpha: number; reach: number; attack?: number; hold?: number; decay: number; aimed?: boolean }

/** 0117's screen recipes (juice/recipes.ts), by name. */
export const SCREEN = {
  fire: { flash: { colour: '#ffd9a0', alpha: 0.1, hold: 0.033, decay: 0.16 } },
  hit: { flash: { colour: '#fff1d8', alpha: 0.08, decay: 0.12 } },
  shieldHit: { flash: { colour: '#bfe6ff', alpha: 0.04, decay: 0.12 } },
  shieldBreak: { flash: { colour: '#d9f3ff', alpha: 0.28, decay: 0.22 }, vignette: { colour: '#4fc3ff', alpha: 0.35, reach: 0.45, decay: 0.4 } },
  shieldLost: {
    flash: { colour: '#cfeeff', alpha: 0.22, decay: 0.25 },
    vignette: { colour: '#4fc3ff', alpha: 0.55, reach: 0.55, hold: 0.08, decay: 0.6, aimed: true },
  },
  hurt: {
    flash: { colour: '#ff2a1a', alpha: 0.14, hold: 0.02, decay: 0.3, mode: 'tint' },
    vignette: { colour: '#c4161c', alpha: 0.6, reach: 0.5, attack: 0.02, hold: 0.06, decay: 0.65, aimed: true },
  },
  sink: { flash: { colour: '#fff1d6', alpha: 0.2, decay: 0.3 } },
  gust: { vignette: { colour: '#e8f4ff', alpha: 0.22, reach: 0.35, decay: 0.5 } },
  shield: { flash: { colour: '#8fd8ff', alpha: 0.08, decay: 0.2 }, vignette: { colour: '#4fc3ff', alpha: 0.25, reach: 0.4, decay: 0.5 } },
  repair: { flash: { colour: '#c8ffb0', alpha: 0.06, decay: 0.2 }, vignette: { colour: '#7be36b', alpha: 0.18, reach: 0.4, decay: 0.5 } },
} as const satisfies Record<string, { flash?: Flash; vignette?: Vignette }>;

/** A pickup's flash and vignette by rarity (0117's: none for the commonest two, more for each up). */
export const PICKUP = {
  flash: [0, 0, 0.05, 0.08, 0.14], decay: [0, 0, 0.18, 0.25, 0.4], vignette: [0, 0, 0, 0.2, 0.34], fades: [0, 0, 0, 0.5, 0.9],
} as const;

/** At most BIG flashes a second stronger than SAFE. */
export const BIG = 3, SAFE = 0.12;

/** The low-hull heartbeat (0117's LOW_HULL): from `start` of her hull, its fastest at `floor`; beats a minute from
 *  slowest to fastest; its rubric; its strength resting and on the beat; its reach; how much the second beat of each
 *  pair is of the first; how long it takes to fade once she is mended (s). */
export const LOW_HULL = { start: 0.3, floor: 0.05, bpm: [72, 128], colour: '#b0141c', rest: [0.1, 0.32], beat: [0.12, 0.28], reach: [0.42, 0.6], dub: 0.15, fade: 9 } as const;

/** How strong a flash of `alpha` plays when `recent` big ones have played in the last second. */
export const capped = (alpha: number, recent: number) => (alpha > SAFE && recent >= BIG ? SAFE : alpha);

/** 0…1 of a heartbeat `t` s in, at `bpm`: a lub and, a sixth of a beat later, a dub (`dub` of it). */
export function heartbeat(t: number, bpm: number, dub: number): number {
  const p = (t * bpm) / 60 % 1, pulse = (x: number) => (x >= 0 && x < 0.12 ? Math.sin((x / 0.12) * Math.PI) : 0);
  return Math.max(pulse(p), pulse(p - 0.18) * dub);
}

/** The heartbeat's strength (0…1) and pace (bpm) for her hull's share `share`, 0 above its start. */
export function lowHull(share: number): { k: number; bpm: number } {
  const k = Math.max(0, Math.min(1, (LOW_HULL.start - share) / (LOW_HULL.start - LOW_HULL.floor)));
  return { k: share > LOW_HULL.start || share <= 0 ? 0 : k, bpm: LOW_HULL.bpm[0] + (LOW_HULL.bpm[1] - LOW_HULL.bpm[0]) * k };
}

export function createFlash(parent: HTMLElement) {
  const layer = (css: string) => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;${css}`;
    parent.prepend(el);
    return el;
  };
  const wash = layer(''), tint = layer(''), rim = layer(''), heart = layer('');
  wash.style.mixBlendMode = 'screen';
  /** When the big flashes of the last second played (s on the page's clock). */
  let big: number[] = [], beat = 0, low = 0;
  const now = () => performance.now() / 1000;

  return {
    /** A flash `strength` strong. */
    flash(f: Flash, strength = 1) {
      const t = now();
      big = big.filter((b) => b > t - 1);
      const alpha = capped(f.alpha * strength, big.length);
      if (alpha <= 0) return;
      if (alpha > SAFE) big.push(t);
      const el = f.mode === 'tint' ? tint : wash, hold = f.hold ?? 0, all = (hold + f.decay) * 1000;
      el.style.background = f.colour;
      el.animate([{ opacity: alpha }, { opacity: alpha, offset: Math.min(0.9, (hold * 1000) / all) }, { opacity: 0 }], { duration: all, easing: 'ease-out' });
    },
    /** A vignette `strength` strong, toward `bearing` (radians clockwise from ahead) when it is aimed. */
    vignette(v: Vignette, strength = 1, bearing?: number) {
      const aimed = v.aimed && bearing !== undefined;
      const cx = aimed ? 50 + Math.sin(bearing) * 55 : 50, cy = aimed ? 50 - Math.cos(bearing) * 55 : 50;
      const inner = Math.round((1 - v.reach) * 100);
      rim.style.background = `radial-gradient(ellipse at ${cx.toFixed(0)}% ${cy.toFixed(0)}%, transparent ${inner}%, ${v.colour} 135%)`;
      const attack = (v.attack ?? 0.03) * 1000, hold = (v.hold ?? 0) * 1000, all = attack + hold + v.decay * 1000;
      const a = Math.min(1, v.alpha * strength);
      rim.animate([{ opacity: 0 }, { opacity: a, offset: attack / all }, { opacity: a, offset: (attack + hold) / all }, { opacity: 0 }], { duration: all, easing: 'ease-out' });
    },
    /** Each frame, dt s on: her hull's share (0…1; the heartbeat), and whether the HUD shows hers. */
    update(dt: number, share: number, shown: boolean) {
      const { k, bpm } = lowHull(shown ? share : 1);
      // eased in, and out slowly once she is mended
      low = k > low ? Math.min(k, low + dt * 2) : Math.max(k, low - dt / LOW_HULL.fade);
      if (low <= 0.001) {
        if (heart.style.opacity !== '0') heart.style.opacity = '0';
        return;
      }
      beat += dt;
      const b = heartbeat(beat, bpm, LOW_HULL.dub), reach = LOW_HULL.reach[0] + (LOW_HULL.reach[1] - LOW_HULL.reach[0]) * low;
      const alpha = (LOW_HULL.rest[0] + (LOW_HULL.rest[1] - LOW_HULL.rest[0]) * low) + (LOW_HULL.beat[0] + (LOW_HULL.beat[1] - LOW_HULL.beat[0]) * low) * b;
      heart.style.background = `radial-gradient(ellipse at 50% 50%, transparent ${Math.round((1 - reach) * 100)}%, ${LOW_HULL.colour} 135%)`;
      heart.style.opacity = Math.min(1, alpha * low).toFixed(3);
    },
  };
}

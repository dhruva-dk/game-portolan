import { clamp } from '../world/scalar.ts';
import { INK, LIGHT } from './ink.ts';

interface Flash {
  color: string;
  alpha: number;
  hold?: number;
  decay: number;
  mode?: 'add' | 'tint';
}
interface Vignette {
  color: string;
  alpha: number;
  reach: number;
  attack?: number;
  hold?: number;
  decay: number;
  aimed?: boolean;
}

export const SCREEN = {
  fire: { flash: { color: LIGHT.warm, alpha: 0.1, hold: 0.033, decay: 0.16 } },
  hit: { flash: { color: LIGHT.white, alpha: 0.08, decay: 0.12 } },
  shieldHit: { flash: { color: LIGHT.ice, alpha: 0.04, decay: 0.12 } },
  shieldBreak: {
    flash: { color: LIGHT.ice, alpha: 0.28, decay: 0.22 },
    vignette: { color: LIGHT.azure, alpha: 0.35, reach: 0.45, decay: 0.4 },
  },
  shieldLost: {
    flash: { color: LIGHT.ice, alpha: 0.22, decay: 0.25 },
    vignette: {
      color: LIGHT.azure,
      alpha: 0.55,
      reach: 0.55,
      hold: 0.08,
      decay: 0.6,
      aimed: true,
    },
  },
  hurt: {
    flash: {
      color: LIGHT.red,
      alpha: 0.14,
      hold: 0.02,
      decay: 0.3,
      mode: 'tint',
    },
    vignette: {
      color: INK.scarlet,
      alpha: 0.6,
      reach: 0.5,
      attack: 0.02,
      hold: 0.06,
      decay: 0.65,
      aimed: true,
    },
  },
  sink: { flash: { color: LIGHT.white, alpha: 0.2, decay: 0.3 } },
  gust: {
    vignette: { color: LIGHT.ice, alpha: 0.22, reach: 0.35, decay: 0.5 },
  },
  shield: {
    flash: { color: LIGHT.ice, alpha: 0.08, decay: 0.2 },
    vignette: { color: LIGHT.azure, alpha: 0.25, reach: 0.4, decay: 0.5 },
  },
  repair: {
    flash: { color: LIGHT.mint, alpha: 0.06, decay: 0.2 },
    vignette: { color: LIGHT.green, alpha: 0.18, reach: 0.4, decay: 0.5 },
  },
} as const satisfies Record<string, { flash?: Flash; vignette?: Vignette }>;

export const PICKUP = {
  flash: [0, 0, 0.05, 0.08, 0.14],
  decay: [0, 0, 0.18, 0.25, 0.4],
  vignette: [0, 0, 0, 0.2, 0.34],
  fades: [0, 0, 0, 0.5, 0.9],
} as const;

export const BIG = 3,
  SAFE = 0.12;

const LOW_HULL = {
  start: 0.3,
  floor: 0.05,
  bpm: [72, 128],
  color: INK.scarlet,
  rest: [0.1, 0.32],
  beat: [0.12, 0.28],
  reach: [0.42, 0.6],
  dub: 0.15,
  fade: 9,
} as const;

export const capped = (alpha: number, recent: number) =>
  alpha > SAFE && recent >= BIG ? SAFE : alpha;

export function heartbeat(t: number, bpm: number, dub: number): number {
  const p = ((t * bpm) / 60) % 1,
    pulse = (x: number) =>
      x >= 0 && x < 0.12 ? Math.sin((x / 0.12) * Math.PI) : 0;
  return Math.max(pulse(p), pulse(p - 0.18) * dub);
}

export function lowHull(share: number): { k: number; bpm: number } {
  const k = clamp((LOW_HULL.start - share) / (LOW_HULL.start - LOW_HULL.floor));
  return {
    k: share > LOW_HULL.start || share <= 0 ? 0 : k,
    bpm: LOW_HULL.bpm[0] + (LOW_HULL.bpm[1] - LOW_HULL.bpm[0]) * k,
  };
}

export function createFlash(parent: HTMLElement) {
  const layer = (css: string) => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;${css}`;
    parent.prepend(el);
    return el;
  };
  const wash = layer(''),
    tint = layer(''),
    rim = layer(''),
    heart = layer('');
  let big: number[] = [],
    beat = 0,
    low = 0,
    reached = -1;
  const now = () => performance.now() / 1000;

  return {
    flash(f: Flash, strength = 1) {
      const t = now();
      big = big.filter((b) => b > t - 1);
      const alpha = capped(f.alpha * strength, big.length);
      if (alpha <= 0) return;
      if (alpha > SAFE) big.push(t);
      const el = f.mode === 'tint' ? tint : wash,
        hold = f.hold ?? 0,
        all = (hold + f.decay) * 1000;
      el.style.background = f.color;
      el.animate(
        [
          { opacity: alpha },
          { opacity: alpha, offset: Math.min(0.9, (hold * 1000) / all) },
          { opacity: 0 },
        ],
        { duration: all, easing: 'ease-out' }
      );
    },
    vignette(v: Vignette, strength = 1, bearing?: number) {
      const aimed = v.aimed && bearing !== undefined;
      const cx = aimed ? 50 + Math.sin(bearing) * 55 : 50,
        cy = aimed ? 50 - Math.cos(bearing) * 55 : 50;
      const inner = Math.round((1 - v.reach) * 100);
      rim.style.background = `radial-gradient(ellipse at ${cx.toFixed(0)}% ${cy.toFixed(0)}%, transparent ${inner}%, ${v.color} 135%)`;
      const attack = (v.attack ?? 0.03) * 1000,
        hold = (v.hold ?? 0) * 1000,
        all = attack + hold + v.decay * 1000;
      const a = Math.min(1, v.alpha * strength);
      rim.animate(
        [
          { opacity: 0 },
          { opacity: a, offset: attack / all },
          { opacity: a, offset: (attack + hold) / all },
          { opacity: 0 },
        ],
        { duration: all, easing: 'ease-out' }
      );
    },
    update(dt: number, share: number, shown: boolean) {
      const { k, bpm } = lowHull(shown ? share : 1);
      low =
        k > low
          ? Math.min(k, low + dt * 2)
          : Math.max(k, low - dt / LOW_HULL.fade);
      if (low <= 0.001) {
        if (heart.style.opacity !== '0') heart.style.opacity = '0';
        return;
      }
      beat += dt;
      const b = heartbeat(beat, bpm, LOW_HULL.dub),
        reach =
          LOW_HULL.reach[0] + (LOW_HULL.reach[1] - LOW_HULL.reach[0]) * low;
      const alpha =
        LOW_HULL.rest[0] +
        (LOW_HULL.rest[1] - LOW_HULL.rest[0]) * low +
        (LOW_HULL.beat[0] + (LOW_HULL.beat[1] - LOW_HULL.beat[0]) * low) * b;
      const inner = Math.round((1 - reach) * 100),
        opacity = Math.min(1, alpha * low).toFixed(3);
      if (inner !== reached)
        heart.style.background = `radial-gradient(ellipse at 50% 50%, transparent ${(reached = inner)}%, ${LOW_HULL.color} 135%)`;
      if (heart.style.opacity !== opacity) heart.style.opacity = opacity;
    },
  };
}

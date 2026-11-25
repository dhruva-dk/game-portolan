import { BEAT } from './house.ts';

export const BEATS = [
  'stamp',
  'row',
  'coin',
  'standing',
  'landed',
  'tossed',
  'slam',
  'seal',
  'built',
  'painted',
  'knock',
  'unroll',
  'furl',
  'laurel',
  'card',
  'frost',
  'debt',
] as const;
export type Beat = (typeof BEATS)[number];

interface Rule {
  beat: Beat;
  at?: number;
  only?: string;
  within?: string;
}

export const RULES: Readonly<Record<string, Rule>> = {
  refuse: { beat: 'knock' },
  stamp: { beat: 'stamp', only: 'stamped', at: 0.6 },
  sealed: { beat: 'seal', at: 0.6 },
  puff: { beat: 'landed', at: 0.13 },
  quake: { beat: 'slam' },
  tossed: { beat: 'tossed' },
  floated: { beat: 'built' },
  'inked-row': { beat: 'row', within: 'result' },
  moved: { beat: 'standing', within: 'result' },
  'dealt-card': { beat: 'card', at: 0.5 },
  crowned: { beat: 'laurel', at: 0.35 },
  frost: { beat: 'frost', at: 0.3 },
  'debt-stamp': { beat: 'debt', at: 0.6 },
  'uncle-in': { beat: 'unroll' },
  'uncle-out': { beat: 'furl' },
};

export function beatOf(
  name: string,
  classes: readonly string[],
  within: (tap: string) => boolean
): { beat: Beat; at: number } | null {
  const rule = Object.hasOwn(RULES, name) ? RULES[name] : null;
  if (!rule) return null;
  if (rule.only !== undefined && !classes.includes(rule.only)) return null;
  if (rule.within !== undefined && !within(rule.within)) return null;
  return { beat: rule.beat, at: rule.at ?? 0 };
}

export function coinTicks(
  at: number,
  ms: number,
  from: number,
  to: number
): number[] {
  if (from === to) return [];
  const { gap, most } = BEAT.coin,
    n = Math.min(most, Math.max(1, Math.floor(ms / gap))),
    ticks: number[] = [];
  for (let k = n; k >= 1; k--) {
    const t = at + ms * (1 - (1 - k / n) ** (1 / 3));
    if (ticks.length === 0 || ticks[0] - t >= gap) ticks.unshift(t);
  }
  return ticks;
}

let heard: (b: Beat) => void = () => undefined;
const last = new Map<Beat, number>();
const hooked = new WeakSet<HTMLElement>();

export function beat(b: Beat) {
  const now = performance.now();
  if (now - (last.get(b) ?? -Infinity) < BEAT.apart) return;
  last.set(b, now);
  heard(b);
}

const lasting = (el: Element, name: string) => {
  const style = getComputedStyle(el),
    names = style.animationName.split(','),
    times = style.animationDuration.split(','),
    i = names.findIndex((n) => n.trim() === name),
    t = (times[i < 0 ? 0 : i % times.length] ?? '0s').trim();
  return t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000;
};

export function onBeats(layer: HTMLElement, to: (b: Beat) => void) {
  heard = to;
  if (hooked.has(layer)) return;
  hooked.add(layer);
  layer.addEventListener('animationstart', (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const found = beatOf(
      e.animationName,
      (el.getAttribute('class') ?? '').split(/\s+/),
      (tap) => el.closest(`[data-tap="${tap}"]`) !== null
    );
    if (!found) return;
    const wait = found.at * lasting(el, e.animationName);
    if (wait <= 0) beat(found.beat);
    else window.setTimeout(() => beat(found.beat), wait);
  });
}

export function createBeats() {
  let timers: number[] = [];
  return {
    play(list: readonly { beat: Beat; at: number }[]) {
      for (const { beat: b, at } of list)
        timers.push(window.setTimeout(() => beat(b), at));
    },
    stop() {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    },
  };
}

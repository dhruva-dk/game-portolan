import { blowOf, felt, type Blow, type Deed } from '../player.ts';
import { easeInOut } from '../world/scalar.ts';

const PRIORITY = { hurt: 0, hit: 1, break: 2, kill: 3 } as const;
type Priority = keyof typeof PRIORITY;

interface Stop {
  scale: number;
  hold: number;
  release: number;
  priority: Priority;
}

export const STOPS = {
  hit: { scale: 0.05, hold: 0.045, release: 0.06, priority: 'hit' },
  shieldHit: { scale: 0.1, hold: 0.035, release: 0.05, priority: 'hit' },
  shieldBreak: { scale: 0, hold: 0.11, release: 0.14, priority: 'break' },
  shieldLost: { scale: 0.05, hold: 0.08, release: 0.12, priority: 'break' },
  hurt: { scale: 0.35, hold: 0.04, release: 0.08, priority: 'hurt' },
  sink: { scale: 0.2, hold: 0.32, release: 0.35, priority: 'kill' },
} as const satisfies Record<string, Stop>;
const DEALT: Record<Blow, Stop> = {
  broke: STOPS.shieldBreak,
  hull: STOPS.hit,
  shield: STOPS.shieldHit,
};

const BUDGET = 0.2,
  WINDOW = 1,
  MAX_HOLD = 0.6,
  FRAME = 1 / 60;

export function stopFor(
  d: Deed,
  me: number
): { stop: Stop; strength: number } | null {
  if (d.kind === 'sank')
    return d.by === me && d.ship !== me
      ? { stop: STOPS.sink, strength: 1 }
      : null;
  if (d.kind !== 'struck') return null;
  const points = d.shield + d.hull;
  if (d.by === me && d.ship !== me)
    return {
      stop: DEALT[blowOf(d)],
      strength: Math.min(1, felt.dealt(points)),
    };
  if (d.ship === me && points > 0)
    return {
      stop: d.broke ? STOPS.shieldLost : STOPS.hurt,
      strength: Math.min(1, felt.taken(points)),
    };
  return null;
}

type Live = Stop & { age: number };
const valueOf = (s: Live) =>
  s.age < s.hold
    ? s.scale
    : s.scale +
      (1 - s.scale) *
        easeInOut(Math.min(1, (s.age - s.hold) / Math.max(1e-6, s.release)));
const budgeted = (s: Stop) => PRIORITY[s.priority] < PRIORITY.kill;
const toCome = (s: Live) =>
  (1 - s.scale) *
  (Math.max(0, s.hold - s.age) +
    (Math.min(s.release, s.hold + s.release - s.age) * 2) / 3);

export function createStops() {
  const live: Live[] = [],
    spentAt: number[] = [],
    frozen: number[] = [];
  let now = 0;

  const current = () => {
    let floor = -1;
    for (const s of live)
      if (s.age < s.hold) floor = Math.max(floor, PRIORITY[s.priority]);
    let scale = 1;
    for (const s of live)
      if (PRIORITY[s.priority] >= floor) scale = Math.min(scale, valueOf(s));
    return scale;
  };
  const used = () => {
    let spent = 0,
      coming = 0;
    for (const f of frozen) spent += f;
    for (const s of live) if (budgeted(s)) coming += toCome(s);
    return spent + coming;
  };

  return {
    request(spec: Stop, strength = 1) {
      const depth = (1 - spec.scale) * Math.min(1, strength);
      let hold = Math.min(
        spec.hold * (strength < 1 ? 0.5 + strength / 2 : 1),
        MAX_HOLD
      );
      if (budgeted(spec) && depth > 0) {
        const left = BUDGET - used(),
          cost = depth * (hold + (spec.release * 2) / 3);
        if (cost > left)
          hold = Math.max(0, left / depth - (spec.release * 2) / 3);
        if (hold < FRAME && cost > left) return;
      }
      live.push({ ...spec, scale: 1 - depth, hold, age: 0 });
    },
    update(dt: number): number {
      const scale = current();
      now += dt;
      let n = 0;
      for (const s of live) {
        s.age += dt;
        if (s.age < s.hold + s.release) live[n++] = s;
      }
      live.length = n;
      if (scale < 1 && live.length && live.every(budgeted)) {
        spentAt.push(now);
        frozen.push((1 - scale) * dt);
      }
      n = 0;
      for (let i = 0; i < spentAt.length; i++) {
        if (spentAt[i] < now - WINDOW) continue;
        spentAt[n] = spentAt[i];
        frozen[n++] = frozen[i];
      }
      spentAt.length = frozen.length = n;
      return dt * scale;
    },
    clear() {
      live.length = spentAt.length = frozen.length = 0;
    },
  };
}

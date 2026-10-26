import { EVENT, FLIGHT } from '../sim/state.ts';

export type Haptic = 'loop' | 'trail' | 'hit' | 'fire' | 'ram' | 'chest' | 'bank' | 'gull' | 'storm' | 'home' | 'sink' | 'sail' | 'tap';
export type Pulse = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'select';
export interface Backend { pulse(p: Pulse): void }
interface Pattern { readonly pulses: readonly (readonly [ms: number, p: Pulse])[]; readonly rest: number; readonly weight: number }

const p = (rest: number, weight: number, ...pulses: [number, Pulse][]): Pattern => ({ pulses, rest, weight });

export const PATTERNS: Readonly<Record<Exclude<Haptic, 'loop'>, Pattern>> = {
  fire: p(140, 2, [0, 'medium']),
  hit: p(160, 3, [0, 'heavy'], [70, 'light']),
  ram: p(300, 4, [0, 'heavy'], [90, 'heavy']),
  chest: p(500, 3, [0, 'heavy'], [130, 'success']),
  bank: p(700, 2, [0, 'light'], [60, 'light'], [130, 'medium']),
  trail: p(600, 3, [0, 'warning']),
  gull: p(800, 1, [0, 'light'], [110, 'light']),
  storm: p(2500, 3, [0, 'heavy'], [180, 'medium']),
  home: p(2500, 1, [0, 'light'], [90, 'medium']),
  sink: p(4000, 5, [0, 'error'], [220, 'heavy'], [560, 'heavy']),
  sail: p(90, 0, [0, 'select']),
  tap: p(60, 0, [0, 'select']),
};

export function loopPattern(size: number): Pattern {
  const s = Math.max(0, Math.min(3, Math.round(size)));
  const steps: Pulse[] = (['light', 'medium', 'heavy', 'heavy'] as Pulse[]).slice(0, s + 1);
  return { pulses: [...steps.map((q, i) => [i * 75, q] as [number, Pulse]), [steps.length * 75 + 60, 'success']], rest: 800, weight: 4 };
}

export const loopSize = (area: number): number => Math.max(0, Math.min(3, Math.floor(Math.log10(Math.max(1, area) / 60))));

export const LIMIT = { gap: 45, perSecond: 10, stale: 250 } as const;

interface HappeningLike { readonly kind: number; readonly ship: number; readonly by: number; readonly amount: number }

export function eventHaptic(e: HappeningLike, me: number): [Haptic, number] | null {
  const mine = e.ship === me;
  switch (e.kind) {
    case EVENT.loop: return mine ? ['loop', loopSize(e.amount)] : null;
    case EVENT.broken: return mine ? ['trail', 0] : null;
    case EVENT.hit: case EVENT.struck: return mine ? ['hit', 0] : null;
    case EVENT.broadside: return mine ? ['fire', 0] : null;
    case EVENT.ram: return mine || e.by === me ? ['ram', 0] : null;
    case EVENT.opened: return mine ? ['chest', 0] : null;
    case EVENT.bank: return mine ? ['bank', 0] : null;
    case EVENT.sunk: return mine ? ['sink', 0] : null;
    default: return null;
  }
}

export interface Watched { gullFlight: number; inHome: boolean; stormEdge: boolean }

interface Due { at: number; p: Pulse; w: number }

export class Haptics {
  enabled = true;
  private readonly backend: Backend;
  private readonly now: () => number;
  private readonly last = new Map<Haptic, number>();
  private readonly due: Due[] = [];
  private readonly fired: number[] = [];
  private lastPulse = -Infinity;
  private seen: Watched | null = null;

  constructor(backend: Backend = nativeBackend(), now: () => number = () => performance.now()) {
    this.backend = backend;
    this.now = now;
  }

  play(h: Haptic, size = 0): boolean {
    if (!this.enabled) return false;
    const t = this.now(), pat = h === 'loop' ? loopPattern(size) : PATTERNS[h];
    if (t - (this.last.get(h) ?? -Infinity) < pat.rest) return false;
    this.last.set(h, t);
    for (const [ms, q] of pat.pulses) this.due.push({ at: t + ms, p: q, w: pat.weight });
    this.due.sort((a, b) => a.at - b.at);
    this.flush();
    return true;
  }

  events(events: readonly HappeningLike[], me: number): void {
    for (const e of events) {
      const h = eventHaptic(e, me);
      if (h) this.play(h[0], h[1]);
    }
  }

  cue(c: { readonly sound: string; readonly near: boolean }): void {
    if (!c.near) return;
    if (/chest/i.test(c.sound)) this.play('chest');
  }

  watch(w: Watched): void {
    const was = this.seen;
    this.seen = { ...w };
    if (!was) return;
    if ((was.gullFlight === FLIGHT.back || was.gullFlight === FLIGHT.circle) && w.gullFlight === FLIGHT.mast) this.play('gull');
    if (!was.inHome && w.inHome) this.play('home');
    if (!was.stormEdge && w.stormEdge) this.play('storm');
  }

  flush(): void {
    const t = this.now();
    while (this.fired.length > 0 && this.fired[0] <= t - 1000) this.fired.shift();
    while (this.due.length > 0 && this.due[0].at <= t) {
      const e = this.due.shift()!;
      if (t - e.at > LIMIT.stale) continue;
      if (t - this.lastPulse < LIMIT.gap || this.fired.length >= LIMIT.perSecond) {
        if (e.w >= 3 && t - e.at < LIMIT.stale - LIMIT.gap) { e.at = this.lastPulse + LIMIT.gap; this.due.unshift(e); break; }
        continue;
      }
      this.backend.pulse(e.p);
      this.lastPulse = t;
      this.fired.push(t);
    }
  }
}

const IMPACT: Record<string, string> = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };
const VIBRATE: Record<Pulse, number> = { light: 8, medium: 14, heavy: 24, success: 18, warning: 30, error: 40, select: 5 };

interface HapticsPlugin {
  impact(o: { style: string }): Promise<void>;
  notification(o: { type: string }): Promise<void>;
  selectionChanged(): Promise<void>;
}
interface CapacitorGlobal {
  isNativePlatform?(): boolean;
  isPluginAvailable?(name: string): boolean;
  registerPlugin?<T>(name: string): T;
}

export function nativeBackend(): Backend {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  try {
    if (cap?.isNativePlatform?.() && cap.isPluginAvailable?.('Haptics') && cap.registerPlugin) {
      const h = cap.registerPlugin<HapticsPlugin>('Haptics');
      const quiet = (): void => {};
      return {
        pulse(q) {
          const r = q === 'success' || q === 'warning' || q === 'error' ? h.notification({ type: q.toUpperCase() })
            : q === 'select' ? h.selectionChanged() : h.impact({ style: IMPACT[q] });
          r.catch(quiet);
        },
      };
    }
  } catch {  }
  const nav = (globalThis as { navigator?: { vibrate?: (ms: number) => boolean } }).navigator;
  if (nav && typeof nav.vibrate === 'function') return { pulse: (q) => { nav.vibrate!(VIBRATE[q]); } };
  return { pulse: () => {} };
}

// Haptics through @capacitor/haptics on the device, and a logged no-op in the browser. Single taps (light, medium,
// heavy, the three notifications and the selection tick) and rhythmic patterns built from them, scheduled on the
// juice clock so a captured strip logs each beat on the frame it lands.
//
// The Taptic Engine blurs taps closer than ~35 ms into one buzz, so taps inside that gap are dropped unless they're
// stronger than the one that just played.
import { effects } from './log.ts';

export type HapticKind = 'select' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export interface Beat {
  /** Milliseconds from the start of the pattern. */
  at: number;
  kind: HapticKind;
}

/**
 * The patterns, timed by ear for the Taptic Engine. Gaps under 50 ms smear, 60-120 ms reads as a figure, and
 * 150 ms or more reads as separate beats.
 * - shieldBreak: a heavy crack, then two light tinkles falling away, like glass.
 * - shieldLost: the crack felt from inside: heavy, heavy, then a warning.
 * - sink: a heavy hit, then the hull going under in two settling knocks.
 * - heartbeat: lub-dub, the low-hull pulse (repeated by the screen effects while the hull is low).
 * - levelUp: rising light → medium → heavy, landing on success.
 * - rankUp: da-da-DUM, a stamp, then success.
 * - win: a rolling fanfare that ends on a success and a last heavy.
 * - legendary: a pickup worth stopping for: heavy, then a shimmer of light taps.
 */
export const PATTERNS = {
  shieldBreak: [
    { at: 0, kind: 'heavy' },
    { at: 70, kind: 'light' },
    { at: 150, kind: 'light' },
  ],
  shieldLost: [
    { at: 0, kind: 'heavy' },
    { at: 90, kind: 'heavy' },
    { at: 220, kind: 'warning' },
  ],
  sink: [
    { at: 0, kind: 'heavy' },
    { at: 160, kind: 'medium' },
    { at: 380, kind: 'light' },
  ],
  heartbeat: [
    { at: 0, kind: 'heavy' },
    { at: 150, kind: 'medium' },
  ],
  levelUp: [
    { at: 0, kind: 'light' },
    { at: 90, kind: 'medium' },
    { at: 190, kind: 'heavy' },
    { at: 420, kind: 'success' },
  ],
  rankUp: [
    { at: 0, kind: 'medium' },
    { at: 130, kind: 'medium' },
    { at: 330, kind: 'heavy' },
    { at: 600, kind: 'success' },
  ],
  win: [
    { at: 0, kind: 'heavy' },
    { at: 180, kind: 'medium' },
    { at: 300, kind: 'medium' },
    { at: 420, kind: 'heavy' },
    { at: 900, kind: 'success' },
    { at: 1250, kind: 'heavy' },
  ],
  legendary: [
    { at: 0, kind: 'heavy' },
    { at: 120, kind: 'light' },
    { at: 200, kind: 'light' },
    { at: 280, kind: 'light' },
  ],
} as const satisfies Record<string, readonly Beat[]>;

export type PatternName = keyof typeof PATTERNS;

const WEIGHT: Record<HapticKind, number> = { select: 0, light: 1, medium: 2, heavy: 3, success: 2, warning: 3, error: 3 };

/** What actually makes the buzz. Null in the browser. */
export interface HapticDriver {
  play(kind: HapticKind): void;
}

/** Loads the Capacitor driver on a native platform; resolves to null in a browser. */
export async function capacitorDriver(): Promise<HapticDriver | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const { Haptics: H, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    const quiet = () => {};
    return {
      play(kind) {
        if (kind === 'select') H.selectionChanged().catch(quiet);
        else if (kind === 'light') H.impact({ style: ImpactStyle.Light }).catch(quiet);
        else if (kind === 'medium') H.impact({ style: ImpactStyle.Medium }).catch(quiet);
        else if (kind === 'heavy') H.impact({ style: ImpactStyle.Heavy }).catch(quiet);
        else if (kind === 'success') H.notification({ type: NotificationType.Success }).catch(quiet);
        else if (kind === 'warning') H.notification({ type: NotificationType.Warning }).catch(quiet);
        else H.notification({ type: NotificationType.Error }).catch(quiet);
      },
    };
  } catch {
    return null;
  }
}

export class Haptics {
  /** The player's haptics setting. */
  enabled = true;
  /** Seconds below which a second tap merges into the first. */
  minGap = 0.035;
  driver: HapticDriver | null = null;
  private queue: { at: number; kind: HapticKind; pattern: string; source: string }[] = [];
  private now = 0;
  private last = { t: -1, weight: -1 };

  constructor(driver?: HapticDriver | null) {
    if (driver !== undefined) this.driver = driver;
    else void capacitorDriver().then((d) => (this.driver ??= d));
  }

  /** Plays one tap or a named pattern now. */
  play(what: HapticKind | PatternName): void {
    if (what in PATTERNS) {
      const beats: readonly Beat[] = PATTERNS[what as PatternName];
      effects.add('haptic', `pattern ${what}`, { beats: beats.length, ms: beats[beats.length - 1].at }, this.enabled ? 'played' : 'suppressed');
      if (!this.enabled) return;
      for (const b of beats) {
        if (b.at === 0) this.tap(b.kind, what);
        else this.queue.push({ at: this.now + b.at / 1000, kind: b.kind, pattern: what, source: effects.source });
      }
      return;
    }
    this.tap(what as HapticKind, '');
  }

  /** Steps queued pattern beats on the juice clock (real time). */
  update(dt: number): void {
    this.now += dt;
    if (!this.queue.length) return;
    const due = this.queue.filter((q) => q.at <= this.now + 1e-6);
    this.queue = this.queue.filter((q) => q.at > this.now + 1e-6);
    for (const q of due) {
      effects.begin(q.source);
      this.tap(q.kind, q.pattern);
      effects.end();
    }
  }

  cancel(): void {
    this.queue = [];
  }

  private tap(kind: HapticKind, pattern: string): void {
    const w = WEIGHT[kind];
    const detail = { native: !!this.driver, ...(pattern ? { pattern } : {}) };
    if (!this.enabled) {
      effects.add('haptic', kind, detail, 'suppressed');
      return;
    }
    if (this.now - this.last.t < this.minGap && w <= this.last.weight) {
      effects.add('haptic', kind, { ...detail, merged: true }, 'suppressed');
      return;
    }
    this.last = { t: this.now, weight: w };
    this.driver?.play(kind);
    effects.add('haptic', kind, detail);
  }
}

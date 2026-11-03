// The effect log: every camera move, hit-stop, haptic, flash, marker, animation, particle hook and sound hook that
// fires, with what it resolved to. It's read next to a frame strip, so it says what actually played,
// what was trimmed by a budget and what was suppressed, and why.

export type Channel =
  | 'camera'
  | 'time'
  | 'haptic'
  | 'flash'
  | 'vignette'
  | 'marker'
  | 'number'
  | 'anim'
  | 'particles'
  | 'sound';

/** played: as asked. trimmed: played, but cut down by a budget. suppressed: didn't play. */
export type Outcome = 'played' | 'trimmed' | 'suppressed';

export type Detail = Record<string, number | string | boolean>;

export interface EffectEntry {
  /** Real seconds since the log started (the clock hit-stop doesn't slow). */
  t: number;
  frame: number;
  /** The recipe that fired it, or 'direct' for a call straight into a channel. */
  source: string;
  channel: Channel;
  what: string;
  outcome: Outcome;
  detail: Detail;
}

export class EffectLog {
  readonly entries: EffectEntry[] = [];
  limit = 4000;
  now = 0;
  frame = 0;
  private sources: string[] = [];
  private readonly listeners = new Set<(e: EffectEntry) => void>();

  /** Advances the log's clock. The Juice instance calls this once a frame with real time. */
  tick(realDt: number): void {
    this.now += realDt;
    this.frame++;
  }

  /** Everything added until `end` is credited to this recipe. */
  begin(source: string): void {
    this.sources.push(source);
  }

  end(): void {
    this.sources.pop();
  }

  get source(): string {
    return this.sources[this.sources.length - 1] ?? 'direct';
  }

  add(channel: Channel, what: string, detail: Detail = {}, outcome: Outcome = 'played'): EffectEntry {
    const e: EffectEntry = { t: this.now, frame: this.frame, source: this.source, channel, what, outcome, detail };
    this.entries.push(e);
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
    for (const fn of this.listeners) fn(e);
    return e;
  }

  listen(fn: (e: EffectEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  since(t: number): EffectEntry[] {
    return this.entries.filter((e) => e.t >= t);
  }

  clear(): void {
    this.entries.length = 0;
  }

  /** One line per entry: time, frame, source, channel, what, outcome and the resolved numbers. */
  text(entries: readonly EffectEntry[] = this.entries): string {
    return entries.map(format).join('\n');
  }
}

export function format(e: EffectEntry): string {
  const d = Object.entries(e.detail)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? +v.toFixed(3) : v}`)
    .join(' ');
  const flag = e.outcome === 'played' ? '' : ` [${e.outcome}]`;
  return `${e.t.toFixed(3).padStart(8)}s #${String(e.frame).padEnd(5)} ${e.source.padEnd(18)} ${e.channel.padEnd(9)} ${e.what}${flag}${d ? '  ' + d : ''}`;
}

/** The one log every channel writes to. */
export const effects = new EffectLog();

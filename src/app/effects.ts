// The effect log. Every sound played, every haptic, every screen, camera and actor effect, and every screen change
// goes in here with the loop's clock and the simulation tick, so the reviewer's capture tools can read exactly what a
// moment did and when. The juice library keeps its own log (src/juice/log.ts); the app copies each of its entries in
// as it happens, so this one log holds everything on one clock.
import { effects as juiceLog } from '../juice/index.ts';

export type EffectKind =
  | 'sound' | 'haptic' | 'camera' | 'time' | 'flash' | 'vignette' | 'marker' | 'number' | 'anim' | 'particles'
  | 'screen' | 'actor' | 'hud' | 'flow';

export interface EffectEntry {
  /** The loop's clock in seconds when it fired. */
  t: number;
  /** The simulation tick it came from, or -1 outside a match. */
  tick: number;
  kind: EffectKind;
  name: string;
  data?: Record<string, unknown>;
}

const LOG_CAP = 8000;

export class EffectLog {
  readonly entries: EffectEntry[] = [];
  clock = 0;
  tick = -1;

  constructor() {
    juiceLog.listen((e) => this.add(e.channel, e.what, { ...e.detail, recipe: e.source, outcome: e.outcome }));
  }

  add(kind: EffectKind, name: string, data?: Record<string, unknown>): void {
    const e: EffectEntry = { t: Math.round(this.clock * 1000) / 1000, tick: this.tick, kind, name };
    if (data) e.data = data;
    this.entries.push(e);
    if (this.entries.length > LOG_CAP) this.entries.splice(0, this.entries.length - LOG_CAP);
  }

  since(t: number): EffectEntry[] {
    return this.entries.filter((e) => e.t >= t);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

// What the game has taught: the first time a mechanic matters the chart pins a drawn scrap for it (src/screens/scraps.ts,
// and the hand over the Gale), each once in a career. The match's moments offer scraps, the HUD pins them one at a time
// as it has room, and the ones shown are kept in the browser's storage beside the settings. Capture mode keeps them in
// memory and starts with them off, so the capture tools' frames show only what they arrange.
import { PLAYER } from '../sim/match.ts';
import type { ScrapId } from '../screens/scraps.ts';
import type { Moment } from './events.ts';
import type { Session } from './session.ts';

export const TIPS_KEY = 'portolan.tips';

/** The scraps the HUD pins. */
const SCRAPS: readonly ScrapId[] = ['wind', 'fight', 'closing'];
/** What the chart teaches in place: the Gale's hand at DIVE. */
const DRAWN = ['gale'] as const;

export type TipId = ScrapId | (typeof DRAWN)[number];

const known = (id: string): id is TipId => (SCRAPS as readonly string[]).includes(id) || (DRAWN as readonly string[]).includes(id);

/** The ids read back from storage: anything that isn't a list of known ids is dropped. */
export function parseSeen(raw: string | null): Set<TipId> {
  const out = new Set<TipId>();
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(v)) for (const id of v) if (typeof id === 'string' && known(id)) out.add(id);
  } catch {
    // a broken save shows the scraps again
  }
  return out;
}

export class Tips {
  /** Whether scraps are offered at all: off in capture mode until the hook turns them on. */
  on: boolean;
  private readonly seen: Set<TipId>;
  private readonly storage: Storage | null;
  private readonly queue: ScrapId[] = [];

  constructor(capture: boolean) {
    let st: Storage | null = null;
    try {
      st = capture ? null : localStorage;
    } catch {
      // storage blocked: the scraps seen are remembered for this visit
    }
    this.storage = st;
    let raw: string | null = null;
    try {
      raw = st?.getItem(TIPS_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.seen = parseSeen(raw);
    this.on = !capture;
  }

  /** The scraps shown so far, in no order. */
  get shown(): TipId[] {
    return [...this.seen];
  }

  /** A new match: nothing waiting. */
  reset(): void {
    this.queue.length = 0;
  }

  /** Whether the chart should draw its teaching for `id` now: true the first time it is asked (and from then on it
   *  counts as shown). */
  drawn(id: (typeof DRAWN)[number]): boolean {
    if (!this.on || this.seen.has(id)) return false;
    this.seen.add(id);
    this.save();
    return true;
  }

  /** Forgets every scrap shown, so each shows again. */
  forget(): void {
    this.seen.clear();
    this.save();
  }

  /** A moment in the match: the ones that are the player's own offer their scraps. */
  moment(m: Moment, s: Session): void {
    if (!this.on || s.watch !== PLAYER) return;
    switch (m.k) {
      case 'about': if (m.ship === PLAYER && m.how === 'irons') this.offer('wind'); break;
      case 'hit': if (!m.steady && m.shield + m.hull > 0 && (m.ship === PLAYER ? m.by >= 0 && m.by !== PLAYER : m.by === PLAYER)) this.offer('fight'); break;
      case 'stormPhase': this.offer('closing'); break;
      default:
    }
  }

  /** The next scrap to pin, and it counts as shown from here: asked only when the HUD has room for one. */
  next(): ScrapId | null {
    const id = this.queue.shift() ?? null;
    if (id) {
      this.seen.add(id);
      this.save();
    }
    return id;
  }

  /** Queues a scrap that has never shown and isn't already waiting. */
  private offer(id: ScrapId): void {
    if (this.seen.has(id) || this.queue.includes(id)) return;
    this.queue.push(id);
  }

  private save(): void {
    try {
      this.storage?.setItem(TIPS_KEY, JSON.stringify([...this.seen]));
    } catch {
      // storage full or blocked: the scraps seen hold for this visit
    }
  }
}

// The career, as the app holds it: loaded from and saved to the browser's storage (never in capture mode), a plan for
// each match, and a tally kept through the match that becomes the career's MatchReport at the end.
import {
  applyMatch, loadCareer, memoryStore, planMatch, saveCareer, webStore, NO_HABITS, WEAPON_CLASSES as CAREER_WEAPONS,
  type Career, type MatchChanges, type MatchPlan, type MatchReport, type PlayerHabits, type SaveStore,
} from '../career/index.ts';
import { regionAt } from '../sim/world/index.ts';
import type { V3 } from '../sim/math.ts';
import type { Moment } from './events.ts';

export class CareerHolder {
  career: Career;
  readonly store: SaveStore;
  /** What the last match changed, for the results screen. */
  last: { changes: MatchChanges; before: Career } | null = null;

  constructor(capture: boolean) {
    this.store = capture ? memoryStore() : safeWebStore();
    this.career = loadCareer(this.store, (Math.random() * 0xffffffff) >>> 0).career;
  }

  plan(): MatchPlan {
    return planMatch(this.career);
  }

  /** Applies a finished match, saves, and keeps the changes for the results. */
  apply(report: MatchReport): MatchChanges {
    const before = this.career, { career, changes } = applyMatch(before, report);
    this.career = career;
    this.last = { changes, before };
    this.save();
    return changes;
  }

  /** Replaces the career (after an equip in a menu, say) and saves. */
  set(c: Career): void {
    this.career = c;
    this.save();
  }

  save(): void {
    try {
      saveCareer(this.store, this.career);
    } catch {
      // storage full or blocked: the career lives on in memory
    }
  }
}

function safeWebStore(): SaveStore {
  try {
    return webStore(localStorage);
  } catch {
    return memoryStore();
  }
}

interface ShipTally {
  kills: number;
  damage: number;
  survived: number;
  regions: Set<number>;
  sunkBy: number;
  sunkAt: number;
}

/** Keeps score through a match: kills, damage, time afloat, regions sailed, the order ships sank, and habits. */
export class MatchTally {
  readonly ships: ShipTally[];
  private readonly order: number[] = [];
  private drop: number | null = null;
  private rangeSum = 0;
  private rangeN = 0;
  private readonly byWeapon = new Map<string, number>();
  private clock = 0;

  constructor(count: number) {
    this.ships = Array.from({ length: count }, () => ({ kills: 0, damage: 0, survived: 0, regions: new Set<number>(), sunkBy: -1, sunkAt: -1 }));
  }

  /** Called once a second of match time with every ship's position (unit vector) and whether it floats. */
  sample(seconds: number, ships: readonly { pos: V3; afloat: boolean }[]): void {
    this.clock = seconds;
    ships.forEach((s, i) => {
      if (!s.afloat) return;
      this.ships[i].survived = seconds;
      this.ships[i].regions.add(regionAt(s.pos));
    });
  }

  /** Reads one moment; `posOf(i)` gives ship i's position in metres, for the range of the player's hits. */
  observe(m: Moment, posOf: (i: number) => V3): void {
    switch (m.k) {
      case 'hit':
        if (m.by >= 0 && m.by !== m.ship) {
          this.ships[m.by].damage += m.shield + m.hull;
          if (m.by === 0) {
            const a = posOf(0), b = posOf(m.ship);
            this.rangeSum += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
            this.rangeN++;
            this.byWeapon.set(m.weapon, (this.byWeapon.get(m.weapon) ?? 0) + m.shield + m.hull);
          }
        }
        return;
      case 'sink': {
        const t = this.ships[m.ship];
        if (t.sunkAt >= 0) return;
        t.sunkAt = this.clock;
        t.sunkBy = m.by !== m.ship ? m.by : -1;
        if (m.by >= 0 && m.by !== m.ship) this.ships[m.by].kills++;
        this.order.push(m.ship);
        return;
      }
      case 'galeDive':
        if (m.ship === 0) this.drop = m.region;
        return;
      default:
        return;
    }
  }

  get sunk(): readonly number[] {
    return this.order;
  }

  /**
   * The career's report. Ships sunk get places from the back; any still afloat (the winner, or everyone left when the
   * player quits early) are placed ahead of them by `standing` (higher is better).
   */
  report(captains: readonly string[], standing: (i: number) => number): MatchReport {
    const n = this.ships.length, place = new Array<number>(n).fill(0);
    this.order.forEach((ship, k) => { place[ship] = n - k; });
    const afloat = this.ships.map((_, i) => i).filter((i) => place[i] === 0).sort((a, b) => standing(b) - standing(a));
    afloat.forEach((ship, k) => { place[ship] = k + 1; });
    return {
      captains: [...captains],
      ships: this.ships.map((s, i) => ({
        place: place[i], kills: s.kills, damage: Math.round(s.damage), survived: Math.round(s.sunkAt >= 0 ? s.sunkAt : this.clock),
        regions: [...s.regions].sort((a, b) => a - b), sunkBy: s.sunkBy,
      })),
      habits: this.habits(),
    };
  }

  private habits(): PlayerHabits {
    let best: string | null = null, most = 0;
    for (const [w, d] of this.byWeapon) if (d > most) { most = d; best = w; }
    const weapon = best === null ? -1 : (CAREER_WEAPONS as readonly string[]).indexOf(best);
    return {
      ...NO_HABITS,
      drop: this.drop,
      range: this.rangeN ? Math.round(this.rangeSum / this.rangeN) : null,
      weapon: weapon >= 0 ? weapon : null,
    };
  }
}

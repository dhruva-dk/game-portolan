// The race's teaching (#58 step 8.3): four folios in the settings folio's form (screens.ts folio), each laid over the
// match the first time what it teaches comes up, closed by its mark or a tap outside it, and not shown again on this
// device. No words: each is drawn.
//   crewmate  her ship and her crewmate's alike in their side's colours; a ball between them stops harmless (its burst
//             struck out), a ball on a foe bursts in rubric. The first race she sails with one.
//   faults    her six parts' marks, one in rubric, her wake shortened beside it. Her first part failed.
//   flight    her ship in their side's water (azure), the gull coming, then its jobs in order: hull, gust, stores, part.
//             The first time she may call it.
//   calls     the call wheel's four marks, each over what it does: two ships together, a ship ringed, a ship in their
//             water, a ship sailing free. Once the crewmate's folio is closed.

import type { Race } from '../player';
import type { Glyph } from './glyphs';
import { INK, WASH, galleon, glyph, paperDisc } from './ink';
import { H, W, folio } from './screens';

export type Lesson = 'crewmate' | 'faults' | 'flight' | 'calls';

/** The folio's size and place in the page, centred. */
const FW = 560, FH = 270, X = (W - FW) / 2, Y = (H - FH) / 2 - 40;
/** Where shown lessons are kept on this device (a convenience: none kept, each shows once a page load). */
const KEPT = 'portolan.taught';

/** A burst: rubric spikes round a point, or struck out (harmless). */
const burst = (x: number, y: number, harmless: boolean) => (harmless
  ? `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${INK.sepia}" stroke-width="1.6" stroke-dasharray="3 3"/><path d="M${x - 12} ${y + 12}L${x + 12} ${y - 12}" stroke="${INK.iron}" stroke-width="2.4" stroke-linecap="round"/>`
  : `<path d="M${x} ${y - 14}L${x + 4} ${y - 4}L${x + 14} ${y}L${x + 4} ${y + 4}L${x} ${y + 14}L${x - 4} ${y + 4}L${x - 14} ${y}L${x - 4} ${y - 4}Z" fill="${INK.rubric}" stroke="${INK.iron}" stroke-width="1"/>`);
/** A dashed arrow from (x1, y1) to (x2, y2). */
const arrow = (x1: number, y1: number, x2: number, y2: number, ink: string = INK.iron) => {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 9;
  return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${ink}" stroke-width="2" stroke-dasharray="6 4" fill="none"/>`
    + `<path d="M${x2} ${y2}L${x2 - h * Math.cos(a - 0.45)} ${y2 - h * Math.sin(a - 0.45)}L${x2 - h * Math.cos(a + 0.45)} ${y2 - h * Math.sin(a + 0.45)}Z" fill="${ink}"/>`;
};
/** Their side's water: an azure wash. */
const water = (x: number, y: number, rx: number, ry: number) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${WASH.azure}" opacity=".35" stroke="${WASH.azure}" stroke-width="1.6"/>`;
/** Her ship and her crewmate's: vermilion sails. */
const ours = (x: number, y: number, size: number) => galleon(x, y, size, { sail: WASH.vermilion });

const LESSONS: Readonly<Record<Lesson, () => string>> = {
  crewmate: () => {
    const y = Y + 150;
    return ours(X + 110, y, 96) + ours(X + 250, y, 96) + galleon(X + 450, y, 96, { sail: WASH.viridian })
      + arrow(X + 140, y - 40, X + 232, y - 40) + burst(X + 250, y - 40, true)
      + arrow(X + 280, y + 46, X + 430, y + 46, INK.rubric) + burst(X + 450, y + 30, false);
  },
  faults: () => {
    const parts: Glyph[] = ['part.sails', 'part.rigging', 'part.rudder', 'part.hull', 'part.keel', 'part.mounts'];
    const row = parts.map((p, i) => glyph(p, X + 90 + i * 76, Y + 90, 44, { ink: i === 2 ? 'rubric' : 'iron' })).join('');
    const wake = (x: number, long: number) => `<path d="M${x} ${Y + 210}h${-long}" stroke="${WASH.ultramarine}" stroke-width="3" stroke-dasharray="8 5"/>`;
    return row + arrow(X + 242, Y + 120, X + 242, Y + 168, INK.rubric)
      + galleon(X + 300, Y + 205, 80) + wake(X + 255, 60) + `<path d="M${X + 380} ${Y + 205}h40" stroke="${INK.rubric}" stroke-width="3"/>`;
  },
  flight: () => {
    const y = Y + 160, jobs: Glyph[] = ['item.repairKit', 'hud.gust', 'item.smallShield', 'part.rudder'];
    return water(X + 130, y, 110, 70) + ours(X + 130, y, 90)
      + paperDisc(X + 130, Y + 62, 28) + glyph('hud.flight', X + 130, Y + 62, 34) + arrow(X + 130, Y + 92, X + 130, y - 46)
      + jobs.map((j, i) => paperDisc(X + 300 + i * 62, y, 24) + glyph(j, X + 300 + i * 62, y, 28)
        + (i < jobs.length - 1 ? arrow(X + 326 + i * 62, y, X + 336 + i * 62, y) : '')).join('');
  },
  calls: () => {
    const cx = (i: number) => X + 90 + i * 126, top = Y + 80, low = Y + 200;
    const marks = (['withMe', 'attack', 'hold', 'free'] as const).map((c, i) => paperDisc(cx(i), top, 26) + glyph(`call.${c}`, cx(i), top, 32)).join('');
    return marks
      + ours(cx(0) - 18, low, 56) + ours(cx(0) + 22, low + 6, 56)
      + galleon(cx(1), low, 64, { sail: WASH.viridian }) + `<circle cx="${cx(1)}" cy="${low}" r="36" fill="none" stroke="${INK.rubric}" stroke-width="2"/>`
      + water(cx(2), low, 50, 32) + ours(cx(2), low, 56)
      + ours(cx(3) - 10, low, 56) + arrow(cx(3) + 10, low + 22, cx(3) + 50, low - 20);
  },
};

export function createTeaching() {
  const taught = new Set<Lesson>();
  try {
    for (const l of JSON.parse(localStorage.getItem(KEPT) ?? '[]') as Lesson[]) taught.add(l);
  } catch { /* no storage: each lesson shows once this page load */ }
  const keep = () => {
    try {
      localStorage.setItem(KEPT, JSON.stringify([...taught]));
    } catch { /* as above */ }
  };
  let open: Lesson | null = null;
  const f = folio(X, Y, FW, FH, () => {
    open = null;
    f.show(false);
  });
  const teach = (l: Lesson) => {
    if (open || taught.has(l)) return;
    taught.add(l);
    keep();
    open = l;
    f.draw(LESSONS[l]());
    f.show(true);
  };

  return {
    /** A frame of her race (null: none, or not hers to see): the first lesson it calls for, if none is open. */
    update(r: Race | null) {
      if (!r) return;
      if (r.mate) teach('crewmate');
      // (the calls once the crewmate's folio is closed: one open at a time)
      if (taught.has('crewmate')) teach('calls');
      if (r.faults.length) teach('faults');
      if (r.flight.can) teach('flight');
    },
    /** Whether a lesson is open (the match goes on under it). */
    open: () => open !== null,
    /** Her match left behind (her end, the way home): an open lesson put away. */
    close() {
      if (!open) return;
      open = null;
      f.show(false);
    },
  };
}

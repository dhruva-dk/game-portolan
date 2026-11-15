// Slips over the world that must not cover each other (the rookery's days left: ui/rookery.ts), stacked by where they
// stand on the screen. Pure arithmetic, so it runs in node for the tests.

/** A slip's size on the screen, CSS px: its height, its width by its text's length (the italic numerals at 15 px),
 *  and the gap kept between two stacked. */
const SLIP = { height: 24, perChar: 8.2, pad: 18, gap: 4 } as const;

/** A slip's width for its text, CSS px. */
export const slipWidth = (text: string): number => text.length * SLIP.perChar + SLIP.pad;

/** Where each slip sits (its anchor: the middle of its foot) so none overlaps another: taken nearest the viewer first
 *  (lowest on the screen), each lifted just over any already placed it would cover, so slips of buildings close
 *  together stack upward and keep their order. A slip whose anchor is on a screen `width` wide is kept wholly on it. */
export function settled(slips: readonly { x: number; y: number; w: number }[], width = Infinity): { x: number; y: number }[] {
  const inside = slips.map((s) => {
    const half = s.w / 2 + SLIP.gap;
    return s.x < 0 || s.x > width ? s : { ...s, x: Math.min(Math.max(s.x, half), Math.max(half, width - half)) };
  });
  const order = inside.map((_, i) => i).sort((a, b) => inside[b].y - inside[a].y || inside[a].x - inside[b].x);
  const placed: { x: number; y: number; w: number }[] = [], out = inside.map((s) => ({ x: s.x, y: s.y }));
  for (const i of order) {
    const s = inside[i];
    let y = s.y;
    // each lift is strictly upward and clears the slip it met, so this ends
    for (let moved = true; moved;) {
      moved = false;
      for (const p of placed) {
        const across = Math.abs(p.x - s.x) < (p.w + s.w) / 2 + SLIP.gap, up = Math.abs(p.y - y) < SLIP.height + SLIP.gap;
        if (across && up) {
          y = p.y - SLIP.height - SLIP.gap;
          moved = true;
        }
      }
    }
    placed.push({ x: s.x, y, w: s.w });
    out[i].y = y;
  }
  return out;
}

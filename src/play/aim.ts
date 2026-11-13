// The reticle: where her gun's aim falls on the screen, kept off her own ship.
//
// 0117 aimed along the look (session.ts aimAt, AIM): at the ship its assist had, or else at a point along the look at a
// distance set by how steeply the camera looked down, near when it looked down steeply and far when it looked along the
// sea. Its reticle stood at the screen's middle, where her rig stood too, and it thinned her sail round it. Here the
// camera's boom keeps her in the middle as well, and the reticle is drawn where the aim falls: when that is on her
// (within her outline on the screen), it is lifted clear above her, or below her if there is no room above, keeping
// its place across the screen. The gun lays its own elevation for the range (sim/gun.ts), so the bearing is what the
// reticle tells, and that is kept.
//
// Plain arithmetic on screen points: it imports nothing, so it runs in node for the tests.

/** 0117's aim (session.ts AIM): the distance along the look, metres, from looking down `pitch[1]` radians (near) to
 *  `pitch[0]` (far). */
export const AIM = { near: 40, far: 260, pitch: [0.06, 0.6] } as const;

/** The distance along the look her gun is aimed at, metres, for the camera looking down `pitch` radians. */
export function aimDistance(pitch: number): number {
  const k = Math.min(1, Math.max(0, (AIM.pitch[1] - pitch) / (AIM.pitch[1] - AIM.pitch[0])));
  return AIM.near + (AIM.far - AIM.near) * k;
}

export interface Point { x: number; y: number }

/**
 * Where the reticle is drawn for the aim falling at `p` on a screen `height` px high: p itself if it is clear of her
 * outline (the screen points `outline`, her hull's and rig's) by `pad` px; else at p's place across the screen,
 * `pad` px above her outline's top, or below its bottom if that would be within `top` px of the screen's top (where
 * the HUD's slips are).
 */
export function clear(p: Point, outline: readonly Point[], pad: number, height: number, top = pad): Point {
  if (outline.length === 0) return p;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of outline) [x0, x1, y0, y1] = [Math.min(x0, q.x), Math.max(x1, q.x), Math.min(y0, q.y), Math.max(y1, q.y)];
  if (p.x < x0 - pad || p.x > x1 + pad || p.y < y0 - pad || p.y > y1 + pad) return p;
  return y0 - pad >= top ? { x: p.x, y: y0 - pad } : { x: p.x, y: Math.min(height - pad, y1 + pad) };
}

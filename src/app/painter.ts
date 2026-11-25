import type { Look } from '../render/snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';
import { MOTION } from '../ui/base/house.ts';

const PAPER_LIFT: Vec3 = [0.86, 0.8, 0.68];

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const eased = (t: number) => 1 - (1 - t) ** 3;

const inked = (t: number) =>
  t < 0.5 ? 1 - eased(t * 2) : eased((t - 0.5) * 2);

const same = (a: Look, b: Look) =>
  a.pattern === b.pattern &&
  a.emblem === b.emblem &&
  a.paint.every((c, i) => c === b.paint[i]) &&
  a.sail.every((c, i) => c === b.sail[i]);

export function painter(paint: (look: Look) => void, first: Look) {
  let shown: Look = first,
    from: Look = first,
    to: Look = first,
    began = 0,
    sails = 0.5,
    frame = 0;
  const step = (now: number) => {
    const t = Math.min(1, (now - began) / MOTION.repaint.ms),
      e = eased(t),
      lift = Math.sin(Math.PI * t) * MOTION.repaint.lift;
    shown = {
      paint: mix(mix(from.paint, to.paint, e), PAPER_LIFT, lift),
      sail: mix(mix(from.sail, to.sail, e), PAPER_LIFT, lift * sails),
      pattern: t < 0.5 ? from.pattern : to.pattern,
      emblem: t < 0.5 ? from.emblem : to.emblem,
      ink: from.emblem === to.emblem ? 1 : inked(t),
    };
    paint(shown);
    if (t < 1) frame = requestAnimationFrame(step);
  };
  return (look: Look, again = false) => {
    if (!again && same(look, to)) return;
    cancelAnimationFrame(frame);
    from = shown;
    to = look;
    sails = again ? 0 : 0.5;
    began = performance.now();
    frame = requestAnimationFrame(step);
  };
}

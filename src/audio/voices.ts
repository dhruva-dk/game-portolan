export const VOICES = 16;

export interface Pool {
  begins: Float64Array;
  ends: Float64Array;
  priority: Float64Array;
}

export const pool = (n = VOICES): Pool => ({
  begins: new Float64Array(n),
  ends: new Float64Array(n),
  priority: new Float64Array(n),
});

export function claim(
  p: Pool,
  now: number,
  priority: number,
  begins: number,
  ends: number
): number {
  let slot = -1;
  for (let i = 0; i < p.ends.length; i++) {
    if (p.ends[i] <= now) {
      slot = i;
      break;
    }
    const worse =
      slot < 0 ||
      p.priority[i] < p.priority[slot] ||
      (p.priority[i] === p.priority[slot] && p.begins[i] < p.begins[slot]);
    if (p.priority[i] <= priority && worse) slot = i;
  }
  if (slot < 0) return -1;
  p.begins[slot] = begins;
  p.ends[slot] = ends;
  p.priority[slot] = priority;
  return slot;
}

export function clear(p: Pool) {
  p.begins.fill(0);
  p.ends.fill(0);
  p.priority.fill(0);
}

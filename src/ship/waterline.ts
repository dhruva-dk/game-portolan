import { SCALE, halfAt, zOf } from './lines.ts';

const POINTS = 33;
const FINE = 2000;

const fine = Array.from({ length: FINE + 1 }, (_, i) => {
  const s = i / FINE;
  return { z: zOf(s, 0) * SCALE, half: halfAt(s, 0) * SCALE };
});

export const WATERLINE = (() => {
  const stern = fine[0].z,
    stem = fine[FINE].z;
  const half = Array.from({ length: POINTS }, (_, k) => {
    const z = stern + ((stem - stern) * k) / (POINTS - 1);
    const j = Math.max(
      1,
      fine.findIndex((p) => p.z >= z)
    );
    const a = fine[j - 1],
      b = fine[j];
    return b.z > a.z
      ? a.half + ((b.half - a.half) * (z - a.z)) / (b.z - a.z)
      : b.half;
  });
  half[POINTS - 1] = 0;
  return { stern, stem, half, beam: 2 * Math.max(...half) };
})();

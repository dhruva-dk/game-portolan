// Where the galleon meets the water: her waterline's outline in her own frame
// (+x to port, +z forward; metres), for the sea to fit its foam round her and
// keep its waves out of her (water/wake.ts). Her half-breadth at the waterline
// at evenly spaced points from her stern's end to her stem's, from the lines
// (lines.ts) at her drawn size.
//
// Pure: runs in node for the tests.

import { SCALE, halfAt, zOf } from './lines.ts';

/** Points along her. */
const POINTS = 33;
/** The lines sampled this finely along her before they are set out evenly. */
const FINE = 2000;

const fine = Array.from({ length: FINE + 1 }, (_, i) => {
  const s = i / FINE;
  return { z: zOf(s, 0) * SCALE, half: halfAt(s, 0) * SCALE };
});

/**
 * Her waterline: from `stern` to `stem` (metres along her z), the half-breadth
 * at each of POINTS evenly between.
 */
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
  // the stem comes to a point
  half[POINTS - 1] = 0;
  return { stern, stem, half, beam: 2 * Math.max(...half) };
})();

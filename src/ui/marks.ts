// The chart's larger marks, after the UI sheet (and the old game's chart/rose.ts, chart/seal.ts): the compass rose and
// its rhumb lines, wax seals for rank, the laurel for a place, and the level's ring.

import { INK, PAPER, WASH, arcPath, figure, ring, roughCircle, slip } from './ink';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 32 rhumb lines from (cx, cy), `reach` long: principal winds iron, half green, quarter rubric. */
export function rhumbs(cx: number, cy: number, reach: number, opacity = 0.3) {
  const colours = ['#2a1a10', '#c0452c', '#4a7c4c', '#c0452c'];
  let s = '';
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    s += `<line x1="${cx}" y1="${cy}" x2="${r2(cx + Math.cos(a) * reach)}" y2="${r2(cy + Math.sin(a) * reach)}" stroke="${colours[i % 4]}" stroke-width=".6"/>`;
  }
  return `<g opacity="${opacity}">${s}</g>`;
}

/** The 32-point rose, radius R: iron principal points, green half winds, rubric quarter winds, a gilt fleur-de-lis
 * at north and a blue needle turned `needle` degrees (in a group with id "needle" so it can be swung). */
export function rose(cx: number, cy: number, R: number, needle = 0) {
  let s = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="rgba(241,228,200,.55)" stroke="${INK.iron}" stroke-width="2"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.93)}" fill="none" stroke="${INK.iron}" stroke-width="1"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.965)}" fill="none" stroke="${INK.iron}" stroke-width="${r2(R * 0.035)}" stroke-dasharray="${r2((R * 0.9651 * Math.PI * 2) / 64)}"/>`;
  const point = (a: number, L: number, w: number, dark: string, light: string) => {
    const tx = cx + Math.cos(a) * L, ty = cy + Math.sin(a) * L;
    const lx = cx + Math.cos(a - Math.PI / 2) * w, ly = cy + Math.sin(a - Math.PI / 2) * w;
    const rx = cx + Math.cos(a + Math.PI / 2) * w, ry = cy + Math.sin(a + Math.PI / 2) * w;
    return `<path d="M${cx} ${cy}L${r2(lx)} ${r2(ly)}L${r2(tx)} ${r2(ty)}Z" fill="${dark}" stroke="${INK.iron}" stroke-width=".6"/>`
      + `<path d="M${cx} ${cy}L${r2(rx)} ${r2(ry)}L${r2(tx)} ${r2(ty)}Z" fill="${light}" stroke="${INK.iron}" stroke-width=".6"/>`;
  };
  for (let i = 1; i < 32; i += 2) s += point(-Math.PI / 2 + (i * Math.PI) / 16, R * 0.58, R * 0.045, '#c0452c', '#f3e3c4');
  for (let i = 1; i < 16; i += 2) s += point(-Math.PI / 2 + (i * Math.PI) / 8, R * 0.72, R * 0.065, '#4a7c4c', '#f3e3c4');
  for (let i = 0; i < 8; i++) s += point(-Math.PI / 2 + (i * Math.PI) / 4, i % 2 ? R * 0.8 : R * 0.92, R * 0.09, '#2a1a10', '#f3e3c4');
  const fy = cy - R * 0.92, k = (v: number) => r2(R * v);
  s += `<path d="M${cx} ${r2(fy - k(0.2))}C${r2(cx + k(0.05))} ${r2(fy - k(0.12))} ${r2(cx + k(0.05))} ${r2(fy - k(0.05))} ${cx} ${r2(fy)}`
    + `C${r2(cx - k(0.05))} ${r2(fy - k(0.05))} ${r2(cx - k(0.05))} ${r2(fy - k(0.12))} ${cx} ${r2(fy - k(0.2))}Z`
    + `M${r2(cx - k(0.02))} ${r2(fy - k(0.05))}C${r2(cx - k(0.12))} ${r2(fy - k(0.14))} ${r2(cx - k(0.14))} ${r2(fy - k(0.02))} ${r2(cx - k(0.08))} ${r2(fy + k(0.01))}Z`
    + `M${r2(cx + k(0.02))} ${r2(fy - k(0.05))}C${r2(cx + k(0.12))} ${r2(fy - k(0.14))} ${r2(cx + k(0.14))} ${r2(fy - k(0.02))} ${r2(cx + k(0.08))} ${r2(fy + k(0.01))}Z"`
    + ` fill="${WASH.gold}" stroke="${INK.iron}" stroke-width=".8"/>`;
  s += `<g class="needle" style="transform-origin:${cx}px ${cy}px;transform:rotate(${needle}deg)"><path d="M${cx} ${r2(cy - R * 0.66)}L${r2(cx + R * 0.03)} ${cy}L${cx} ${r2(cy + R * 0.5)}L${r2(cx - R * 0.03)} ${cy}Z" fill="${INK.blue}" stroke="${INK.iron}" stroke-width=".6"/></g>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.055)}" fill="${WASH.gold}" stroke="${INK.iron}" stroke-width=".8"/>`;
  return s;
}

/** A rank's wax: iron, rubric, silver, gold … by tier. */
export const TIERS = [
  ['#4a3e36', '#1c1612'], ['#a06a34', '#5e3812'], ['#6f9ad0', '#2c4f86'], ['#f0c86a', '#9a6a1c'],
  ['#e2e4e8', '#7f848b'], ['#a8e0ee', '#3e8aa0'], ['#8a6a9a', '#4a2a5a'], ['#d65a3c', '#7e1d0f'],
] as const;

/** A wax seal of `tier`'s colours, radius r. */
export function seal(x: number, y: number, r: number, tier: number) {
  const [light, dark] = TIERS[Math.min(Math.max(tier, 0), TIERS.length - 1)];
  const id = `wax${tier}`;
  return `<radialGradient id="${id}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`
    + `<path d="${roughCircle(x, y, r, x * 2 + y, r * 0.12)}" fill="url(#${id})" filter="url(#sh)"/>`
    + `<circle cx="${x}" cy="${y}" r="${r2(r * 0.72)}" fill="none" stroke="${dark}" stroke-width="${r2(Math.max(0.8, r * 0.07))}" opacity=".8"/>`
    + `<circle cx="${x}" cy="${y}" r="${r2(r * 0.86)}" fill="none" stroke="${light}" stroke-width="${r2(r * 0.05)}" opacity=".6"/>`;
}

/** A laurel of radius r round (cx, cy), open at the top. */
export function laurel(cx: number, cy: number, r: number, colour: string) {
  let s = '';
  for (const side of [-1, 1]) {
    s += `<path d="${side < 0 ? arcPath(cx, cy, r, Math.PI * 0.58, Math.PI * 1.32) : arcPath(cx, cy, r, -Math.PI * 0.32, Math.PI * 0.42)}" fill="none" stroke="${colour}" stroke-width="2"/>`;
    for (let i = 0; i < 12; i++) {
      const a = side < 0 ? Math.PI * (0.6 + i * 0.06) : Math.PI * (0.4 - i * 0.06);
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r, deg = (a * 180) / Math.PI + (side < 0 ? 90 : -90);
      for (const o of [-1, 1]) {
        const ex = r2(px + Math.cos(a) * o * 7), ey = r2(py + Math.sin(a) * o * 7);
        s += `<ellipse cx="${ex}" cy="${ey}" rx="3.4" ry="8" transform="rotate(${r2(deg + o * 28 * side)} ${ex} ${ey})" fill="${colour}" stroke="${INK.iron}" stroke-width=".5" opacity=".95"/>`;
      }
    }
  }
  return s;
}

/** The level's ring: the level's numeral in a paper ring that fills with gold toward the next; radius r. */
export function levelRing(x: number, y: number, r: number, level: number, progress: number) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.6"/>`
    + ring(x, y, r - r * 0.1, progress, WASH.gold, r * 0.14)
    + `<circle cx="${x}" cy="${y}" r="${r2(r * 0.8)}" fill="none" stroke="${INK.iron}" stroke-width=".6"/>`
    + figure(x, y + r * 0.04, level, r * 1.36);
}

/** The career plate: her level's ring and her rank's seal on a slip, `w` wide (h = w × 0.62). */
export function plate(x: number, y: number, w: number, level: number, progress: number, tier: number) {
  const h = w * 0.62, k = w / 110;
  return slip(x, y, w, h) + levelRing(x + w / 2 - 18 * k, y + h / 2, 25 * k, level, progress) + seal(x + w / 2 + 30 * k, y + h / 2, 13 * k, tier);
}

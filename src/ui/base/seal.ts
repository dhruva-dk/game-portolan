import { INK, SHADOW, glyph } from './ink.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

const SEAL = { r: 27, bumps: 15, wave: 1.8, rays: 9 } as const;

export function seal(cx: number, cy: number, r: number = SEAL.r) {
  const k = r / SEAL.r;
  let edge = '';
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2,
      at =
        r + k * (SEAL.wave * Math.cos(a * SEAL.bumps) + 0.8 * Math.sin(a * 3));
    edge += `${i ? 'L' : 'M'}${r2(cx + at * Math.cos(a))} ${r2(cy + at * Math.sin(a))}`;
  }
  let rays = '';
  for (let i = 0; i < SEAL.rays; i++) {
    const a = (i / SEAL.rays) * Math.PI * 2 + 0.3,
      from = r + 7 * k,
      to = r + (15 + (i % 3) * 4) * k,
      dot = to + 6 * k;
    rays +=
      `<path d="M${r2(cx + from * Math.cos(a))} ${r2(cy + from * Math.sin(a))}L${r2(cx + to * Math.cos(a))} ${r2(cy + to * Math.sin(a))}" stroke="${INK.iron}" stroke-width="${r2(Math.max(1, 1.6 * k))}" stroke-linecap="round"/>` +
      `<circle cx="${r2(cx + dot * Math.cos(a + 0.18))}" cy="${r2(cy + dot * Math.sin(a + 0.18))}" r="${r2((i % 2 ? 1.2 : 1.8) * Math.max(0.7, k))}" fill="${INK.rubric}"/>`;
  }
  const origin = `transform-origin:${r2(cx)}px ${r2(cy)}px`;
  return (
    `<g class="flourish" style="${origin}"><circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r + 4 * k)}" fill="none" stroke="${INK.rubric}" stroke-width="${r2(Math.max(1.2, 2.2 * k))}"/></g>` +
    `<g class="flourish rays" style="${origin}">${rays}</g>` +
    `<g class="sealed" style="${origin}">` +
    `<path d="${edge}Z" fill="${INK.rubric}" stroke="${SHADOW}" stroke-opacity=".35" stroke-width="${r2(Math.max(0.8, 1.2 * k))}"/>` +
    `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r - 6 * k)}" fill="none" stroke="${INK.white}" stroke-opacity=".45" stroke-width="${r2(Math.max(0.8, 1.3 * k))}"/>` +
    glyph('tick', cx, cy, r + 2 * k, { ink: 'white', paper: INK.rubric }) +
    '</g>'
  );
}

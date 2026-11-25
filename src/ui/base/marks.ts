import { INK, PAPER, WASH, alpha, arcPath } from './ink.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

const WINDS = [INK.iron, WASH.vermilion, INK.green, WASH.vermilion] as const;

export function rhumbs(cx: number, cy: number, reach: number, opacity = 0.3) {
  let s = '';
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    s += `<line x1="${cx}" y1="${cy}" x2="${r2(cx + Math.cos(a) * reach)}" y2="${r2(cy + Math.sin(a) * reach)}" stroke="${WINDS[i % 4]}" stroke-width=".6"/>`;
  }
  return `<g opacity="${opacity}">${s}</g>`;
}

export interface RoseInks {
  face: string;
  line: string;
  ring: string;
  weight: number;
  breadth: number;
  checker: number;
  quarter: readonly [string, string];
  half: readonly [string, string];
  ordinal: readonly [string, string];
  cardinal: readonly [string, string];
  fleur: string;
  needle: string | null;
  hub: string;
}
export const ROSE: RoseInks = {
  face: alpha(PAPER, 0.55),
  line: INK.iron,
  ring: INK.iron,
  weight: 1,
  breadth: 1,
  checker: 0.035,
  quarter: [WASH.vermilion, PAPER],
  half: [INK.green, PAPER],
  ordinal: [INK.iron, PAPER],
  cardinal: [INK.iron, PAPER],
  fleur: WASH.gold,
  needle: INK.blue,
  hub: WASH.gold,
};

export function rose(
  cx: number,
  cy: number,
  R: number,
  needle = 0,
  inks: RoseInks = ROSE
) {
  const o = inks,
    w = (v: number) => r2(v * o.weight),
    line = (v: number) => `stroke="${o.line}" stroke-width="${w(v)}"`;
  let s =
    `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${o.face}" stroke="${o.ring}" stroke-width="${w(2)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.93)}" fill="none" stroke="${o.ring}" stroke-width="${w(1)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.965)}" fill="none" stroke="${o.ring}" stroke-width="${r2(R * o.checker)}" stroke-dasharray="${r2((R * 0.9651 * Math.PI * 2) / 64)}"/>`;
  const point = (
    a: number,
    L: number,
    hw: number,
    [dark, light]: readonly [string, string]
  ) => {
    const tx = cx + Math.cos(a) * L,
      ty = cy + Math.sin(a) * L;
    const lx = cx + Math.cos(a - Math.PI / 2) * hw,
      ly = cy + Math.sin(a - Math.PI / 2) * hw;
    const rx = cx + Math.cos(a + Math.PI / 2) * hw,
      ry = cy + Math.sin(a + Math.PI / 2) * hw;
    return (
      `<path d="M${cx} ${cy}L${r2(lx)} ${r2(ly)}L${r2(tx)} ${r2(ty)}Z" fill="${dark}" ${line(0.6)}/>` +
      `<path d="M${cx} ${cy}L${r2(rx)} ${r2(ry)}L${r2(tx)} ${r2(ty)}Z" fill="${light}" ${line(0.6)}/>`
    );
  };
  const b = R * o.breadth;
  for (let i = 1; i < 32; i += 2)
    s += point(
      -Math.PI / 2 + (i * Math.PI) / 16,
      R * 0.58,
      b * 0.045,
      o.quarter
    );
  for (let i = 1; i < 16; i += 2)
    s += point(-Math.PI / 2 + (i * Math.PI) / 8, R * 0.72, b * 0.065, o.half);
  for (let i = 0; i < 8; i++)
    s += point(
      -Math.PI / 2 + (i * Math.PI) / 4,
      i % 2 ? R * 0.8 : R * 0.92,
      b * 0.09,
      i % 2 ? o.ordinal : o.cardinal
    );
  const fy = cy - R * 0.92,
    k = (v: number) => r2(R * v);
  s +=
    `<path d="M${cx} ${r2(fy - k(0.2))}C${r2(cx + k(0.05))} ${r2(fy - k(0.12))} ${r2(cx + k(0.05))} ${r2(fy - k(0.05))} ${cx} ${r2(fy)}` +
    `C${r2(cx - k(0.05))} ${r2(fy - k(0.05))} ${r2(cx - k(0.05))} ${r2(fy - k(0.12))} ${cx} ${r2(fy - k(0.2))}Z` +
    `M${r2(cx - k(0.02))} ${r2(fy - k(0.05))}C${r2(cx - k(0.12))} ${r2(fy - k(0.14))} ${r2(cx - k(0.14))} ${r2(fy - k(0.02))} ${r2(cx - k(0.08))} ${r2(fy + k(0.01))}Z` +
    `M${r2(cx + k(0.02))} ${r2(fy - k(0.05))}C${r2(cx + k(0.12))} ${r2(fy - k(0.14))} ${r2(cx + k(0.14))} ${r2(fy - k(0.02))} ${r2(cx + k(0.08))} ${r2(fy + k(0.01))}Z"` +
    ` fill="${o.fleur}" ${line(0.8)}/>`;
  if (o.needle)
    s += `<g class="needle" style="transform-origin:${cx}px ${cy}px;transform:rotate(${needle}deg)"><path d="M${cx} ${r2(cy - R * 0.66)}L${r2(cx + R * 0.03)} ${cy}L${cx} ${r2(cy + R * 0.5)}L${r2(cx - R * 0.03)} ${cy}Z" fill="${o.needle}" ${line(0.6)}/></g>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.055)}" fill="${o.hub}" ${line(0.8)}/>`;
  return s;
}

export function laurel(cx: number, cy: number, r: number) {
  let s = '';
  for (const side of [-1, 1]) {
    s += `<path d="${side < 0 ? arcPath(0, 0, 48, Math.PI * 0.58, Math.PI * 1.32) : arcPath(0, 0, 48, -Math.PI * 0.32, Math.PI * 0.42)}" fill="none" stroke-width="2.4"/>`;
    for (let i = 0; i < 12; i++) {
      const a =
        side < 0 ? Math.PI * (0.6 + i * 0.06) : Math.PI * (0.4 - i * 0.06);
      const px = Math.cos(a) * 48,
        py = Math.sin(a) * 48,
        deg = (a * 180) / Math.PI + (side < 0 ? 90 : -90);
      for (const o of [-1, 1]) {
        const ex = r2(px + Math.cos(a) * o * 7),
          ey = r2(py + Math.sin(a) * o * 7);
        s += `<ellipse cx="${ex}" cy="${ey}" rx="3.4" ry="8" transform="rotate(${r2(deg + o * 28 * side)} ${ex} ${ey})" fill="url(#h-iron)"/>`;
      }
    }
  }
  return `<g transform="translate(${cx} ${cy}) scale(${r2(r / 48)})" stroke="${INK.iron}" stroke-width="1" stroke-linejoin="round">${s}</g>`;
}

export const spyglass = (x: number, y: number, s: number) => {
  const k = s / 80;
  const tube = (x0: number, w: number, h: number) =>
    `<rect x="${x0}" y="${-h / 2}" width="${w}" height="${h}" rx="1.5" fill="url(#h-iron-d)" stroke="${INK.iron}" stroke-width="1.6"/>`;
  return (
    `<g transform="translate(${x} ${y}) rotate(-16) scale(${k})" stroke-linejoin="round">` +
    tube(-40, 18, 10) +
    tube(-23, 22, 14) +
    tube(-2, 32, 19) +
    `<rect x="29" y="-12.5" width="9" height="25" rx="2" fill="${INK.iron}" stroke="${INK.iron}" stroke-width="1.2"/>` +
    `<path d="M-40 -5v10M-23 -7v14M-2 -9.5v19M12 -9.5v19" stroke="${INK.iron}" stroke-width="1.2"/>` +
    `<circle cx="-42" cy="0" r="3" fill="${INK.iron}"/></g>`
  );
};

export const ram = (x: number, y: number, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})" stroke="${INK.iron}" stroke-width="1.4" stroke-linejoin="round">` +
  `<path d="M-17 -2L-3 -2L1 2L-3 7L-15 7Z" fill="url(#h-iron)"/><path d="M17 -2L3 -2L-1 2L3 7L15 7Z" fill="url(#h-iron)" transform="scale(1 -1) translate(0 -5)"/>` +
  `<path d="M0 -12l2 6l5 -4l-2 6l6 1l-6 2l3 5" fill="none" stroke="${INK.rubric}" stroke-width="1.6"/></g>`;

export const pencil = (x: number, y: number, s: number) =>
  `<g transform="translate(${x} ${y}) rotate(-45) scale(${s / 24})" stroke="${INK.iron}" stroke-width="1.3" stroke-linejoin="round">` +
  `<path d="M-6 -3.2H9V3.2H-6Z" fill="${WASH.ochre}"/><path d="M9 -3.2H12.5V3.2H9Z" fill="${WASH.vermilion}"/>` +
  `<path d="M-6 -3.2L-12 0L-6 3.2Z" fill="${PAPER}"/><path d="M-10 -1.1L-12 0L-10 1.1Z" fill="${INK.iron}"/></g>`;

export const dyePot = (x: number, y: number, s: number, dye: string) =>
  `<g transform="translate(${x} ${y}) scale(${s / 24})" stroke="${INK.iron}" stroke-linejoin="round" stroke-linecap="round">` +
  `<path d="M3 -3L10 -12" stroke-width="2.2"/>` +
  `<path d="M9 -11L11.5 -14L13 -12.5L10.5 -10Z" fill="${dye}" stroke-width=".8"/>` +
  `<path d="M-9 -3Q-11.5 7 -6 10.5H6Q11.5 7 9 -3Z" fill="url(#h-iron)" stroke-width="1.3"/>` +
  `<path d="M-9.5 3.5H9.5" stroke-width=".6" fill="none"/>` +
  `<ellipse cx="0" cy="-3.5" rx="10" ry="3" fill="${PAPER}" stroke-width="1.2"/>` +
  `<ellipse cx="0" cy="-3.4" rx="7.6" ry="1.9" fill="${dye}" stroke-width=".7"/>` +
  `<path d="M-6.5 -2.4Q-7.4 1 -6.6 3.2Q-5.6 1 -5.6 -2.2Z" fill="${dye}" stroke-width=".6"/></g>`;

export const again = (x: number, y: number, s: number) => {
  const ring = 'M-15.6 -9A18 18 0 1 0 0 -18';
  return (
    `<g transform="translate(${x} ${y}) scale(${r2(s / 48)})" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${ring}" fill="none" stroke="${INK.iron}" stroke-width="8.4"/>` +
    `<path d="${ring}" fill="none" stroke="${PAPER}" stroke-width="4.6"/>` +
    `<path d="M-2 -29L13 -18L-2 -7Z" fill="${WASH.gold}" stroke="${INK.iron}" stroke-width="2"/></g>`
  );
};

export const die = (x: number, y: number, s: number) => {
  const a = 20,
    c = a * 0.87;
  type P = readonly [number, number];
  const on = (o: P, e: P, f: P, u: number, v: number) =>
    [r2(o[0] + u * e[0] + v * f[0]), r2(o[1] + u * e[1] + v * f[1])] as const;
  const pips = (o: P, e: P, f: P, uv: readonly P[]) =>
    uv
      .map(([u, v]) => {
        const [px, py] = on(o, e, f, u, v);
        return `<circle cx="${px}" cy="${py}" r="2.3"/>`;
      })
      .join('');
  const near: P = [0, 0],
    left: P = [-c, -a / 2],
    right: P = [c, -a / 2],
    down: P = [0, a];
  let hatch = '';
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    const [hx, hy] = on(near, right, down, t, 0.08);
    hatch += `M${hx} ${hy}V${r2(hy + a * 0.84)}`;
  }
  const [mx, my] = on(near, left, right, 0.5, 0.5);
  return (
    `<g transform="translate(${x} ${y + s * 0.08}) scale(${r2(s / 44)})" stroke="${INK.iron}" stroke-width="1.8" stroke-linejoin="round">` +
    `<path d="M0 0L${-c} ${-a / 2}L0 ${-a}L${c} ${-a / 2}ZM0 0L${-c} ${-a / 2}V${a / 2}L0 ${a}ZM0 0L${c} ${-a / 2}V${a / 2}L0 ${a}Z" fill="${PAPER}"/>` +
    `<path d="${hatch}" stroke-width=".6" opacity=".55"/>` +
    `<g fill="${INK.iron}" stroke="none">` +
    pips(near, left, right, [
      [0.22, 0.22],
      [0.78, 0.22],
      [0.22, 0.78],
      [0.78, 0.78],
    ]) +
    pips(near, left, down, [
      [0.3, 0.3],
      [0.7, 0.7],
    ]) +
    pips(near, right, down, [
      [0.25, 0.25],
      [0.5, 0.5],
      [0.75, 0.75],
    ]) +
    `</g><circle cx="${mx}" cy="${my}" r="2.7" fill="${INK.iron}" stroke-width=".9"/></g>`
  );
};

export const anchor = (x: number, y: number, s: number) =>
  `<g transform="translate(${x} ${y}) scale(${r2(s / 48)})" stroke="${INK.iron}" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
  `<circle cx="0" cy="-18" r="4.5" stroke-width="3"/>` +
  `<path d="M0 -13.5V20M-10 -7H10" stroke-width="4"/>` +
  `<path d="M-17 6Q-14 20 0 21Q14 20 17 6" stroke-width="4"/>` +
  `<path d="M-21 9L-17 3L-13 9M13 9L17 3L21 9" stroke-width="3.4"/></g>`;

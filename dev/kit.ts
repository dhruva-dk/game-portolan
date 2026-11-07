// The drawing kit's specimen: every primitive of src/chart drawn on plates at the window's size, for looking at.
//
//   dev/kit.html?plate=paper   one plate: paper, ink, objects, seals, galleons, marks, motion, press, hud
//
// The hud plate is the live layer itself (a ChartLayer over a stand-in for the world) at a representative frame of a
// match: the disc, the fleet, the Storm, the pennants, the hit-marks and every control, with the thumbs' homes and the
// touch targets drawn over it. window.__kit drives it for the capture tool: ready, plates, plate(name),
// measure(frames) (the live layer's CPU time per frame), problems() (the layout's).
import { Parchment } from '../src/render/paper/parchment.ts';
import {
  ChartLayer, ILLUMINATIONS, Paper, Pen, Press, WASH, arcPts, arrow, bakeDisc, bakeSeal, bakeSheet, burst, cartouche, chartLayout, cross,
  cubic, dottedRing, drawBaked, drawGalleon, drawSeal, drawSprite, dryAlpha, figure, flight, galleon, galleonSprite, hand, layoutProblems,
  moon, needle, part, pennant, pressLook, prims, quadrant, rhumbWeb, ring, rings, rose, sandglass, shape, stagger, stamp, staff, star,
  stick, stormRing, sun, tally, unroll, wake, woodcut, type ChartLayout, type Rect, type Seal,
} from '../src/chart/index.ts';

const dpr = window.devicePixelRatio || 1;
const W = window.innerWidth, H = window.innerHeight;
const SAFE = W < 1000 ? { top: 0, right: 62, bottom: 20, left: 62 } : { top: 0, right: 0, bottom: 25, left: 0 };
const L: ChartLayout = chartLayout(W, H, SAFE);
const phone = L.cls === 'iphone';
/** The specimen's own scale: the iPad's plates at their size, the phone's designed smaller. */
const u = phone ? 0.62 : Math.min(W / 1376, H / 1032);

const cv = document.createElement('canvas');
cv.width = Math.round(W * dpr);
cv.height = Math.round(H * dpr);
cv.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px`;
document.body.appendChild(cv);
const g = cv.getContext('2d')!;

/** A stand-in for the world under the interface: the sea at evening. */
function world(c = g): void {
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2c4f66');
  sky.addColorStop(0.42, '#5d8796');
  sky.addColorStop(0.44, '#24546a');
  sky.addColorStop(1, '#0b2230');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  // a long swell, so the paper's edges and shadows have something to lie on
  c.strokeStyle = 'rgba(180,215,225,0.08)';
  c.lineWidth = 1;
  for (let y = H * 0.47; y < H; y += 14 + (y - H * 0.44) * 0.06) {
    c.beginPath();
    for (let x = 0; x <= W; x += 12) c.lineTo(x, y + Math.sin(x * 0.02 + y) * 2);
    c.stroke();
  }
}

const parchment = await Parchment.create();
const paper = await Paper.from(parchment);
const pen = new Pen(paper, dpr, L.widths);

/** A folio filling the plate, for its drawings to sit on. */
function folio(seed = 4): void {
  world();
  const m = phone ? 6 : 10;
  drawBaked(g, bakeSheet(paper, L.widths, { weight: 'folio', w: W - m * 2, h: H - m * 2, dpr, seed, folds: false }), m, m);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  pen.on(g, 0, 0);
}

/** Captains for the specimen: a spread of colours with their emblems, as #30's set will be. */
const CAPS = [
  { colour: '#b8322a', emblem: 'goshawk' }, { colour: '#1f4f9a', emblem: 'whale' }, { colour: '#2f6a3c', emblem: 'oak' },
  { colour: '#d08a1c', emblem: 'sun' }, { colour: '#6a3f8c', emblem: 'owl' }, { colour: '#1d2326', emblem: 'raven' },
  { colour: '#2b8a8a', emblem: 'turtle' }, { colour: '#e8dcc0', emblem: 'lotus' }, { colour: '#a8452a', emblem: 'fox' },
  { colour: '#c8b040', emblem: 'comet' },
];

/** Seals are baked once per size and kind. */
const seals = new Map<string, Seal>();
const seal = (ill: (typeof ILLUMINATIONS)[number], size: number, device: Parameters<typeof bakeSeal>[3]['device'], seed = 3): Seal => {
  const key = `${ill}|${size}|${JSON.stringify(device)}`;
  let s = seals.get(key);
  if (!s) seals.set(key, (s = bakeSeal(paper, L.widths, ill, { size, dpr, device, seed })));
  return s;
};

const PLATES: Record<string, () => void> = {};

PLATES.paper = () => {
  world();
  const m = phone ? 10 : 18;
  drawBaked(g, bakeSheet(paper, L.widths, { weight: 'folio', w: W * 0.5, h: H - m * 2, dpr, seed: 4 }), m, m);
  drawBaked(g, bakeSheet(paper, L.widths, { weight: 'half', w: W * 0.4, h: H * 0.44, dpr, seed: 9 }), W * 0.55, m);
  drawBaked(g, bakeSheet(paper, L.widths, { weight: 'scrap', w: W * 0.17, h: H * 0.26, dpr, seed: 12 }), W * 0.56, H * 0.56);
  const r = L.hud.r;
  drawBaked(g, bakeDisc(paper, r, dpr, 5), W - m - r * 2 - (phone ? SAFE.right - 10 : 0), H - m - r * 2 - (phone ? 10 : 0));
};

PLATES.ink = () => {
  folio(5);
  const x0 = W * 0.07, col = W * 0.3, row = 34 * u + (phone ? 6 : 0);
  // the three widths in each ink, inked left to right; the last row is caught mid-stroke
  const inks = ['iron', 'rubric', 'green', 'blue', 'gold', 'sepia'] as const;
  inks.forEach((ink, i) => {
    (['hair', 'fine', 'bold'] as const).forEach((w, j) => {
      const y = H * 0.09 + i * row + j * row * 0.28;
      pen.stroke([x0, y, x0 + col * 0.4, y + 3 * u, x0 + col * 0.8, y - 2 * u], { w, ink, seed: i * 7 + j });
    });
  });
  const ym = H * 0.09 + inks.length * row + row * 0.3;
  for (let k = 0; k < 5; k++) pen.stroke(cubic([], x0, ym + k * 9 * u, x0 + col * 0.3, ym - 14 * u + k * 9 * u, x0 + col * 0.5, ym + 18 * u + k * 9 * u, x0 + col * 0.8, ym + k * 9 * u, 24), { w: 'bold', seed: 40 + k }, (k + 1) / 5);
  // washes: the captains' colours and the sea's, each a blot laid by brush
  const wx = W * 0.42, wy = H * 0.1, cell = Math.min(W * 0.1, 120 * u);
  const blot = (cx: number, cy: number, r: number, seed: number) => {
    const p: number[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2, rr = r * (1 + 0.12 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 7 + seed * 2));
      p.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
    }
    return shape(p);
  };
  CAPS.forEach((c, i) => pen.wash(blot(wx + (i % 5) * cell, wy + Math.floor(i / 5) * cell * 0.8, cell * 0.36, i), c.colour, { alpha: 0.85 }));
  Object.values(WASH).forEach((c, i) => pen.wash(blot(wx + (i % 5) * cell, wy + (2 + Math.floor(i / 5)) * cell * 0.8, cell * 0.36, i + 20), c, { alpha: 0.8 }));
  // hatching, dots, a dotted course, gilt
  const hy = H * 0.68, hx = W * 0.42;
  const sq = shape([hx, hy, hx + cell, hy, hx + cell, hy + cell * 0.8, hx, hy + cell * 0.8]);
  pen.hatch(sq, hx, hy, cell, cell * 0.8, 0.8, 3 * u + 1.2);
  pen.hatch(sq, hx, hy, cell, cell * 0.8, -0.8, 3 * u + 1.2, { seed: 9 });
  pen.stroke([hx, hy, hx + cell, hy, hx + cell, hy + cell * 0.8, hx, hy + cell * 0.8, hx, hy], { w: 'fine', seed: 3 });
  pen.rule([[hx + cell * 1.3, hy + cell * 0.2, hx + cell * 3.3, hy + cell * 0.1]], { w: 'fine', alpha: 0.9 }, 1, [0, 6]);
  pen.rule([[hx + cell * 1.3, hy + cell * 0.5, hx + cell * 3.3, hy + cell * 0.45]], { w: 'fine', ink: 'rubric' }, 1, [7, 5]);
  const leaf = new Path2D();
  leaf.rect(hx + cell * 3.6, hy, cell * 0.8, cell * 0.8);
  pen.gilt(leaf, 'gold', hx + cell * 4, hy + cell * 0.4, cell * 0.4);
  const sl = new Path2D();
  sl.rect(hx + cell * 4.5, hy, cell * 0.8, cell * 0.8);
  pen.gilt(sl, 'silver', hx + cell * 4.9, hy + cell * 0.4, cell * 0.4);
  // woodcuts from the icon set
  ['ability.ram', 'ability.repair', 'ability.smokeScreen', 'region.fjords', 'hud.storm'].forEach((n, i) => {
    try { woodcut(pen, prims(n), x0 + i * 96 * u + 40 * u, H * 0.72, 78 * u); woodcut(pen, prims(n), x0 + i * 60 * u + 20 * u, H * 0.88, 36 * u); } catch { /* a drawing the set renamed */ }
  });
};

PLATES.objects = () => {
  folio(6);
  const R = 150 * u;
  rhumbWeb(pen, W * 0.5, H * 0.5, R * 1.6, Math.hypot(W, H) * 0.5, 1, 0.22);
  rose(pen, W * 0.18, H * 0.3, R, { points: 32 });
  rose(pen, W * 0.5, H * 0.3, R * 0.8, { points: 16 });
  rose(pen, W * 0.8, H * 0.3, R * 0.6, { points: 8, ring: 0 });
  ring(pen, W * 0.18, H * 0.75, R * 0.7, R * 0.85, { ticks: 360 });
  needle(pen, W * 0.18, H * 0.75, R * 0.6, 0.35);
  arrow(pen, W * 0.4, H * 0.72, W * 0.55, H * 0.64);
  arrow(pen, W * 0.4, H * 0.82, W * 0.48, H * 0.8, 1, 'rubric');
  const f = cartouche(pen, W * 0.78, H * 0.74, 230 * u, 150 * u, { field: '#d8c39a' });
  woodcut(pen, prims('ability.ram'), f.cx, f.cy, f.ry * 1.5);
};

PLATES.seals = () => {
  folio(8);
  const size = 104 * u;
  ILLUMINATIONS.forEach((ill, i) => {
    const dev = i === 4 ? { figure: '1' } : i === 3 ? 'star' as const : { emblem: CAPS[i].emblem };
    const s = seal(ill, size, dev, i + 3);
    drawSeal(g, s, W * (0.11 + i * 0.195), H * 0.2, { phase: 0.5 });
    drawSeal(g, s, W * (0.11 + i * 0.195), H * 0.45, { phase: 0.1, press: 1 });
  });
  const fs = L.figure.large * (phone ? 0.75 : 0.72);
  figure(pen, '0123456789', W * 0.07, H * 0.7, fs);
  figure(pen, '0123456789', W * 0.07, H * 0.87, fs * 0.55, { ink: 'rubric' });
  figure(pen, '127', W * 0.52, H * 0.7, fs * 1.1, { ink: 'rubric' });
  figure(pen, '1:30', W * 0.68, H * 0.7, fs * 0.9);
  figure(pen, '38', W * 0.86, H * 0.7, fs, { ink: 'gold' });
  figure(pen, '2468', W * 0.52, H * 0.87, L.figure.hit);
  figure(pen, '45', W * 0.68, H * 0.87, L.figure.clock);
};

PLATES.galleons = () => {
  folio(10);
  CAPS.forEach((c, i) => {
    const sp = galleonSprite(pen, c, { size: L.mark.hud, facing: i % 2 ? -1 : 1 });
    drawGalleon(g, sp, W * (0.08 + i * 0.09), H * 0.17);
  });
  CAPS.slice(0, 6).forEach((c, i) => galleon(pen, c, W * (0.1 + i * 0.16), H * 0.42, { size: L.mark.chart, gilt: i === 0 }));
  galleon(pen, CAPS[0], W * 0.3, H * 0.88, { size: 300 * u });
  galleon(pen, CAPS[1], W * 0.74, H * 0.88, { size: 230 * u, facing: -1, gilt: true });
};

PLATES.marks = () => {
  folio(12);
  const x0 = W * 0.06;
  staff(pen, x0, H * 0.08, H * 0.42, 1, 5 * u);
  pennant(pen, { x: x0, y: H * 0.09, length: 200 * u, height: 22 * u, colour: '#b8322a', phase: 0.4 });
  pennant(pen, { x: x0, y: H * 0.17, length: 120 * u, height: 22 * u, colour: '#2f62b0', phase: 1.6 });
  pennant(pen, { x: x0, y: H * 0.25, length: 160 * u, height: 18 * u, colour: '#2f6a3c', phase: 2.5, gilt: true, trim: '#d4a84a' });
  pennant(pen, { x: x0, y: H * 0.33, length: 90 * u, height: 18 * u, colour: '#6a3f8c', phase: 0, wind: 0.2 });
  for (let n = 1; n <= 7; n++) tally(pen, n * 2 - 1, W * 0.3, H * (0.06 + n * 0.055), 22 * u);
  [1, 0.7, 0.4, 0.1, 0].forEach((s, i) => sandglass(pen, W * (0.55 + i * 0.09), H * 0.2, 110 * u, { sand: s, running: s > 0 && s < 1, time: 0.3 }));
  hand(pen, W * 0.24, H * 0.6, 150 * u, 0);
  hand(pen, W * 0.4, H * 0.76, 90 * u, 0.6);
  star(pen, W * 0.48, H * 0.56, 22 * u);
  star(pen, W * 0.54, H * 0.56, 14 * u, 1, 'silver');
  cross(pen, W * 0.61, H * 0.56, 12 * u, 1, 'rubric');
  burst(pen, W * 0.69, H * 0.56, 24 * u);
  sun(pen, W * 0.79, H * 0.56, 30 * u);
  moon(pen, W * 0.89, H * 0.56, 24 * u);
  stick(pen, W * 0.12, H * 0.86, 56 * u, W * 0.12 + 18 * u, H * 0.86 - 10 * u);
  quadrant(pen, W * 0.3, H * 0.93, 60 * u, 1);
  stormRing(pen, W * 0.55, H * 0.82, 70 * u, 1, 0.8);
  dottedRing(pen, W * 0.55, H * 0.82, 44 * u);
  const trail: number[] = [];
  for (let i = 0; i < 30; i++) trail.push(W * 0.72 + i * 8 * u, H * 0.8 + Math.sin(i * 0.25) * 20 * u);
  wake(pen, trail, '#1f4f9a');
  rings(pen, W * 0.9, H * 0.84, 10 * u, 4 * u, 5, 0.6);
};

/** Frame cells across a row: n cells of the plate's width at height y, each with its t. */
function strip(y: number, h: number, n: number, draw: (cx: number, cy: number, cw: number, ch: number, t: number, i: number) => void, labels?: string[]): void {
  const x0 = W * 0.05, cw = (W * 0.9) / n;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // a hairline box round each frame, as a printer's plate would separate them
    pen.rule([[x0 + i * cw + 3, y, x0 + (i + 1) * cw - 3, y, x0 + (i + 1) * cw - 3, y + h, x0 + i * cw + 3, y + h, x0 + i * cw + 3, y]], { w: 'hair', alpha: 0.35, wobble: 0.1 });
    g.save();
    g.beginPath();
    g.rect(x0 + i * cw + 3, y, cw - 6, h);
    g.clip();
    draw(x0 + i * cw + cw / 2, y + h / 2, cw - 6, h, t, i);
    g.restore();
    figure(pen, labels?.[i] ?? String(Math.round(t * 100)), x0 + i * cw + 8, y + h - 5, phone ? 7 : 9, { alpha: 0.5 });
  }
}

PLATES.motion = () => {
  folio(14);
  const n = 7, rowH = H * 0.16, gap = H * 0.02;
  let y = H * 0.055;
  // ink-in: a rose drawing itself
  strip(y, rowH, n, (cx, cy, _w, ch, t) => rose(pen, cx, cy, ch * 0.42, { points: 16 }, t));
  y += rowH + gap;
  // unroll: a half-sheet rolling open
  const small = bakeSheet(paper, L.widths, { weight: 'half', w: ((W * 0.9) / n) * 0.82, h: rowH * 0.7, dpr, seed: 31 });
  strip(y, rowH, n, (cx, cy, _w, _h, t) => {
    unroll(g, paper, small, cx - small.w / 2, cy - small.h / 2, t, 'right', dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  y += rowH + gap;
  // fly-to: a gilt seal lifting off, crossing, landing with a stamp
  const s = seal('gold', 44 * u + 8, 'star', 9);
  strip(y, rowH, n, (cx, cy, cw, ch, t) => {
    const from = { x: cx - cw * 0.34, y: cy + ch * 0.22 }, to = { x: cx + cw * 0.3, y: cy + ch * 0.1 };
    pen.rule([cubic([], from.x, from.y, from.x + 10, from.y - ch * 0.5, to.x - 10, to.y - ch * 0.5, to.x, to.y, 20)], { w: 'hair', alpha: 0.25 }, 1, [0, 4]);
    const f = flight(from, to, t);
    stamp(pen, to.x, to.y, s.size * 0.5, f.stamp);
    g.save();
    g.globalAlpha = f.shadow.alpha;
    g.fillStyle = '#1a0e05';
    g.beginPath();
    g.ellipse(f.x + f.shadow.dx * 0.4, f.y + f.shadow.dy * 0.4, s.size * 0.5 * f.scale, s.size * 0.42 * f.scale, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    drawSeal(g, s, f.x, f.y - f.lift * 10, { scale: f.scale, phase: t });
  });
  y += rowH + gap;
  // stagger: a list of tallies inking in one after another
  strip(y, rowH, n, (cx, cy, cw, ch, t) => {
    for (let i = 0; i < 4; i++) tally(pen, 3 + i, cx - cw * 0.38, cy - ch * 0.3 + i * ch * 0.2, ch * 0.13, stagger(t, i, 4, 0.45), 'iron', 5 + i);
  });
  y += rowH + gap;
  // dry: a hit-mark in rubric rising and drying away (drawn live, in the pen's dry mood), and a sunk captain's baked
  // mark drying off the chart beside it
  const sunk = galleonSprite(pen, CAPS[2], { size: L.mark.hud * 1.3 });
  strip(y, rowH, n, (cx, cy, cw, ch, t) => {
    pen.mood({ dry: t }, () => figure(pen, '127', cx - cw * 0.16, cy + ch * 0.2 - t * ch * 0.25, L.figure.hit * 1.3, { ink: 'rubric', align: 'center' }));
    g.save();
    g.globalAlpha = dryAlpha(t);
    drawGalleon(g, sunk, cx + cw * 0.24, cy + ch * 0.12);
    g.restore();
  });
};

PLATES.press = () => {
  folio(16);
  // a press and a release on a timeline: rest, the finger lands, held, lifted, springing past rest, settled
  const times = [0, 0.03, 0.08, 0.2, 0.24, 0.3, 0.38, 0.5, 0.7];
  const down = 0.02, up = 0.2;
  const p = new Press();
  const sinks: number[] = [];
  let t = 0;
  for (const at of times) {
    while (t < at - 1e-9) {
      if (t >= down && t < up) p.down();
      else p.up();
      p.step(0.005);
      t += 0.005;
    }
    sinks.push(p.sink);
  }
  const n = times.length, rowH = H * 0.26;
  const ms = times.map((at) => String(Math.round(at * 1000)));
  const fire = seal('rubric', 80 * u + 10, { emblem: 'goshawk' }, 4);
  const play = seal('gold', 80 * u + 10, 'rose', 6);
  let y = H * 0.06;
  strip(y, rowH, n, (cx, cy, _w, _h, _t, i) => {
    const look = pressLook(sinks[i]);
    drawSeal(g, fire, cx, cy - 6 * u, { press: look.dark, scale: look.scale / (1 - 0.045 * look.dark) });
  }, ms);
  y += rowH + H * 0.03;
  strip(y, rowH, n, (cx, cy, _w, _h, _t, i) => drawSeal(g, play, cx, cy - 6 * u, { press: Math.max(0, sinks[i]), scale: pressLook(sinks[i]).scale / (1 - 0.045 * Math.max(0, sinks[i])), phase: 0.5 }), ms);
  y += rowH + H * 0.03;
  strip(y, rowH, n, (cx, cy, cw, _h, _t, i) => {
    const f = cartouche(pen, cx, cy - 4 * u, cw * 0.86, cw * 0.58, { field: '#d8c39a' }, 1, sinks[i]);
    pen.mood({ dark: Math.max(0, sinks[i]) }, () => woodcut(pen, prims('ability.repair'), f.cx, f.cy, Math.min(f.rx, f.ry) * 1.5));
  }, ms);
};

// ---------------------------------------------------------------- the HUD: the live layer at a representative frame

const host = document.createElement('div');
host.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;display:none`;
document.body.appendChild(host);
const layer = new ChartLayer(paper, host);
layer.resize(W, H, dpr, SAFE);
let hudReady = false;

function hud(): void {
  if (hudReady) return;
  hudReady = true;
  const l = layer.layout, D = l.hud, R = D.r;
  const ringS = layer.sprite('hud-ring', R * 2, R * 2, R, R, (p) => {
    ring(p, R, R, R * 0.8, R * 0.92, { ticks: 128 }, 1);
    star(p, R, R - R * 0.86, R * 0.05);
  });
  const sign = Math.round(R * 0.2);
  const region = layer.sprite('hud-region', sign * 2, sign * 2, sign, sign, (p) => woodcut(p, prims('region.fjords'), sign, sign, sign * 1.5));
  const abilityS = layer.sprite('hud-ability', l.controls.ability.w + 40, l.controls.ability.h + 40, (l.controls.ability.w + 40) / 2, (l.controls.ability.h + 40) / 2, (p) => {
    const f = cartouche(p, (l.controls.ability.w + 40) / 2, (l.controls.ability.h + 40) / 2, l.controls.ability.w, l.controls.ability.h, { field: '#d8c39a' });
    woodcut(p, prims('ability.smokeScreen'), f.cx, f.cy, f.ry * 1.5);
  });
  const quadS = layer.sprite('hud-sails', l.controls.sails.r * 3, l.controls.sails.r * 3, l.controls.sails.r * 1.5, l.controls.sails.r * 2, (p) => quadrant(p, l.controls.sails.r * 1.5, l.controls.sails.r * 2, l.controls.sails.r * 1.2, 2, 1));
  const fireSeal = bakeSeal(paper, l.widths, 'rubric', { size: l.controls.fire.r * 2, dpr, device: { emblem: 'goshawk' }, seed: 5 });
  const disc = layer.disc();
  const fleet = CAPS.concat(CAPS).slice(0, 19).map((c, i) => ({ c, a: i * 2.39, d: 0.18 + ((i * 37) % 19) / 19 * 0.62, h: i * 1.7 }));
  const marks = fleet.map((s, i) => [galleonSprite(layer.pen, s.c, { size: l.mark.hud, facing: 1, seed: i }), galleonSprite(layer.pen, s.c, { size: l.mark.hud, facing: -1, seed: i })]);
  const me = galleonSprite(layer.pen, CAPS[0], { size: l.mark.hud * 1.15, gilt: true });
  const presses = {
    fire: layer.presses.add({ id: 'fire', hit: l.controls.fire, press: new Press(), sound: 'fire', haptic: 'medium', on: 'down' }),
    gust: layer.presses.add({ id: 'gust', hit: l.controls.gust, press: new Press(), sound: 'gust', haptic: 'light', on: 'down' }),
    ability: layer.presses.add({ id: 'ability', hit: l.controls.ability, press: new Press(), sound: 'ability', haptic: 'medium', on: 'down' }),
    reload: layer.presses.add({ id: 'reload', hit: l.controls.reload, press: new Press(), on: 'down' }),
    sails: layer.presses.add({ id: 'sails', hit: l.controls.sails, press: new Press(), on: 'down' }),
  };
  const hitMarks = [{ x: -0.3, y: -0.2, v: '42', born: 0 }, { x: 0.25, y: 0.1, v: '118', born: 300 }, { x: 0.1, y: -0.45, v: '7', born: 700 }];

  layer.addLive((gg, now) => {
    const t = now / 1000, P = layer.pen;
    const north = 0.4 + t * 0.05;
    // the disc and its compass ring, turning with north
    drawBaked(gg, disc, D.x - R, D.y - R);
    gg.save();
    gg.beginPath();
    gg.arc(D.x, D.y, R * 0.8, 0, Math.PI * 2);
    gg.clip();
    // the rhumbs from my mark, in three tones by point of sail
    const tones: number[][][] = [[], [], []];
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2 + north, rel = Math.abs(Math.atan2(Math.sin(a - 0.6), Math.cos(a - 0.6)));
      tones[rel < 0.7 ? 2 : rel < 1.4 ? 1 : 0].push([D.x, D.y, D.x + Math.sin(a) * R * 0.8, D.y - Math.cos(a) * R * 0.8]);
    }
    P.rule(tones[0], { w: 'hair', ink: 'iron', alpha: 0.5, seed: 1 });
    P.rule(tones[1], { w: 'hair', ink: 'green', alpha: 0.6, seed: 2 });
    P.rule(tones[2], { w: 'hair', ink: 'rubric', alpha: 0.6, seed: 3 });
    // the Storm: its edge and its next circle
    stormRing(P, D.x + R * 0.25, D.y + R * 0.2, R * 0.66, 1, 0.7);
    dottedRing(P, D.x + R * 0.18, D.y + R * 0.14, R * 0.4);
    // wakes and the fleet
    fleet.forEach((s, i) => {
      const x = D.x + Math.cos(s.a + t * 0.02) * s.d * R * 0.78, y = D.y + Math.sin(s.a + t * 0.02) * s.d * R * 0.78;
      const hx = Math.cos(s.h + t * 0.1), hy = Math.sin(s.h + t * 0.1);
      const trail: number[] = [];
      for (let k = 0; k < 8; k++) trail.push(x - hx * k * 4 + Math.sin(k * 0.6 + i) * 1.5, y - hy * k * 4 + Math.cos(k * 0.5) * 1.5);
      wake(P, trail, s.c.colour, 0.6);
      drawGalleon(gg, marks[i][hx >= 0 ? 0 : 1], x, y);
    });
    drawGalleon(gg, me, D.x, D.y + l.mark.hud * 0.15);
    // hit-marks: rubric figures floating up and drying out
    for (const m of hitMarks) {
      const age = ((now - m.born) % 1600) / 1600;
      P.mood({ dry: Math.max(0, age * 1.4 - 0.4) }, () => figure(P, m.v, D.x + m.x * R, D.y + m.y * R - age * 18, l.figure.hit * (m.v.length > 2 ? 1.15 : 0.9), { ink: 'rubric', align: 'center', seed: m.born }, Math.min(1, age * 6)));
    }
    gg.restore();
    drawSprite(gg, ringS, D.x, D.y, { rot: north });
    // the lubber mark, the region's sign and the hour's sun at the top
    drawSprite(gg, region, D.x - R * 0.16, D.y - R * 0.62);
    sun(P, D.x + R * 0.16, D.y - R * 0.62, R * 0.07, 1);
    // the wind on the rim, a feathered arrow its strength long
    const wa = 2.2 + Math.sin(t * 0.3) * 0.1;
    arrow(P, D.x + Math.cos(wa) * R * 1.02, D.y + Math.sin(wa) * R * 1.02, D.x + Math.cos(wa + 0.35) * R * 1.02, D.y + Math.sin(wa + 0.35) * R * 1.02);
    // hull and shield: two pennants on a staff at the rim
    const sx = D.x - R * 1.06, sy = D.y - R * 0.55;
    staff(P, sx, sy, sy + R * 0.95, 1, 3.5);
    pennant(P, { x: sx, y: sy + 4, length: R * 0.75, height: 13, colour: CAPS[0].colour, dir: -1, phase: t * 4 });
    pennant(P, { x: sx, y: sy + 24, length: R * 0.42, height: 13, colour: '#2f62b0', dir: -1, phase: t * 4 + 1.3 });
    // the Storm's clock: a figure beside a small sand-glass; shot in hand as tallies
    sandglass(P, D.x - R * 0.74, D.y + R + l.figure.clock * 0.55, l.figure.clock * 1.5, { sand: 0.6 - (t % 30) / 75, running: true, time: t });
    figure(P, '1:30', D.x - R * 0.58, D.y + R + l.figure.clock, l.figure.clock);
    tally(P, 4, D.x + R * 0.3, D.y + R + l.figure.clock, l.figure.clock * 0.9);
    // the controls
    const c = l.controls;
    stick(P, c.stick.x, c.stick.y, c.stick.r, c.stick.x + Math.cos(t) * c.stick.r * 0.3, c.stick.y + Math.sin(t) * c.stick.r * 0.3);
    const f = pressLook(presses.fire.press.sink);
    drawSeal(gg, fireSeal, c.fire.x, c.fire.y, { press: f.dark, scale: f.scale / (1 - 0.045 * f.dark), phase: 0.5 + 0.5 * Math.sin(t * 0.8) });
    const gl = pressLook(presses.gust.press.sink);
    staff(P, c.gust.x - c.gust.r * 0.6, c.gust.y - c.gust.r * 0.8 + gl.dy, c.gust.y + c.gust.r * 0.8 + gl.dy, 1, 3);
    P.mood({ dark: gl.dark }, () => pennant(P, { x: c.gust.x - c.gust.r * 0.6, y: c.gust.y - c.gust.r * 0.75 + gl.dy, length: c.gust.r * 1.5, height: c.gust.r * 0.55, colour: '#e8dcc0', phase: t * 5, gilt: true }));
    const al = pressLook(presses.ability.press.sink);
    drawSprite(gg, abilityS, c.ability.x, c.ability.y + al.dy, { scale: al.scale, dark: al.dark });
    const rl = pressLook(presses.reload.press.sink);
    P.mood({ dark: rl.dark }, () => sandglass(P, c.reload.x, c.reload.y + rl.dy, c.reload.r * 1.7 * rl.scale, { sand: (t * 0.2) % 1, running: true, time: t }));
    const ql = pressLook(presses.sails.press.sink);
    drawSprite(gg, quadS, c.sails.x, c.sails.y + ql.dy, { scale: ql.scale, dark: ql.dark });
    const pad = 30;
    const box = (x: number, y: number, r: number): Rect => ({ x: x - r - pad, y: y - r - pad, w: (r + pad) * 2, h: (r + pad) * 2 });
    return [box(D.x, D.y, R * 1.25), { x: sx - R * 0.85, y: sy - 20, w: R * 0.9, h: R * 1.1 }, box(c.stick.x, c.stick.y, c.stick.r), box(c.fire.x, c.fire.y, c.fire.r * 1.2),
      box(c.gust.x, c.gust.y, c.gust.r * 1.6), box(c.ability.x, c.ability.y, Math.max(c.ability.w, c.ability.h) * 0.75),
      box(c.reload.x, c.reload.y, c.reload.r * 1.2), box(c.sails.x, c.sails.y, c.sails.r * 1.6)];
  });
}

PLATES.hud = () => {
  world();
  hud();
  host.style.display = 'block';
  layer.presses.list.find((p) => p.id === 'fire')?.press.down();
  for (let i = 0; i < 12; i++) layer.frame(1000 + i * 33);
  // the layout's rules drawn over it: the thumbs' homes (dashed), every target's reach (dotted)
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const over = document.createElement('canvas');
  over.width = cv.width;
  over.height = cv.height;
  over.style.cssText = cv.style.cssText;
  over.id = 'kit-over';
  document.getElementById('kit-over')?.remove();
  document.body.appendChild(over);
  const o = over.getContext('2d')!;
  o.setTransform(dpr, 0, 0, dpr, 0, 0);
  o.lineWidth = 1.2;
  for (const th of Object.values(L.thumbs)) {
    o.strokeStyle = 'rgba(255,240,200,0.7)';
    o.setLineDash([6, 5]);
    o.beginPath();
    o.arc(th.x, th.y, th.r, 0, Math.PI * 2);
    o.stroke();
  }
  o.setLineDash([2, 4]);
  o.strokeStyle = 'rgba(120,230,160,0.8)';
  for (const p of layer.presses.list) {
    const h = p.hit;
    o.beginPath();
    if ('r' in h) o.arc(h.x, h.y, Math.max(h.r, 28), 0, Math.PI * 2);
    else o.rect(h.x - Math.max(h.w, 56) / 2, h.y - Math.max(h.h, 56) / 2, Math.max(h.w, 56), Math.max(h.h, 56));
    o.stroke();
  }
  o.setLineDash([]);
  o.strokeStyle = 'rgba(255,120,90,0.6)';
  o.strokeRect(SAFE.left + 0.5, SAFE.top + 0.5, W - SAFE.left - SAFE.right - 1, H - SAFE.top - SAFE.bottom - 1);
};

let current = '';
function plate(name: string): void {
  current = name;
  host.style.display = name === 'hud' ? 'block' : 'none';
  document.getElementById('kit-over')?.remove();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  (PLATES[name] ?? PLATES.paper)();
}

plate(new URLSearchParams(location.search).get('plate') ?? 'paper');

/**
 * The live layer's CPU time per frame over `frames` frames of the HUD, one per animation frame as the game would draw
 * it (a canvas left to pile up frames without presenting them flushes in great stalls no real frame sees).
 */
async function measure(frames: number): Promise<{ mean: number; p95: number; worst: number; frames: number; slow: number[][]; problems: string[] }> {
  plate('hud');
  const raf = () => new Promise<number>((ok) => requestAnimationFrame(ok));
  // a second of frames first, so what is measured is the steady state and not the first use of each ink
  for (let i = 0; i < 30; i++) layer.frame(await raf());
  const times: number[] = [];
  const fire = layer.presses.list.find((p) => p.id === 'fire')!;
  for (let i = 0; i < frames; i++) {
    // a finger on the fire seal for a beat, now and then
    if (i % 30 === 0) fire.press.down();
    if (i % 30 === 6) fire.press.up();
    times.push(layer.frame(await raf()));
  }
  const slow = times.map((ms, i) => [i, +ms.toFixed(1)]).filter(([, ms]) => ms > 4);
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return { mean: +mean.toFixed(3), p95: +times[Math.floor(times.length * 0.95)].toFixed(3), worst: +times[times.length - 1].toFixed(3), frames, slow, problems: layoutProblems(L) };
}

(window as unknown as { __kit: unknown }).__kit = {
  ready: true,
  plates: Object.keys(PLATES),
  plate,
  current: () => current,
  measure,
  problems: () => layoutProblems(L),
  arcPts,
  part,
};

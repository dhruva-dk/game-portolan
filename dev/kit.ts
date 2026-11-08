// The drawing kit's specimen: every primitive of src/chart drawn on plates at the window's size, for looking at.
//
//   dev/kit.html?plate=paper   one plate: paper, ink, objects, seals, galleons, marks, motion, press, hud
//
// The hud plate is the live layer itself (a ChartLayer over a stand-in for the world) showing the match HUD's
// instrument family at rest (issue #54): the vitals' bars, the Storm's clock and the ships afloat, the minimap disc,
// the stick, the sails, the hotbar, the round buttons and the reticle, each where src/chart/layout.ts puts it on this
// device; ?rules draws the thumbs' homes, the touch targets and the safe area over it. window.__kit drives it for the
// capture tool: ready, plates, plate(name), measure(frames) (the live layer's CPU time per frame), problems() (the
// layout's).
import { CAPTAINS } from '../src/career/captains.ts';
import { Parchment } from '../src/render/paper/parchment.ts';
import {
  ChartLayer, ILLUMINATIONS, Paper, Pen, Press, WASH, arcPts, arrow, bakeDisc, bakeSeal, bakeSheet, burst, cartouche, chartLayout, cross,
  cubic, dottedRing, drawBaked, drawGalleon, drawSeal, drawSprite, dryAlpha, figure, flight, galleon, galleonSprite, hand, layoutProblems,
  moon, needle, part, pennant, pressLook, prims, quadrant, rhumbWeb, ring, rings, rose, sandglass, shape, stagger, stamp, staff, star,
  stick, stormRing, sun, tally, unroll, wake, woodcut, word, type ChartLayout, type Rect, type Seal, type Sprite,
} from '../src/chart/index.ts';
import { badge, bar, paper as laid, reticle, roundButton, sailsArc, slipPath, slot, stickRing, type SlotOptions } from '../src/screens/instruments.ts';

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

/** The league's captains as the roster keeps them, every tenth of the colour circle for the specimen. */
const CAPS = CAPTAINS.filter((_, i) => i % 2 === 0);

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
    const dev = i === 4 ? { figure: '1' } : i === 3 ? 'star' as const : { emblem: CAPS[i].sigil.id };
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
  // the lettering hand: the alphabet, and the two words the game has
  word(pen, 'ABCDEFGHIJKLM', W * 0.07, H * 0.59, fs * 0.5);
  word(pen, 'NOPQRSTUVWXYZ', W * 0.07, H * 0.64, fs * 0.5, { ink: 'rubric' });
  word(pen, 'PLAY', W * 0.52, H * 0.8, fs * 0.72, { gilt: true });
  word(pen, 'DIVE', W * 0.74, H * 0.8, fs * 0.72, { alpha: 0.4 });
  word(pen, 'DIVE', W * 0.88, H * 0.8, fs * 0.72);
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

// ---------------------------------------------------------------- the HUD: the instrument family at rest

const host = document.createElement('div');
host.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;display:none`;
document.body.appendChild(host);
const layer = new ChartLayer(paper, host);
layer.resize(W, H, dpr, SAFE);
let hudReady = false;

/**
 * Every element of the match HUD (issue #54's table) at rest, drawn with src/screens/instruments.ts and laid out by
 * src/chart/layout.ts. What holds still is baked once to a sprite, as the live HUD will bake it; each frame draws the
 * sprites, the controls with their press look, the stick and the reticle. The thumbs' homes, the targets and the safe
 * area are drawn over it with ?rules.
 */
function hud(): void {
  if (hudReady) return;
  hudReady = true;
  const l = layer.layout, D = l.hud, R = D.r, c = l.controls, me = CAPS[3];
  const PAD = 16;
  /** A drawing baked once, w × h plus a margin for its shadow, anchored at its centre. */
  const bake = (key: string, w: number, h: number, draw: (p: Pen, cx: number, cy: number) => void) =>
    layer.sprite(key, w + PAD * 2, h + PAD * 2, w / 2 + PAD, h / 2 + PAD, (p) => draw(p, w / 2 + PAD, h / 2 + PAD));
  // top left: the shield's bar over the hull's, on one slip
  const sb = l.bars.shield, hb = l.bars.hull, vw = sb.w + 20, vh = hb.y + hb.h / 2 - (sb.y - sb.h / 2) + 20, vy = (sb.y + hb.y) / 2;
  const vitals = bake('hud-vitals', vw, vh, (p, cx, cy) => {
    laid(p, slipPath(cx, cy, vw, vh, 3), { burn: 4 });
    bar(p, { ...sb, x: cx, y: cy - (vy - sb.y) }, 0.62, { colour: WASH.azure, figure: '62', seed: 5 });
    bar(p, { ...hb, x: cx, y: cy + (hb.y - vy) }, 0.84, { colour: me.colour, figure: '84', seed: 6 });
  });
  // top centre: the Storm's clock and the ships afloat
  const clock = bake('hud-clock', l.clock.w, l.clock.h, (p, cx, cy) => badge(p, { ...l.clock, x: cx, y: cy }, prims('hud.spiral'), '1:30', { seed: 9 }));
  const afloat = bake('hud-afloat', l.afloat.w, l.afloat.h, (p, cx, cy) => badge(p, { ...l.afloat, x: cx, y: cy }, prims('hud.shipsLeft'), '23', { seed: 10 }));
  // top right: the minimap disc with its compass rim, north up, a star at north
  const disc = layer.disc();
  const rimS = layer.sprite('hud-rim', R * 2, R * 2, R, R, (p) => {
    ring(p, R, R, R * 0.84, R * 0.96, { ticks: 128 }, 1);
    star(p, R, R - R * 0.9, R * 0.05);
  });
  // the controls, each at rest
  const sailsS = bake('hud-sails', c.sails.r * 2, c.sails.r * 2, (p, cx, cy) => sailsArc(p, cx, cy, c.sails.r, 2, { seed: 17 }));
  const fireS = bake('hud-fire', c.fire.r * 2, c.fire.r * 2, (p, cx, cy) => roundButton(p, cx, cy, c.fire.r, prims('weapon.cannon'), { seed: 21, icon: 1.2 }));
  const reloadS = bake('hud-reload', c.reload.r * 2, c.reload.r * 2, (p, cx, cy) => roundButton(p, cx, cy, c.reload.r, prims('hud.reload'), { seed: 22 }));
  const abilityS = bake('hud-ability', c.ability.r * 2, c.ability.r * 2, (p, cx, cy) => roundButton(p, cx, cy, c.ability.r, prims('ability.smokeScreen'), { seed: 23 }));
  const gustS = bake('hud-gust', c.gust.r * 2, c.gust.r * 2, (p, cx, cy) => roundButton(p, cx, cy, c.gust.r, prims('hud.gust'), { seed: 24, pips: { n: 2, full: 2 } }));
  // the hotbar: a cannon chosen with its shot, a harpoon with its lines, three empty slots
  const holds: SlotOptions[] = [{ drawing: prims('weapon.cannon'), count: '24', chosen: true }, { drawing: prims('weapon.harpoon'), count: '6' }, {}, {}, {}];
  const slotS = l.slots.map((b, i) => bake(`hud-slot-${i}`, b.w, b.h, (p, cx, cy) => slot(p, { ...b, x: cx, y: cy }, { ...holds[i], seed: 31 + i })));
  const presses = {
    fire: layer.presses.add({ id: 'fire', hit: c.fire, press: new Press(), sound: 'fire', haptic: 'medium', on: 'down' }),
    gust: layer.presses.add({ id: 'gust', hit: c.gust, press: new Press(), sound: 'gust', haptic: 'light', on: 'down' }),
    ability: layer.presses.add({ id: 'ability', hit: c.ability, press: new Press(), sound: 'ability', haptic: 'medium', on: 'down' }),
    reload: layer.presses.add({ id: 'reload', hit: c.reload, press: new Press(), on: 'down' }),
    sails: layer.presses.add({ id: 'sails', hit: c.sails, press: new Press(), on: 'down' }),
    slots: l.slots.map((b, i) => layer.presses.add({ id: `slot-${i + 1}`, hit: b, press: new Press() })),
  };
  const pressed = (gg: CanvasRenderingContext2D, s: Sprite, x: number, y: number, sink: number) => {
    const look = pressLook(sink);
    drawSprite(gg, s, x, y + look.dy, { scale: look.scale, dark: look.dark });
  };

  layer.addLive((gg) => {
    const P = layer.pen;
    drawSprite(gg, vitals, sb.x, vy);
    drawSprite(gg, clock, l.clock.x, l.clock.y);
    drawSprite(gg, afloat, l.afloat.x, l.afloat.y);
    drawBaked(gg, disc, D.x - R, D.y - R);
    drawSprite(gg, rimS, D.x, D.y);
    arrow(P, D.x, D.y + R * 0.16, D.x, D.y - R * 0.16);
    stickRing(P, c.stick.x, c.stick.y, c.stick.r, 0, 0);
    pressed(gg, sailsS, c.sails.x, c.sails.y, presses.sails.press.sink);
    l.slots.forEach((b, i) => pressed(gg, slotS[i], b.x, b.y, presses.slots[i].press.sink));
    pressed(gg, fireS, c.fire.x, c.fire.y, presses.fire.press.sink);
    pressed(gg, reloadS, c.reload.x, c.reload.y, presses.reload.press.sink);
    pressed(gg, abilityS, c.ability.x, c.ability.y, presses.ability.press.sink);
    pressed(gg, gustS, c.gust.x, c.gust.y, presses.gust.press.sink);
    reticle(P, l.reticle.x, l.reticle.y, l.reticle.r);
    const pad = 30;
    const box = (x: number, y: number, r: number): Rect => ({ x: x - r - pad, y: y - r - pad, w: (r + pad) * 2, h: (r + pad) * 2 });
    return [box(D.x, D.y, R * 1.2), box(sb.x, vy, Math.max(vw, vh) * 0.6), box(l.clock.x, l.clock.y, l.clock.w * 0.6), box(l.afloat.x, l.afloat.y, l.afloat.w * 0.6),
      box(c.stick.x, c.stick.y, c.stick.r), box(c.sails.x, c.sails.y, c.sails.r), ...l.slots.map((b) => box(b.x, b.y, b.w * 0.6)),
      box(c.fire.x, c.fire.y, c.fire.r), box(c.reload.x, c.reload.y, c.reload.r), box(c.ability.x, c.ability.y, c.ability.r), box(c.gust.x, c.gust.y, c.gust.r),
      box(l.reticle.x, l.reticle.y, l.reticle.r)];
  });
}

PLATES.hud = () => {
  world();
  hud();
  host.style.display = 'block';
  for (let i = 0; i < 12; i++) layer.frame(1000 + i * 33);
  if (!new URLSearchParams(location.search).has('rules')) return;
  // the layout's rules drawn over it: the thumbs' homes (dashed), every target's reach (dotted), the safe area
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

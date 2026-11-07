// The drawing kit's specimen: every primitive of src/chart drawn on plates at the window's size, for looking at.
//
//   dev/kit.html?plate=paper        one plate (paper, ink, objects, seals, galleons, motion, press, hud)
//
// window.__kit drives it for the capture tool: ready, plate(name), measure(frames).
import { Parchment } from '../src/render/paper/parchment.ts';
import { Paper } from '../src/chart/paper.ts';
import { Pen, arcPts } from '../src/chart/pen.ts';
import { bakeDisc, bakeSheet, drawBaked } from '../src/chart/sheet.ts';
import { arrow, needle, rhumbWeb, ring, rose } from '../src/chart/rose.ts';
import { figure } from '../src/chart/numerals.ts';
import { ILLUMINATIONS, bakeSeal, drawSeal } from '../src/chart/seal.ts';

const dpr = window.devicePixelRatio || 1;
const W = window.innerWidth, H = window.innerHeight;
const cv = document.createElement('canvas');
cv.width = Math.round(W * dpr);
cv.height = Math.round(H * dpr);
cv.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px`;
document.body.appendChild(cv);
const g = cv.getContext('2d')!;

/** A stand-in for the world under the interface: the sea at evening. */
function world(): void {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2c4f66');
  sky.addColorStop(0.45, '#4e7d8e');
  sky.addColorStop(0.47, '#1f4a5c');
  sky.addColorStop(1, '#0b2230');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
}

const parchment = await Parchment.create();
const paper = await Paper.from(parchment);
const widths = W > 1000 && H > 700 ? { hair: 0.6, fine: 1.05, bold: 1.9 } : { hair: 0.5, fine: 0.9, bold: 1.6 };
const pen = new Pen(paper, dpr, widths);

const PLATES: Record<string, () => void> = {
  paper() {
    world();
    const m = 18;
    const folio = bakeSheet(paper, widths, { weight: 'folio', w: W * 0.56, h: H - m * 2, dpr, seed: 4 });
    drawBaked(g, folio, m, m);
    const half = bakeSheet(paper, widths, { weight: 'half', w: W * 0.36, h: H * 0.42, dpr, seed: 9 });
    drawBaked(g, half, W * 0.6, m);
    const scrap = bakeSheet(paper, widths, { weight: 'scrap', w: W * 0.17, h: H * 0.22, dpr, seed: 12 });
    drawBaked(g, scrap, W * 0.6, H * 0.5);
    const r = Math.min(W, H) * 0.14;
    const disc = bakeDisc(paper, r, dpr, 5);
    drawBaked(g, disc, W - m - r * 2, H - m - r * 2);
    // a few strokes on the folio, to see ink soak into the sheet
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    pen.on(g, 0, 0);
    const x0 = m + 70, y0 = m + 80;
    for (const [i, w] of (['hair', 'fine', 'bold'] as const).entries()) {
      pen.stroke([x0, y0 + i * 40, x0 + 160, y0 + i * 40 + 6, x0 + 300, y0 + i * 40 - 4], { w, seed: i + 1 });
    }
    pen.stroke(arcPts(x0 + 120, y0 + 220, 60, -Math.PI, 0.6), { w: 'bold', ink: 'rubric', seed: 7 });
    pen.stroke(arcPts(x0 + 260, y0 + 220, 40, 0, Math.PI * 1.9), { w: 'fine', ink: 'blue', seed: 8 });
    pen.rule([[x0, y0 + 320, x0 + 360, y0 + 320], [x0, y0 + 330, x0 + 360, y0 + 340]], { w: 'hair' });
    pen.rule([[x0, y0 + 352, x0 + 360, y0 + 352]], { w: 'fine', ink: 'green' }, 1, [0, 6]);
  },
};

/** A folio filling the plate, for the plate's drawings to sit on. */
function folio(seed = 4): void {
  world();
  const m = 10;
  drawBaked(g, bakeSheet(paper, widths, { weight: 'folio', w: W - m * 2, h: H - m * 2, dpr, seed, folds: false }), m, m);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  pen.on(g, 0, 0);
}

PLATES.objects = () => {
  folio(6);
  const u = Math.min(W / 1376, H / 1032) * 1.0;
  const R = 150 * u;
  rhumbWeb(pen, W * 0.5, H * 0.5, R * 1.6, Math.hypot(W, H) * 0.5, 1, 0.35);
  rose(pen, W * 0.18, H * 0.3, R, { points: 32 });
  rose(pen, W * 0.5, H * 0.3, R * 0.8, { points: 16 });
  rose(pen, W * 0.78, H * 0.3, R * 0.6, { points: 8, ring: 0 });
  ring(pen, W * 0.18, H * 0.75, R * 0.7, R * 0.85, { ticks: 360 });
  needle(pen, W * 0.18, H * 0.75, R * 0.6, 0.35);
  arrow(pen, W * 0.4, H * 0.7, W * 0.55, H * 0.62);
  arrow(pen, W * 0.4, H * 0.8, W * 0.48, H * 0.78, 1, 'rubric');
};

PLATES.seals = () => {
  folio(8);
  const u = Math.min(W / 1376, H / 1032);
  const size = 110 * u;
  ILLUMINATIONS.forEach((ill, i) => {
    const s = bakeSeal(paper, widths, ill, { size, dpr, device: i === 4 ? { figure: '1' } : i === 3 ? 'star' : { emblem: 'goshawk' }, seed: i + 3 });
    drawSeal(g, s, W * (0.12 + i * 0.19), H * 0.2, { phase: 0.5 });
    drawSeal(g, s, W * (0.12 + i * 0.19), H * 0.43, { phase: 0.1, press: 1 });
  });
  // the numeral hand
  const fs = 46 * u;
  figure(pen, '0123456789', W * 0.08, H * 0.66, fs);
  figure(pen, '0123456789', W * 0.08, H * 0.82, fs * 0.6, { ink: 'rubric' });
  figure(pen, '127', W * 0.55, H * 0.66, fs * 1.2, { ink: 'rubric' });
  figure(pen, '1:30', W * 0.72, H * 0.66, fs);
  figure(pen, '38', W * 0.88, H * 0.66, fs, { ink: 'gold' });
  figure(pen, '2468', W * 0.55, H * 0.85, fs * 0.45);
};

let current = '';
function plate(name: string): void {
  current = name;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  (PLATES[name] ?? PLATES.paper)();
}

plate(new URLSearchParams(location.search).get('plate') ?? 'paper');

(window as unknown as { __kit: unknown }).__kit = {
  ready: true,
  plates: Object.keys(PLATES),
  plate,
  current: () => current,
};

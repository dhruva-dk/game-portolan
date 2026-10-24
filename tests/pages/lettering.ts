// The lettering specimen (outside the game build): the cancelleresca on parchment, drawn by the game's own lettering.
//   ?sheet=specimen   every glyph: minuscules, capitals, figures and marks, and two pangrams
//   ?sheet=names      the thirty captains, the twelve regions and the eight winds
//   ?sheet=small      interface sizes (11–13 CSS px) on scraps and buttons, for the legibility check at device scale
//   ?sheet=title      Portolan at title size; &progress=0–1 holds the lettering-in there, &animate=1 loops it
//   ?sheet=frames     Portolan lettering itself in, at four moments
//   ?hour=15          hour of the day (the palette's paper and ink)
// window.__lettering drives it from tests/pages/lettering.shots.ts.
import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { ButtonBase, Scrap } from '../../src/ui/parchment.ts';
import { Lettering, type InkText, type InkTextOptions } from '../../src/lettering/ink.ts';

const params = new URLSearchParams(location.search);
const sheet = params.get('sheet') ?? 'specimen';
const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
pipeline.style.setHour(Number(params.get('hour') ?? 15));
const W = innerWidth, H = innerHeight;
pipeline.setSize(W, H, devicePixelRatio);
const lettering = new Lettering(pipeline.style, devicePixelRatio, (b) => pipeline.registerTexture('lettering', b));

const pageScrap = new Scrap(pipeline.style, { width: W - 16, height: H - 16, torn: [0.25, 0.25, 0.25, 0.25], frame: 'double', age: 0.04 });
pageScrap.position.set(W / 2, H / 2, 0);
pipeline.ui.add(pageScrap);

let writeMs = 0, texts = 0;
function put(text: string, o: InkTextOptions, x: number, y: number): InkText {
  const t0 = performance.now();
  const m = lettering.text(text, o);
  writeMs += performance.now() - t0;
  texts++;
  m.position.set(Math.round(x), Math.round(y), 0);
  pipeline.ui.add(m);
  return m;
}
/** Stacks blocks of text down the page from y, each wrapped to the page, returning the next y. */
function stack(rows: [string, number][], y: number, gap: number): number {
  for (const [text, size] of rows) {
    const m = put(text, { size, valign: 'top', maxWidth: W - 90 }, 45, y);
    y += m.layout.box.bottom - m.layout.box.top + gap;
  }
  return y;
}

const CAPTAINS = ['Saetta', 'Lanza', 'Astore', 'Fiera', 'Morsa', 'Meridiana', 'Marea', 'Aurora', 'Lontana', 'Rosa dei Venti',
  'Gazza', 'Volpe', 'Rapina', 'Scheggia', 'Ladra', 'Testuggine', 'Rocca', 'Ancora', 'Bastia', 'Quieta',
  'Pazienza', 'Ombra', 'Gufo', 'Avvoltoio', 'Sorniona', 'Fortuna', 'Azzardo', 'Tempesta', 'Cometa', 'Sirocchia'];
const REGIONS = ['The Ice Crown', 'The Fjords', 'The Basalt Stacks', 'The Kelp Shallows', 'The Amber Shoals', 'The Weeping Isle',
  'The Coral Atolls', 'The Spice Isles', 'The Fire Archipelago', 'The Mangrove Labyrinth', 'The Glass Sea', 'The Maelstrom'];
const WINDS = ['Greco', 'Levante', 'Scirocco', 'Ostro', 'Libeccio', 'Ponente', 'Maestro', 'Tramontana'];

const titles: InkText[] = [];
let animate = false;
if (sheet === 'specimen') {
  const big = H * 0.105, small = H * 0.058;
  stack([
    ['abcdefghijklm nopqrstuvwxyz', big],
    ['ABCDEFGHIJKLM NOPQRSTUVWXYZ', big],
    ['0123456789 .,:;!? ’‘ ”“ -–—−+×·/()%&', big],
    ['Quel vituperabile xenofobo zelante assaggia il whisky ed esclama: alleluja!', small],
    ['The quick brown fox jumps over the lazy dog. Has learned you break off at the volcano.', small],
  ], H * 0.06, H * 0.012);
} else if (sheet === 'names') {
  const size = H * 0.05, cols = 5, colW = (W - 90) / cols, row = size * 1.12;
  CAPTAINS.forEach((c, i) => put(c, { size, valign: 'top' }, 45 + (i % cols) * colW, H * 0.05 + Math.floor(i / cols) * row));
  const y0 = H * 0.05 + 6 * row + size * 0.5;
  REGIONS.forEach((r, i) => put(r, { size: size * 0.92, valign: 'top', swash: true }, 45 + (i % 3) * ((W - 90) / 3), y0 + Math.floor(i / 3) * row));
  WINDS.forEach((w, i) => put(w, { size, valign: 'top', pigment: i % 2 ? 'vermilion' : 'ink' }, 45 + (i % 4) * colW * 1.25, y0 + (4 + Math.floor(i / 4)) * row + size * 0.4));
} else if (sheet === 'small') {
  let y = 34;
  for (const size of [11, 12, 13]) {
    put(`${size} px  0123456789  1,250  +24 −12  7/10  ×2`, { size, valign: 'top' }, 40, y);
    put('Saetta  Lanza  Levante  Head home  The Coral Atolls  Iron-gall', { size, valign: 'top' }, 40, y + size * 1.25);
    y += size * 3;
  }
  const hull = new Scrap(pipeline.style, { width: 150, height: 40, frame: 'rule', torn: [0.2, 0.9, 0.2, 0.1] });
  hull.position.set(120, y + 30, 0);
  pipeline.ui.add(hull);
  put('Hull 84', { size: 13, valign: 'middle', align: 'center' }, 120, y + 30);
  ['25', '3', '120'].forEach((n, i) => {
    const b = new ButtonBase(pipeline.style, 24);
    b.position.set(260 + i * 64, y + 30, 0);
    pipeline.ui.add(b);
    put(n, { size: 13, valign: 'middle', align: 'center' }, 260 + i * 64, y + 30);
  });
  put('Saetta', { size: 12, valign: 'middle', pigment: 'vermilion' }, 470, y + 30);
  put('Gold leaf', { size: 12, valign: 'middle', pigment: 'goldLeaf' }, 540, y + 30);
} else if (sheet === 'title') {
  titles.push(put('Portolan', { size: Math.min(H * 0.5, W * 0.3), align: 'center', valign: 'middle', swash: true, progress: Number(params.get('progress') ?? 1) }, W / 2, H / 2));
  animate = params.get('animate') === '1';
} else if (sheet === 'frames') {
  const size = Math.min(H * 0.22, W * 0.14);
  [0.2, 0.45, 0.7, 1].forEach((p, i) =>
    titles.push(put('Portolan', { size, align: 'center', valign: 'middle', swash: true, progress: p }, W * (i % 2 ? 0.74 : 0.27), H * (i < 2 ? 0.3 : 0.72))));
}

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 10);
let last = performance.now(), frames = 0;
function loop(now: number): void {
  if (animate) for (const t of titles) t.progress = ((now / 1000) % (t.duration + 1.5)) / t.duration;
  pipeline.render(scene, camera, Math.min((now - last) / 1000, 0.1));
  last = now;
  frames++;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

declare global { interface Window { __lettering: unknown } }
window.__lettering = {
  get ready() { return frames > 2; },
  stats: () => ({ texts, writeMs: +writeMs.toFixed(1), bytes: lettering.bytes, durations: titles.map((t) => +t.duration.toFixed(2)), ...pipeline.stats }),
};

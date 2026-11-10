// The app's icon: the compass rose on the sheet, opaque and without a word. tools/appicon.ts photographs this page at
// 1024 pixels square; iOS rounds the corners itself.
import { Parchment } from '../src/render/paper/parchment.ts';
import { Paper, Pen, bakeSheet, chartLayout, drawBaked, rose } from '../src/chart/index.ts';

const SIZE = 1024;
const cv = document.createElement('canvas');
cv.width = cv.height = SIZE;
cv.style.cssText = `position:fixed;left:0;top:0;width:${SIZE}px;height:${SIZE}px`;
document.body.appendChild(cv);
const g = cv.getContext('2d', { alpha: false })!;
g.fillStyle = '#dfc8a2';
g.fillRect(0, 0, SIZE, SIZE);

const L = chartLayout(SIZE, SIZE);
const parchment = await Parchment.create();
const paper = await Paper.from(parchment);
// the sheet runs past the square on every side, so no torn edge shows
drawBaked(g, bakeSheet(paper, L.widths, { weight: 'folio', w: SIZE + 240, h: SIZE + 240, dpr: 1, seed: 6, folds: false }), -120, -120);
g.setTransform(1, 0, 0, 1, 0, 0);
const widths = { ...L.widths };
for (const k of Object.keys(widths) as (keyof typeof widths)[]) widths[k] *= 3.2;
const pen = new Pen(paper, 1, widths).on(g, 0, 0);
rose(pen, SIZE / 2, SIZE / 2, SIZE * 0.44, { points: 16, seed: 11 });
(window as unknown as { iconReady: boolean }).iconReady = true;

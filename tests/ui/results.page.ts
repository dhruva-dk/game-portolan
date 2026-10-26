import { applyResult } from '../../src/career/progress.ts';
import { toSetup } from '../../src/career/setup.ts';
import { inkChart as inkVoyage } from '../../src/career/learn.ts';
import { RANK, copyCareer, newCareer, tierOf, type Career } from '../../src/career/state.ts';
import { LESSON, newVoyage } from '../../src/career/voyage.ts';
import { emblemSheet, sheet } from '../../src/render/harbourScene.ts';
import { buildGeography } from '../../src/sim/world/geography.ts';
import { createMatch } from '../../src/sim/state.ts';
import { CONSUMABLE, FITTING } from '../../src/sim/tables.ts';
import { UNROLL, drawCareerChart, drawUnroll, unrollOf } from '../../src/ui/careerChart.ts';
import { chestLayout, chestOffers, drawChestChoice } from '../../src/ui/chestChoice.ts';
import { rgba, type G } from '../../src/ui/inkpage.ts';
import { drawNextNine, drawResults, drawSkip, nextLayout, resultsLayout, resultsModel, skipLayout } from '../../src/ui/results.ts';
import { drawPrompt, promptLayout } from '../../src/ui/tutorial.ts';
import { inkChart, madeMatch } from './results.fixtures.ts';

const q = new URLSearchParams(location.search), full = q.get('shot') ?? 'chest', dev = q.get('dev') ?? 'iphone';
const close = full.endsWith('-close'), shot = full.replace(/-close$/, ''), dpr = devicePixelRatio || 2;
const view = dev === 'ipad' ? { width: 1376, height: 1032, dpr, safe: { top: 24, right: 0, bottom: 20, left: 0 } } : { width: 956, height: 440, dpr, safe: { top: 0, right: 62, bottom: 20, left: 62 } };
const s = sheet(view.width, view.height, 12_000_000, dpr), g = s.g;
let clip: { x: number; y: number; width: number; height: number } | null = null;
s.canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:10';
document.body.appendChild(s.canvas);

function sea(g: G): void {
  const grd = g.createLinearGradient(0, 0, 0, view.height);
  grd.addColorStop(0, '#bfcfc2');
  grd.addColorStop(1, '#7f9c95');
  g.fillStyle = grd;
  g.fillRect(0, 0, view.width, view.height);
  g.strokeStyle = rgba('#2a211c', 0.14);
  g.lineWidth = 1;
  for (let y = 24; y < view.height; y += 18) for (let x = (y * 7) % 60; x < view.width; x += 60) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 4, x + 20, y); g.stroke(); }
}

if (shot.startsWith('chest')) {
  sea(g);
  const ship = createMatch(toSetup(newCareer(3), 77).setup).ships[0];
  ship.offer.length = 0;
  if (shot === 'chest-gold') ship.offer.push({ kind: FITTING.ironRam, tier: 4 }, { kind: FITTING.crowsNest, tier: 2 }, { kind: CONSUMABLE.fogFlask, tier: 3 });
  else ship.offer.push({ kind: FITTING.longGuns, tier: 3 }, { kind: FITTING.copperSheathing, tier: 2 }, { kind: CONSUMABLE.patchKit, tier: 1 });
  const l = chestLayout(view);
  drawChestChoice(g, chestOffers(ship), l, 3, -1, shot === 'chest-gold');
  if (close) clip = { x: l.sheet.x - 4, y: l.sheet.y - 4, width: l.sheet.width + 8, height: l.sheet.height + 8 };
} else if (shot === 'skip') {
  sea(g);
  drawSkip(g, skipLayout(view), "Sunk by Lanza's guns", 6, false, 2);
} else if (shot.startsWith('results') || shot === 'next') {
  const place = shot === 'results-won' ? 1 : 3, before = newCareer(17);
  before.match = 4;
  before.player.points = RANK.tier * 2 - 6;
  before.player.tier = tierOf(before.player.points);
  const { drawn } = toSetup(before, 99), result = madeMatch(place), voyage = newVoyage();
  voyage.breakOff = 2;
  voyage.entered[2] = 140;
  voyage.lessons[LESSON.breakOff] = 140;
  const after = applyResult(before, result, voyage);
  g.fillStyle = '#3e4d52';
  g.fillRect(0, 0, view.width, view.height);
  const m = resultsModel(before, after, result, drawn, voyage);
  if (shot === 'next') {
    const l = nextLayout(view), u = Math.min(12 * l.k, l.cells[0].height / 8.6);
    drawNextNine(g, m, l, 4, m.next.map((c) => emblemSheet(u * 2.3, u * 2.8, c.pigments, c.emblem, dpr).canvas));
  } else {
    const l = resultsLayout(view);
    drawResults(g, m, l, shot === 'results-mid' ? 3.9 : 8);
    if (close) clip = { x: l.mid.x - 8, y: l.page.y + 6, width: l.mid.width + 16, height: 92 * l.k };
  }
} else if (shot.startsWith('chart')) {
  const f = shot.endsWith('-100') ? 1 : shot.endsWith('-23') ? 2 / 3 : 0;
  drawCareerChart(g, inked(f), view.width, view.height, 1, { geo: shot.startsWith('chart-geo') ? buildGeography() : null });
} else if (shot.startsWith('unroll-')) {
  const before = inked(1 / 3, 3), seen = inked(2 / 3, 5), voyage = newVoyage();
  voyage.seen.set(seen.chart.seen);
  seen.chart.named.forEach((n, r) => { if (n.match >= 0 && before.chart.named[r].match < 0) voyage.entered[r] = 300 + 200 * n.match; });
  const after = copyCareer(before);
  inkVoyage(after, voyage);
  after.match++;
  const u = unrollOf(before, after, voyage, buildGeography(), view.width, view.height, dpr);
  drawUnroll(g, u, [0, UNROLL.ink * 0.55, UNROLL.names + UNROLL.every * 0.9, u.end][Number(shot.slice(7))] ?? 0);
} else if (shot.startsWith('lesson-')) {
  sea(g);
  drawPrompt(g, promptLayout(view, Number(shot.slice(7))), 3);
}
function inked(f: number, named = f >= 1 ? 99 : 5): Career {
  const c = newCareer(9);
  if (f <= 0) return c;
  inkChart(c, f, named);
  c.match = f >= 1 ? 61 : 14;
  c.player.points = f >= 1 ? RANK.top : RANK.tier * 3 + 10;
  c.player.tier = tierOf(c.player.points);
  return c;
}

(window as unknown as { __wp27: { done: boolean; clip: typeof clip } }).__wp27 = { done: true, clip };

// WP27 shots page: one part-A sheet drawn full screen on a 2D canvas at the device's size (results.shots.ts):
// ?shot=chest|chest-gold|results|results-mid|results-won|chart-0|chart-23|chart-100|lesson-<k>&dev=iphone|ipad
import { applyResult } from '../../src/career/progress.ts';
import { toSetup } from '../../src/career/setup.ts';
import { RANK, newCareer, tierOf } from '../../src/career/state.ts';
import { LESSON, newVoyage } from '../../src/career/voyage.ts';
import { sheet } from '../../src/render/harbourScene.ts';
import { createMatch } from '../../src/sim/state.ts';
import { CONSUMABLE, FITTING } from '../../src/sim/tables.ts';
import { drawCareerChart } from '../../src/ui/careerChart.ts';
import { chestLayout, chestOffers, drawChestChoice } from '../../src/ui/chestChoice.ts';
import { rgba, type G } from '../../src/ui/inkpage.ts';
import { drawResults, resultsLayout, resultsModel } from '../../src/ui/results.ts';
import { drawPrompt, promptLayout } from '../../src/ui/tutorial.ts';
import { inkChart, madeMatch } from './results.fixtures.ts';

const q = new URLSearchParams(location.search), shot = q.get('shot') ?? 'chest', dev = q.get('dev') ?? 'iphone';
const view = dev === 'ipad' ? { width: 1376, height: 1032, dpr: 2, safe: { top: 24, right: 0, bottom: 20, left: 0 } } : { width: 956, height: 440, dpr: 2, safe: { top: 0, right: 62, bottom: 20, left: 62 } };
const s = sheet(view.width, view.height, 12_000_000, 2), g = s.g;
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
  drawChestChoice(g, chestOffers(ship), chestLayout(view), 3, -1, shot === 'chest-gold');
} else if (shot.startsWith('results')) {
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
  drawResults(g, resultsModel(before, after, result, drawn, voyage), resultsLayout(view), shot === 'results-mid' ? 3.9 : 8);
} else if (shot.startsWith('chart')) {
  const c = newCareer(9), f = shot === 'chart-100' ? 1 : shot === 'chart-23' ? 2 / 3 : 0;
  if (f > 0) {
    inkChart(c, f, f >= 1 ? 99 : 5);
    c.match = f >= 1 ? 61 : 14;
    c.player.points = f >= 1 ? RANK.top : RANK.tier * 3 + 10;
    c.player.tier = tierOf(c.player.points);
  }
  drawCareerChart(g, c, view.width, view.height, 1);
} else if (shot.startsWith('lesson-')) {
  sea(g);
  drawPrompt(g, promptLayout(view, Number(shot.slice(7))), 3);
}
(window as unknown as { __wp27: { done: boolean } }).__wp27 = { done: true };

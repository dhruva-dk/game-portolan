// The art direction's hero shots (docs/art-direction.md), captured together for judging the look round by round.
//   node tools/hero.ts <dir> [query] [--dpr=3]      e.g. node tools/hero.ts captures/round1 mood=warm
// Writes <dir>/1.png … <dir>/7.png and <dir>/sheet.png, all seven on one contact sheet labelled only by number:
// 1 the chase in open sea, the sun over her quarter; 2 the same sailing into the sun; 3 near the start's island; 4 a
// crowd of ships; 5 at the storm's edge; 6 the lobby; 7 the planet from space, as the map shows it. The query is
// added to each (a mood, a seed); the islands and weather follow the seed, so the shots are of kinds of view, not of
// one island. Headless, as every tool here.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [dir = 'captures/hero', extra = ''] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const and = extra ? `&${extra}` : '';
const SHOTS = [
  'screen=match&drive=150,1,14',
  'screen=match&drive=291,1,14',
  'screen=match',
  'screen=match&ships=80&drive=0,0.3,2',
  'screen=match&storm=100',
  'screen=lobby',
  'screen=map',
].map((q) => q + and);

mkdirSync(dir, { recursive: true });
execFileSync('node', ['tools/capture.ts', `--out=${dir}`, ...flags, ...SHOTS], { stdio: 'inherit' });
SHOTS.forEach((q, i) => renameSync(`${dir}/${q.replace(/[^\w.=-]+/g, '_')}.png`, `${dir}/${i + 1}.png`));

// the sheet: two across, each shot at the phone's CSS size, its number in a corner
const W = 956, H = 440, GAP = 8;
const cells = SHOTS.map((_, i) => {
  const png = readFileSync(`${dir}/${i + 1}.png`).toString('base64');
  return `<div style="position:relative;width:${W}px;height:${H}px"><img src="data:image/png;base64,${png}"
    style="width:${W}px;height:${H}px;display:block"><b style="position:absolute;right:12px;bottom:6px;font:600 28px Georgia,serif;
    color:#f3e6c8;text-shadow:0 1px 3px #000">${i + 1}</b></div>`;
}).join('');
const rows = Math.ceil(SHOTS.length / 2);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 2 * W + 3 * GAP, height: rows * H + (rows + 1) * GAP } });
  await page.setContent(`<body style="margin:0;padding:${GAP}px;background:#1d1a16;display:grid;
    grid-template-columns:${W}px ${W}px;gap:${GAP}px">${cells}</body>`);
  await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode())));
  writeFileSync(`${dir}/sheet.png`, await page.screenshot({ fullPage: true }));
  console.log(`${dir}/sheet.png`);
} finally {
  await browser.close();
}

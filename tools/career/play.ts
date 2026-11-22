// The manager's game played through in headless Chromium with WebGPU, as a
// player would: a new career from the main menu, a team made, the days gone
// through to race day, the race sailed (her ship left to the storm, then the
// race hurried to its end), its result, and on to the next planet. A capture
// at each step, and what the page logged on the way.
//   node tools/career/play.ts [--out=dir] [--races=n]
// It fails (exit 1) if a step's screen never comes.

import { mkdirSync } from 'node:fs';
import { VIEW, launch } from '../launch.ts';

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ??
  fallback;
const out = arg('out', 'captures/career'),
  races = Number(arg('races', '1'));

const { browser, url, close } = await launch();
mkdirSync(out, { recursive: true });
const page = await browser.newPage({ viewport: VIEW });
page.on(
  'console',
  (m) =>
    ['error', 'warning', 'info'].includes(m.type()) &&
    /refused|Error|error|:/.test(m.text()) &&
    !/ms$|baked|sounded/.test(m.text()) &&
    console.error(`[page] ${m.text()}`)
);
page.on('pageerror', (e) => console.error(`[page] ${e.message}`));

let shot = 0;
const capture = async (name: string) => {
  const file = `${out}/${String(++shot).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log(file);
};
/** The office's open screen is `name` (its root shown, the page past its load). */
const at = (name: string, timeout = 120000) =>
  page.waitForSelector(`.o-body > .s-${name}:not([hidden])`, { timeout });
const tap = (selector: string) => page.locator(selector).first().click();
const title = () => page.locator('.o-title').innerText();

try {
  await page.goto(`${url}?debug&manager`);
  await at('menu');
  await page.waitForTimeout(1500);
  await capture('menu');
  await tap('.m-tile');
  await at('found');
  await capture('found');
  // a team made: the page sails to the first race's planet, and opens at Home
  await tap('.f-foot .k-btn');
  await page.waitForURL(/career/, { timeout: 60000 });
  await at('home');
  await page.waitForTimeout(1500);
  await capture('home');

  for (let race = 1; race <= races; race++) {
    // Continue through the days until race day's plan opens
    for (let stops = 0; stops < 40; stops++) {
      if (await page.locator('.o-body > .s-plan:not([hidden])').count()) break;
      await tap('.o-on');
      await page.waitForTimeout(400);
    }
    await at('plan', 10000);
    await capture(`race${race}-plan`);
    console.log(`race ${race}: ${await title()}`);
    // the race: Continue from the plan; the eye comes down, the HUD shows
    await tap('.o-on');
    await page.waitForFunction(
      () => {
        const office = document.querySelector<HTMLElement>('.o-root');
        return office && (office.hidden || office.classList.contains('gone'));
      },
      null,
      { timeout: 30000 }
    );
    await page.waitForTimeout(14000);
    await capture(`race${race}-sailing`);
    // the pit wall's keys: the team's orders changed, and a pit stop's sheet opened where she lies
    await tap('.w-keys .k-btn');
    await page.waitForTimeout(600);
    await capture(`race${race}-orders`);
    await tap('.w-sheet .w-job:nth-child(2)');
    await page.waitForTimeout(600);
    if ((await page.locator('.w-keys .k-btn:not(.off)').count()) > 1) {
      await page.locator('.w-keys .k-btn').nth(1).click();
      await page.waitForTimeout(600);
      await capture(`race${race}-pit`);
    } else await capture(`race${race}-called`);
    // her ship left alone sinks in the storm in time; then LEAVE (the anchor) hurries the race to its end
    const began = Date.now();
    while (Date.now() - began < 900000) {
      if (await page.locator('.o-body > .s-result:not([hidden])').count())
        break;
      const leave = page.locator('[data-way="leave"]');
      if (await leave.isVisible()) await leave.click();
      await page.waitForTimeout(2000);
    }
    await at('result', 10000);
    await page.waitForTimeout(800);
    await capture(`race${race}-result`);
    await tap('.o-on');
    await at('home');
    await page.waitForTimeout(1500);
    await capture(`race${race}-home`);
  }
  console.log('played through');
} catch (e) {
  await capture('failed');
  console.error(e);
  process.exitCode = 1;
} finally {
  await close();
}

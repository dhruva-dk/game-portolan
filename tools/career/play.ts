// The manager's game played through in headless Chromium with WebGPU, as a
// player would: a new career from the main menu, a team made, the days gone
// through to race day, the race sailed (her ship left to the storm, then the
// race hurried to its end), its result, and on to the next planet. A capture
// at each step, and what the page logged on the way.
//   node tools/career/play.ts [--out=dir] [--races=n] [--tour]
// --tour: after the first race, every tab of the nav opened and captured.
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

/** The nav's tabs, in the order they stand (src/office/office.ts TABS). */
const TABS = [
  'home',
  'player',
  'mail',
  'ship',
  'hq',
  'team',
  'drivers',
  'staff',
  'scouting',
  'finances',
  'sponsors',
  'standings',
  'calendar',
];

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

  /** Every tab of the nav opened in turn and captured (the first row of a list tapped, where `into` names its screen). */
  const tour = async (label: string) => {
    for (let i = 1; i < TABS.length; i++) {
      await page.locator('.o-tab').nth(i).click();
      await at(TABS[i], 10000);
      await page.waitForTimeout(500);
      await capture(`${label}-${TABS[i]}`);
    }
    // a letter opened, a design's cards dealt, a driver's profile and the offer to a scouted person
    await page.locator('.o-tab').nth(2).click();
    await tap('.s-mail .k-rows > .k-tr');
    await page.waitForTimeout(400);
    await capture(`${label}-letter`);
    await page.locator('.o-tab').nth(3).click();
    // (a card dealt and picked, where her designer knows a component of the part)
    if (await page.locator('.y-slot .k-btn:not(.off)').count()) {
      await tap('.y-slot .k-btn');
      await page.waitForTimeout(400);
      await tap('.y-card');
      await page.waitForTimeout(400);
    }
    await capture(`${label}-design`);
    await page.locator('.o-tab').nth(8).click();
    await tap('.s-scouting .k-rows > .k-tr');
    await at('profile', 10000);
    await page.waitForTimeout(400);
    await capture(`${label}-profile`);
    // (the offer, where one may be made: not to a driver under contract elsewhere)
    if (await page.locator('.s-profile .k-btn.on:not(.off)').count()) {
      await page.locator('.s-profile .k-btn.on').click();
      await at('offer', 10000);
      await page.waitForTimeout(400);
      await capture(`${label}-offer`);
    }
    // what the career is asked through the screens, where it may be: a sponsor signed, a building begun, a design started
    const asked = async (tab: number, selector: string, name: string) => {
      await page.locator('.o-tab').nth(tab).click();
      await page.waitForTimeout(300);
      if (!(await page.locator(selector).count())) return;
      await tap(selector);
      await page.waitForTimeout(500);
      await capture(`${label}-${name}`);
    };
    await asked(10, '.sp-sign .k-btn:not(.off)', 'signed');
    // (a building of the harbour chosen by its label: its card has what may be built)
    await page.locator('.o-tab').nth(4).click();
    await page.waitForTimeout(600);
    await page
      .locator('.q-site .q-label')
      .first()
      .click({ timeout: 3000 })
      .catch(() => null);
    await asked(4, '.q-card .k-btn:not(.off)', 'building');
    await asked(3, '.s-ship .b-act .k-btn:not(.off)', 'designing');
    await page.locator('.o-tab').nth(0).click();
    await at('home', 10000);
    await capture(`${label}-home`);
  };
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
    // (if she is still afloat: left alone she may be sunk before a key is reached)
    const key = (selector: string, nth = 0) =>
      page
        .locator(selector)
        .nth(nth)
        .click({ timeout: 3000 })
        .then(
          () => true,
          () => false
        );
    if (await key('.w-keys .k-btn')) {
      await page.waitForTimeout(600);
      await capture(`race${race}-orders`);
      await key('.w-sheet .w-job', 1);
      await page.waitForTimeout(600);
      if (
        (await page.locator('.w-keys .k-btn:not(.off)').count()) > 1 &&
        (await key('.w-keys .k-btn', 1))
      ) {
        await page.waitForTimeout(600);
        await capture(`race${race}-pit`);
      } else await capture(`race${race}-called`);
    }
    // her ship left alone sinks in the storm in time; then LEAVE (the anchor) hurries the race to its end
    const began = Date.now();
    while (Date.now() - began < 900000) {
      if (await page.locator('.o-body > .s-result:not([hidden])').count())
        break;
      const leave = page.locator('[data-way="leave"]');
      // (the result may come up over it as it is reached)
      if (await leave.isVisible())
        await leave.click({ timeout: 2000 }).catch(() => null);
      await page.waitForTimeout(2000);
    }
    await at('result', 10000);
    await page.waitForTimeout(800);
    await capture(`race${race}-result`);
    await tap('.o-on');
    await at('home');
    await page.waitForTimeout(1500);
    await capture(`race${race}-home`);
    if (race === 1 && process.argv.includes('--tour')) await tour('tour');
  }
  console.log('played through');
} catch (e) {
  await capture('failed');
  console.error(e);
  process.exitCode = 1;
} finally {
  await close();
}

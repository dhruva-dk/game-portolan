// PROTOTYPE: screenshots of the office prototype in headless Chromium at the iPad's page.
//   node prototype/office/shoot.ts <outdir> [query ...]     e.g. screen=home screen=faces theme=dark&screen=home
import { DEVICE, launch } from '../../tools/launch.ts';

const [out, ...queries] = process.argv.slice(2);
const run = await launch();
try {
  const page = await run.browser.newPage({ viewport: { width: DEVICE.width, height: DEVICE.height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  for (const q of queries.length ? queries : ['screen=home']) {
    await page.goto(`${run.url}prototype/office/?${q}`);
    await page.waitForSelector('#ready', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(300);
    const file = `${out}/${q.replace(/[&=]/g, '_')}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
} finally {
  await run.close();
}

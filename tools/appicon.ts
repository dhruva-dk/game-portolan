// Draws the app's icon from the chart kit (dev/appicon.ts) and writes it into the iOS project, opaque, 1024 px square.
import { join } from 'node:path';
import { launch, root, serve } from './harness.ts';

const OUT = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png');

const server = await serve();
const { browser } = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`appicon: ${e.message}`));
  await page.goto(new URL('dev/appicon.html', server.url).href);
  await page.waitForFunction(() => (window as unknown as { iconReady?: boolean }).iconReady === true, undefined, { timeout: 60_000 });
  await page.screenshot({ path: OUT, omitBackground: false, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  console.log(`appicon: wrote ${OUT}`);
} finally {
  await browser.close();
  await server.close();
}

// The app's icon, drawn by the game's own rose (tools/appicon-page.ts) in headless Chromium (tools/launch.ts) and written
// as an opaque RGB PNG, 1024 px square, into the iOS project's app icon set with its Contents.json; iOS rounds the
// corners itself. Each of the icons (ICONS) is also written to captures/icon/<name>-1024.png and, to judge it as a home
// screen shows it, <name>-120.png.
//   node tools/appicon.ts            (npm run icon)       installs INSTALLED
//   node tools/appicon.ts sea        installs another

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from './launch.ts';
import { png } from './png.ts';

/** The icon the app wears. */
const INSTALLED = 'card';
const SET = resolve(import.meta.dirname, '../ios/App/App/Assets.xcassets/AppIcon.appiconset');
const FILE = 'AppIcon-1024.png';
const OUT = resolve(import.meta.dirname, '../captures/icon');
const SIZES = [1024, 120];

const installed = process.argv[2] ?? INSTALLED;
mkdirSync(OUT, { recursive: true });
const { browser, url, close } = await launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  await page.goto(`${url}package.json`);
  const names = await page.evaluate(async (path) => {
    const m: typeof import('./appicon-page.ts') = await import(path);
    return Object.keys(m.ICONS);
  }, '/tools/appicon-page.ts');
  if (!names.includes(installed)) throw new Error(`no icon '${installed}': ${names.join(', ')}`);
  for (const name of names) {
    for (const size of SIZES) {
      const b64 = await page.evaluate(async ([path, n, s]) => {
        const m: typeof import('./appicon-page.ts') = await import(path);
        return m.pixels(n, s);
      }, ['/tools/appicon-page.ts', name, size] as const);
      const file = png(size, size, Buffer.from(b64, 'base64'));
      writeFileSync(resolve(OUT, `${name}-${size}.png`), file);
      if (name === installed && size === 1024) writeFileSync(resolve(SET, FILE), file);
    }
    console.log(`${resolve(OUT, name)}-{${SIZES.join(',')}}.png`);
  }
  const contents = { images: [{ filename: FILE, idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } };
  writeFileSync(resolve(SET, 'Contents.json'), `${JSON.stringify(contents, null, 2)}\n`);
  console.log(`installed '${installed}' as ${resolve(SET, FILE)}`);
} finally {
  await close();
}

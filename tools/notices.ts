// The notices a release carries: CREDITS.md, then the licence of each library that ships inside the app.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
/** What is compiled into the app; the rest of package.json only builds it. */
const SHIPPED = ['three', '@capacitor/core', '@capacitor/ios', '@capacitor/app', '@capacitor/haptics', '@capacitor/preferences'];

/** Writes NOTICES.txt into `dir`. Throws if a shipped library has no licence to carry, rather than leave it out. */
export function writeNotices(dir: string): void {
  const parts = [readFileSync(join(root, 'CREDITS.md'), 'utf8')];
  for (const name of SHIPPED) {
    const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map((f) => join(root, 'node_modules', name, f)).find(existsSync);
    if (!file) throw new Error(`no licence found for ${name}`);
    parts.push(`\n\n----- ${name} -----\n\n${readFileSync(file, 'utf8')}`);
  }
  writeFileSync(join(dir, 'NOTICES.txt'), parts.join(''));
}

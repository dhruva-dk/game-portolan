// A new planet per race leaves nothing behind: the page opened at the lobby (?restage, debug.ts), then ten planets
// made in turn as the way home makes them (main.ts restage), each drawn for a while; after each, the GPU's geometries
// and textures held (three's renderer.info.memory) and the JS heap once garbage is collected, its objects judged: what
// it uses less V8's compiled code (a heap snapshot's), which grows by itself as the game's code is optimised. Fails
// (exit 1) if, after the tenth, any is more than SLACK over what it was after the first.
//   node tools/restage.ts [--count=10] [--settle=2] [--seed=3 | --fresh]
// Each is made anew, the last put away whole, on one seed (--seed, the page's own by default), so each holds what the
// last did and anything more is left behind; --fresh makes the page's own next planets instead (as each race does),
// whose geometries differ by their islands. --settle: seconds each is drawn before it is measured (its pieces are
// counted by three once first drawn).

import { SEED } from '../src/world/planet.ts';
import { DEVICE, launch } from './launch.ts';

/** How far over the first's the tenth may be, as a share of it. */
const SLACK = 0.05;

const flag = (name: string, fallback: number) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const count = flag('count', 10), settle = flag('settle', 2), seed = process.argv.includes('--fresh') ? undefined : flag('seed', SEED);

/** The GPU's geometries and textures; the JS heap's objects (used less compiled code), what it uses, and its code. */
interface Held { geometries: number; textures: number; heap: number; used: number; code: number }
declare global {
  /** What ?restage puts on the page (debug.ts). */
  interface Window { restage(seed?: number): Promise<{ geometries: number; textures: number }>; memory(): { geometries: number; textures: number } }
}

const { browser, url, close } = await launch();
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: DEVICE.width, height: DEVICE.height }, deviceScaleFactor: DEVICE.dpr });
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && console.error(`[page] ${m.text()}`));
  await page.goto(`${url}?debug&restage&screen=lobby${seed === undefined ? '' : `&seed=${seed}`}`);
  console.log(seed === undefined ? 'the page\'s own next planets' : `planets of seed ${seed}, each made anew`);
  await page.waitForFunction(() => document.getElementById('meter')?.textContent, null, { timeout: 120000 });
  await page.waitForTimeout(settle * 1000);
  const cdp = await page.context().newCDPSession(page);
  /** The bytes of V8's own compiled code in the heap now (a snapshot's nodes of type code: the JIT's machine code,
   *  feedback and handlers), which grows as code warms and is no object the page keeps. */
  const compiled = async () => {
    const chunks: string[] = [];
    const take = (e: { chunk: string }) => chunks.push(e.chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk', take);
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    cdp.off('HeapProfiler.addHeapSnapshotChunk', take);
    const s = JSON.parse(chunks.join('')) as { snapshot: { meta: { node_fields: string[]; node_types: [string[]] } }; nodes: number[] };
    const fields = s.snapshot.meta.node_fields, n = fields.length, type = fields.indexOf('type'), size = fields.indexOf('self_size');
    const code = s.snapshot.meta.node_types[0].indexOf('code');
    let bytes = 0;
    for (let i = 0; i < s.nodes.length; i += n) if (s.nodes[i + type] === code) bytes += s.nodes[i + size];
    return bytes;
  };
  /** What is held now, garbage collected first. */
  const held = async (): Promise<Held> => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    const code = await compiled();
    const gpu = await page.evaluate(() => window.memory());
    return { ...gpu, heap: usedSize - code, used: usedSize, code };
  };
  const opened = await held();
  const mb = (b: number) => `${(b / 2 ** 20).toFixed(2)} MB`;
  const line = (label: string, h: Held) => console.log(`${label.padEnd(10)} geometries ${String(h.geometries).padStart(5)}  textures ${String(h.textures).padStart(4)}  `
    + `heap ${mb(h.heap)} (used ${mb(h.used)}, less ${mb(h.code)} of compiled code)`);
  line('opened', opened);
  const after: Held[] = [];
  for (let i = 1; i <= count; i++) {
    const began = Date.now();
    await page.evaluate((s) => window.restage(s ?? undefined), seed ?? null);
    const ms = Date.now() - began;
    await page.waitForTimeout(settle * 1000);
    after.push(await held());
    line(`restage ${i}`, after[i - 1]);
    console.log(`           (made in ${ms} ms)`);
  }
  const [first, last] = [after[0], after[after.length - 1]];
  for (const k of ['geometries', 'textures', 'heap'] as const) {
    const grown = (last[k] - first[k]) / Math.max(1, first[k]);
    const over = grown > SLACK;
    failed ||= over;
    console.log(`${over ? 'OVER' : 'ok'}: ${k} ${(grown * 100).toFixed(1)}% from the first restage to the ${count}th (at most ${SLACK * 100}%)`);
  }
  // (the heap as V8 counts it, compiled code and all: not judged, the JIT's code growing as the game's code warms)
  console.log(`(used ${(((last.used - first.used) / first.used) * 100).toFixed(1)}%, compiled code ${(((last.code - first.code) / first.code) * 100).toFixed(1)}%)`);
} finally {
  await close();
}
process.exit(failed ? 1 : 0);

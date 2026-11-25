import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';
import { lines, outDir, writeJson, type Lines } from './out.ts';

const VIEW = { width: 1180, height: 820 } as const,
  DPR = 2;

const BUDGET = { draws: 100, triangles: 900_000, passes: 20 };
type Budget = typeof BUDGET;

const VIEWS: {
  name: string;
  q: string;
  own?: Partial<Budget>;
  flat?: boolean;
}[] = [
  { name: 'sea', q: 'screen=match&drive=150,1,14' },
  { name: 'coast', q: 'screen=match' },
  { name: 'ships', q: 'screen=match&ships=12' },
  { name: 'lobby', q: 'screen=lobby' },
  { name: 'new', q: 'screen=new' },
  { name: 'deal', q: 'screen=deal&seed=test&races=14' },
  {
    name: 'negotiation',
    q: 'screen=negotiation&seed=test&races=14&offers=refuse,counter',
  },
  { name: 'ship', q: 'screen=ship&seed=test&races=14&stop=6' },
  { name: 'paint', q: 'screen=paint&seed=test&races=14' },
  { name: 'sponsors', q: 'screen=sponsors&seed=test&races=1&sponsors=1' },
  { name: 'planet', q: 'screen=planet&seed=test&races=14' },
  { name: 'opponents', q: 'screen=opponents&seed=test&races=14&team=1' },
  { name: 'result', q: 'screen=result&seed=test&races=2' },
  { name: 'paper', q: 'screen=paper&seed=test&races=4' },
  { name: 'offseason', q: 'screen=offseason&seed=test&races=10&page=2' },
  { name: 'settings', q: 'screen=settings&seed=test&races=14' },
  { name: 'team', q: 'screen=team&seed=test&races=14' },
  { name: 'glyphs', q: 'screen=glyphs', flat: true },
  { name: 'map', q: 'screen=match&map' },
  {
    name: 'worst',
    q: 'screen=match&ships=79&pack&ahead=6&kit&loot=60&kind=mortar&fire=',
  },
];

type Action =
  | { tap: string }
  | { drag: [number, number]; from: string | null }
  | { wait: string }
  | { hold: number };
const argv = process.argv.slice(2);
const actions: Action[] = [];
const opt: Record<string, string> = {};
let from: string | null = null;
let query: string | null = null,
  budget = false,
  early = false,
  bare = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--budget') budget = true;
  else if (a === '--early') early = true;
  else if (a === '--bare') bare = true;
  else if (a === '--wait') actions.push({ wait: argv[++i] });
  else if (a === '--hold') actions.push({ hold: Number(argv[++i]) });
  else if (a === '--tap') actions.push({ tap: argv[++i] });
  else if (a === '--from') from = argv[++i];
  else if (a === '--drag') {
    const [dx, dy] = argv[++i].split(',').map(Number);
    actions.push({ drag: [dx, dy], from });
    from = null;
  } else if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
  else query = a;
}
if (query === null && !budget && !bare) {
  console.error(
    'usage: npm run browser -- "<query>" [--tap what]... [--from what] [--drag dx,dy]... [--wait what]... [--hold ms]... [--shots n] [--every ms] [--settle ms] [--patience ms] [--early] [--bare] [--dpr n] [--subject name]\n       npm run browser -- --budget'
  );
  process.exit(2);
}
const num = (k: string, d: number) =>
  opt[k] === undefined ? d : Number(opt[k]);

const server = await createServer({
  logLevel: 'error',
  server: { port: 5199, strictPort: false },
});
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5199/';
const browser = await chromium.launch({
  args: [
    '--enable-unsafe-webgpu',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
  ],
});

async function adapterOf(page: Page) {
  return page.evaluate(async () => {
    const a = await navigator.gpu?.requestAdapter();
    return a
      ? {
          vendor: a.info.vendor,
          architecture: a.info.architecture,
          description: a.info.description,
          features: [...a.features].sort(),
        }
      : null;
  });
}

const addressOf = (q: string, plain: boolean) =>
  plain ? (q ? `?${q}` : '') : `?${['debug', q].filter(Boolean).join('&')}`;

async function open(q: string, log: Lines | null, dpr = DPR, plain = false) {
  const page = await browser.newPage({
    viewport: VIEW,
    deviceScaleFactor: dpr,
  });
  const t0 = Date.now(),
    at = () => Date.now() - t0;
  const errors: string[] = [];
  page.on('console', (m) =>
    log?.write({
      t: at(),
      type: m.type(),
      text: m.text(),
      at: m.location().url
        ? `${m.location().url.replace(url, '')}:${m.location().lineNumber}`
        : null,
    })
  );
  page.on('pageerror', (e) => {
    errors.push(e.message);
    log?.write({
      t: at(),
      type: 'pageerror',
      text: e.message,
      stack: e.stack ?? null,
    });
  });
  page.on('requestfailed', (r) =>
    log?.write({
      t: at(),
      type: 'requestfailed',
      url: r.url(),
      failure: r.failure()?.errorText ?? null,
    })
  );
  page.on('response', (r) => {
    if (r.status() >= 400)
      log?.write({ t: at(), type: 'http', url: r.url(), status: r.status() });
  });
  await page.goto(`${url}${addressOf(q, plain)}`);
  return { page, errors, at };
}

const firstReading = (page: Page) =>
  page.waitForFunction(
    () => document.getElementById('meter')?.dataset.line,
    null,
    { timeout: 60000 }
  );

function reading(line: string) {
  const m =
    /^(\d+)\s+cpu (\S+) \((\S+)\)\s+gpu (?:(\S+) \+ (\S+)|–)\s+(\d+) draws (\d+)k tri (\d+) passes/.exec(
      line
    );
  const n = (s: string | undefined) =>
    s === undefined || s === '–' ? null : Number(s);
  if (!m) return { line };
  return {
    fps: n(m[1]),
    cpu: n(m[2]),
    cpuRender: n(m[3]),
    gpu: n(m[4]),
    gpuCompute: n(m[5]),
    draws: n(m[6]),
    triangles: (n(m[7]) ?? 0) * 1000,
    passes: n(m[8]),
  };
}

const meterOf = async (page: Page) =>
  page.$eval('#meter', (m) => {
    const d = (m as HTMLElement).dataset;
    return {
      line: d.line ?? '',
      passes: d.passes ?? null,
      objects: d.objects ?? null,
    };
  });

function watchMeter(page: Page, log: Lines, at: () => number) {
  let last = '',
    on = true;
  const tick = async () => {
    while (on) {
      try {
        const m = await meterOf(page);
        if (m.line && m.line !== last) {
          last = m.line;
          log.write({
            t: at(),
            ...reading(m.line),
            byPass: m.passes?.split('\n') ?? null,
            byObject: m.objects?.split('\n') ?? null,
          });
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  const running = tick();
  return async () => {
    on = false;
    await running;
  };
}

const label = (s: string) =>
  s
    .replace(/[^\w=.-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'page';

let failed = false;
try {
  if (budget) {
    const probe = await browser.newPage();
    await probe.goto(url);
    const dir = outDir(opt.subject ?? 'budget', {
      chromium: browser.version(),
      gpu: await adapterOf(probe),
      budget: BUDGET,
      views: VIEWS,
    });
    await probe.close();
    const log = lines(join(dir, 'console.jsonl'));
    const results = [];
    for (const [k, { name, q, own, flat }] of VIEWS.entries()) {
      const limit: Budget = { ...BUDGET, ...own };
      const { page, errors } = await open(`${q}&pause`, log, 1);
      if (flat) {
        await page.waitForLoadState('networkidle');
        await page.screenshot({
          path: join(dir, `${String(k + 1).padStart(2, '0')}-${name}.png`),
        });
        await page.close();
        failed ||= errors.length > 0;
        results.push({ name, q, limit, seen: null, over: [], errors });
        console.log(
          `${errors.length ? 'OVER' : 'ok  '} ${name.padEnd(6)} no world drawn: page errors only` +
            (errors.length ? `  PAGE ERRORS: ${errors.join(' | ')}` : '')
        );
        continue;
      }
      await firstReading(page);
      const first = await page.getAttribute('#meter', 'data-line');
      await page.waitForFunction(
        (t) => document.getElementById('meter')?.dataset.line !== t,
        first,
        { timeout: 10000 }
      );
      const m = await meterOf(page),
        r = reading(m.line);
      const seen = {
        draws: r.draws ?? Infinity,
        triangles: r.triangles ?? Infinity,
        passes: r.passes ?? Infinity,
      };
      const over = (['draws', 'triangles', 'passes'] as const).filter(
        (x) => seen[x] > limit[x]
      );
      await page.screenshot({
        path: join(dir, `${String(k + 1).padStart(2, '0')}-${name}.png`),
      });
      await page.close();
      failed ||= over.length > 0 || errors.length > 0;
      results.push({
        name,
        q,
        limit,
        seen,
        over,
        errors,
        byPass: m.passes?.split('\n') ?? null,
        byObject: m.objects?.split('\n') ?? null,
      });
      console.log(
        `${over.length ? 'OVER' : 'ok  '} ${name.padEnd(6)} ${seen.draws} draws  ${seen.triangles / 1000}k tri  ${seen.passes} passes` +
          (over.length ? `  (over: ${over.join(', ')})` : '') +
          (own
            ? `  (its own: ${limit.draws} draws, ${limit.triangles / 1000}k tri)`
            : '') +
          (errors.length ? `  PAGE ERRORS: ${errors.join(' | ')}` : '')
      );
    }
    log.close();
    writeJson(join(dir, 'budget.json'), results);
    console.log(
      `budget: ${BUDGET.draws} draws, ${BUDGET.triangles / 1000}k triangles, ${BUDGET.passes} passes a frame`
    );
    console.log(
      `→ ${dir}  (budget.json: each view's counts and its draws by pass and by object; a shot each; console.jsonl)`
    );
  } else {
    const q = query ?? '';
    const shots = num('shots', 1),
      every = num('every', 500),
      settle = num('settle', 1500),
      dpr = num('dpr', DPR);
    const probe = await browser.newPage();
    await probe.goto(url);
    const dir = outDir(opt.subject ?? (q || 'default'), {
      query: q,
      actions,
      shots,
      every,
      settle,
      early,
      dpr,
      view: VIEW,
      chromium: browser.version(),
      gpu: await adapterOf(probe),
    });
    await probe.close();
    const log = lines(join(dir, 'console.jsonl')),
      meter = lines(join(dir, 'meter.jsonl'));
    const { page, errors, at } = await open(q, log, dpr, bare);
    const stop = watchMeter(page, meter, at);
    if (!early) {
      await firstReading(page);
      await page.waitForTimeout(settle);
    }
    let n = 0;
    const shot = async (what: string) => {
      const name = `${String(++n).padStart(2, '0')}-${label(what)}`;
      await page.screenshot({ path: join(dir, `${name}.png`) });
      const outline = await page
        .locator('body')
        .ariaSnapshot()
        .catch((e: Error) => `(no outline: ${e.message})`);
      const { line } = await meterOf(page).catch(() => ({ line: '' }));
      writeFileSync(
        join(dir, `${name}.txt`),
        `${q} · ${what} · at ${at()} ms\nmeter: ${line || '(no reading yet)'}\n\n${outline}\n`
      );
      console.log(`${name}.png  ${line || '(no meter reading yet)'}`);
    };
    for (const a of actions) {
      if ('tap' in a) {
        const [what, nth = '0'] = a.tap.split('@');
        const css = /^[.#[]|^[a-z][\w-]*[.#[:]/.test(what);
        const target = css
          ? page.locator(what).nth(Number(nth))
          : page.getByText(what, { exact: true }).nth(Number(nth));
        try {
          await target.click({ timeout: 4000 }).catch(async () => {
            await target.waitFor({ state: 'visible', timeout: 6000 });
            await target.click({ timeout: 6000, force: true });
          });
        } catch (e) {
          await shot(`failed-tap-${what}`);
          console.log(
            `TAP FAILED: ${css ? 'selector' : 'text'} "${what}"${nth !== '0' ? ` @${nth}` : ''}: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`
          );
          console.log(
            `  the outline in the failed-tap .txt lists what the page shows; a text tap matches it exactly, case and all`
          );
          failed = true;
          break;
        }
        await page.waitForTimeout(800);
        await shot(`tap-${what}`);
      } else if ('wait' in a) {
        const css = /^[.#[]|^[a-z][\w-]*[.#[:]/.test(a.wait);
        const target = css
          ? page.locator(a.wait).first()
          : page.getByText(a.wait, { exact: true }).first();
        const begun = at();
        try {
          await target.waitFor({
            state: 'visible',
            timeout: num('patience', 120000),
          });
        } catch (e) {
          await shot(`failed-wait-${a.wait}`);
          console.log(
            `WAIT FAILED: "${a.wait}": ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`
          );
          failed = true;
          break;
        }
        console.log(`waited ${at() - begun} ms for ${a.wait}`);
        await shot(`wait-${a.wait}`);
      } else if ('hold' in a) {
        await page.waitForTimeout(a.hold);
        await shot(`hold-${a.hold}`);
      } else {
        const [dx, dy] = a.drag;
        const box = a.from
          ? await (
              /^[.#[]|^[a-z][\w-]*[.#[:]/.test(a.from)
                ? page.locator(a.from)
                : page.getByText(a.from, { exact: true })
            )
              .first()
              .boundingBox()
          : null;
        const x = box ? box.x + box.width / 2 : VIEW.width / 2,
          y = box ? box.y + box.height / 2 : VIEW.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        if (a.from) {
          await page.waitForTimeout(600);
          await shot(`held-${a.from}`);
        }
        await page.mouse.move(x + dx, y + dy, { steps: 24 });
        if (a.from) {
          await page.waitForTimeout(300);
          await shot(`dragged-${dx},${dy}`);
        }
        await page.mouse.up();
        await page.waitForTimeout(1500);
        await shot(`drag-${dx},${dy}`);
      }
    }
    for (let k = 0; k < shots; k++) {
      if (k > 0) await page.waitForTimeout(every);
      await shot(shots > 1 ? `shot-${k + 1}` : 'shot');
    }
    await stop();
    await page.close();
    log.close();
    meter.close();
    const counts = { console: log.count(), meter: meter.count() };
    if (errors.length) {
      failed = true;
      console.log(
        `PAGE ERRORS (${errors.length}): ${errors.slice(0, 3).join(' | ')}`
      );
    }
    console.log(
      `→ ${dir}  (NN-*.png and NN-*.txt each shot; console.jsonl ${counts.console} lines; meter.jsonl ${counts.meter} seconds)`
    );
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);

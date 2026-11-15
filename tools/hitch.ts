// The frames dropped as she goes to sea: the lobby, her tap on PLAY, and the first seconds of the match (the eye coming
// down from space onto her berth, then her hands on her ship), timed in headless Chromium with the CPU slowed to stand
// in for the device's (the iPad's page, launch.ts DEVICE). Prints the frames over 33 ms and over 50 ms in each window, the worst frames, and what ran in
// each of the worst on the page's main thread (Chrome's trace: its sampled JS by function, garbage collection, style
// and layout) and on the GPU process's. Fails (exit 1) if the window from PLAY drops more frames than LIMIT allows.
//   node tools/hitch.ts [--slow=1] [--seconds=15] [--worst=8] [--trace=file.json]      (npm run hitch)
// --slow is Chrome's CPU throttling (1: none); --seconds the window after PLAY (over 15, neither the JS nor the GPU
// process is traced: the trace would outgrow what node can read); --trace keeps Chrome's trace for its Performance panel.
//
// What it can and cannot say: the frame rate is uncapped, so a frame's time is its own cost (the main thread's work,
// then the GPU's); throttling slows the page's JS, layout and style, not the GPU process (its shader and pipeline
// compiles run at the desktop's speed, under Metal as on the phone but not WKWebView's) and not the GPU itself. A hitch
// here is a hitch on the phone; a smooth run here bounds only the main thread's share. LIMIT holds at --slow=1: the
// phone's cores are about as quick as this desktop's, and at 2x and over the sim's steady cost (80 ships riding the
// swell, world/swell.ts) fills the frame by itself, so every frame is over and the start's own hitches are lost in it.

import { writeFileSync } from 'node:fs';
import { DEVICE, launch } from './launch.ts';

/** The most frames over 50 ms and over 33 ms the window from PLAY may hold (at --slow=1; some 2 over 33 ms, none over
 *  50, the worst some 45 ms, when it was set). */
export const LIMIT = { over50: 1, over33: 4 };

const flag = (name: string, fallback: number) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const slow = flag('slow', 1), seconds = flag('seconds', 15), worst = flag('worst', 8), lobbyFor = 3;
const traceTo = process.argv.find((a) => a.startsWith('--trace='))?.slice(8);

interface CallFrame { functionName: string; url: string }
interface ProfileNode { id: number; callFrame: CallFrame; parent?: number }
interface TraceEvent {
  name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; id?: string;
  args?: { name?: string; data?: { startTime?: number; cpuProfile?: { nodes?: ProfileNode[]; samples?: number[] }; timeDeltas?: number[] } };
}

/** The trace's events, each read from the buffer by itself: the whole trace, as frames come quicker, outgrows the
 *  longest string node can make. */
function traceEvents(trace: Buffer): TraceEvent[] {
  const events: TraceEvent[] = [];
  const QUOTE = 0x22, SLASH = 0x5c, OPEN = 0x7b, CLOSE = 0x7d, END = 0x5d;
  let i = trace.indexOf('"traceEvents"');
  if (i < 0) throw new Error('the trace has no traceEvents');
  i = trace.indexOf('[', i) + 1;
  // each event an object at the list's top: from its opening brace to the brace that closes it, strings skipped
  let depth = 0, start = 0, quoted = false;
  for (; i < trace.length; i++) {
    const b = trace[i];
    if (quoted) {
      if (b === SLASH) i++;
      else if (b === QUOTE) quoted = false;
    } else if (b === QUOTE) quoted = true;
    else if (b === OPEN && depth++ === 0) start = i;
    else if (b === CLOSE && --depth === 0) events.push(JSON.parse(trace.toString('utf8', start, i + 1)));
    else if (b === END && depth === 0) break;
  }
  return events;
}

declare global {
  /** What ?screen=rookery-3d puts on the page (debug.ts). */
  interface Window { rookery: { shown: boolean; select(b: string | null): void }; crew(changes: object): void }
}

const { browser, url, close } = await launch();
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: DEVICE.width, height: DEVICE.height }, deviceScaleFactor: DEVICE.dpr, hasTouch: true });
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  await page.goto(`${url}?screen=lobby`);
  await page.waitForFunction(() => document.getElementById('meter')?.textContent, null, { timeout: 120000 });
  // the lobby's own first frames (its shaders compiled) are not in either window
  await page.waitForTimeout(2000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'blink.user_timing', ...(seconds > 15 ? [] : ['disabled-by-default-v8.cpu_profiler', 'gpu'])],
  });
  // every frame's moment, by the page's own clock; PLAY tapped after the lobby's window
  await page.evaluate(() => {
    performance.mark('hitch:begin');
    const tick = (t: number) => {
      performance.mark('hitch:frame', { startTime: t });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.waitForTimeout(lobbyFor * 1000 * Math.max(1, slow / 2));
  const tapped = await page.evaluate(() => performance.now());
  await page.locator('#play').tap();
  await page.waitForTimeout(seconds * 1000);
  const { times, begin } = await page.evaluate(() => ({
    times: performance.getEntriesByName('hitch:frame').map((e) => e.startTime),
    begin: performance.getEntriesByName('hitch:begin')[0].startTime,
  }));
  const trace = await browser.stopTracing();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
  if (traceTo) writeFileSync(traceTo, trace);

  const events = traceEvents(trace);
  const mark = events.find((e) => e.name === 'hitch:begin');
  if (!mark) throw new Error('the trace has no hitch:begin mark');
  /** Trace time (µs) of a moment by the page's clock (ms). */
  const offset = mark.ts - begin * 1000, toTrace = (ms: number) => ms * 1000 + offset;
  const threads = new Map<string, string>();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, String(e.args?.name));
  const main = { pid: mark.pid, tid: mark.tid };
  const gpu = [...threads].find(([, n]) => n === 'CrGpuMain')?.[0];

  // the main thread's sampled JS: each sample's moment and its stack (leaf first)
  const nodes = new Map<number, ProfileNode>(), samples: { ts: number; node: number }[] = [];
  const profiles = new Map<string, number>();
  for (const e of events) {
    if (e.pid !== main.pid || e.tid !== main.tid) continue;
    if (e.name === 'Profile') profiles.set(String(e.id), e.args?.data?.startTime ?? 0);
  }
  const clocks = new Map(profiles);
  for (const e of events) {
    if (e.name !== 'ProfileChunk' || !clocks.has(String(e.id))) continue;
    const c = e.args?.data ?? {};
    for (const n of c.cpuProfile?.nodes ?? []) nodes.set(n.id, n);
    let t = clocks.get(String(e.id))!;
    (c.cpuProfile?.samples ?? []).forEach((s, i) => {
      t += c.timeDeltas?.[i] ?? 0;
      samples.push({ ts: t, node: s });
    });
    clocks.set(String(e.id), t);
  }
  samples.sort((a, b) => a.ts - b.ts);
  // (by name and file: the lines are the served code's, not the source's)
  const where = (f: CallFrame) => `${f.functionName || '(anonymous)'} ${(f.url ?? '').replace(/^.*?\/(src|node_modules\/\.vite\/deps|node_modules)\//, '$1/').replace(/\?.*$/, '')}`;
  const idle = new Set(['(idle)', '(program)', '(garbage collector)', '(root)']);

  /** What ran on the main thread from a to b (trace µs): JS by function (self, and the game's own by whole call),
   *  garbage collection, style and layout; and the GPU process's busy time. */
  const within = (a: number, b: number) => {
    const self = new Map<string, number>(), whole = new Map<string, number>();
    let gc = 0, js = 0;
    for (let i = samples.findIndex((s) => s.ts >= a); i >= 0 && i < samples.length && samples[i].ts < b; i++) {
      const dt = (Math.min(samples[i + 1]?.ts ?? b, b) - samples[i].ts) / 1000;
      const leaf = nodes.get(samples[i].node);
      if (!leaf) continue;
      if (leaf.callFrame.functionName === '(garbage collector)') gc += dt;
      if (idle.has(leaf.callFrame.functionName)) continue;
      js += dt;
      self.set(where(leaf.callFrame), (self.get(where(leaf.callFrame)) ?? 0) + dt);
      const seen = new Set<string>();
      for (let n: ProfileNode | undefined = leaf; n; n = n.parent ? nodes.get(n.parent) : undefined) {
        if (!/\/src\//.test(n.callFrame.url ?? '')) continue;
        const k = where(n.callFrame);
        if (!seen.has(k)) whole.set(k, (whole.get(k) ?? 0) + dt);
        seen.add(k);
      }
    }
    const busy = (name: RegExp, pid: number, tid?: number) => events
      .filter((e) => e.ph === 'X' && e.pid === pid && (tid === undefined || e.tid === tid) && name.test(e.name) && e.ts < b && e.ts + (e.dur ?? 0) > a)
      .reduce((s, e) => s + (Math.min(b, e.ts + (e.dur ?? 0)) - Math.max(a, e.ts)) / 1000, 0);
    const [gp, gt] = gpu ? gpu.split(':').map(Number) : [-1, -1];
    return {
      js, gc: Math.max(gc, busy(/^(MinorGC|MajorGC|V8\.GC_SCAVENGER$|V8\.GC_MARK_COMPACTOR$)/, main.pid, main.tid)),
      style: busy(/^(UpdateLayoutTree|Layout|PrePaint|Paint|Layerize|Commit)$/, main.pid, main.tid),
      gpu: busy(/^(GpuChannel::ExecuteDeferredRequest|CommandBufferStub::OnAsyncFlush|GPUTask|DawnSharedImage|.*Pipeline.*)$/, gp, gt),
      top: [...self].sort((x, y) => y[1] - x[1]).slice(0, 4),
      game: [...whole].sort((x, y) => y[1] - x[1]).slice(0, 7),
    };
  };

  const frames = times.slice(1).map((t, i) => ({ at: t, ms: t - times[i], from: times[i] }));
  const report = (label: string, list: typeof frames, from: number) => {
    const over33 = list.filter((f) => f.ms > 33.4).length, over50 = list.filter((f) => f.ms > 50).length;
    const sorted = list.map((f) => f.ms).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    console.log(`\n${label}: ${list.length} frames, median ${median.toFixed(1)} ms, over 33 ms: ${over33}, over 50 ms: ${over50}, worst ${(sorted.at(-1) ?? 0).toFixed(0)} ms`);
    return { over33, over50, from };
  };
  const ms = (x: number) => `${x.toFixed(0).padStart(4)} ms`;

  console.log(`hitch: CPU ${slow}x slowed, lobby ${lobbyFor} s then ${seconds} s from PLAY`);
  report('lobby', frames.filter((f) => f.at < tapped), begin);
  const played = frames.filter((f) => f.at >= tapped);
  const after = report('from PLAY', played, tapped);
  for (const f of [...played].sort((x, y) => y.ms - x.ms).slice(0, worst).sort((x, y) => x.at - y.at)) {
    const w = within(toTrace(f.from), toTrace(f.at));
    console.log(`\n  ${ms(f.ms)} at +${((f.at - tapped) / 1000).toFixed(2)} s   JS ${w.js.toFixed(0)}  GC ${w.gc.toFixed(0)}  style/layout/paint ${w.style.toFixed(0)}  GPU process ${w.gpu.toFixed(0)} (ms)`);
    for (const [k, v] of w.game) console.log(`      ${ms(v)}  ${k}`);
    if (w.top.length) console.log(`      self: ${w.top.map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' | ')}`);
  }
  // the window's frames by second, as a strip
  const strip: string[] = [];
  for (let s = 0; s < seconds; s++) {
    const inS = played.filter((f) => f.at - tapped >= s * 1000 && f.at - tapped < (s + 1) * 1000);
    strip.push(`${s}s ${inS.length}f max ${Math.max(0, ...inS.map((f) => f.ms)).toFixed(0)}`);
  }
  console.log(`\n  ${strip.join(' · ')}`);
  failed = after.over50 > LIMIT.over50 || after.over33 > LIMIT.over33;
  console.log(`\n${failed ? 'OVER' : 'ok'}: from PLAY at most ${LIMIT.over50} frames over 50 ms and ${LIMIT.over33} over 33 ms (at --slow=1)`);

  // The rookery's own view (debug.ts ?screen=rookery-3d), once it is drawn: the view eased from building to building,
  // a building's level changed and work begun on another (its forms laid anew), the view turned; held to the same LIMIT
  const rook = await browser.newPage({ viewport: { width: DEVICE.width, height: DEVICE.height }, deviceScaleFactor: DEVICE.dpr });
  rook.on('pageerror', (e) => console.error(`[rookery] ${e.message}`));
  await rook.goto(`${url}?screen=rookery-3d`);
  await rook.waitForFunction(() => window.rookery?.shown, null, { timeout: 120000 });
  await rook.waitForTimeout(2000);
  const rcdp = await rook.context().newCDPSession(rook);
  await rcdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
  await rook.evaluate(() => {
    const tick = (t: number) => {
      performance.mark('hitch:rookery', { startTime: t });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (const [k, b] of ['factory', 'flightLoft', 'fishMarket', 'crowsNest', null].entries()) {
    await rook.evaluate((b) => window.rookery.select(b), b);
    if (k === 2) await rook.evaluate(() => window.crew({ levels: { factory: 1, drawingLoft: 2, testTank: 3, foundry: 2, sailingSchool: 1, flightLoft: 2, crowsNest: 2, fishMarket: 2, landingPad: 1 }, under: { landingPad: { share: 0.5, days: 6 } } }));
    await rook.waitForTimeout(1600);
  }
  const rtimes = await rook.evaluate(() => performance.getEntriesByName('hitch:rookery').map((e) => e.startTime));
  await rook.close();
  const rframes = rtimes.slice(1).map((t, i) => ({ at: t, ms: t - rtimes[i], from: rtimes[i] }));
  const viewed = report('the rookery', rframes, rtimes[0] ?? 0);
  const rfailed = viewed.over50 > LIMIT.over50 || viewed.over33 > LIMIT.over33;
  console.log(`${rfailed ? 'OVER' : 'ok'}: the rookery at most ${LIMIT.over50} frames over 50 ms and ${LIMIT.over33} over 33 ms`);
  failed ||= rfailed;
} finally {
  await close();
}
process.exit(failed ? 1 : 0);

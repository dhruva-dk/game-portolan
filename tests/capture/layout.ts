// The interface's layout rules, measured on every screen at the smallest and largest iPad and iPhone, each with its
// safe areas. Each screen gets a frame and a list of its touch targets; any rule broken is listed in layout.json and
// fails the run:
//   - every touch target is at least 44 points each way, and no two overlap;
//   - nothing you can touch sits under a safe area;
//   - no text is cut off by its box;
//   - in a match, the controls used in a fight (fire, gust, ability, reload and the sails) have their centres in the
//     bottom 60% of the screen and within 40% of its width from the left or the right edge. The hotbar, the gull and
//     the drop sit along the bottom middle, where a thumb moves to tap them between fights.
import { log, openApp, Shots, type Rig } from './common.ts';
import { DEVICES, type DeviceName, type Game } from '../harness.ts';

interface Screen {
  name: string;
  /** Hook calls, in the page, that bring the screen up. */
  setup: string;
  /** A match screen: the fight controls must sit under the thumbs. */
  thumbs?: boolean;
}

export const SCREENS: readonly Screen[] = [
  { name: 'title', setup: 'h.go("title")' },
  { name: 'lobby', setup: 'h.go("lobby")' },
  ...['abilities', 'locker', 'rivals', 'career', 'rank', 'settings'].map((s) => ({ name: s, setup: `h.go("${s}")` })),
  { name: 'gale', setup: 'h.play({ seed: 11 })' },
  { name: 'hud', setup: 'h.play({ seed: 11, skipGale: true }); h.step(90)', thumbs: true },
  // a region's event warned in the player's own region: the banner under the Storm's clock, the circle on the map
  { name: 'hud-event', setup: 'h.moment("event-fireArchipelago", 11); h.step(60)' },
  { name: 'death', setup: 'h.play({ seed: 11, skipGale: true }); h.step(90); h.sinkPlayer(3, "cannon"); h.step(60)' },
  { name: 'spectate', setup: 'h.play({ seed: 11, skipGale: true }); h.step(90); h.sinkPlayer(3, "cannon"); h.step(60); h.go("spectate")' },
  { name: 'results', setup: 'h.play({ seed: 11, skipGale: true }); h.step(90); h.winPlayer(); h.step(60); h.finish()' },
];

interface Target { what: string; x: number; y: number; w: number; h: number; fight: boolean }
interface Measured { targets: Target[]; clipped: string[]; safe: { top: number; right: number; bottom: number; left: number }; vw: number; vh: number }

const MIN = 44;

async function measure(game: Game): Promise<Measured> {
  return game.page.evaluate(() => {
    const ui = document.querySelector('.pui') ?? document.body;
    const px = (v: string) => parseFloat(v) || 0;
    // the safe-area insets as the page resolved them
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;inset:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const ps = getComputedStyle(probe);
    const safe = { top: px(ps.paddingTop), right: px(ps.paddingRight), bottom: px(ps.paddingBottom), left: px(ps.paddingLeft) };
    probe.remove();
    const shown = (e: Element) => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (let n: Element | null = e; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
      }
      return true;
    };
    const SEL = 'button, [role="button"], .p-tile, .p-row[data-part], .s-mx__hold, .s-hud__slot, .s-hud__sail, .s-globe, [data-what]';
    const seen = new Set<Element>();
    const targets = [...ui.querySelectorAll(SEL)].filter((e) => {
      // the innermost target counts once: a button's own face or label is not another target
      if ([...seen].some((s) => s.contains(e))) return false;
      if (!shown(e) || getComputedStyle(e).pointerEvents === 'none') return false;
      seen.add(e);
      return true;
    }).map((e) => {
      const r = e.getBoundingClientRect(), h = e as HTMLElement;
      return {
        what: h.dataset.what ?? h.dataset.part ?? h.dataset.slot ?? (h.getAttribute('aria-label') || h.className.toString().split(' ')[0]),
        x: r.left, y: r.top, w: r.width, h: r.height,
        fight: h.classList.contains('s-mx__hold') || h.classList.contains('s-hud__sail'),
      };
    });
    // text cut off: a box whose text runs past it while it hides the overflow
    const clipped: string[] = [];
    for (const e of ui.querySelectorAll<HTMLElement>('*')) {
      if (!shown(e) || !e.childNodes.length) continue;
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own) continue;
      const s = getComputedStyle(e);
      const hides = s.overflow !== 'visible' || s.overflowX !== 'visible' || s.textOverflow === 'ellipsis';
      if (hides && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2)) clipped.push(`${e.className || e.tagName}: "${e.textContent!.trim().slice(0, 40)}"`);
    }
    return { targets, clipped, safe, vw: innerWidth, vh: innerHeight };
  });
}

function judge(m: Measured, thumbs: boolean): string[] {
  const bad: string[] = [];
  for (const t of m.targets) {
    const name = `${t.what} (${t.w.toFixed(0)}×${t.h.toFixed(0)} at ${t.x.toFixed(0)},${t.y.toFixed(0)})`;
    if (t.w < MIN - 0.5 || t.h < MIN - 0.5) bad.push(`under 44 points: ${name}`);
    const s = m.safe;
    if (t.x < s.left - 0.5 || t.y < s.top - 0.5 || t.x + t.w > m.vw - s.right + 0.5 || t.y + t.h > m.vh - s.bottom + 0.5) bad.push(`under a safe area: ${name}`);
    if (thumbs && t.fight) {
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      if (cy < m.vh * 0.4) bad.push(`above the bottom 60%: ${name}`);
      if (cx > m.vw * 0.4 && cx < m.vw * 0.6) bad.push(`out of thumb reach, mid-screen: ${name}`);
    }
  }
  // no two targets overlap, or a thumb meant for one presses the other
  m.targets.forEach((a, i) => m.targets.slice(i + 1).forEach((b) => {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 1 && oy > 1) bad.push(`overlapping: ${a.what} and ${b.what}`);
  }));
  for (const c of m.clipped) bad.push(`text cut off: ${c}`);
  return bad;
}

async function run(game: Game, code: string): Promise<void> {
  await game.page.evaluate(async (src) => {
    const h = (window as unknown as { __portolan: unknown }).__portolan;
    await (0, eval)(`(async (h) => { ${src}; })`)(h);
  }, code);
}

export async function layout(r: Rig, o: { dpr: number; device?: string; only?: string }): Promise<void> {
  const devices = (o.device?.split(',') ?? ['iphoneSmall', 'iphone', 'ipadSmall', 'ipad']) as DeviceName[];
  const only = o.only?.split(',');
  const screens = only ? SCREENS.filter((s) => only.includes(s.name)) : SCREENS;
  const report: Record<string, Record<string, { targets: number; broken: string[] }>> = {};
  let broken = 0;
  const shots = await Shots.create('layout');
  for (const device of devices) {
    if (!(device in DEVICES)) throw new Error(`--device must be among ${Object.keys(DEVICES).join(', ')}`);
    report[device] = {};
    for (const sc of screens) {
      // a fresh page per screen, so no screen inherits another's state
      const game = await openApp(r, { device, dpr: o.dpr });
      await run(game, sc.setup);
      await game.hook((h) => h.settle(3));
      await game.page.waitForTimeout(900);
      await game.hook((h) => h.run(2));
      const m = await measure(game);
      const bad = judge(m, !!sc.thumbs);
      broken += bad.length;
      report[device][sc.name] = { targets: m.targets.length, broken: bad };
      await shots.shot(game, `${device} ${sc.name}${bad.length ? ` (${bad.length} broken)` : ''}`);
      log(`layout ${device} ${sc.name}: ${m.targets.length} targets, ${bad.length ? `${bad.length} broken` : 'ok'}`);
      for (const b of bad) log(`  ${b}`);
      game.assertClean();
      await game.close();
    }
  }
  await shots.json('layout.json', report);
  await shots.sheet(r.browser, 4);
  if (broken) throw new Error(`layout: ${broken} rule(s) broken (captures/layout/layout.json)`);
}

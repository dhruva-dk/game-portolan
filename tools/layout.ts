// The office's screens checked for their layout in headless Chromium, each from
// its fixture (src/office/fixtures/), at the iPad Air's landscape screen:
//   frame   the top bar's edges on the page's columns' (one frame for all)
//   pixel   each column's edges on whole CSS px (the snapped tokens', layout.ts)
//   centre  the bar's things on one centre line; a chip in a ruled row (a
//           verdict, a stamp: anything with a ground of its own) centred in it
//   inside  nothing past its paper's edges that its paper does not clip, and no
//           paper past the page's; no scroller squashed under a row
//   clipped a figure in a table cut short
//   under   a table's scrolled rows over its heads
//   squeezed a name in a table cut to a stub (under SLACK.stub px)
//   dead    a name drawn as a link that opens nothing
//   unmarked a row that opens a page with no name drawn as a link
//   inset   a sheet's first words (its head, or its body's first thing) no
//           nearer its top edge than a sheet with a head has them
//   node tools/layout.ts [screen ...]
// Prints each fault; fails (exit 1) on any.

import { VIEW, launch } from './launch.ts';

/** The screens built on the chartroom kit that have a fixture. */
const SCREENS = [
  'menu',
  'found',
  'home',
  'profile',
  'team',
  'drivers',
  'staff',
  'scouting',
  'offer',
  'finances',
  'result',
  'standings',
];

/** How far apart two edges or centres may be, CSS px. */
const SLACK = {
  edge: 0.5,
  centre: 0.75,
  inside: 1,
  pixel: 0.02,
  row: 40,
  inset: 8,
  stub: 96,
};

const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const { browser, url, close } = await launch();
let faults = 0;
try {
  for (const screen of asked.length ? asked : SCREENS) {
    const page = await browser.newPage({ viewport: VIEW });
    page.on('pageerror', (e) => console.error(`[${screen}] ${e.message}`));
    await page.goto(`${url}?screen=${screen}`);
    await page.waitForFunction(
      () => document.getElementById('meter')?.dataset.line,
      null,
      { timeout: 60000 }
    );
    await page.waitForTimeout(600);
    const found = await page.evaluate((slack) => {
      const out: string[] = [];
      const shown = (e: Element) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const n = (v: number) => Math.round(v * 10) / 10;
      const all = (root: ParentNode, sel: string) =>
        Array.from(root.querySelectorAll(sel));
      const name = (e: Element) => {
        const text = (e.textContent ?? '').trim().replace(/\s+/g, ' ');
        return `${e.tagName.toLowerCase()}.${Array.from(e.classList).join('.')}${text ? ` "${text.slice(0, 24)}"` : ''}`;
      };
      const body = document.querySelector('.o-body > :not([hidden])');
      if (!body) return ['no screen shown'];
      const sheet = body.getBoundingClientRect();
      const cs = getComputedStyle(body);
      const left = sheet.left + parseFloat(cs.paddingLeft),
        right = sheet.right - parseFloat(cs.paddingRight);

      // frame: the bar on the page's margins
      const bar = document.querySelector('.sh-bar > .cr-paper');
      if (bar && shown(bar) && body.classList.contains('cr-page')) {
        const b = bar.getBoundingClientRect();
        if (
          Math.abs(b.left - left) > slack.edge ||
          Math.abs(b.right - right) > slack.edge
        )
          out.push(
            `frame: the bar ${n(b.left)}–${n(b.right)}, the columns ${n(left)}–${n(right)}`
          );
      }

      // pixel: the columns' edges whole (not an even grid's, whose fractions are its own)
      if (
        body.classList.contains('cr-page') &&
        !body.classList.contains('cards')
      )
        for (const c of Array.from(body.children)) {
          const r = c.getBoundingClientRect();
          for (const x of [r.left, r.right])
            if (Math.abs(x - Math.round(x)) > slack.pixel)
              out.push(`pixel: ${name(c)} has an edge at ${x.toFixed(2)}`);
        }

      // centre: the bar's things, and a chip in a ruled row
      const tops = all(document, '.sh-top > *').filter(
        (e) => shown(e) && !e.classList.contains('sh-grow')
      );
      const mid = (e: Element) => {
        const r = e.getBoundingClientRect();
        return (r.top + r.bottom) / 2;
      };
      if (tops.length) {
        const line = mid(tops[0]);
        for (const e of tops)
          if (Math.abs(mid(e) - line) > slack.centre)
            out.push(
              `centre: ${name(e)} at ${n(mid(e))}, the bar's line ${n(line)}`
            );
      }
      for (const row of all(body, '.cr-terms > div')) {
        const rs = getComputedStyle(row),
          r = row.getBoundingClientRect();
        const line =
          (r.top +
            parseFloat(rs.paddingTop) +
            r.bottom -
            parseFloat(rs.paddingBottom)) /
          2;
        for (const e of all(row, ':scope > *, :scope > * > *')) {
          const es = getComputedStyle(e);
          const grounded =
            es.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
            es.backgroundImage !== 'none' ||
            es.boxShadow !== 'none';
          if (grounded && shown(e) && Math.abs(mid(e) - line) > slack.centre)
            out.push(
              `centre: ${name(e)} at ${n(mid(e))} in a row centred at ${n(line)}`
            );
        }
      }

      // inside: within its paper unless clipped short of it; each paper within the page
      const clips = (e: Element) => {
        const s = getComputedStyle(e);
        return s.overflowX !== 'visible' || s.overflowY !== 'visible';
      };
      const scrolls = (e: Element) =>
        /auto|scroll/.test(getComputedStyle(e).overflowY);
      const papers = [
        ...all(body, '.cr-paper'),
        ...(body.classList.contains('cr-paper') ? [body] : []),
        ...all(document, '.sh-bar .cr-paper'),
      ].filter(shown);
      const screenBox = (body.parentElement ?? body).getBoundingClientRect();
      /** `e` is clipped short of `top` (a scroller, or a box that hides its overflow, between them). */
      const clippedBelow = (e: Element, top: Element) => {
        for (let a = e.parentElement; a && a !== top; a = a.parentElement)
          if (clips(a)) return true;
        return false;
      };
      for (const p of papers) {
        const pr = p.getBoundingClientRect();
        if (
          p.closest('.o-body') &&
          !clippedBelow(p, body) &&
          (pr.top < screenBox.top - slack.inside ||
            pr.bottom > screenBox.bottom + slack.inside)
        )
          out.push(
            `inside: ${name(p)} runs ${n(pr.top)}–${n(pr.bottom)}, past the page ${n(screenBox.top)}–${n(screenBox.bottom)}`
          );
        for (const e of all(p, '*')) {
          if (e.closest('svg') !== null && e.tagName !== 'svg') continue;
          if (!shown(e)) continue;
          // the nearest paper is its own (a paper within a paper is checked as itself)
          if (e.parentElement?.closest('.cr-paper') !== p) continue;
          const s = getComputedStyle(e);
          if (s.position === 'absolute' || s.position === 'fixed') continue;
          if (clippedBelow(e, p)) continue;
          const r = e.getBoundingClientRect();
          if (
            r.left < pr.left - slack.inside ||
            r.right > pr.right + slack.inside ||
            r.top < pr.top - slack.inside ||
            r.bottom > pr.bottom + slack.inside
          )
            out.push(
              `inside: ${name(e)} ${n(r.left)},${n(r.top)}–${n(r.right)},${n(r.bottom)} past ${name(p).split(' ')[0]} ${n(pr.left)},${n(pr.top)}–${n(pr.right)},${n(pr.bottom)}`
            );
          if (
            scrolls(e) &&
            e.scrollHeight > e.clientHeight + 1 &&
            e.clientHeight < slack.row
          )
            out.push(
              `inside: ${name(e)} scrolls in ${e.clientHeight}px, under a row`
            );
        }
      }

      // clipped: a figure in a table shown whole (a name may run to an ellipsis; a number never)
      for (const c of all(body, '.cr-tr > .num').filter(shown))
        if (c.scrollWidth > c.clientWidth + 0.5)
          out.push(
            `clipped: ${name(c)} needs ${c.scrollWidth}px of ${c.clientWidth}px`
          );

      // under: a table's scrolled rows never shown over its heads
      for (const t of all(body, '.cr-table.scrolls').filter(shown)) {
        const head = t.querySelector(':scope > .cr-tr.head'),
          rows = t.querySelector(':scope > .cr-rows');
        if (!head || !rows) continue;
        const over =
          head.getBoundingClientRect().bottom -
          rows.getBoundingClientRect().top;
        if (over > slack.edge)
          out.push(`under: ${name(rows)} runs ${n(over)}px up over its heads`);
      }

      // dead: a name drawn as a link opens something (itself, or the row or card it names)
      for (const a of all(body, '.cr-link').filter(shown))
        if (!a.closest('.press'))
          out.push(`dead: ${name(a)} looks a link and opens nothing`);
      // unmarked: a row that opens a page says so, its name drawn as a link
      for (const r of all(body, '.cr-tr.press').filter(shown))
        if (!r.querySelector('.cr-link'))
          out.push(`unmarked: ${name(r)} opens a page, no name a link`);

      // squeezed: a name cut to an ellipsis, but never to a stub of itself
      const cell = '.cr-tr:not(.head) > div:not(.num)';
      for (const c of all(body, `${cell}, ${cell} *`).filter(shown))
        if (c.scrollWidth > c.clientWidth + 0.5 && c.clientWidth < slack.stub)
          out.push(`squeezed: ${name(c)} cut to ${c.clientWidth}px`);

      // inset: a sheet's first words off its top edge, head or none
      for (const s of all(body, '.cr-sheet').filter(shown)) {
        const first = s.querySelector(
          ':scope > .cr-head > span, :scope > .cr-body > *'
        );
        if (!first || !shown(first)) continue;
        const gap =
          first.getBoundingClientRect().top - s.getBoundingClientRect().top;
        if (gap < slack.inset)
          out.push(
            `inset: ${name(first)} ${n(gap)}px under the top of its sheet`
          );
      }
      return [...new Set(out)];
    }, SLACK);
    for (const f of found) console.log(`${screen}: ${f}`);
    if (!found.length) console.log(`${screen}: ok`);
    faults += found.length;
    await page.close();
  }
} finally {
  await close();
}
if (faults) {
  console.error(`${faults} faults`);
  process.exitCode = 1;
}

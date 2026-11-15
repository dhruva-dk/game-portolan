// The office's checks (Phase C section 7), run by tools/capture.ts on every shot showing the office's page (`.office`),
// each failure a line naming what fails and where:
//   scroll    the document scrolls, or the page's content runs past it, or a box that does not scroll clips its content
//   target    a tap target under 44 × 44 px, or nearer than 8 px to another (one inside the other is one target; cells
//             of one control, siblings abutting with a rule between, are one control's: a table's rows, tabs)
//   text      text set under 13 px
//   contrast  text under 7 : 1 against what it is set on (a disabled control's is exempt: it is greyed to say so)
// and, of the source, `literals()`: a colour named in a screen's file (src/ui/office/) instead of taken from ink.ts.
// Sizes are the page's own px (the page is drawn at its own size on the iPad's screen: launch.ts DEVICE).

import { readdirSync, readFileSync } from 'node:fs';
import type { Page } from 'playwright';

const MIN = { target: 44, gap: 8, text: 13, contrast: 7 } as const;

/** The checks' failures on the page as shown now (none if it shows no office page). */
export function officeChecks(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const sheet = Array.from(document.querySelectorAll<HTMLElement>('.office')).find((p) => p.getBoundingClientRect().width > 0);
    if (!sheet) return [];
    const fails: string[] = [];
    const scale = sheet.getBoundingClientRect().width / 1180;
    const name = (el: Element) => {
      const cls = el.getAttribute('class')?.trim().replace(/\s+/g, '.');
      const text = (el.textContent ?? '').trim().slice(0, 24) || el.getAttribute('aria-label') || '';
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${text ? ` "${text}"` : ''}`;
    };
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
      }
      return true;
    };
    /** Whether `el` is the topmost thing at its own centre (not under a dialog's veil). */
    const top = (el: Element) => {
      const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    };
    const all = Array.from(sheet.querySelectorAll<HTMLElement>('*')).filter((el) => !(el instanceof SVGElement) && shown(el));

    // scroll
    const doc = document.scrollingElement!;
    if (doc.scrollHeight > doc.clientHeight + 1 || doc.scrollWidth > doc.clientWidth + 1) fails.push('scroll: the document scrolls');
    for (const el of [sheet, ...all]) {
      const s = getComputedStyle(el);
      const scrolls = /(auto|scroll)/.test(s.overflowY + s.overflowX);
      if (scrolls || el.tagName === 'INPUT' || s.textOverflow === 'ellipsis') continue;
      if (el.scrollHeight > el.clientHeight + 2 && s.overflowY !== 'visible') fails.push(`scroll: ${name(el)} clips its content (${el.scrollHeight} in ${el.clientHeight})`);
    }

    // targets
    const targets = all.filter((el) => (el.classList.contains('press') || el.matches('button, input, select, [role=tab]'))
      && !el.matches('.o-root, .office, .k-veil') && top(el));
    for (const el of targets) {
      const r = el.getBoundingClientRect(), w = r.width / scale, h = r.height / scale;
      if (w < min.target - 0.5 || h < min.target - 0.5) fails.push(`target: ${name(el)} is ${w.toFixed(0)} × ${h.toFixed(0)}`);
    }
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const a = targets[i], b = targets[j];
        if (a.contains(b) || b.contains(a)) continue;
        const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
        const dx = Math.max(0, q.left - p.right, p.left - q.right), dy = Math.max(0, q.top - p.bottom, p.top - q.bottom);
        // (cells of one control abutting, a rule between them: a table's rows, a tab strip's tabs, a segmented's options)
        if (a.parentElement === b.parentElement && Math.max(dx, dy) < 0.5) continue;
        if (Math.max(dx, dy) / scale < min.gap - 0.5) fails.push(`target: ${name(a)} and ${name(b)} are ${(Math.max(dx, dy) / scale).toFixed(0)} px apart`);
      }
    }

    // text and contrast
    const rgba = (c: string) => (c.match(/[\d.]+/g) ?? ['0', '0', '0', '0']).map(Number).concat(c.startsWith('rgba') ? [] : [1]).slice(0, 4);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (top: number[], under: number[]) => [0, 1, 2].map((k) => top[k] * top[3] + under[k] * (1 - top[3])).concat(1);
    /** What `el`'s text is set on: its ancestors' backgrounds, laid one over another down to the desk. */
    const ground = (el: Element) => {
      const layers: number[][] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      return layers.reverse().reduce((under, c) => over(c, under), [255, 255, 255, 1]);
    };
    for (const el of all) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own) continue;
      const s = getComputedStyle(el), px = parseFloat(s.fontSize);
      if (px < min.text - 0.05) fails.push(`text: ${name(el)} at ${px} px`);
      if (el.closest('.off, [aria-disabled=true], [disabled]')) continue;
      const bg = ground(el), fg = over(rgba(s.color), bg), [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (l1 + 0.05) / (l2 + 0.05);
      if (ratio < min.contrast) fails.push(`contrast: ${name(el)} at ${ratio.toFixed(2)} : 1`);
    }
    return fails;
  }, MIN);
}

/** A colour named in a screen's file: a hex, rgb(), hsl() or a named CSS colour in a style. */
export function literals(dir = 'src/ui/office'): string[] {
  const fails: string[] = [];
  const colour = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(|\b(white|black|red|green|blue|grey|gray|yellow|orange|purple)\b(?=['";\s])/i;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    readFileSync(`${dir}/${f}`, 'utf8').split('\n').forEach((line, i) => {
      if (!line.trim().startsWith('//') && colour.test(line)) fails.push(`literal: ${dir}/${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  return fails;
}

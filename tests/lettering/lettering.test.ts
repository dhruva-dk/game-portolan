import { cpuNow } from '../cpu.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GLYPHS, METRICS } from '../../src/lettering/glyphs.ts';
import { Raster, flatten, sweep } from '../../src/lettering/nib.ts';
import { MIN_GAP, X_HEIGHT_EM, layoutText, letterGap, rasterizeText, type TextLayout } from '../../src/lettering/text.ts';

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MARKS = ' .,:;!?\'"’‘”“-–—−+×·/()%&';
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

test('every character the game needs is in the hand', () => {
  for (const ch of LETTERS + MARKS) assert.ok(GLYPHS[ch], `missing ${ch}`);
  const spec = readFileSync(new URL('../../PROMPT.md', import.meta.url), 'utf8');
  const strings = [...spec.matchAll(/\*\*([^*]+)\*\*/g), ...spec.matchAll(/\*"([^"]+)"\*/g)].map((m) => m[1]);
  assert.ok(strings.length > 150, 'names found in PROMPT.md');
  for (const s of strings) {
    for (const ch of s) assert.ok(GLYPHS[ch], `missing ${JSON.stringify(ch)} in ${s}`);
    assert.ok(layoutText(s, { size: 14 }).strokes.length > 0);
  }
});

test('the writing is deterministic', () => {
  const text = 'Saetta 1,250 — Portolan', o = { size: 17, align: 'center' as const, swash: true };
  const first = rasterizeText(layoutText(text, o), 3);
  rasterizeText(layoutText('Rosa dei Venti', { size: 30 }), 2);
  const again = rasterizeText(layoutText(text, o), 3);
  assert.equal(JSON.stringify(layoutText(text, o)), JSON.stringify(layoutText(text, o)));
  assert.deepEqual([again.width, again.height, again.left, again.top], [first.width, first.height, first.left, first.top]);
  assert.equal(hash(again.data), hash(first.data));
});

test('layout metrics: scale, joins, alignment, wrapping, anchors, writing order', () => {
  const w = (l: TextLayout) => l.box.right - l.box.left;
  assert.ok(Math.abs(w(layoutText('Meridiana', { size: 24 })) - 2 * w(layoutText('Meridiana', { size: 12 }))) < 1e-9);

  const k = (12 * X_HEIGHT_EM) / METRICS.xHeight, nn = layoutText('nn', { size: 12 });
  assert.equal(nn.strokes.length, GLYPHS.n.strokes.length * 2 - 1);
  assert.ok(Math.abs(nn.lines[0].width - 2 * GLYPHS.n.adv * k) < 1e-9);

  const c = layoutText('Lontana', { size: 20, align: 'center' });
  assert.ok(Math.abs(c.box.left + c.box.right) < 1e-9);
  const r = layoutText('Lontana', { size: 20, align: 'right' });
  assert.ok(Math.abs(r.box.right) < 1e-9);

  const para = layoutText('Has learned you break off at the volcano, and presses when you run.', { size: 16, maxWidth: 140, lineHeight: 1.4 });
  assert.ok(para.lines.length >= 3);
  for (const l of para.lines) assert.ok(l.width <= 140 + 1e-9, `${l.text} is ${l.width} wide`);
  for (let i = 1; i < para.lines.length; i++) assert.ok(Math.abs(para.lines[i].baseline - para.lines[i - 1].baseline - 1.4 * 16) < 1e-9);

  const size = 20, u = (size * X_HEIGHT_EM) / METRICS.xHeight;
  assert.ok(Math.abs(layoutText('Ostro', { size, valign: 'top' }).box.top) < 1e-9);
  assert.ok(Math.abs(layoutText('Ostro\nOstro', { size, valign: 'bottom' }).box.bottom) < 1e-9);
  const mid = layoutText('Ostro', { size, valign: 'middle' });
  assert.ok(Math.abs(mid.lines[0].baseline - METRICS.capHeight * u / 2) < 1e-9);

  const it = layoutText('it', { size: 12 });
  assert.ok(it.strokes.at(-2)!.t0 > it.strokes.at(-3)!.t1 && it.strokes.at(-1)!.t1 === it.duration);
  for (let i = 1; i < it.strokes.length; i++) assert.ok(it.strokes[i].t0 >= it.strokes[i - 1].t1);
  assert.throws(() => layoutText('é', { size: 12 }), /no glyph/);
});

test('optical spacing: no two letters collide', () => {
  for (const a of LETTERS) {
    for (const b of LETTERS) {
      const joined = layoutText(a + b, { size: 12 }).strokes.length < GLYPHS[a].strokes.length + GLYPHS[b].strokes.length;
      if (!joined) assert.ok(letterGap(a, b) >= MIN_GAP - 1e-9, `${a}${b}: ${letterGap(a, b)}`);
    }
  }
  const k = (12 * X_HEIGHT_EM) / METRICS.xHeight;
  assert.ok(layoutText('To', { size: 12 }).lines[0].width < (GLYPHS.T.adv + GLYPHS.o.adv) * k - 0.1);
});

test('the nib: exact coverage, union without seams, thick and thin from direction', () => {
  const r = new Raster(32, 32);
  const square = (x: number, y: number, s: number) => [x, y, x, y + s, x + s, y + s, x + s, y];
  r.fill(square(2.3, 3.7, 10));
  r.fill(square(6, 6, 9));
  const cov = r.coverage();
  assert.ok(Math.abs(cov.reduce((a, b) => a + b, 0) - (100 + 81 - 6.3 * 7.7)) < 1e-3);
  assert.ok(Math.max(...cov) <= 1);

  const angle = (METRICS.penAngle * Math.PI) / 180, nib = { width: 12, thickness: 1, angle };
  const line = flatten([{ op: 'M', p: [10, 40] }, { op: 'L', p: [90, 40] }], 0.1, 3), page = new Raster(100, 80);
  sweep(line, nib, () => 1, (poly) => page.fill(poly));
  const col = page.coverage().filter((_, i) => i % 100 === 50).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(col - (12 * Math.sin(angle) + Math.cos(angle))) < 0.02, `${col}`);
});

test('legible at the smallest interface size: no stroke of any glyph fades out', () => {
  for (const ratio of [2, 3]) {
    for (const ch of (LETTERS + MARKS).replace(' ', '')) {
      const layout = layoutText(ch, { size: 11 });
      for (const st of layout.strokes) {
        const { data } = rasterizeText({ ...layout, strokes: [st] }, ratio);
        let peak = 0;
        for (let i = 0; i < data.length; i += 4) peak = Math.max(peak, data[i]);
        assert.ok(peak >= 0.6 * 255, `${ch} at 11 px ×${ratio}: a stroke peaks at ${(peak / 255).toFixed(2)}`);
      }
    }
  }
});

test('interface text is quick to write', () => {
  const label = () => rasterizeText(layoutText('1,250', { size: 13 }), 3);
  for (let i = 0; i < 5; i++) label();
  const t0 = cpuNow();
  for (let i = 0; i < 20; i++) label();
  const ms = (cpuNow() - t0) / 20;
  console.log(`a 13 px label at 3×: ${ms.toFixed(2)} ms`);
  assert.ok(ms < 10);
});

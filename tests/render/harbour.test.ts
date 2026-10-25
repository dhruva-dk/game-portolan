// WP26 part C: the 3D harbour keeps within 150 draws and 420k triangles on the iPhone and the iPad at every graphics
// quality (Swift 0.6, Fine 0.8, Finest 1), pinnace or galleon, pages shut and open; and it is built from the career:
// a new form or new pigments rebuild the ship, new plumage the gull, the same career rebuilds nothing.
//   node --test tests/render/harbour.test.ts
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch, openGame, serve, type DeviceName, type Launched, type Server } from '../harness.ts';

type Built = { calls: number; tris: number; form: string; pigments: string; ship: string; gull: string };
type Hook = { measure(detail: number, open: number): { calls: number; tris: number }; look(form: number, pig: readonly [number, number] | null, marks: string[]): Built };
type Arg = { f: number; p: [number, number] | null; m: string[] };
const CALLS = 150, TRIS = 420_000;
const hook = (w: unknown): Hook => (w as { __harbour: Hook }).__harbour;
let server: Server, launched: Launched;
before(async () => { server = await serve(); launched = await launch(); });
after(async () => { await launched.browser.close(); await server.close(); });

test('the harbour within 150 draws and 420k triangles on both devices, every quality, pages shut and open', async () => {
  const over: string[] = [];
  for (const device of ['iphone', 'ipad'] as DeviceName[]) {
    const game = await openGame(launched.browser, `${server.url}tests/render/harbour.html`, { device, hook: '__harbour' });
    for (const f of [0, 3]) {
      await game.page.evaluate((a: Arg) => (window as unknown as { __harbour: Hook }).__harbour.look(a.f, a.p, a.m), { f, p: null, m: [] });
      for (const detail of [0.6, 0.8, 1]) for (const open of [0, 1]) {
        const r = await game.page.evaluate((a: { d: number; o: number }) => (window as unknown as { __harbour: Hook }).__harbour.measure(a.d, a.o), { d: detail, o: open });
        console.log(`${device} form ${f} detail ${detail} open ${open}: ${r.calls} draws, ${r.tris} tris`);
        assert.ok(r.calls > 15 && r.tris > 40_000, `${device}: the harbour drew (${r.calls} draws, ${r.tris} tris)`);
        if (r.calls > CALLS || r.tris > TRIS) over.push(`${device} form ${f} detail ${detail} open ${open}: ${r.calls} draws, ${r.tris} tris`);
      }
    }
    await game.page.close();
  }
  assert.deepEqual(over, [], `harbour over ${CALLS} draws or ${TRIS / 1000}k triangles`);
});

test("the harbour's ship and gull are the career's: form, pigments and plumage rebuild them", async () => {
  const game = await openGame(launched.browser, `${server.url}tests/render/harbour.html`, { device: 'iphone', hook: '__harbour' });
  const look = (f: number, p: [number, number] | null, m: string[]) => game.page.evaluate((a: Arg) => (window as unknown as { __harbour: Hook }).__harbour.look(a.f, a.p, a.m), { f, p, m });
  void hook;
  const a = await look(0, [0, 1], []);
  const b = await look(3, [0, 1], []);
  assert.equal(a.form, 'pinnace');
  assert.equal(b.form, 'galleon');
  assert.notEqual(b.ship, a.ship, 'a new form builds her anew');
  const c = await look(3, [2, 3], []);
  assert.notEqual(c.pigments, b.pigments);
  assert.notEqual(c.ship, b.ship, 'new pigments repaint her');
  const d = await look(3, [2, 3], ['#2a6f5e', '#3657a8']);
  assert.equal(d.ship, c.ship, 'new plumage leaves the ship be');
  assert.notEqual(d.gull, c.gull, 'new plumage rebuilds the gull');
  const e = await look(3, [2, 3], ['#2a6f5e', '#3657a8']);
  assert.deepEqual([e.ship, e.gull], [d.ship, d.gull], 'the same career rebuilds nothing');
  await game.page.close();
});

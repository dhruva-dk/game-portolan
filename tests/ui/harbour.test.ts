// WP26: the harbour's model in Node — every page reachable from the harbour and back, every touch target inside the
// safe area, at least 44 pt and clear of the others on the iPhone, the iPad and the smallest iPhone, the league and
// the nine captains' cards, the shipwright and the gull acting through the career API only as it allows, and the
// settings kept on the device, read back and applied.
//   node --test tests/ui/harbour.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAITS } from '../../src/career/league.ts';
import { GULL_PRICES, gullPrice } from '../../src/career/progress.ts';
import { LEAGUE, copyCareer, newCareer, unlockedForms } from '../../src/career/state.ts';
import { LINKS, MIN_TARGET, PAGES, PARENT, formChoices, gullRows, harbourAct, harbourLayout, hit, leagueRows, nineCards, type Page } from '../../src/ui/cards.ts';
import { safeRect, type View } from '../../src/ui/safeArea.ts';
import { applySettings, defaults, forgetSettings, loadSettings, sanitize, setSettings, settings, storage } from '../../src/ui/settings.ts';

const VIEWS: Record<string, View> = {
  iphone: { width: 956, height: 440, dpr: 3, safe: { top: 0, right: 62, bottom: 20, left: 62 } },
  ipad: { width: 1376, height: 1032, dpr: 2, safe: { top: 0, right: 0, bottom: 25, left: 0 } },
  mini: { width: 812, height: 375, dpr: 3, safe: { top: 0, right: 50, bottom: 21, left: 50 } },
};

test('every page is reachable from the harbour by its links, and back leads home', () => {
  const seen = new Set<Page>(['home']), queue: Page[] = ['home'];
  while (queue.length) for (const p of LINKS[queue.shift()!]) if (!seen.has(p)) { seen.add(p); queue.push(p); }
  assert.deepEqual([...seen].sort(), [...PAGES].sort());
  for (const p of PAGES) {
    let q: Page | null = p, steps = 0;
    while (q !== null && q !== 'home' && steps++ < 5) q = PARENT[q];
    assert.equal(q, 'home', `${p} backs out to the harbour`);
  }
  for (const v of Object.values(VIEWS)) for (const p of PAGES) {
    const ids = harbourLayout(v, p).targets.map((t) => t.id);
    for (const to of LINKS[p]) assert.ok(ids.includes(`link:${to}`), `${p} links to ${to}`);
    assert.equal(ids.includes('back'), p !== 'home', `${p}: a way back`);
  }
});

test('every touch target fits the safe area, is at least 44 pt and clear of the others', () => {
  for (const [name, v] of Object.entries(VIEWS)) {
    const r = safeRect(v);
    const within = (t: { x: number; y: number; width: number; height: number }) =>
      t.x >= r.x - 0.5 && t.y >= r.y - 0.5 && t.x + t.width <= r.x + r.width + 0.5 && t.y + t.height <= r.y + r.height + 0.5;
    for (const p of PAGES) {
      const l = harbourLayout(v, p);
      for (const t of l.targets) {
        assert.ok(t.width >= MIN_TARGET && t.height >= MIN_TARGET, `${name} ${p} ${t.id}: ${t.width.toFixed(0)}×${t.height.toFixed(0)}`);
        assert.ok(within(t), `${name} ${p} ${t.id} inside the safe area`);
        assert.equal(hit(l, t.x + t.width / 2, t.y + t.height / 2)?.id, t.id);
      }
      for (const a of l.targets) for (const b of l.targets) {
        if (a === b) continue;
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        assert.ok(apart, `${name} ${p}: ${a.id} and ${b.id} overlap`);
      }
      for (const c of l.cells) assert.ok(within(c), `${name} ${p}: every card and row inside the safe area`);
      if (l.ledger) assert.ok(within(l.ledger), `${name} ${p}: the ledger inside the safe area`);
    }
    // the app test (tests/app/shell.test.ts) taps set sail in the middle of the safe area, 0.42 of the way down
    assert.equal(hit(harbourLayout(v, 'home'), r.x + r.width / 2, r.y + r.height * 0.42)?.id, 'sail', name);
  }
});

test('the league holds thirty captains and the player, the nine drawn marked and carded', () => {
  const c = newCareer(26), rows = leagueRows(c);
  assert.equal(rows.length, LEAGUE + 1);
  assert.equal(rows.filter((r) => r.player).length, 1);
  assert.equal(rows.filter((r) => r.drawn).length, 9);
  rows.forEach((r, i) => { assert.equal(r.place, i + 1); if (i) assert.ok(rows[i - 1]!.points >= r.points); });
  const cards = nineCards(c);
  assert.equal(cards.length, 9);
  for (const k of cards) for (const f of ['name', 'meaning', 'temperament', 'form', 'line', 'record', 'emblem', 'wind'] as const) assert.ok(k[f], `${k.name}: ${f}`);
  assert.deepEqual(cards.map((k) => k.id).sort((a, b) => a - b), rows.filter((r) => r.drawn).map((r) => r.id).sort((a, b) => a - b));
});

test('the shipwright and the gull act through the career API only as it allows', () => {
  const c = newCareer(26), open = unlockedForms(c.player.tier);
  for (const f of formChoices(c)) {
    const r = harbourAct(c, { kind: 'form', form: f.form });
    assert.equal(f.unlocked, open.includes(f.form));
    if (!f.unlocked) assert.deepEqual([r.ok, r.why, r.career], [false, 'locked', c]);
    else if (f.chosen) assert.equal(r.why, 'chosen');
  }
  const top = copyCareer(c);
  top.player.tier = 8;
  const galleon = harbourAct(top, { kind: 'form', form: 3 });
  assert.ok(galleon.ok);
  assert.equal(galleon.career.player.form, 3);
  assert.equal(top.player.form, c.player.form, 'the career acted on is left as it was');

  const poor = copyCareer(c);
  poor.player.treasure = 0;
  for (const t of TRAITS) {
    assert.equal(harbourAct(poor, { kind: 'gull', trait: t }).why, 'short');
    assert.equal(gullRows(poor).find((g) => g.trait === t)!.affordable, false);
  }
  let rich = copyCareer(c);
  rich.player.treasure = 100_000;
  for (const t of TRAITS) {
    for (let lv = rich.player.gull[t]; lv < GULL_PRICES[t].length; lv++) {
      const price = gullPrice(rich, t)!, before = rich.player.treasure;
      const r = harbourAct(rich, { kind: 'gull', trait: t });
      assert.ok(r.ok, `${t} level ${lv + 1}`);
      assert.equal(r.career.player.treasure, before - price);
      assert.equal(r.career.player.gull[t], lv + 1);
      rich = r.career;
    }
    assert.equal(harbourAct(rich, { kind: 'gull', trait: t }).why, 'top');
    assert.equal(gullRows(rich).find((g) => g.trait === t)!.price, null);
  }
});

test('settings are kept on the device, read back and applied', async () => {
  const kept = new Map<string, unknown>();
  storage.read = async (k) => kept.get(k);
  storage.write = async (k, v) => { kept.set(k, structuredClone(v)); };
  forgetSettings();
  assert.deepEqual(settings(), defaults(false));
  const chosen = { sound: 0.5, music: 0, haptics: false, reducedMotion: true };
  await setSettings(chosen);
  assert.deepEqual(kept.get('settings'), chosen);
  forgetSettings();
  assert.equal(settings().haptics, true, 'forgotten: the defaults');
  assert.deepEqual(await loadSettings(), chosen, 'read back from the device');
  const heard: unknown[] = [], haptics = { enabled: true }, motion = { reducedMotion: false };
  applySettings(settings(), { audio: { setVolumes: (v) => { heard.push(v); } }, haptics, motion });
  assert.deepEqual(heard, [{ sound: 0.5, music: 0 }]);
  assert.equal(haptics.enabled, false);
  assert.equal(motion.reducedMotion, true);
  assert.deepEqual(sanitize({ sound: 0.6, music: 'loud', haptics: 1 }), { ...defaults(), sound: 0.5 });
  kept.set('settings', 'garbage');
  forgetSettings();
  assert.deepEqual(await loadSettings(), defaults(false), 'an unreadable record keeps the defaults');
  forgetSettings();
});

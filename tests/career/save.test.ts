import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTAINS } from '../../src/career/captains.ts';
import { CAREER_FORMAT, careerHash, decodeCareer, encodeCareer, equipAbility, equipCosmetic, newCareer, type Career } from '../../src/career/career.ts';
import { encode, fromHex, hash64, toHex } from '../../src/career/codec.ts';
import { STARTER_LOOK } from '../../src/career/cosmetics.ts';
import { planMatch } from '../../src/career/fleet.ts';
import { xpAt } from '../../src/career/levels.ts';
import { TIER } from '../../src/career/ranks.ts';
import { applyMatch } from '../../src/career/results.ts';
import { BACKUP_KEY, SAVE_KEY, loadCareer, memoryStore, parseCareer, saveCareer, serializeCareer, webStore } from '../../src/career/save.ts';
import { STARTER_ACTIVE, STARTER_PASSIVE } from '../../src/sim/abilities.ts';
import { rngFrom } from '../../src/sim/math.ts';
import { syntheticReport } from './synthetic.ts';

function played(seed: number, matches: number): Career {
  let c = newCareer(seed);
  const rng = rngFrom(seed);
  for (let m = 0; m < matches; m++) {
    c = applyMatch(c, syntheticReport(rng, planMatch(c), 1100, { drop: m % 16, runAt: 40, storm: 12, range: 150, weapon: 2 })).career;
  }
  c = equipAbility(c, 'smokeScreen');
  return equipCosmetic(c, 'duskRose');
}

test('a career saves and loads whole: record, rating, loadout, chart, rivals and all they have learned', () => {
  const c = played(8, 25), store = memoryStore();
  saveCareer(store, c);
  const { career, status } = loadCareer(store, 999);
  assert.equal(status, 'loaded');
  assert.deepEqual(career, c);
  assert.equal(careerHash(career), careerHash(c));
  assert.ok(career.chart.some((n) => n > 0) && career.captains.some((r) => r.met > 0 && r.habits.drop.some((w) => w > 0)));
  assert.equal(career.active, 'smokeScreen');
  assert.equal(career.look.sailColour, 'duskRose');
  assert.deepEqual(planMatch(career), planMatch(c), 'the next match is the same after a reload');
  assert.ok(serializeCareer(c).startsWith(`PTLC.${CAREER_FORMAT.version}.`));
  assert.ok(serializeCareer(c).length < 20000, `${serializeCareer(c).length} characters`);
});

test('a missing save starts a fresh career', () => {
  const { career, status } = loadCareer(memoryStore(), 42);
  assert.equal(status, 'missing');
  assert.deepEqual(career, newCareer(42));
});

test('a corrupt save starts a fresh career, never a crash, and the old save is kept aside', () => {
  const good = serializeCareer(played(3, 6));
  const parts = good.split('.'), hex = parts[3];
  const flip = (s: string, i: number): string => s.slice(0, i) + (s[i] === '0' ? '1' : '0') + s.slice(i + 1);
  const resealed = (bytes: Uint8Array): string => `PTLC.${CAREER_FORMAT.version}.${hash64(bytes)}.${toHex(bytes)}`;
  const truncated = fromHex(hex)!.slice(0, 40);
  const bad = [
    '',
    'hello',
    '{"matches": 3}',
    'PTLC.3..',
    good.slice(0, good.length - 7),
    good + '00',
    flip(good, good.length - 5),
    flip(good, 30),
    `${parts[0]}.${parts[1]}.${parts[2]}.${hex.toUpperCase()}`,
    `${parts[0]}.${parts[1]}.0000000000000000.${hex}`,
    `XXXX.${parts[1]}.${parts[2]}.${hex}`,
    resealed(truncated),
    resealed(new Uint8Array([80, 84, 76, 67, 6, 255, 255, 255, 255, 255, 255, 255, 255, 1])),
  ];
  for (const s of bad) {
    const store = memoryStore();
    store.write(SAVE_KEY, s);
    const { career, status } = loadCareer(store, 77);
    assert.equal(status, 'corrupt', JSON.stringify(s.slice(0, 40)));
    assert.deepEqual(career, newCareer(77));
    assert.equal(store.data[BACKUP_KEY], s, 'the unreadable save is kept aside');
  }
  assert.throws(() => decodeCareer(truncated));
});

test('a save from an unknown version starts fresh; the version is checked, not guessed', () => {
  const c = newCareer(5), future = encode({ ...CAREER_FORMAT, version: CAREER_FORMAT.version + 1 }, c);
  const store = memoryStore();
  store.write(SAVE_KEY, `PTLC.${CAREER_FORMAT.version + 1}.${hash64(future)}.${toHex(future)}`);
  assert.equal(loadCareer(store, 5).status, 'unknownVersion');
  assert.ok(store.data[BACKUP_KEY]);
  const old = encode({ ...CAREER_FORMAT, version: 2 }, c);
  assert.equal(parseCareer(`PTLC.2.${hash64(old)}.${toHex(old)}`).status, 'unknownVersion');
  const lying = encodeCareer(c);
  assert.equal(parseCareer(`PTLC.2.${hash64(lying)}.${toHex(lying)}`).status, 'corrupt', 'the label must match the payload');
});

test('a save that decodes but holds stale ids or impossible numbers is repaired field by field', () => {
  const c = played(11, 4);
  c.active = 'cannonade';
  c.passive = 'steadyAim';
  c.look = { ...c.look, sailColour: 'noSuchColour', wake: 'rainbowSpray', figurehead: 'heron' };
  c.captains = c.captains.filter((r) => r.id !== CAPTAINS[3].id);
  c.captains.push({ ...c.captains[0], id: 'retiredCaptain' });
  c.captains[1].grudge = 9;
  c.captains[2].habits.drop = [1, 2, 3];
  c.rating = 99999;
  c.bestTier = 40;
  c.wins = c.matches + 5;
  c.chart = c.chart.slice(0, 10);
  const got = parseCareer(serializeCareer(c));
  assert.equal(got.status, 'repaired');
  const r = got.career!;
  assert.deepEqual([r.active, r.passive], [STARTER_ACTIVE, STARTER_PASSIVE]);
  assert.deepEqual([r.look.sailColour, r.look.wake], [STARTER_LOOK.sailColour, STARTER_LOOK.wake]);
  assert.equal(r.look.figurehead, 'heron', 'what was fine stays');
  assert.deepEqual(r.captains.map((x) => x.id), CAPTAINS.map((x) => x.id));
  assert.equal(r.captains[3].met, 0, 'a captain missing from the save starts fresh');
  assert.equal(r.captains[1].grudge, 3);
  assert.equal(r.captains[2].habits.drop.length, 16);
  assert.ok(r.rating <= 2600 && r.bestTier === TIER.legend && r.wins === r.matches && r.chart.length === 16);
  assert.equal(parseCareer(serializeCareer(r)).status, 'loaded', 'a repaired career saves clean');
});

test('the browser store wraps localStorage, and a storage that throws never crashes the career', () => {
  const backing: Record<string, string> = {};
  const ls = { getItem: (k: string) => backing[k] ?? null, setItem: (k: string, v: string) => void (backing[k] = v) };
  const store = webStore(ls), c = newCareer(2);
  c.xp = xpAt(12);
  saveCareer(store, c);
  assert.ok(backing[SAVE_KEY]);
  assert.deepEqual(loadCareer(store, 1).career, c);
  const broken = webStore({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } });
  assert.doesNotThrow(() => saveCareer(broken, c));
  assert.deepEqual(loadCareer(broken, 4), { career: newCareer(4), status: 'missing' });
  const hostile = { read: () => { throw new Error('gone'); }, write: () => { throw new Error('gone'); } };
  assert.equal(loadCareer(hostile, 4).status, 'missing');
});

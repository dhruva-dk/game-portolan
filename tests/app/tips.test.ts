// First-time tips: each shows once ever and one at a time, the saved list survives a broken save and is written and
// read back, every tip comes up through its own trigger, and a real match
// offers the Gale's tip on the Gale and the starter weapon's once the ship has settled at sea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Intents } from '../../src/app/controls.ts';
import type { Moment } from '../../src/app/events.ts';
import { Session } from '../../src/app/session.ts';
import { TIPS, TIPS_KEY, Tips, parseSeen, type TipId } from '../../src/app/tips.ts';
import { MOMENTS } from '../../src/app/moments.ts';
import { isNight, localHour, seaLevelAt } from '../../src/sim/environment.ts';
import { openAt } from '../../src/sim/nav.ts';
import { R, TERRITORY, cellOf } from '../../src/sim/sphere.ts';
import { PLAYER, WEATHER_KIND, WEATHER_NAMES } from '../../src/sim/match.ts';
import { TIDE, WEATHER } from '../../src/sim/tables.ts';
import { REGIONS } from '../../src/sim/world/index.ts';
import { newCareer } from '../../src/career/career.ts';
import { planMatch } from '../../src/career/fleet.ts';
import { PHASE, TICK } from '../../src/sim/state.ts';
import type { CosmeticIds } from '../../src/render/actors/view.ts';
import { WEAPON_NAME } from '../../src/ui/model.ts';

const hands: Intents = {
  stick: { x: 0, y: 0 }, look: { x: 0, y: 0 }, idle: 0, throttle: 1,
  fire: false, dive: false, gust: false, reload: false, ability: false, drop: false, take: false, select: -1, swap: -1, hail: -1,
};

const session = (seed: number, skipGale = false) => new Session(planMatch(newCareer(seed)), {} as CosmeticIds, { seed, skipGale });

/** Tips as the app keeps them in capture mode (in memory), turned on. */
function tips(): Tips {
  const t = new Tips(true);
  t.on = true;
  return t;
}

/** Rides `seconds`, moving the tips on each tick; every tip that came up, in order. */
function ride(s: Session, t: Tips, seconds: number): string[] {
  const seen: string[] = [];
  for (let k = 0; k < seconds / TICK; k++) {
    s.control(hands, TICK);
    s.step();
    const v = t.update(s, TICK);
    if (v && seen[seen.length - 1] !== v.id) seen.push(v.id);
  }
  return seen;
}

test('the saved tips: known ids kept, anything else dropped, a broken save shows them all again', () => {
  assert.deepEqual([...parseSeen(null)], []);
  assert.deepEqual([...parseSeen('{oops')], []);
  assert.deepEqual([...parseSeen('{"gale":true}')], []);
  assert.deepEqual([...parseSeen('["gale","nope",3,"weather:fog"]')].sort(), ['gale', 'weather:fog']);
  for (const id of Object.keys(TIPS)) assert.ok(parseSeen(JSON.stringify([id])).has(id as TipId), `${id} round-trips`);
});

test('on the Gale its tip shows at once, stays its time, and never again', () => {
  const s = session(11), t = tips();
  assert.equal(s.me.phase, PHASE.gale);
  const first = t.update(s, TICK);
  assert.equal(first?.id, 'gale');
  assert.match(first!.text, /Dive/);
  const shown = ride(s, t, 6);
  assert.deepEqual(shown, ['gale'], 'the same card for its seven seconds');
  assert.equal(t.update(s, 1.5), null, 'then it goes, with nothing new on the Gale');
  t.reset();
  assert.equal(t.update(s, TICK), null, 'a new match does not show it again');
  assert.deepEqual(t.shown, ['gale']);
});

test('at sea the first tips wait for the ship to settle, then come one at a time, the starter weapon first', (t) => {
  const s = session(11, true), tp = tips();
  assert.equal(s.me.phase, PHASE.sea);
  assert.deepEqual(ride(s, tp, 2.5), [], 'nothing in the first seconds');
  const shown = ride(s, tp, 30);
  t.diagnostic(`tips in the first 32 s: ${shown.join(', ')}`);
  assert.equal(shown[0], 'weapon');
  assert.ok(shown.includes('gust') && shown.includes('ability'), 'gust and the ability follow');
  assert.equal(new Set(shown).size, shown.length, 'none twice');
  tp.reset();
  assert.ok(!ride(session(29, true), tp, 12).some((id) => shown.includes(id)), 'in the next match a tip seen does not come back');
});

test('the weapon tip names the weapon held, and moments offer theirs only for the player', () => {
  const s = session(11, true), t = tips();
  ride(s, t, 4);
  const card = t.update(s, 0);
  assert.equal(card?.id, 'weapon');
  assert.ok(Object.values(WEAPON_NAME).some((n) => card!.title === `Your ${n}`), `named: ${card!.title}`);
  // another ship's broadside offers nothing; the Storm closing in does, behind the card already up
  t.moment({ k: 'fire', ship: 3, weapon: 'cannon', rarity: 0, pos: s.me.pos, dir: s.me.pos } as Moment, s);
  t.moment({ k: 'stormPhase', phase: 1, seconds: 60 } as Moment, s);
  const after = ride(s, t, 40);
  assert.ok(after.includes('storm'), 'the Storm\'s tip comes up in turn');
  assert.ok(!after.includes('shot'), 'not the shot tip for someone else\'s shot');
});

/** The browser's storage as a map, put in place of `localStorage` while `run` runs. */
function withStorage(saved: string | null, run: (store: Map<string, string>) => void): void {
  const store = new Map<string, string>(saved === null ? [] : [[TIPS_KEY, saved]]);
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
  try {
    run(store);
  } finally {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test('the tips seen are written to storage, read back by the next visit, and cleared by forgetting them', () => {
  withStorage(null, (store) => {
    const s = session(11), first = new Tips(false);
    assert.equal(first.update(s, TICK)?.id, 'gale');
    assert.deepEqual(JSON.parse(store.get(TIPS_KEY)!), ['gale'], 'written as soon as it shows');
    const next = new Tips(false);
    assert.deepEqual(next.shown, ['gale'], 'read back on the next visit');
    assert.equal(next.update(session(12), TICK), null, 'and not shown again');
    next.forget();
    assert.deepEqual(JSON.parse(store.get(TIPS_KEY)!), [], 'forgetting clears the save');
    assert.equal(new Tips(false).update(session(13), TICK)?.id, 'gale', 'so it shows again');
  });
});

/** Puts the player where the tide, falling now, will shut water near her within the tip's look ahead. */
function onAFallingTide(s: Session): void {
  const probe = new Tips(true) as unknown as { closing(t: number, p: { x: number; y: number; z: number }): boolean };
  // the tide falls fastest a half period after its high water
  const tick = Math.round(TIDE.period / 2 / TICK), p = { x: 0, y: 0, z: 0 }, n = 40000;
  for (let i = 0; i < n; i++) {
    // a spiral of points over the whole planet
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963229728653;
    p.x = Math.cos(a) * r; p.y = y; p.z = Math.sin(a) * r;
    if (!openAt(p, seaLevelAt(tick * TICK)) || !probe.closing(tick * TICK, p)) continue;
    s.state.tick = tick;
    s.me.pos.x = p.x; s.me.pos.y = p.y; s.me.pos.z = p.z;
    return;
  }
  throw new Error('no water anywhere the falling tide shuts');
}

/** What brings each tip up, done to the player once she has settled at sea (the Gale's needs only the Gale). */
const TRIGGER: Record<string, (s: Session, t: Tips) => void> = {
  gale: () => {},
  weapon: () => {},
  gust: () => {},
  ability: () => {},
  shot: (s, t) => t.moment({ k: 'fire', ship: PLAYER, weapon: 'cannon', rarity: 0, pos: s.me.pos, dir: s.me.pos } as Moment, s),
  shieldBreak: (s, t) => t.moment({ k: 'shieldBreak', ship: PLAYER } as Moment, s),
  loot: (s, t) => t.moment({ k: 'pickup', ship: PLAYER } as Moment, s),
  consumable: (s, t) => t.moment({ k: 'useStart', ship: PLAYER } as Moment, s),
  storm: (s, t) => t.moment({ k: 'stormPhase', phase: 1, seconds: 60 } as Moment, s),
  landmark: (s, t) => t.moment({ k: 'perk', ship: PLAYER, perk: REGIONS[0].perk, on: true } as Moment, s),
  whale: (s, t) => t.moment({ k: 'whaleBreach', pos: { x: s.me.pos.x * R, y: s.me.pos.y * R, z: s.me.pos.z * R } } as Moment, s),
  gull: (s) => void (s.me.coins = 9999),
  mend: (s) => {
    s.me.hull = 40;
    s.me.lastHit = -10000;
    s.state.owner[cellOf(TERRITORY, s.me.pos)] = PLAYER + 1;
  },
  night: (s) => {
    for (let h = 0; h < 24 && !isNight(s.state, s.me.pos); h++) s.state.hour = h;
  },
  event: (s) => void MOMENTS.find((m) => m.name === 'event-fireArchipelago')!.arrange(s.state),
  tide: onAFallingTide,
  ...Object.fromEntries(WEATHER_NAMES.map((w) => [`weather:${w}`, (s: Session) => {
    const v = s.state.weather[0], at = s.me.pos;
    v.kind = WEATHER_KIND[w];
    v.at.x = at.x; v.at.y = at.y; v.at.z = at.z;
    v.r = WEATHER.r[1];
    v.life = WEATHER.life[1];
    v.age = WEATHER.rise;
  }])),
};

/** Rides `seconds` without moving, from a save holding every tip but `id`, after `arrange`; whether `id` came up. */
function comesUp(id: TipId, arrange: (s: Session, t: Tips) => void, seconds = 20): boolean {
  let came = false;
  withStorage(JSON.stringify(Object.keys(TIPS).filter((x) => x !== id)), () => {
    const s = session(11, id !== 'gale'), tp = new Tips(false), still = { ...hands, throttle: 0 };
    // midday where she is, so night has to be brought on
    s.state.hour = (((s.state.hour + 12 - localHour(s.state, s.me.pos)) % 24) + 24) % 24;
    // settled at sea first, then what brings it on
    for (let k = 0; k < 3.5 / TICK; k++) (s.control(still, TICK), s.step(), tp.update(s, TICK));
    arrange(s, tp);
    for (let k = 0; k < seconds / TICK && !came; k++) {
      s.control(still, TICK);
      s.step();
      came = tp.update(s, TICK)?.id === id;
    }
  });
  return came;
}

test('every tip comes up through its own trigger, and none but the first four without it', (t) => {
  const ids = Object.keys(TIPS) as TipId[], always = ['gale', 'weapon', 'gust', 'ability'];
  assert.deepEqual(Object.keys(TRIGGER).sort(), [...ids].sort(), 'a trigger for every tip');
  for (const id of ids) {
    assert.ok(comesUp(id, TRIGGER[id]), `${id} comes up`);
    if (!always.includes(id)) assert.ok(!comesUp(id, () => {}), `${id} does not come up untriggered`);
  }
  t.diagnostic(`all ${ids.length} tips came up, ${ids.length - always.length} of them only when brought on`);
});

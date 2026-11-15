// The biomes (world/biome.ts) and their rules (sim/rule.ts), #61 section 3: a planet's biome is its seed's, every seed
// under 2^20 today's palm keys; and each rule changes the sim on a planet of its own biome, and on no other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { think } from '../src/sim/bot.ts';
import { byTemper, mind, type Seen } from '../src/sim/captain.ts';
import { SHIP } from '../src/sim/handling.ts';
import { leeAt, ruled, tideAt, tided, type Ground } from '../src/sim/rule.ts';
import { shipAt, step, type Helm } from '../src/sim/ship.ts';
import { BIOMES, SPAN, anyPlanet, biomeOf, groundOf, seedIn, traitsOf, type Rule } from '../src/world/biome.ts';
import { GROUNDS } from '../src/palette.ts';
import { createPlanet, risesOf, type Planet } from '../src/world/planet.ts';
import { cross, fromChart, normalize, type Vec3 } from '../src/world/sphere.ts';

test('every seed under 2^20 is palm keys, its ground its own seed; above it, each of the six in turn', () => {
  for (const seed of [0, 1, 3, 7922, SPAN - 1]) {
    assert.equal(biomeOf(seed).name, 'palmKeys');
    assert.equal(groundOf(seed), seed);
  }
  BIOMES.forEach((b, i) => {
    assert.equal(biomeOf(i * SPAN + 5).name, b.name);
    assert.equal(biomeOf(seedIn(b.name, 12345)).name, b.name);
    assert.ok(groundOf(seedIn(b.name, 12345)) < SPAN, 'the ground\'s seed is within the noise\'s');
  });
  assert.equal(BIOMES[0].rule, 'none', 'palm keys has no rule');
  assert.equal(new Set(BIOMES.map((b) => b.rule)).size, BIOMES.length, 'each biome its own rule');
  for (const b of BIOMES) {
    const t = traitsOf(seedIn(b.name, 3));
    assert.equal(t.biome, b.name);
    assert.equal(t.rule, b.rule);
    assert.ok(t.title.length > 0 && t.says.length > 0, `${b.name} is named, and its rule`);
    assert.ok(GROUNDS[b.name], `${b.name} has its ground's colours`);
  }
  const drawn = new Set(Array.from({ length: 600 }, (_, n) => biomeOf(anyPlanet(Math.imul(n + 1, 0x9e3779b1))).name));
  assert.equal(drawn.size, BIOMES.length, 'a new planet may be of any biome');
});

/** A planet of each biome, by its seed. */
const planets: Planet[] = BIOMES.map((b) => createPlanet(seedIn(b.name, 7)));

test('a biome\'s planet is its seed\'s alone', () => {
  const again = createPlanet(seedIn('basaltFjords', 7)), first = planets[2];
  assert.equal(again.biome.name, 'basaltFjords');
  assert.equal(again.islands.length, first.islands.length);
  for (const s of first.islands.slice(0, 6)) {
    const p = fromChart(s.chart, s.radius * 0.5, 0);
    assert.equal(again.height(p), first.height(p));
  }
});

/** Places round each island of the planet (rings out from its middle), with the depth there and the lee's share. */
function places(planet: Planet) {
  const rises = risesOf(planet.islands), out: { at: Vec3; depth: number; lee: number }[] = [];
  for (const s of planet.islands) for (let r = 0.6; r < 2.4; r += 0.1) for (let a = 0; a < 24; a++) {
    const at = fromChart(s.chart, s.radius * r * Math.cos((a * Math.PI) / 12), s.radius * r * Math.sin((a * Math.PI) / 12));
    out.push({ at, depth: -planet.height(at), lee: leeAt(rises, at) });
  }
  return out;
}
const spots = planets.map(places);

/** Her bearing at `at`: any tangent. */
const ahead = (at: Vec3): Vec3 => normalize(cross(at, Math.abs(at[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));

/** Her speed after a second sailing from `at` (from rest, or at `speed`) under the rule, the helm `helm` asks. */
function sail(planet: Planet, rule: Rule, at: Vec3, helm: Helm, speed = 0): number {
  const depth = (p: Vec3) => -planet.height(p), ground: Ground = { depth, rises: risesOf(planet.islands) };
  let s = { ...shipAt(at, ahead(at)), speed };
  for (let k = 0; k < 30; k++) s = step(s, ruled(rule, { ...helm, course: s.heading }, s.at, ground), 1 / 30, depth);
  return s.speed;
}

/** For each rule, a probe of the sim on a planet under a rule, its places chosen so that no other rule touches it;
 *  and whether the rule's own planet has such a place. Each returns a number the sim gave (NaN: no such place). */
const probes: Record<Exclude<Rule, 'none'>, (i: number, rule: Rule) => number> = {
  // her way over a reef's flats, clear of any lee
  reef: (i, rule) => {
    const p = spots[i].find((s) => s.depth > SHIP.draught + 1 && s.depth < 5 && s.lee === 1);
    return p ? sail(planets[i], rule, p.at, { course: null, throttle: 1 }, 6) : NaN;
  },
  // her way under the cliffs, in water too deep for a reef's rule (and no gust, which is all the roots touch)
  lee: (i, rule) => {
    const p = spots[i].find((s) => s.depth > 7.5 && s.lee < 0.9);
    return p ? sail(planets[i], rule, p.at, { course: null, throttle: 1 }, 6) : NaN;
  },
  // a gust's drive in the shallows, asking nothing of her own (so her way, a reef's or a lee's, is nothing to it)
  roots: (i, rule) => {
    const p = spots[i].find((s) => s.depth > SHIP.draught + 1 && s.depth < 6);
    return p ? sail(planets[i], rule, p.at, { course: null, throttle: 0, gust: true }) : NaN;
  },
  // whether a bot of middling lookout notices a ship at 80% of her clear-air notice, both in open water
  ash: (i, rule) => {
    const p = spots[i].find((s) => s.depth > 12);
    if (!p) return NaN;
    const hand = byTemper(11), own: Seen = { id: 1, ship: shipAt(p.at, ahead(p.at)) };
    const range = hand.t.notice * (0.8 + 0.4 * hand.t.lookout) * 0.8;
    const foe: Seen = { id: 2, ship: shipAt(fromChart({ at: p.at, axis: ahead(p.at) }, range, 0), ahead(p.at)) };
    const sea = { depth: () => 100, rule };
    return think(own, [foe], sea, { ...mind(11, p.at), think: 1 }, hand).memory.foe;
  },
  // the depth under her a quarter of the tide's period into the race
  tide: (i, rule) => {
    const p = spots[i].find((s) => s.depth > SHIP.draught);
    return p ? tided(rule, (q) => -planets[i].height(q), () => tideAt(rule, 150 / 4))(p.at) : NaN;
  },
};

for (const [name, probe] of Object.entries(probes) as [Exclude<Rule, 'none'>, (i: number, rule: Rule) => number][]) {
  const own = BIOMES.findIndex((b) => b.rule === name);
  test(`${name} (${BIOMES[own].name}): changes the sim on a planet of its biome, and on no other`, () => {
    assert.ok(!Number.isNaN(probe(own, name)), `${BIOMES[own].name}'s planet has a place for it`);
    const elsewhere = planets.filter((_, i) => i !== own && !Number.isNaN(probe(i, 'none'))).length;
    assert.ok(elsewhere >= 3, `the probe finds a place on most other planets (${elsewhere})`);
    planets.forEach((planet, i) => {
      const ruledBy = probe(i, planet.biome.rule), clear = probe(i, 'none');
      if (i === own) assert.notEqual(ruledBy, clear, `${name} changes the sim on ${planet.biome.name}`);
      else assert.ok(Object.is(ruledBy, clear), `${planet.biome.name}'s rule leaves ${name}'s probe as it was`);
    });
  });
}

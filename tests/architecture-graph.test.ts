// Architecture rules on the import graph, read from TypeScript's own syntax
// trees: every export is taken by what runs, no import goes round in a circle,
// world/ is tiers (the math the rest stands on; the grids; the sea and sky; the
// planet's making), and every import of a file names it as it is (.ts). What a
// rule lets stand is in architecture/exceptions.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {
  everywhere,
  exportsOf,
  files,
  imports,
  none,
  tree,
  unused,
  visit,
  type Hit,
  type Import,
  type Scanned,
} from './architecture/scan.ts';

const RULES = ['exports', 'cycles', 'world', 'extensions'];

/**
 * The names an import takes from its file: those it names, or, for a namespace,
 * those it reads off it.
 */
const taken = (i: Import, of: Scanned): string[] => {
  if (i.whole) return exportsOf(of).map((e) => e.name);
  if (!i.names.includes('*')) return i.names;
  if (!i.ns) return exportsOf(of).map((e) => e.name);
  const read: string[] = [];
  visit(tree(i.from), (n) => {
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === i.ns
    )
      read.push(n.name.text);
    if (
      ts.isQualifiedName(n) &&
      ts.isIdentifier(n.left) &&
      n.left.text === i.ns
    )
      read.push(n.right.text);
  });
  return read;
};

test('exports: every export is taken by another file of src; one only the tests or tools take is run by the game too, or excepted', () => {
  const bySrc = new Set<string>(),
    byOthers = new Set<string>();
  for (const f of everywhere) {
    for (const i of imports(f)) {
      const of = files.find((g) => g.rel === i.to);
      if (!of || of === f) continue;
      for (const name of taken(i, of))
        (f.at.startsWith('src/') ? bySrc : byOthers).add(`${of.rel} ${name}`);
    }
  }
  const found: Hit[] = [];
  for (const f of files) {
    for (const e of exportsOf(f)) {
      const key = `${f.rel} ${e.name}`;
      if (bySrc.has(key)) continue;
      let uses = 0;
      visit(tree(f), (n) => {
        if (ts.isIdentifier(n) && n.text === e.name) uses++;
      });
      // (its own declaration is one use; a tested internal is used in its file besides)
      if (byOthers.has(key) && uses > 1) continue;
      found.push({
        file: f.at,
        line: e.line,
        name: e.name,
        text: byOthers.has(key)
          ? 'only the tests or tools take it, and the game never runs it'
          : 'nothing takes it: no export',
      });
    }
  }
  none('exports', found, 'exports nothing in the game takes');
});

test('cycles: no import goes round in a circle (types aside: they are erased)', () => {
  const graph = new Map(
    files.map((f) => [
      f.rel,
      imports(f)
        .filter((i) => !i.typeOnly && i.to.endsWith('.ts'))
        .map((i) => i.to),
    ])
  );
  // Tarjan's strongly connected components: a component of more than one file is a circle
  let next = 0;
  const index = new Map<string, number>(),
    low = new Map<string, number>(),
    stack: string[] = [],
    on = new Set<string>();
  const found: Hit[] = [];
  const strong = (v: string) => {
    index.set(v, next);
    low.set(v, next++);
    stack.push(v);
    on.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) !== index.get(v)) return;
    const circle: string[] = [];
    let w: string;
    do {
      w = stack.pop()!;
      on.delete(w);
      circle.push(w);
    } while (w !== v);
    if (circle.length > 1 || graph.get(v)?.includes(v))
      found.push({ file: `src/${v}`, line: 1, text: circle.join(' → ') });
  };
  for (const v of graph.keys()) if (!index.has(v)) strong(v);
  none('cycles', found, 'imports in a circle');
});

/**
 * world/'s tiers, each taking only from its own and those under it: the math everything stands on; the grids laid on the
 * sphere; then, side by side and apart, the sea and the sky's motions, and the planet's making.
 */
const TIERS: Record<string, readonly string[]> = {
  math: [
    'scalar.ts',
    'random.ts',
    'sphere.ts',
    'turn.ts',
    'pose.ts',
    'remembered.ts',
    'seeds.ts',
    'harbour.ts',
  ],
  grids: ['cells.ts', 'lattice.ts', 'noise3.ts'],
  motions: [
    'cascades.ts',
    'sum.ts',
    'spectrum.ts',
    'swell.ts',
    'sun.ts',
    'weather.ts',
    'wind.ts',
  ],
  making: [
    'planet.ts',
    'planet-terrain.ts',
    'terrain.ts',
    'terrain-grid.ts',
    'terrain-scatter.ts',
    'land.ts',
    'coastline.ts',
    'harbour-site.ts',
  ],
};
const UNDER: Record<string, readonly string[]> = {
  math: ['math'],
  grids: ['math', 'grids'],
  motions: ['math', 'grids', 'motions'],
  making: ['math', 'grids', 'making'],
};
const tierOf = (rel: string) =>
  Object.keys(TIERS).find((t) =>
    TIERS[t].includes(rel.replace(/^world\//, ''))
  );
/** Who may run the planet's making, outside world/: the world built once (environment.ts), the matches dealt on it
 *  (play/setup.ts), the water sounded for them (its worker, play/sounding.ts) and a career's other races sailed on it
 *  apart (their worker, play/racing.ts), what draws the land (land/, whose
 *  bake runs the making again in a worker), and the seed panel's survey of another seed's planet (its worker,
 *  play/survey.ts: the page's world is built once, so another seed's land is made apart from it, as data only). The
 *  rest take its types, and the world as built. */
const MAKERS = [
  'environment.ts',
  'play/setup.ts',
  'play/sounding.ts',
  'play/racing.ts',
  'play/survey.ts',
  'land/',
];

test("world: world/ is tiers (math, grids, motions, making); only the world's builders run the planet's making", () => {
  const found: Hit[] = [];
  const world = files.filter((f) => f.rel.startsWith('world/'));
  for (const f of world) {
    const tier = tierOf(f.rel);
    if (!tier) found.push({ file: f.at, line: 1, text: 'in no tier of TIERS' });
    for (const i of imports(f)) {
      const to = tierOf(i.to);
      if (tier && to && !UNDER[tier].includes(to))
        found.push({
          file: f.at,
          line: i.line,
          text: `${tier} takes from ${to}: '${i.spec}'`,
        });
    }
  }
  for (const f of files.filter(
    (f) =>
      !f.rel.startsWith('world/') &&
      !MAKERS.some(
        (m) => f.rel === m || (m.endsWith('/') && f.rel.startsWith(m))
      )
  )) {
    for (const i of imports(f)) {
      if (!i.typeOnly && tierOf(i.to) === 'making' && i.to.startsWith('world/'))
        found.push({
          file: f.at,
          line: i.line,
          name: i.to,
          text: `runs the making: '${i.spec}'`,
        });
    }
  }
  none(
    'world',
    found,
    "world/'s tiers, and the planet's making run outside its builders"
  );
  const tiered = Object.values(TIERS).flat();
  assert.deepEqual(
    tiered.filter((t) => !world.some((f) => f.rel === `world/${t}`)),
    [],
    'TIERS names files world/ has not'
  );
});

test('extensions: every import of a file of this repo names it as it is, with its .ts', () => {
  const found = everywhere.flatMap((f) =>
    imports(f)
      .filter((i) => i.spec.startsWith('.') && !/\.ts(\?.*)?$/.test(i.spec))
      .map((i) => ({ file: f.at, line: i.line, text: i.spec }))
  );
  none('extensions', found, 'relative imports without .ts');
});

test('the exceptions to these rules all excuse something', () => {
  assert.deepEqual(
    unused(RULES).map(
      (e) => `${e.rule} ${e.file}${e.name ? ` ${e.name}` : ''}`
    ),
    [],
    'stale exceptions: remove them'
  );
});

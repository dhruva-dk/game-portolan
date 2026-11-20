// The bots' parts (BOTS.md 1.5): each keeps its own tuning and its own memory,
// and the parts that sail her know nothing of what she is about.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {
  files,
  imports,
  lineOf,
  none,
  tree,
  visit,
  type Hit,
  type Scanned,
} from './architecture/scan.ts';

/** A bot's parts, src-relative. */
const PARTS = [
  'sim/bot.ts',
  'sim/captain.ts',
  'sim/tactician.ts',
  'sim/pilot.ts',
  'sim/helmsman.ts',
  'sim/gunner.ts',
  'sim/purser.ts',
  'sim/claimer.ts',
  'sim/hunter.ts',
  'sim/route.ts',
  'sim/utility.ts',
  'sim/temper.ts',
];
/** The parts that sail her: they know nothing of what she is about. */
const SAILING = [
  'sim/tactician.ts',
  'sim/pilot.ts',
  'sim/helmsman.ts',
  'sim/route.ts',
];
/** The parts that choose what she is about. */
const CHOOSING = [
  'sim/bot.ts',
  'sim/purser.ts',
  'sim/claimer.ts',
  'sim/hunter.ts',
];
/**
 * Tables read as they are, not from the brain: captain.ts's BOT, shared by
 * every part; and gunner.ts's GUNNER, her aim's feel, the same for every bot
 * (a fairness to the player, not a choice of hers: BOTS.md decision 4); and
 * the tools every part sails by alike: route.ts's ROUTE (the chart's search),
 * utility.ts's REASON (the weighing of options), purser.ts's WORTH (what each
 * of her stores mends).
 */
const SHARED = new Set(['BOT', 'GUNNER', 'ROUTE', 'REASON', 'WORTH']);

const parts = files.filter((f) => PARTS.includes(f.rel));

/** A file's tuning tables: top-level consts named in capitals, set to an object. */
function tables(f: Scanned): string[] {
  const names: string[] = [];
  for (const s of tree(f).statements) {
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      let init = d.initializer;
      while (init && ts.isAsExpression(init)) init = init.expression;
      if (
        ts.isIdentifier(d.name) &&
        /^[A-Z][A-Z_]+$/.test(d.name.text) &&
        init &&
        ts.isObjectLiteralExpression(init)
      )
        names.push(d.name.text);
    }
  }
  return names;
}

test('own tuning: a part of a bot names no other part’s tuning table (captain.ts BOT, shared by all, aside)', () => {
  const owner = new Map<string, string>();
  for (const f of parts) for (const t of tables(f)) owner.set(t, f.rel);
  // (the rule reads something: the parts' tables are found)
  assert.ok(owner.size >= 10, `only ${owner.size} tables found`);
  const found: Hit[] = [];
  for (const f of parts)
    visit(tree(f), (n) => {
      if (!ts.isIdentifier(n) || SHARED.has(n.text)) return;
      const o = owner.get(n.text);
      if (o && o !== f.rel)
        found.push({
          file: f.at,
          line: lineOf(f, n.getStart()),
          text: `${n.text} is ${o}'s`,
        });
    });
  none('own tuning', found, 'a part reading another part’s tuning');
});

/** The brain's slices each part reads (brain.ts Brain): its own, no other's. */
const SLICES: Record<string, readonly string[]> = {
  'sim/bot.ts': ['sight', 'mind', 'roaming', 'storming'],
  'sim/tactician.ts': ['ramming'],
  'sim/helmsman.ts': ['helm'],
  'sim/purser.ts': ['purser'],
  'sim/claimer.ts': ['claimer'],
  'sim/hunter.ts': ['hunting'],
};

test('own slices: a part reads its tuning from the brain it is given (c.b), its own slices alone, never its table itself', () => {
  const found: Hit[] = [];
  let reads = 0;
  for (const f of parts) {
    const own = new Set(tables(f)),
      slices = SLICES[f.rel] ?? [];
    visit(tree(f), (n) => {
      // its table named outside its own declaration
      if (
        ts.isIdentifier(n) &&
        own.has(n.text) &&
        !SHARED.has(n.text) &&
        !(ts.isVariableDeclaration(n.parent) && n.parent.name === n)
      )
        found.push({
          file: f.at,
          line: lineOf(f, n.getStart()),
          text: `${n.text} read, not the brain's`,
        });
      // a slice of the brain: c.b.<slice>
      if (
        ts.isPropertyAccessExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === 'b'
      ) {
        reads++;
        if (!slices.includes(n.name.text))
          found.push({
            file: f.at,
            line: lineOf(f, n.getStart()),
            text: `b.${n.name.text} is not its own`,
          });
      }
    });
  }
  // (the rule reads something)
  assert.ok(reads >= 100, `only ${reads} reads of the brain found`);
  none('own slices', found, 'a part reading tuning not its own slice');
});

test('no modes: the parts that sail her import nothing of those that choose, and never name a Mode', () => {
  const found: Hit[] = [];
  for (const f of parts.filter((p) => SAILING.includes(p.rel))) {
    for (const i of imports(f))
      if (i.to && CHOOSING.includes(i.to))
        found.push({ file: f.at, line: i.line, text: `imports ${i.to}` });
    visit(tree(f), (n) => {
      if (
        (ts.isIdentifier(n) && n.text === 'Mode') ||
        (ts.isPropertyAccessExpression(n) && n.name.text === 'mode')
      )
        found.push({
          file: f.at,
          line: lineOf(f, n.getStart()),
          text: n.getText(),
        });
    });
  }
  none('no modes', found, 'a sailing part knowing what she is about');
});

/** Memory is named `m` or `g` (a gunner's) where it is written. */
const MEMORY = new Set(['m', 'g']);

/** The memory field `e` writes, if it is one: m.x or c.m.x. */
function field(e: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(e)) return null;
  const x = e.expression;
  const ok =
    (ts.isIdentifier(x) && MEMORY.has(x.text)) ||
    (ts.isPropertyAccessExpression(x) && x.name.text === 'm');
  return ok ? e.name.text : null;
}

const ASSIGN = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
]);

/** Every memory field a file writes, with where. */
function writes(f: Scanned): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = [];
  const note = (e: ts.Expression) => {
    const name = field(e);
    if (name) out.push({ name, line: lineOf(f, e.getStart()) });
  };
  visit(tree(f), (n) => {
    if (ts.isBinaryExpression(n) && ASSIGN.has(n.operatorToken.kind)) {
      if (ts.isArrayLiteralExpression(n.left)) n.left.elements.forEach(note);
      else note(n.left);
    } else if (
      (ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) &&
      (n.operator === ts.SyntaxKind.PlusPlusToken ||
        n.operator === ts.SyntaxKind.MinusMinusToken)
    )
      note(n.operand);
  });
  return out;
}

test('memory owners: each part declares the memory it keeps (an interface named …Memory, or Gunner, or Chance) and alone writes it', () => {
  const owner = new Map<string, string>();
  for (const f of parts)
    for (const s of tree(f).statements)
      if (
        ts.isInterfaceDeclaration(s) &&
        /Memory$|^Gunner$|^Chance$/.test(s.name.text)
      )
        for (const m of s.members)
          if (m.name && ts.isIdentifier(m.name)) owner.set(m.name.text, f.rel);
  const all = parts.flatMap((f) => writes(f).map((w) => ({ f, w })));
  // (the rule reads something: the memory's fields, and the writes to them)
  assert.ok(owner.size >= 30, `only ${owner.size} memory fields found`);
  assert.ok(all.length >= 30, `only ${all.length} writes found`);
  const found: Hit[] = [];
  for (const { f, w } of all) {
    const o = owner.get(w.name);
    if (o && o !== f.rel)
      found.push({ file: f.at, line: w.line, text: `${w.name} is ${o}'s` });
  }
  none('memory owners', found, 'a part writing another part’s memory');
});

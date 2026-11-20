// Architecture rules on how src is written, read from TypeScript's own syntax
// trees: one definition of everything (no two function bodies alike), every
// colour in its two homes, the UI's layout, pointers and markup each in one
// place, three's raw primitives behind their wrappers, comments that name only
// files that are there, files measured in what they say, and casts past the
// types only ever fewer. What a rule lets stand is in
// architecture/exceptions.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import ts from 'typescript';
import { EXCEPTIONS } from './architecture/exceptions.ts';
import {
  ROOT,
  comments,
  everywhere,
  files,
  hits,
  lineOf,
  none,
  tree,
  unused,
  visit,
  type Hit,
} from './architecture/scan.ts';

const RULES = [
  'clones',
  'colours',
  'layout',
  'pointers',
  'markup',
  'primitives',
  'paths',
  'statements',
  'casts',
  'non-null',
];

/**
 * The fewest tokens a function body has for a copy of it to count: under this,
 * a likeness is an idiom, not a copy.
 */
const CLONE = 30;

test('clones: no two function bodies in src are alike (their own names aside): one definition of everything', () => {
  const seen = new Map<string, Hit[]>();
  for (const f of files) {
    visit(tree(f), (n) => {
      if (
        !(
          ts.isFunctionDeclaration(n) ||
          ts.isArrowFunction(n) ||
          ts.isFunctionExpression(n) ||
          ts.isMethodDeclaration(n)
        ) ||
        !n.body
      )
        return;
      // the function's own names (its parameters and what it declares) read by
      // the order they come in, so a copy with its names changed is still a
      // copy
      const own = new Map<string, string>();
      const bind = (x: ts.Node) =>
        visit(x, (y) => {
          if (
            (ts.isParameter(y) ||
              ts.isVariableDeclaration(y) ||
              ts.isBindingElement(y)) &&
            ts.isIdentifier(y.name)
          )
            own.set(y.name.text, `$${own.size}`);
        });
      n.parameters.forEach(bind);
      bind(n.body);
      const tokens: string[] = [];
      const start = n.body.getStart();
      const scanner = ts.createScanner(
        ts.ScriptTarget.Latest,
        true,
        ts.LanguageVariant.Standard,
        f.text,
        undefined,
        start,
        n.body.getEnd() - start
      );
      for (
        let k = scanner.scan();
        k !== ts.SyntaxKind.EndOfFileToken;
        k = scanner.scan()
      ) {
        const t = scanner.getTokenText();
        tokens.push(
          k === ts.SyntaxKind.Identifier
            ? (own.get(t) ?? t)
            : k === ts.SyntaxKind.StringLiteral
              ? '""'
              : t
        );
      }
      if (tokens.length < CLONE) return;
      const key = tokens.join(' ');
      const name =
        ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)
          ? n.name?.getText()
          : undefined;
      seen.set(key, [
        ...(seen.get(key) ?? []),
        {
          file: f.at,
          line: lineOf(f, n.getStart()),
          name,
          text: `${tokens.length} tokens`,
        },
      ]);
    });
  }
  const found = [...seen.values()]
    .filter((at) => at.length > 1)
    .flatMap((at) =>
      at.map((h, i) => ({
        ...h,
        text: `${h.text}, the same as ${at
          .filter((_, j) => j !== i)
          .map((o) => `${o.file}:${o.line}`)
          .join(', ')}`,
      }))
    );
  none('clones', found, 'function bodies written twice');
});

test('colours: every colour is named in src/palette.ts (the world) or src/ui/ink.ts (the paper), the page included', () => {
  const COLOUR =
    /['"`]#[0-9A-Fa-f]{3,8}\b|#[0-9A-Fa-f]{6}\b|\b0x[0-9A-Fa-f]{6}\b|\b(rgba?|hsla?)\(/;
  const homes = ['palette.ts', 'ui/ink.ts'];
  const found = hits(COLOUR, (rel) => !homes.includes(rel));
  const page = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  page.split('\n').forEach((line, i) => {
    if (COLOUR.test(line.replace(/var\(--[\w-]+\)/g, '')))
      found.push({ file: 'index.html', line: i + 1, text: line.trim() });
  });
  none(
    'colours',
    found,
    'a colour outside src/palette.ts and src/ui/ink.ts (name it there)'
  );
});

test("layout: the page's size and layout are read in src/ui/ui.ts alone, which tells the rest", () => {
  const READS =
    /\b(getBoundingClientRect|clientWidth|clientHeight|offsetWidth|offsetHeight|innerWidth|innerHeight|getComputedStyle|devicePixelRatio)\b|addEventListener\(\s*['"]resize['"]/;
  none(
    'layout',
    hits(READS, (rel) => rel !== 'ui/ui.ts'),
    "the page's layout read outside src/ui/ui.ts"
  );
});

test('pointers: pointers are heard in src/ui/touch.ts (taps) and src/ui/input.ts (her hands on the sea) alone', () => {
  none(
    'pointers',
    hits(
      /addEventListener\(\s*['"]pointer/,
      (rel) => !['ui/touch.ts', 'ui/input.ts'].includes(rel)
    ),
    'a pointer heard elsewhere'
  );
});

test('markup: markup is written into the page by the UI alone (its own drawings, from its own numbers)', () => {
  none(
    'markup',
    hits(
      /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/,
      (rel) => !rel.startsWith('ui/')
    ),
    'markup written outside src/ui'
  );
});

test("primitives: three's raw primitives go through their wrappers; three's types are filled only where excepted", () => {
  none(
    'primitives',
    hits(/\bLoop\s*\(/, (rel) => rel !== 'tsl.ts'),
    "three's Loop outside src/tsl.ts (tsl.ts loop: its counter named)"
  );
  none(
    'primitives',
    hits(/\bnew\s+StorageTexture\b/, (rel) => rel !== 'gpu.ts'),
    'a StorageTexture made outside src/gpu.ts (gpu.ts storageTable)'
  );
  none(
    'primitives',
    hits(/\bdeclare\s+(module|global)\b/),
    "three's types filled in (a gap in them: an exception, with the three it was checked against)"
  );
});

/**
 * Where a path a comment names may be: from the comment's own folder, from src,
 * from the repo's root, or a file of the same name anywhere in it.
 */
const NAMES = new Set(everywhere.map((f) => basename(f.at)));
const there = (path: string, from: string) =>
  [
    resolve(dirname(from), path),
    resolve(ROOT, 'src', path),
    resolve(ROOT, path),
  ].some(existsSync) ||
  (!path.includes('/') && NAMES.has(path));

test('paths: a file a comment names is there', () => {
  const found = everywhere.flatMap((f) =>
    comments(f).flatMap((c) =>
      [
        ...c.text.matchAll(
          /(?<![\w.@/-])((?:[\w-]+\/)*[\w-]+\.(?:ts|html|sh))\b/g
        ),
      ]
        .filter((m) => !there(m[1], f.path))
        .map((m) => ({ file: f.at, line: c.line, text: m[1] }))
    )
  );
  none('paths', found, 'a file named in a comment that is not there');
});

/**
 * The most statements a file of src says. Measured in statements, not lines, so
 * wrapping a long line costs nothing and packing one saves nothing: past this,
 * split the module.
 */
const STATEMENTS = 320;

test(`statements: no file in src says more than ${STATEMENTS} statements`, () => {
  const found = files.flatMap((f) => {
    let n = 0;
    visit(tree(f), (x) => {
      if (
        ts.isVariableStatement(x) ||
        ts.isExpressionStatement(x) ||
        ts.isReturnStatement(x) ||
        ts.isIfStatement(x) ||
        ts.isIterationStatement(x, false) ||
        ts.isSwitchStatement(x) ||
        ts.isCaseClause(x) ||
        ts.isThrowStatement(x) ||
        ts.isTryStatement(x) ||
        ts.isBreakOrContinueStatement(x) ||
        ts.isFunctionDeclaration(x) ||
        ts.isClassDeclaration(x) ||
        ts.isInterfaceDeclaration(x) ||
        ts.isTypeAliasDeclaration(x) ||
        ts.isEnumDeclaration(x) ||
        ts.isMethodDeclaration(x) ||
        ts.isPropertyDeclaration(x)
      )
        n++;
    });
    return n > STATEMENTS
      ? [{ file: f.at, line: 1, text: `${n} statements` }]
      : [];
  });
  none('statements', found, `files over ${STATEMENTS} statements`);
});

/** A file's casts past the types (`as`, but `as const`) and its non-null assertions (`!`). */
const casts = (f: (typeof files)[number]) => {
  let as = 0,
    bang = 0;
  visit(tree(f), (x) => {
    if (ts.isAsExpression(x) && x.type.getText() !== 'const') as++;
    if (ts.isNonNullExpression(x)) bang++;
  });
  return { as, bang };
};

test('casts and non-null: a file of src asserts past its types no more than its exception says (none, if it has none), and those only come down', () => {
  for (const [rule, of] of [
    ['casts', 'as'],
    ['non-null', 'bang'],
  ] as const) {
    const found = files.flatMap((f) => {
      const n = casts(f)[of];
      const at =
        EXCEPTIONS.find((e) => e.rule === rule && e.file === f.at)?.at ?? 0;
      return n > at
        ? [{ file: f.at, line: 1, name: 'over', text: `${n}, at most ${at}` }]
        : n > 0 && n < at
          ? [
              {
                file: f.at,
                line: 1,
                name: 'down',
                text: `${n}: lower its exception to ${n}`,
              },
            ]
          : n > 0
            ? [{ file: f.at, line: 1, text: `${n}` }]
            : [];
    });
    // (an over or a down is never excused: the exception names neither)
    none(
      rule,
      found,
      rule === 'casts' ? 'casts past the types' : 'non-null assertions'
    );
  }
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

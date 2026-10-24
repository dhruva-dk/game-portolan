// The purity rules of src/sim and src/career (progress.html, Architecture A2): they import nothing outside the
// pure code, reach no global but an allowlist of exactly specified ones, call no transcendental Math function, and
// use none of the constructs that differ between engines or runs (the ** operator, clocks, timers, async, Intl and
// locale methods, for…in, Map/Set, Object.keys/values/entries, sorts without a comparator, string-formatted
// floats). The TypeScript checker resolves every identifier, so a local named `location` or a field `.window` is
// no violation, while the global `window` is. (Whether a sort comparator is a total order, ties broken by id, is
// for review: no lint can see it.)
//   node --test tests/sim/purity.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The pure areas, and the areas each may import from. */
const AREAS = [
  { dir: 'src/sim', mayImport: ['src/sim'] },
  { dir: 'src/career', mayImport: ['src/sim', 'src/career'] },
];

/** Globals whose every operation is exactly specified: same bits on every engine. */
const GLOBALS = new Set([
  'Math', 'Number', 'Array', 'ArrayBuffer', 'DataView', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array',
  'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array', 'Error', 'RangeError', 'TypeError', 'Infinity', 'NaN',
  'undefined',
]);
/** Math members that IEEE 754 rounds exactly, and its constants. */
const MATH = new Set([
  'sqrt', 'abs', 'floor', 'ceil', 'round', 'trunc', 'sign', 'min', 'max', 'imul', 'clz32', 'fround',
  'PI', 'E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT2', 'SQRT1_2',
]);
/** Methods that depend on the locale or format floats as strings, on any receiver. */
const BANNED_MEMBERS = new Set([
  'localeCompare', 'toLocaleString', 'toLocaleLowerCase', 'toLocaleUpperCase', 'toLocaleDateString',
  'toLocaleTimeString', 'toFixed', 'toPrecision', 'toExponential', 'parseFloat',
]);

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  noEmit: true,
  strict: true,
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'], // DOM globals resolve, so they can be caught
  types: [], // and Node's do not: `process` is an unknown identifier
};

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    return e.isDirectory() ? tsFiles(path) : e.name.endsWith('.ts') ? [path] : [];
  });
}

/** Every purity violation under `root`, as "file:line: what". */
export function purityViolations(root: string): string[] {
  const areas = AREAS.map((a) => ({ dir: join(root, a.dir) + sep, mayImport: a.mayImport.map((d) => join(root, d) + sep) }));
  const files = areas.flatMap((a) => tsFiles(a.dir));
  const program = ts.createProgram(files, OPTIONS);
  const checker = program.getTypeChecker();
  const src = join(root, 'src') + sep;
  const isLib = (d: ts.Declaration) => program.isSourceFileDefaultLibrary(d.getSourceFile());
  const isOurs = (d: ts.Declaration) => d.getSourceFile().fileName.startsWith(src) && !d.getSourceFile().fileName.includes(`${sep}node_modules${sep}`);
  const isGlobal = (node: ts.Node, name: string) => {
    if (!ts.isIdentifier(node) || node.text !== name) return false;
    const decls = checker.getSymbolAtLocation(node)?.declarations ?? [];
    return decls.length > 0 && decls.every(isLib);
  };
  const out: string[] = [];

  for (const file of files) {
    const sf = program.getSourceFile(file)!;
    const area = areas.find((a) => file.startsWith(a.dir))!;
    const report = (node: ts.Node, what: string) => {
      out.push(`${relative(root, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${what}`);
    };
    const inType = (node: ts.Node) => {
      for (let n: ts.Node | undefined = node.parent; n; n = n.parent) if (ts.isTypeNode(n)) return true;
      return false;
    };
    const checkReference = (node: ts.Identifier, symbol: ts.Symbol | undefined) => {
      const decls = symbol?.declarations ?? [];
      if (decls.length > 0 && decls.every(isOurs)) return;
      if (GLOBALS.has(node.text) && decls.every(isLib)) return;
      report(node, symbol ? `global ${node.text}` : `unknown identifier ${node.text}`);
    };

    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text, target = resolve(dirname(file), spec);
        if (!spec.startsWith('.') || !area.mayImport.some((d) => target.startsWith(d))) report(node, `imports ${spec}`);
      } else if (ts.isImportEqualsDeclaration(node) || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
        report(node, 'dynamic or CommonJS import');
      } else if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken
        || node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken)) {
        report(node, 'the ** operator');
      } else if (ts.isForInStatement(node)) {
        report(node, 'for…in');
      } else if (ts.isAwaitExpression(node) || (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))) {
        report(node, 'async');
      } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ['sort', 'toSorted'].includes(node.expression.name.text) && node.arguments.length === 0) {
        report(node, 'a sort without a comparator');
      } else if (ts.isPropertyAccessExpression(node)) {
        if (BANNED_MEMBERS.has(node.name.text)) report(node, `.${node.name.text}`);
        if (isGlobal(node.expression, 'Math') && !MATH.has(node.name.text)) report(node, `Math.${node.name.text}`);
      } else if (ts.isElementAccessExpression(node) && isGlobal(node.expression, 'Math')) {
        report(node, 'Math[…]');
      } else if (ts.isIdentifier(node)) {
        const p = node.parent;
        const memberName = (ts.isPropertyAccessExpression(p) && p.name === node) || ts.isQualifiedName(p);
        const label = ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p);
        if (!memberName && !label && !inType(node)) {
          checkReference(node, checker.getSymbolAtLocation(node));
          if (ts.isShorthandPropertyAssignment(p)) checkReference(node, checker.getShorthandAssignmentValueSymbol(p));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

test('src/sim and src/career are pure', () => {
  assert.deepEqual(purityViolations(ROOT), []);
});

test('the purity lint catches every banned construct, and only those', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'portolan-purity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path: string, lines: string[]) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), lines.join('\n') + '\n');
  };
  // Each seeded violation on its own line, with what the lint must say about it.
  const seeded: [string, string][] = [
    ["import * as THREE from 'three';", 'imports three'],
    ["import { view } from '../render/view.ts';", 'imports ../render/view.ts'],
    ["import { career } from '../career/ok.ts';", 'imports ../career/ok.ts'],
    ['export const a = Math.sin(1) + THREE + view + career;', 'Math.sin'],
    ['export const b = 2 ** 3;', 'the ** operator'],
    ['export let c = 1; c **= 2;', 'the ** operator'],
    ['export const d = Date.now();', 'global Date'],
    ['export const e = performance.now();', 'global performance'],
    ['export const f = Math.random();', 'Math.random'],
    ['export const g = new Map<number, number>();', 'global Map'],
    ['export const h = new Set<number>();', 'global Set'],
    ['for (const k in {}) void k;', 'for…in'],
    ['export const i = Object.keys({});', 'global Object'],
    ['export async function j() { return 0; }', 'async'],
    ['export const k = [3, 1].sort();', 'a sort without a comparator'],
    ["export const l = 'a'.localeCompare('b');", '.localeCompare'],
    ['export const m = (1.5).toFixed(2);', '.toFixed'],
    ['export const n = JSON.stringify({});', 'global JSON'],
    ['export const o = typeof window;', 'global window'],
    ['export const p = setTimeout(() => {}, 1);', 'global setTimeout'],
    ['export const q = Intl.NumberFormat;', 'global Intl'],
    ["export const r = Math['cos'](1);", 'Math[…]'],
    ['export const s = globalThis;', 'global globalThis'],
    ['export const u = process.env;', 'unknown identifier process'],
    ["export const v = import('./ok.ts');", 'dynamic or CommonJS import'],
    ['export const w = new Float64Array(2).toSorted();', 'a sort without a comparator'],
    ['export const x = Math.pow(2, 3) + Math.exp(1) + Math.atan2(1, 2);', 'Math.pow'],
    ['export const y = String(1.5);', 'global String'],
    ["export const z = parseFloat('1');", 'global parseFloat'],
    ['export const aa = new Promise<void>((done) => done());', 'global Promise'],
    ['export const ab = navigator.hardwareConcurrency;', 'global navigator'],
    ['export const ac = { location };', 'global location'],
    ['export const ad = crypto.getRandomValues(new Uint8Array(1));', 'global crypto'],
  ];
  write('src/sim/bad.ts', seeded.map(([line]) => line));
  // Allowed constructs that look like violations.
  write('src/sim/ok.ts', [
    "import { helper } from './helper.ts';",
    'interface Pose { location: number; window: number; sort: number[] }',
    'export function good(p: Pose, location: number): number {',
    '  const window = p.window + location;',
    '  const sorted = [3, 1, 2].sort((x, y) => x - y);',
    '  const m: Record<string, number> = { length: 3 };',
    '  const view = new DataView(new ArrayBuffer(8));',
    '  outer: for (const v of sorted) if (v > 2) break outer;',
    '  const hex = (255).toString(16);',
    '  return Math.sqrt(window) + Math.PI + Math.imul(3, 5) + Number.MAX_SAFE_INTEGER + m.length + view.byteLength',
    '    + helper(1) + p.location + p.sort.length + hex.length + (undefined ?? 0) + (Infinity > NaN ? 1 : 0);',
    '}',
  ]);
  write('src/sim/helper.ts', ['export const helper = (x: number): number => Math.abs(x);']);
  write('src/career/ok.ts', ["import { helper } from '../sim/helper.ts';", 'export const career = helper(2);']);
  write('src/career/bad.ts', ["import { ui } from '../ui/hud.ts';", 'export const b = ui;']);
  write('src/render/view.ts', ['export const view = Math.sin(1);']); // not pure code: never checked

  const found = purityViolations(root);
  const pow = seeded.findIndex(([line]) => line.includes('Math.pow')) + 1;
  const want = [
    ...seeded.map(([, what], i) => `src/sim/bad.ts:${i + 1}: ${what}`),
    `src/sim/bad.ts:${pow}: Math.exp`,
    `src/sim/bad.ts:${pow}: Math.atan2`,
    'src/career/bad.ts:1: imports ../ui/hud.ts',
  ];
  for (const w of want) assert.ok(found.includes(w), `caught: ${w}`);
  assert.deepEqual(found.filter((f) => !want.includes(f)), [], 'nothing else flagged');
});

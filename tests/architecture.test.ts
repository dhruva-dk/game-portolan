// Architecture rules, checked by plain text scanning of src/**/*.ts. Failures name file:line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const SRC = resolve(import.meta.dirname, '../src');

const walk = (dir: string): string[] =>
  !existsSync(dir)
    ? []
    : readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));

const files = walk(SRC).map((path) => ({ path, rel: relative(SRC, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }));

/** Lines with // comments removed (whole-line and trailing), so prose never trips a rule. Block-comment lines are blanked. */
const code = (text: string) => {
  let inBlock = false;
  return text.split('\n').map((line) => {
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end < 0) return '';
      inBlock = false;
      line = line.slice(end + 2);
    }
    line = line.replace(/\/\*.*?\*\//g, '');
    const open = line.indexOf('/*');
    if (open >= 0) {
      inBlock = true;
      line = line.slice(0, open);
    }
    return line.replace(/\/\/.*$/, '');
  });
};

/** Every line of src matching `pattern`, as "file:line: text"; `only`/`except` filter by src-relative path. */
const hits = (pattern: RegExp, keep: (rel: string) => boolean = () => true) =>
  files.filter((f) => keep(f.rel)).flatMap((f) => code(f.text).flatMap((line, i) => (pattern.test(line) ? [`src/${f.rel}:${i + 1}: ${line.trim()}`] : [])));

const none = (found: string[], rule: string) => assert.deepEqual(found, [], `${rule}:\n  ${found.join('\n  ')}`);

test('a. src/world is pure: no three, nothing outside src/world', () => {
  const found: string[] = [];
  for (const f of files.filter((f) => f.rel.startsWith('world/'))) {
    code(f.text).forEach((line, i) => {
      const spec = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/.exec(line)?.[1];
      if (spec === undefined) return;
      const bad = spec === 'three' || spec.startsWith('three/') || (spec.startsWith('.') && !(resolve(dirname(f.path), spec) + sep).startsWith(join(SRC, 'world') + sep)) || spec.startsWith('/');
      if (bad) found.push(`src/${f.rel}:${i + 1}: imports '${spec}'`);
    });
  }
  none(found, 'src/world may import only from src/world');
});

test('b. no file in src is over 450 lines', () => {
  const found = files.flatMap((f) => (f.text.split('\n').length - (f.text.endsWith('\n') ? 1 : 0) > 450 ? [`src/${f.rel}: ${f.text.split('\n').length} lines`] : []));
  none(found, 'files over 450 lines');
});

test('c. passes live in src/frame.ts only', () => {
  none(hits(/\b(RenderPipeline|PostProcessing)\b|\bpass\s*\(/, (rel) => rel !== 'frame.ts'), 'RenderPipeline, PostProcessing and pass( belong to src/frame.ts');
});

test('d. no three.js hacks', () => {
  none(hits(/\bonBeforeCompile\b/), 'onBeforeCompile');
  // Private members of three objects: an underscore-led member access (`x._foo`, `x['_foo']`) or the renderer's `.backend`.
  // Our own underscore names are never accessed this way, so on current code this matches nothing.
  none(hits(/[\w)\]]\s*\.\s*_[A-Za-z]|\[\s*['"]_[A-Za-z]|\.backend\b/), 'underscore-private member or .backend access');
  // Raw text, not comment-stripped: the directives live in comments.
  const found = files.flatMap((f) => f.text.split('\n').flatMap((line, i) => (/@ts-(ignore|expect-error|nocheck)/.test(line) ? [`src/${f.rel}:${i + 1}: ${line.trim()}`] : [])));
  none(found, '@ts-ignore / @ts-expect-error / @ts-nocheck');
});

test('e. no exported let/var (module state others could write)', () => {
  // Only `export let|var` is detectable reliably by text; mutable exported objects/arrays are indistinguishable from constants.
  none(hits(/^\s*export\s+(let|var)\b/), 'exported mutable binding');
});

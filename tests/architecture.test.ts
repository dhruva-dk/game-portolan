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

test('a2. src/sim is pure: no three, nothing outside src/sim and src/world', () => {
  const found: string[] = [];
  const within = (path: string, dir: string) => (path + sep).startsWith(join(SRC, dir) + sep);
  for (const f of files.filter((f) => f.rel.startsWith('sim/'))) {
    code(f.text).forEach((line, i) => {
      const spec = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/.exec(line)?.[1];
      if (spec === undefined) return;
      const to = resolve(dirname(f.path), spec);
      const bad = !spec.startsWith('.') || !(within(to, 'sim') || within(to, 'world'));
      if (bad) found.push(`src/${f.rel}:${i + 1}: imports '${spec}'`);
    });
  }
  none(found, 'src/sim may import only from src/sim and src/world');
});

test('b. no file in src is over 450 lines', () => {
  const found = files.flatMap((f) => (f.text.split('\n').length - (f.text.endsWith('\n') ? 1 : 0) > 450 ? [`src/${f.rel}: ${f.text.split('\n').length} lines`] : []));
  none(found, 'files over 450 lines');
});

test('c. passes live in src/frame.ts only', () => {
  none(hits(/\b(RenderPipeline|PostProcessing)\b|\bpass\s*\(/, (rel) => rel !== 'frame.ts'), 'RenderPipeline, PostProcessing and pass( belong to src/frame.ts');
});

test('d. no three.js hacks', () => {
  none(hits(/\bon(Before|After)(Compile|Render|Shadow)\b/), 'onBeforeCompile / onBeforeRender / onAfterRender hooks');
  none(hits(/\bas\s+unknown\s+as\b/), 'as unknown as (a cast past the types)');
  none(hits(/['"]three\/src\//), "deep import from 'three/src/' (only three's public entry points)");
  none(hits(/\.prototype\b/), '.prototype (patching classes)');
  // Private members of three objects: an underscore-led member access (`x._foo`, `x['_foo']`) or the renderer's `.backend`.
  // Our own underscore names are never accessed this way, so on current code this matches nothing.
  none(hits(/[\w)\]]\s*\.\s*_[A-Za-z]|\[\s*['"]_[A-Za-z]|\.backend\b/), 'underscore-private member or .backend access');
  // Raw text, not comment-stripped: the directives live in comments.
  const found = files.flatMap((f) => f.text.split('\n').flatMap((line, i) => (/@ts-(ignore|expect-error|nocheck)/.test(line) ? [`src/${f.rel}:${i + 1}: ${line.trim()}`] : [])));
  none(found, '@ts-ignore / @ts-expect-error / @ts-nocheck');
});

test('d2. no any in src: shader values are typed nodes (src/tsl.ts)', () => {
  none(hits(/:\s*any\b|=\s*any\b|\bas\s+any\b|<any>|\bany\[\]/), 'any (name the node type: src/tsl.ts)');
});

test('e. no exported let/var (module state others could write)', () => {
  // Only `export let|var` is detectable reliably by text; mutable exported objects/arrays are indistinguishable from constants.
  none(hits(/^\s*export\s+(let|var)\b/), 'exported mutable binding');
});

test('f. the frame owns every GPU pass and the renderer', () => {
  // Systems say what is due (gpu.ts); only src/frame.ts dispatches it, and only it sets the renderer up.
  // src/main.ts may construct and initialise the renderer, src/meter.ts read its timings.
  const notFrame = (rel: string) => rel !== 'frame.ts';
  none(hits(/\brenderer\s*\.\s*(render|renderAsync|compute|computeAsync)\b|\.computeAsync\s*\(/, notFrame), 'renderer.render / renderer.compute outside src/frame.ts');
  // (main.ts calls the frame's own render)
  none(hits(/(?<!\bframe)\.render(Async)?\s*\(/, notFrame), '.render( outside src/frame.ts');
  none(hits(/\.(setRenderTarget|setClearColor|setClearAlpha|setPixelRatio)\s*\(|\.toneMapping\w*\s*=(?!=)/, notFrame), 'renderer configuration outside src/frame.ts');
  // no system is handed the renderer: its type is named only where it is made, set up and read
  none(hits(/\b(WebGPURenderer|Renderer)\b/, (rel) => !['frame.ts', 'main.ts', 'meter.ts'].includes(rel)), 'the renderer type outside src/frame.ts, src/main.ts and src/meter.ts');
});

test('f2. the frame draws a snapshot: it alone makes the camera, works out the environment and touches its systems', () => {
  const notFrame = (rel: string) => rel !== 'frame.ts';
  none(hits(/\bnew\s+PerspectiveCamera\b/, notFrame), 'a camera made outside src/frame.ts (hand it an Eye: src/snapshot.ts)');
  none(hits(/\benvironmentAt\s*\(/, (rel) => !['frame.ts', 'environment.ts'].includes(rel)), 'environmentAt outside src/frame.ts (it alone works out the environment)');
  none(hits(/\btypeof\s+createFrame\b/, notFrame), 'the frame\'s type named outside src/frame.ts');
  // what the rest of the game may ask of the frame: no camera, scene, sky, fleet or gunfire of its to reach into
  const caller = (rel: string) => rel === 'main.ts' || rel === 'debug.ts' || rel.startsWith('play/') || rel.startsWith('ui/');
  none(hits(/\bframe\s*\??\.\s*(?!(resize|render|ready|anchors)\b)\w/, caller), 'frame.<x> other than resize, render, ready and anchors');
  // the environment is plain data built each frame, written by nobody
  none(hits(/\benv\s*\.\s*\w+\s*(\+|-|\*|\/)?=(?!=)/), 'a write to the environment');
});

test('g. src/world and src/sim are deterministic and headless', () => {
  none(
    hits(/\bMath\.random\b|\bDate\b|\bperformance\b|\b(document|window|self|globalThis|navigator|location)\b/, (rel) => rel.startsWith('world/') || rel.startsWith('sim/')),
    'Math.random, Date, performance or a browser global in src/world or src/sim',
  );
});

test('h. the debug switches live in src/debug.ts alone, set going by one call from src/main.ts', () => {
  none(hits(/\blocation\b|\bURLSearchParams\b|\bswitches\s*\./, (rel) => rel !== 'debug.ts'), "the page's query read outside src/debug.ts");
  none(hits(/['"]\.{1,2}\/(\.\.\/)*debug(\.ts)?['"]/, (rel) => rel !== 'main.ts'), 'src/debug.ts imported other than by src/main.ts');
  const main = code(files.find((f) => f.rel === 'main.ts')!.text).join('\n');
  const taken = [...main.matchAll(/import\s*{([^}]*)}\s*from\s*['"]\.\/debug['"]/g)]
    .flatMap((m) => m[1].split(',').map((n) => n.trim()).filter((n) => n && !n.startsWith('type ')));
  assert.deepEqual(taken, ['scenario'], 'src/main.ts takes only scenario (and types) from src/debug.ts');
  assert.equal(main.match(/\bscenario\s*\(/g)?.length, 1, 'src/main.ts calls scenario once');
});

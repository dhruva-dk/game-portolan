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

/**
 * The layers: for every part of src (a top-level folder, or a top-level file), what it may import. An entry is a
 * folder ('world/'), a file ('sky/light.ts'), 'three' (three and its addons) or '*' (anything). A part's own folder
 * is listed like any other. Any import not in its part's row fails, and so does a part with no row.
 */
const NEUTRAL = ['snapshot.ts', 'player.ts', 'environment.ts'];
/** What every render folder may draw on: three, the world, the GPU's plumbing, the plain seams, and the shared light. */
const RENDER = ['three', 'world/', 'gpu.ts', 'tsl.ts', 'textures.ts', 'snapshot.ts', 'environment.ts', 'sky/light.ts'];
const LAYERS: Record<string, readonly string[]> = {
  // the world and the simulation: pure, headless, deterministic (test g)
  'world/': ['world/'],
  'sim/': ['sim/', 'world/'],
  // the plain-data seams: what the frame draws (snapshot.ts), what passes between the player and the game (player.ts),
  // and the world as built for a match (environment.ts)
  'snapshot.ts': ['world/', 'sim/storm.ts'],
  'player.ts': ['world/'],
  'environment.ts': ['world/'],
  // the UI draws plain data: of the sim only the storm's Cap (the full map inks it)
  'ui/': ['ui/', 'world/', 'sim/storm.ts', 'snapshot.ts', 'player.ts'],
  // the game runs the sim and says what to draw and show, as plain data
  'play/': ['play/', 'sim/', 'world/', ...NEUTRAL],
  // what draws the world; each sideways import named
  'view/': ['view/', ...RENDER],
  'sky/': ['sky/', ...RENDER, 'view/view.ts', 'sim/storm.ts'],
  'land/': ['land/', ...RENDER, 'view/view.ts', 'view/cube.ts'],
  'ship/': ['ship/', ...RENDER, 'view/view.ts'],
  'gunfire/': ['gunfire/', ...RENDER, 'view/view.ts'],
  'water/': ['water/', ...RENDER, 'view/', 'sky/sky.ts', 'land/ground.ts', 'ship/build.ts', 'ship/materials.ts', 'ship/waterline.ts', 'sim/wake.ts'],
  'gpu.ts': ['three'],
  'tsl.ts': ['three'],
  'textures.ts': ['three'],
  'frame.ts': ['three', 'gpu.ts', 'tsl.ts', 'snapshot.ts', 'environment.ts', 'world/', 'view/', 'sky/', 'land/', 'water/', 'ship/', 'gunfire/'],
  'meter.ts': ['three'],
  // the debug tools, and the switches that drive the game through what it offers anyone
  'fly.ts': ['three', 'world/', 'snapshot.ts'],
  'probe.ts': ['three', 'world/', 'sky/sky.ts'],
  'debug.ts': [
    'play/colours.ts', 'play/game.ts', 'play/referee.ts', 'play/setup.ts', 'play/state.ts', 'ui/flow.ts', 'ui/ui.ts', ...NEUTRAL, 'frame.ts', 'world/',
    'sim/fixed.ts', 'sim/handling.ts', 'sim/match.ts', 'sim/storm.ts', 'fly.ts', 'probe.ts',
  ],
  'main.ts': ['*'],
};

/** The part of src a src-relative path belongs to. */
const partOf = (rel: string) => (rel.includes('/') ? `${rel.split('/')[0]}/` : rel);

test('a. the layers: every import is one its part of src may make (LAYERS), and every part has a row', () => {
  const found: string[] = [];
  for (const f of files) {
    const part = partOf(f.rel), row = LAYERS[part];
    if (!row) {
      found.push(`src/${f.rel}: no row for '${part}'`);
      continue;
    }
    code(f.text).forEach((line, i) => {
      for (const m of line.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bnew\s+URL\s*\(\s*)['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        const to = spec.startsWith('.')
          ? relative(SRC, resolve(dirname(f.path), spec)).split(sep).join('/').replace(/(\.ts)?$/, '.ts')
          : spec === 'three' || spec.startsWith('three/') ? 'three' : spec;
        const ok = row.some((e) => e === '*' || e === to || (e.endsWith('/') && to.startsWith(e)));
        if (!ok) found.push(`src/${f.rel}:${i + 1}: '${part}' imports '${spec}'`);
      }
    });
  }
  const parts = new Set(files.map((f) => partOf(f.rel)));
  for (const part of Object.keys(LAYERS)) if (!parts.has(part)) found.push(`LAYERS has a row for '${part}', which is not in src`);
  none(found, 'imports outside the layers');
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
  none(hits(/['"]\.{1,2}\/(\.\.\/)*debug(\.ts)?['"]/, (rel) => rel !== 'main.ts'), 'src/debug.ts imported other than by src/main.ts');  const main = code(files.find((f) => f.rel === 'main.ts')!.text).join('\n');
  const taken = [...main.matchAll(/import\s*{([^}]*)}\s*from\s*['"]\.\/debug['"]/g)]
    .flatMap((m) => m[1].split(',').map((n) => n.trim()).filter((n) => n && !n.startsWith('type ')));
  assert.deepEqual(taken, ['scenario'], 'src/main.ts takes only scenario (and types) from src/debug.ts');
  assert.equal(main.match(/\bscenario\s*\(/g)?.length, 1, 'src/main.ts calls scenario once');
});

test('i. the game touches no page: src/play neither reads nor makes the DOM (ui/ does, and main.ts wires them)', () => {
  none(
    hits(/\b(document|window|HTMLElement|HTMLDivElement|Element|innerWidth|innerHeight|addEventListener|localStorage|requestAnimationFrame|getComputedStyle)\b|\.(createElement|appendChild|style|clientWidth|clientHeight)\b/, (rel) => rel.startsWith('play/')),
    'the DOM in src/play',
  );
});

test('i2. the UI draws plain data: src/ui imports nothing from play/, three or what draws the world', () => {
  const found: string[] = [];
  const RENDER = ['sky', 'water', 'land', 'ship', 'gunfire', 'view'], FILES = ['frame.ts', 'gpu.ts', 'tsl.ts', 'textures.ts'];
  for (const f of files.filter((f) => f.rel.startsWith('ui/'))) {
    code(f.text).forEach((line, i) => {
      const spec = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/.exec(line)?.[1];
      if (spec === undefined) return;
      const to = relative(SRC, resolve(dirname(f.path), spec)).split(sep).join('/');
      const top = to.split('/')[0];
      const bad = spec === 'three' || spec.startsWith('three/') || top === 'play' || RENDER.includes(top) || FILES.includes(to) || FILES.includes(`${to}.ts`);
      if (bad) found.push(`src/${f.rel}:${i + 1}: imports '${spec}'`);
    });
  }
  none(found, 'src/ui importing play/, three or a render module');
});

/** The files that may say they stand in for something, and why. */
const STAND_INS: Record<string, string> = {
  'play/placeholder.ts': 'what the HUD shows and does that nothing in the game has yet (items, Gust, her career), held in one place',
};

test('j. nothing in src says it is temporary or a hack, comments included, but the stand-ins (STAND_INS)', () => {
  // raw text, comments and all; a stand-in named by its path (an import, a reference) is not the word
  const named = (line: string) => Object.keys(STAND_INS).reduce((l, p) => l.replaceAll(p.replace(/\.ts$/, ''), ''), line);
  const found = files.filter((f) => !(f.rel in STAND_INS)).flatMap((f) => f.text.split('\n').flatMap((line, i) =>
    /\b(temporary|for now|placeholders?|hacks?|hacky|workarounds?|fixme|todo)\b/i.test(named(line)) ? [`src/${f.rel}:${i + 1}: ${line.trim()}`] : []));
  none(found, 'words of temporary work (TEMPORARY, for now, placeholder, hack, workaround, FIXME, TODO)');
});

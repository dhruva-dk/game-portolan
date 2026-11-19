// Architecture rules, checked by plain text scanning of src/**/*.ts (and, for the rules against casting past the types,
// any and silencing the checker, of tests/ and tools/ too). Failures name file:line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'src');

const walk = (dir: string): string[] =>
  !existsSync(dir)
    ? []
    : readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));

/** A folder's files: `rel` from that folder (src's rules name src-relative paths), `at` from the repo's root. */
const read = (dir: string) => walk(resolve(ROOT, dir)).map((path) => ({
  path, rel: relative(resolve(ROOT, dir), path).split(sep).join('/'), at: relative(ROOT, path).split(sep).join('/'), text: readFileSync(path, 'utf8'),
}));
type Scanned = ReturnType<typeof read>[number];

const files = read('src');
/** src, the tests and the tools: what the rules on the types hold for. */
const everywhere = [...files, ...read('tests'), ...read('tools')];

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

/** Every line of src (or of `among`) matching `pattern`, as "file:line: text"; `keep` filters by src-relative path. */
const hits = (pattern: RegExp, keep: (rel: string) => boolean = () => true, among: readonly Scanned[] = files) =>
  among.filter((f) => keep(f.rel)).flatMap((f) => code(f.text).flatMap((line, i) => (pattern.test(line) ? [`${f.at}:${i + 1}: ${line.trim()}`] : [])));
/** The same, in src, the tests and the tools. */
const anywhere = (pattern: RegExp) => hits(pattern, undefined, everywhere);

const none = (found: string[], rule: string) => assert.deepEqual(found, [], `${rule}:\n  ${found.join('\n  ')}`);

/**
 * The layers: for every part of src (a top-level folder, or a top-level file), what it may import. An entry is a
 * folder ('world/'), a file ('sky/light.ts'), 'three' (three and its addons) or '*' (anything). A part's own folder
 * is listed like any other. Any import not in its part's row fails, and so does a part with no row.
 */
const NEUTRAL = ['snapshot.ts', 'player.ts', 'environment.ts', 'kinds.ts'];
/** What every render folder may draw on: three, the world, the GPU's plumbing, the plain seams, the palette, and the
 *  shared light. */
const RENDER = ['three', 'world/', 'gpu.ts', 'tsl.ts', 'colour.ts', 'palette.ts', 'snapshot.ts', 'environment.ts', 'sky/light.ts'];
const LAYERS: Record<string, readonly string[]> = {
  // the world and the simulation: pure, headless, deterministic (test g)
  'world/': ['world/'],
  'sim/': ['sim/', 'world/', 'kinds.ts'],
  // the kinds of gun and of loot, named once for all who tell them apart: a leaf
  'kinds.ts': [],
  // the plain-data seams: what the frame draws (snapshot.ts), what passes between the player and the game (player.ts),
  // and the world as built for a match (environment.ts)
  'snapshot.ts': ['world/', 'sim/storm.ts', 'kinds.ts'],
  'player.ts': ['world/', 'kinds.ts'],
  // the rarities' inks, for the two that draw them
  'rarity.ts': [],
  // sRGB to linear light and back, written once: for the palette, what draws the world and the UI
  'colour.ts': ['world/scalar.ts'],
  // every colour of the world, named once, for what draws the world and for the ships' colours (play/colours.ts)
  'palette.ts': ['colour.ts'],
  'environment.ts': ['world/'],
  // the UI draws plain data: of the sim only the storm's Cap (the full map inks it)
  'ui/': ['ui/', 'world/', 'sim/storm.ts', 'snapshot.ts', 'player.ts', 'rarity.ts', 'kinds.ts', 'colour.ts'],
  // the sound: hears what the frame draws and the HUD reads, and the screen shown (player.ts Screen)
  'audio/': ['audio/', 'world/', 'snapshot.ts', 'player.ts', 'kinds.ts'],
  // the game runs the sim and says what to draw and show, as plain data
  'play/': ['play/', 'sim/', 'world/', 'palette.ts', ...NEUTRAL],
  // what draws the world; each sideways import named
  'view/': ['view/', ...RENDER],
  'sky/': ['sky/', ...RENDER, 'view/view.ts', 'sim/storm.ts'],
  'land/': ['land/', ...RENDER, 'view/view.ts', 'view/cube.ts'],
  'ship/': ['ship/', ...RENDER, 'view/view.ts', 'kinds.ts'],
  'gunfire/': ['gunfire/', ...RENDER, 'view/view.ts', 'kinds.ts'],
  // the post chain's steps (grade, bloom, film): nodes over the frame's light, composed by the frame
  'post/': ['post/', 'three', 'tsl.ts', 'world/scalar.ts', 'colour.ts', 'palette.ts'],
  // the loot on the water, its pieces and their beacons
  'loot/': ['loot/', ...RENDER, 'view/view.ts', 'rarity.ts', 'ship/gun.ts', 'kinds.ts'],
  'water/': ['water/', ...RENDER, 'view/', 'sky/sky.ts', 'land/ground.ts', 'ship/build.ts', 'ship/materials.ts', 'ship/waterline.ts', 'sim/wake.ts'],
  'gpu.ts': ['three'],
  'tsl.ts': ['three'],
  'frame.ts': ['three', 'gpu.ts', 'tsl.ts', 'palette.ts', 'snapshot.ts', 'environment.ts', 'load.ts', 'world/', 'view/', 'sky/', 'land/', 'water/', 'ship/', 'gunfire/', 'loot/', 'post/'],
  'meter.ts': ['three'],
  // the load's stages, said as reached: a leaf, for the page and the frame
  'load.ts': [],
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
  none(anywhere(/\bas\s+unknown\s+as\b/), 'a cast through unknown, past the types (in src, tests or tools)');
  none(hits(/['"]three\/src\//), "deep import from 'three/src/' (only three's public entry points)");
  none(hits(/\.prototype\b/), '.prototype (patching classes)');
  // Private members of three objects: an underscore-led member access (`x._foo`, `x['_foo']`) or the renderer's `.backend`.
  // Our own underscore names are never accessed this way, so on current code this matches nothing.
  none(hits(/[\w)\]]\s*\.\s*_[A-Za-z]|\[\s*['"]_[A-Za-z]|\.backend\b/), 'underscore-private member or .backend access');
  // Raw text, not comment-stripped: the directives live in comments. (This file names them only as a pattern, which the
  // pattern does not match, so it holds itself to the rule.)
  const found = everywhere.flatMap((f) => f.text.split('\n').flatMap((line, i) => (/@ts-(ignore|expect-error|nocheck)\b/.test(line) ? [`${f.at}:${i + 1}: ${line.trim()}`] : [])));
  none(found, 'a directive silencing the type checker (ts-ignore, ts-expect-error, ts-nocheck) in src, tests or tools');
});

test('d2. no any in src, tests or tools: shader values are typed nodes (src/tsl.ts)', () => {
  none(anywhere(/:\s*any\b|=\s*any\b|\bas\s+any\b|<\s*any\s*>|\bany\[\]/), 'any (name the type; for a node, src/tsl.ts)');
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
  // what only the switches ask of the game is its `debug`, reached from src/debug.ts (and the game's own, from its state)
  none(hits(/\.\s*debug\s*\./, (rel) => rel !== 'debug.ts' && rel !== 'play/game.ts'), "the game's debug surface reached outside src/debug.ts");
});

test('i. the game touches no page: src/play neither reads nor makes the DOM (ui/ does, and main.ts wires them)', () => {
  none(
    hits(/\b(document|window|HTMLElement|HTMLDivElement|Element|innerWidth|innerHeight|addEventListener|localStorage|requestAnimationFrame|getComputedStyle)\b|\.(createElement|appendChild|style|clientWidth|clientHeight)\b/, (rel) => rel.startsWith('play/')),
    'the DOM in src/play',
  );
});

test('i2. the UI draws plain data: src/ui imports nothing from play/, three or what draws the world', () => {
  const found: string[] = [];
  const RENDER = ['sky', 'water', 'land', 'ship', 'gunfire', 'view', 'post'], FILES = ['frame.ts', 'gpu.ts', 'tsl.ts'];
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

test('f3. the view owns the eye: a perspective camera is named only in src/frame.ts and src/view/, and only they, the meter and the systems with cameras of their own read one', () => {
  none(hits(/\bPerspectiveCamera\b/, (rel) => rel !== 'frame.ts' && !rel.startsWith('view/')), 'PerspectiveCamera outside src/frame.ts and src/view/ (take the eye: view.eye)');
  // the shadow map's and the wake's cameras are their own, orthographic, looking down on what they map
  const own = ['frame.ts', 'meter.ts', 'land/shadow.ts', 'water/wake.ts'];
  none(hits(/\b(projectionMatrix|matrixWorldInverse|projectionMatrixInverse|getWorldPosition)\b/, (rel) => !own.includes(rel) && !rel.startsWith('view/')), "a camera's matrices read outside src/frame.ts and src/view/ (view.eye has them)");
});

/** The files that may take a colour toward its grey (a desaturation), and why: the rest leave the palette's colours as chosen. */
const DESATURATE: Record<string, string> = {
  'post/grade.ts': "the look's saturation, overall and by hue",
  'sky/light.ts': "how much of the sky's tint the light carries (TINTED)",
  'sky/cloud-field.ts': "how much of the sun's colour a cloud's lit side takes (WARMED)",
};

test('k. colour: every colour of the world is named in src/palette.ts, luma is three\'s luminance(), and only DESATURATE moves a colour toward its grey', () => {
  // the HUD's inks are its own (src/ui), drawn on paper, not lit
  none(hits(/['"`]#[0-9A-Fa-f]{6}\b/, (rel) => rel !== 'palette.ts' && !rel.startsWith('ui/')), 'a hex colour outside src/palette.ts and src/ui (name it in the palette)');
  // (the palette's tint works on the CPU, before any shader)
  none(hits(/0\.2126|0\.7152|\b0\.299\b|\b0\.587\b/, (rel) => rel !== 'palette.ts'), "hand-written luma weights (three's luminance())");
  none(hits(/mix\(\s*vec3\(\s*(luminance|dot)\(/, (rel) => !(rel in DESATURATE)), 'a desaturation outside DESATURATE');
  const desaturating = new Set(hits(/mix\(\s*vec3\(\s*(luminance|dot)\(/, () => true).map((h) => h.split(':')[0].replace(/^src\//, '')));
  none(Object.keys(DESATURATE).filter((rel) => !desaturating.has(rel)), 'a DESATURATE entry with no desaturation left in it');
});

test('l. comments say why, not which review or reference asked: no review rounds or reference images named in src or tools', () => {
  const found = [...files, ...read('tools')].flatMap((f) => f.text.split('\n').flatMap((line, i) =>
    /\breview\s*#?\d|\bround\s*#?\d+\b(?!\s*(trip|off|up|down))|idea\.png|art\/target|reference image|\btarget\.png\b/i.test(line) ? [`${f.at}:${i + 1}: ${line.trim()}`] : []));
  none(found, 'a review round or reference image named');
});

/** The parameters of a parenthesised list starting at text[open] ('('): its top-level commas, plus one if not empty. */
const parameters = (text: string, open: number) => {
  let depth = 0, count = 0, any = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '=' && text[i + 1] === '>') { i++; continue; }
    if ('([{<'.includes(c)) depth++;
    else if (')]}>'.includes(c)) { if (--depth === 0) return any ? count + 1 : 0; }
    else if (c === ',' && depth === 1) count++;
    else if (depth === 1 && !/\s/.test(c)) any = true;
  }
  return count;
};
/** The most parameters an exported function takes: past this, the caller passes a named record (water/optics.ts Surface). */
const MOST = 5;
/** Those that took more when the rule came in, at what they took: a ratchet. Each may come down (and leave the list),
 *  never go up; nothing new joins it. */
const OVER: Record<string, number> = {
  'audio/dsp.ts design': 6, 'audio/dsp.ts filter': 7, 'audio/dsp.ts slips': 6, 'audio/dsp.ts bubbles': 7, 'audio/dsp.ts crackle': 6,
  'audio/sounds/blows.ts timber': 7, 'land/site.ts standing': 6,
  'ship/kit.ts rod': 8, 'ship/kit.ts rope': 7, 'ship/kit.ts box': 6, 'ship/kit.ts beam': 7,
  'sim/battle.ts stepBattle': 8, 'sim/bot.ts think': 6, 'sim/gun.ts chosen': 6, 'sim/gun.ts laid': 9, 'sim/gunner.ts ring': 8,
  'sim/gunner.ts aimAndFire': 9, 'sim/ride.ts settled': 6, 'sim/shot.ts loosed': 7, 'sim/stores.ts stored': 9, 'sim/stores.ts spilled': 6,
  'sim/utility.ts choose': 6, 'ui/disc.ts laid': 7, 'ui/ink.ts bar': 6, 'ui/ink.ts ring': 6,
  'water/water.ts createWater': 7, 'world/cells.ts trace': 6, 'world/lattice.ts weighInto': 7,
  'world/sphere.ts chartAt': 6,
};

test('m. an exported function takes at most MOST parameters, but those in OVER, which only come down', () => {
  const seen = new Map<string, number>();
  for (const f of files) {
    const text = code(f.text).join('\n');
    for (const m of text.matchAll(/\bexport\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^(]*>)?\s*\(|\bexport\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/g)) {
      seen.set(`${f.rel} ${m[1] ?? m[2]}`, parameters(text, m.index + m[0].length - 1));
    }
  }
  const found = [...seen].flatMap(([name, n]) => (n > (OVER[name] ?? MOST) ? [`src/${name} takes ${n} (at most ${OVER[name] ?? MOST})`] : []));
  none(found, `exported functions over ${MOST} parameters, or over what they took (OVER)`);
  const stale = Object.entries(OVER).filter(([name, n]) => (seen.get(name) ?? 0) < n).map(([name]) => name);
  none(stale, 'OVER entries that came down or went: lower or remove them');
});

test('n. the lighting interface is the six ways a surface is lit (sky/light.ts Light): a new look is a tone, not a new member', () => {
  const text = files.find((f) => f.rel === 'sky/light.ts')!.text;
  const body = /export interface Light \{([\s\S]*?)\n\}/.exec(text)![1];
  const members = [...body.matchAll(/^\s{2}(\w+)\s*[(:]/gm)].map((m) => m[1]);
  assert.deepEqual(members, ['toon', 'polished', 'leaf', 'band', 'sides', 'level']);
});

/** The files that may say they stand in for something, and why. */
const STAND_INS: Record<string, string> = {};

test('j. nothing in src says it is temporary or a hack, comments included, but the stand-ins (STAND_INS)', () => {
  // raw text, comments and all; a stand-in named by its path (an import, a reference) is not the word
  const named = (line: string) => Object.keys(STAND_INS).reduce((l, p) => l.replaceAll(p.replace(/\.ts$/, ''), ''), line);
  const found = files.filter((f) => !(f.rel in STAND_INS)).flatMap((f) => f.text.split('\n').flatMap((line, i) =>
    /\b(temporary|for now|placeholders?|hacks?|hacky|workarounds?|fixme|todo)\b/i.test(named(line)) ? [`src/${f.rel}:${i + 1}: ${line.trim()}`] : []));
  none(found, 'words of temporary work (TEMPORARY, for now, placeholder, hack, workaround, FIXME, TODO)');
});

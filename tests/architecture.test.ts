// Architecture rules on src: the layers, who owns the passes, the renderer and
// the camera, the deterministic core, the debug switches, colour, and what a
// function and an interface may take. Each finding names file:line. What a rule
// lets stand is in one table (architecture/exceptions.ts), each with its
// reason; the rest of the rules are in architecture-*.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { EXCEPTIONS } from './architecture/exceptions.ts';
import {
  ROOT,
  anywhere,
  everywhere,
  files,
  hits,
  imports,
  lineOf,
  none,
  tree,
  unused,
  type Hit,
} from './architecture/scan.ts';

/**
 * The layers: for every part of src (a top-level folder, or a top-level file),
 * what it may import. An entry is a folder ('world/'), a file ('sky/light.ts'),
 * 'three' (three and its addons) or '*' (anything). A part's own folder is
 * listed like any other. Any import not in its part's row fails, and so does a
 * part with no row.
 */
const NEUTRAL = ['snapshot.ts', 'player.ts', 'environment.ts', 'kinds.ts'];
/**
 * What every render folder may draw on: three, the world, the GPU's plumbing,
 * the plain seams, the palette, and the shared light.
 */
const RENDER = [
  'three',
  'world/',
  'gpu.ts',
  'tsl.ts',
  'colour.ts',
  'palette.ts',
  'snapshot.ts',
  'environment.ts',
  'sky/light.ts',
];
const LAYERS: Record<string, readonly string[]> = {
  // the world and the simulation: pure, headless, deterministic (determinism);
  // world/'s own tiers are architecture-graph.test.ts's
  'world/': ['world/'],
  // (of race.ts, the card a race is sailed by: sim/carded.ts reads it)
  'sim/': ['sim/', 'world/', 'kinds.ts', 'race.ts'],
  // the kinds of gun and of loot, named once for all who tell them apart: a
  // leaf
  'kinds.ts': [],
  // the seam between the career and a race (MANAGER.md): the card that goes in
  // and the result that comes out, as plain data
  'race.ts': ['kinds.ts'],
  // the plain-data seams: what the frame draws (snapshot.ts), what passes
  // between the player and the game (player.ts), and the world as built for a
  // match (environment.ts)
  'snapshot.ts': ['world/', 'sim/storm.ts', 'kinds.ts'],
  // (of race.ts, a team's calls: the race's HUD shows and changes hers)
  'player.ts': ['world/', 'kinds.ts', 'race.ts'],
  // the rarities' inks, for the two that draw them sRGB to linear light and
  // back, written once: for the palette, what draws the world and the UI
  'colour.ts': ['world/scalar.ts'],
  // every colour of the world, named once, for what draws the world and for the
  // ships' colours (play/colours.ts)
  'palette.ts': ['colour.ts'],
  'environment.ts': ['world/'],
  // the seed in the page's address: read, rolled, and sailed onto a new page
  'address.ts': ['world/'],
  // the seam between the career and the office (MANAGER.md): each screen's
  // view and what it asks, as plain data; its fixtures (the debug page's desk)
  // name the palette's dyes
  'office/': ['office/', 'race.ts', 'kinds.ts', 'colour.ts', 'palette.ts'],
  // the career: pure, headless, deterministic (determinism), a reducer over a
  // journal; it deals race cards and takes results (race.ts), and builds the
  // office's views (the seam's words, commands and views); it never runs a
  // race (no play/, no sim/) and never draws (no ui/)
  'career/': ['career/', 'office/', 'race.ts', 'kinds.ts', 'world/random.ts'],
  // where the career's journal is kept: memory and IndexedDB
  // (career/store.ts Store)
  'store/': ['store/', 'career/store.ts'],
  // the career's desk: its session on a store, as the office asks for it; and
  // the fixture careers it is opened on, made by the commands a player sends
  'desk.ts': ['career/', 'store/', 'office/', 'race.ts'],
  'desk-fixtures.ts': ['desk.ts', 'career/', 'store/', 'office/'],
  // the manager's game: the office's desk over the career's, and race day run
  // on the page through what the page hands it (it names no game, no UI)
  'manager.ts': ['desk.ts', 'career/', 'office/', 'race.ts'],
  // the UI draws plain data: of the sim only the storm's Cap (the full map inks
  // it); the office's screens draw the seam's views
  'ui/': [
    'ui/',
    'office/',
    'world/',
    'sim/storm.ts',
    'snapshot.ts',
    'player.ts',
    'kinds.ts',
    'colour.ts',
  ],
  // the sound: hears what the frame draws and the HUD reads, and the screen
  // shown (player.ts Screen)
  'audio/': ['audio/', 'world/', 'snapshot.ts', 'player.ts', 'kinds.ts'],
  // the game runs the sim and says what to draw and show, as plain data
  'play/': ['play/', 'sim/', 'world/', 'palette.ts', 'race.ts', ...NEUTRAL],
  // what draws the world; each sideways import named
  'view/': ['view/', ...RENDER],
  // (of sim/storm.ts its Cap and CLOUD: the storm's state is the snapshot's)
  'sky/': ['sky/', ...RENDER, 'view/view.ts', 'sim/storm.ts'],
  'land/': ['land/', ...RENDER, 'view/view.ts', 'view/cube.ts'],
  'ship/': ['ship/', ...RENDER, 'view/view.ts', 'kinds.ts'],
  'gunfire/': ['gunfire/', ...RENDER, 'view/view.ts', 'kinds.ts'],
  // the post chain's steps (grade, bloom, film): nodes over the frame's light,
  // composed by the frame
  'post/': [
    'post/',
    'three',
    'tsl.ts',
    'world/scalar.ts',
    'colour.ts',
    'palette.ts',
  ],
  // the loot on the water, its pieces and their beacons
  'loot/': [
    'loot/',
    ...RENDER,
    'view/view.ts',
    'ship/gun.ts',
    'ship/gun-shape.ts',
    'kinds.ts',
  ],
  'water/': [
    'water/',
    ...RENDER,
    'view/',
    'sky/sky.ts',
    'land/ground.ts',
    'ship/build.ts',
    'ship/materials.ts',
    'ship/waterline.ts',
    'sim/wake.ts',
  ],
  'gpu.ts': ['three'],
  'tsl.ts': ['three'],
  'frame.ts': [
    'three',
    'gpu.ts',
    'tsl.ts',
    'palette.ts',
    'snapshot.ts',
    'environment.ts',
    'load.ts',
    'world/',
    'view/',
    'sky/',
    'land/',
    'water/',
    'ship/',
    'gunfire/',
    'loot/',
    'post/',
  ],
  'meter.ts': ['three'],
  // the load's stages, said as reached: a leaf, for the page and the frame
  'load.ts': [],
  // the debug tools, and the switches that drive the game through what it
  // offers anyone
  'fly.ts': ['three', 'world/', 'snapshot.ts'],
  'probe.ts': ['three', 'world/', 'sky/sky.ts'],
  'debug.ts': [
    'play/colours.ts',
    'play/game.ts',
    'play/race.ts',
    'play/referee.ts',
    'play/setup.ts',
    'play/state.ts',
    'ui/flow.ts',
    'ui/ui.ts',
    'ui/office/office.ts',
    'ui/office/screens.ts',
    'office/fixtures/desk.ts',
    ...NEUTRAL,
    'frame.ts',
    'world/',
    'sim/fixed.ts',
    'sim/handling.ts',
    'sim/match.ts',
    'sim/storm.ts',
    'fly.ts',
    'probe.ts',
  ],
  'main.ts': ['*'],
};

/** The part of src a src-relative path belongs to. */
const partOf = (rel: string) =>
  rel.includes('/') ? `${rel.split('/')[0]}/` : rel;

/** The rules this file runs, by the ids their exceptions name. */
const RULES = [
  'layers',
  'passes',
  'three',
  'any',
  'state',
  'renderer',
  'frame',
  'determinism',
  'debug',
  'dom',
  'ui-data',
  'camera',
  'colour',
  'desaturate',
  'citations',
  'parameters',
  'light',
  'temporary',
];

test('layers: every import is one its part of src may make (LAYERS), and every part has a row', () => {
  const found: Hit[] = [];
  for (const f of files) {
    const part = partOf(f.rel),
      row = LAYERS[part];
    if (!row) found.push({ file: f.at, line: 1, text: `no row for '${part}'` });
    else {
      for (const i of imports(f)) {
        if (
          !row.some(
            (e) =>
              e === '*' || e === i.to || (e.endsWith('/') && i.to.startsWith(e))
          )
        ) {
          found.push({
            file: f.at,
            line: i.line,
            text: `'${part}' imports '${i.spec}'`,
          });
        }
      }
    }
  }
  const parts = new Set(files.map((f) => partOf(f.rel)));
  for (const part of Object.keys(LAYERS))
    if (!parts.has(part))
      found.push({
        file: 'tests/architecture.test.ts',
        line: 1,
        text: `a row for '${part}', not in src`,
      });
  none('layers', found, 'imports outside the layers');
});

test("layers: what draws the storm has its state from the snapshot alone: of sim/storm.ts it takes types and the cloud's fixed heights (CLOUD)", () => {
  none(
    'layers',
    files
      .filter((f) => f.rel.startsWith('sky/') || f.rel.startsWith('ui/'))
      .flatMap((f) => imports(f))
      .filter(
        (i) =>
          i.to === 'sim/storm.ts' &&
          !i.typeOnly &&
          (i.whole || i.names.some((n) => n !== 'CLOUD'))
      )
      .map((i) => ({ file: i.from.at, line: i.line, text: i.spec })),
    'sim/storm.ts taken by what draws for more than its types and CLOUD'
  );
});

test('passes: passes live in src/frame.ts only', () => {
  none(
    'passes',
    hits(
      /\b(RenderPipeline|PostProcessing)\b|\bpass\s*\(/,
      (rel) => rel !== 'frame.ts'
    ),
    'RenderPipeline, PostProcessing and pass( belong to src/frame.ts'
  );
});

test('three: no three.js hacks', () => {
  none(
    'three',
    hits(/\bon(Before|After)(Compile|Render|Shadow)\b/),
    'onBeforeCompile / onBeforeRender / onAfterRender hooks'
  );
  none(
    'three',
    anywhere(/\bas\s+unknown\s+as\b/),
    'a cast through unknown, past the types (in src, tests or tools)'
  );
  none(
    'three',
    hits(/['"]three\/src\//),
    "deep import from 'three/src/' (only three's public entry points)"
  );
  none('three', hits(/\.prototype\b/), '.prototype (patching classes)');
  // Private members of three objects: an underscore-led member access (`x._foo`, `x['_foo']`) or the renderer's `.backend`.
  none(
    'three',
    hits(/[\w)\]]\s*\.\s*_[A-Za-z]|\[\s*['"]_[A-Za-z]|\.backend\b/),
    'underscore-private member or .backend access'
  );
  // Raw text, not comment-stripped: the directives live in comments. (This file names them only as a pattern, which the
  // pattern does not match, so it holds itself to the rule.)
  const found = everywhere.flatMap((f) =>
    f.text
      .split('\n')
      .flatMap((line, i) =>
        /@ts-(ignore|expect-error|nocheck)\b/.test(line)
          ? [{ file: f.at, line: i + 1, text: line.trim() }]
          : []
      )
  );
  none(
    'three',
    found,
    'a directive silencing the type checker (ts-ignore, ts-expect-error, ts-nocheck) in src, tests or tools'
  );
});

test('any: no any in src, tests or tools; shader values are typed nodes (src/tsl.ts)', () => {
  none(
    'any',
    anywhere(/:\s*any\b|=\s*any\b|\bas\s+any\b|<\s*any\s*>|\bany\[\]/),
    'any (name the type; for a node, src/tsl.ts)'
  );
});

test('state: no exported let or var (module state others could write)', () => {
  none('state', hits(/^\s*export\s+(let|var)\b/), 'exported mutable binding');
});

test('renderer: the frame owns every GPU pass and the renderer', () => {
  // Systems say what is due (gpu.ts); only src/frame.ts dispatches it, and only it sets the renderer up.
  const notFrame = (rel: string) => rel !== 'frame.ts';
  none(
    'renderer',
    hits(
      /\brenderer\s*\.\s*(render|renderAsync|compute|computeAsync)\b|\.computeAsync\s*\(/,
      notFrame
    ),
    'renderer.render / renderer.compute outside src/frame.ts'
  );
  // (main.ts calls the frame's own render)
  none(
    'renderer',
    hits(/(?<!\bframe)\.render(Async)?\s*\(/, notFrame),
    '.render( outside src/frame.ts'
  );
  none(
    'renderer',
    hits(
      /\.(setRenderTarget|setClearColor|setClearAlpha|setPixelRatio)\s*\(|\.toneMapping\w*\s*=(?!=)/,
      notFrame
    ),
    'renderer configuration outside src/frame.ts'
  );
  // no system is handed the renderer: its type is named only where it is made (main.ts) and set up (frame.ts)
  none(
    'renderer',
    hits(
      /\b(WebGPURenderer|Renderer)\b/,
      (rel) => !['frame.ts', 'main.ts'].includes(rel)
    ),
    'the renderer type outside src/frame.ts and src/main.ts'
  );
});

test('frame: the frame draws a snapshot; it alone makes the camera, works out the environment and touches its systems', () => {
  const notFrame = (rel: string) => rel !== 'frame.ts';
  none(
    'frame',
    hits(/\bnew\s+PerspectiveCamera\b/, notFrame),
    'a camera made outside src/frame.ts (hand it an Eye: src/snapshot.ts)'
  );
  none(
    'frame',
    hits(
      /\benvironmentAt\s*\(/,
      (rel) => !['frame.ts', 'environment.ts'].includes(rel)
    ),
    'environmentAt outside src/frame.ts (it alone works out the environment)'
  );
  none(
    'frame',
    hits(/\btypeof\s+createFrame\b/, notFrame),
    "the frame's type named outside src/frame.ts"
  );
  // what the rest of the game may ask of the frame: no camera, scene, sky, fleet or gunfire of its to reach into
  const caller = (rel: string) =>
    rel === 'main.ts' ||
    rel === 'debug.ts' ||
    rel.startsWith('play/') ||
    rel.startsWith('ui/');
  none(
    'frame',
    hits(
      /(?<![\w/.'"-])frame\s*\??\.\s*(?!(resize|render|ready|anchors)\b)\w/,
      caller
    ),
    'frame.<x> other than resize, render, ready and anchors'
  );
  // the environment is plain data built each frame, written by nobody
  none(
    'frame',
    hits(/\benv\s*\.\s*\w+\s*(\+|-|\*|\/)?=(?!=)/),
    'a write to the environment'
  );
});

test('determinism: src/world, src/sim and src/career are deterministic and headless', () => {
  none(
    'determinism',
    hits(
      // (performance the clock, `performance.`, not a part's performance: race.ts Fitted)
      /\bMath\.random\b|\bDate\b|(?<![.\w])performance\s*\.|\b(document|window|self|globalThis|navigator|location|indexedDB|localStorage)\b/,
      (rel) =>
        rel.startsWith('world/') ||
        rel.startsWith('sim/') ||
        rel.startsWith('career/')
    ),
    'Math.random, Date, performance or a browser global in src/world, src/sim or src/career'
  );
});

test('debug: the debug switches live in src/debug.ts alone, loaded and set going by one call from src/main.ts', () => {
  // (but ?debug itself, read by src/main.ts to know whether to load them at all)
  none(
    'debug',
    hits(
      /\blocation\b|\bURLSearchParams\b|\bswitches\s*\./,
      (rel) => rel !== 'debug.ts'
    ).filter(
      (h) =>
        !(
          h.file === 'src/main.ts' &&
          /new URLSearchParams\(location\.search\)\.has\('debug'\)/.test(h.text)
        )
    ),
    "the page's query read outside src/debug.ts"
  );
  const takers = files.flatMap((f) =>
    imports(f)
      .filter((i) => i.to === 'debug.ts')
      .map((i) => ({ f, i }))
  );
  none(
    'debug',
    takers
      .filter(({ f }) => f.rel !== 'main.ts')
      .map(({ f, i }) => ({ file: f.at, line: i.line, text: i.spec })),
    'src/debug.ts imported other than by src/main.ts'
  );
  // its code loaded once, by a dynamic import: a static one would bundle it into every release
  assert.deepEqual(
    takers
      .filter(({ i }) => !i.typeOnly)
      .map(({ f, i }) => `${f.rel} ${i.whole ? 'import()' : 'import'}`),
    ['main.ts import()'],
    'src/main.ts loads src/debug.ts once, by a dynamic import (else only its types)'
  );
  const main = files.find((f) => f.rel === 'main.ts')!;
  let calls = 0;
  const taken: string[] = [];
  ts.forEachChild(tree(main), function each(n: ts.Node) {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'scenario'
    )
      calls++;
    // what the dynamic import's module is taken apart into
    if (
      ts.isVariableDeclaration(n) &&
      ts.isObjectBindingPattern(n.name) &&
      n.initializer &&
      ts.isAwaitExpression(n.initializer) &&
      ts.isCallExpression(n.initializer.expression) &&
      n.initializer.expression.expression.kind ===
        ts.SyntaxKind.ImportKeyword &&
      /\/debug(\.ts)?['"]$/.test(
        n.initializer.expression.arguments[0]?.getText(tree(main)) ?? ''
      )
    )
      for (const e of n.name.elements)
        taken.push((e.propertyName ?? e.name).getText(tree(main)));
    ts.forEachChild(n, each);
  });
  assert.deepEqual(
    taken,
    ['scenario'],
    'src/main.ts takes only scenario (and types) from src/debug.ts'
  );
  assert.equal(calls, 1, 'src/main.ts calls scenario once');
  // what only the switches ask of the game is its `debug`, reached from src/debug.ts (and the game's own, from its state)
  none(
    'debug',
    hits(
      /\.\s*debug\s*\./,
      (rel) => rel !== 'debug.ts' && rel !== 'play/game.ts'
    ),
    "the game's debug surface reached outside src/debug.ts"
  );
});

test('dom: the game touches no page; src/play neither reads nor makes the DOM (ui/ does, and main.ts wires them)', () => {
  none(
    'dom',
    hits(
      /\b(document|window|HTMLElement|HTMLDivElement|Element|innerWidth|innerHeight|addEventListener|localStorage|requestAnimationFrame|getComputedStyle)\b|\.(createElement|appendChild|style|clientWidth|clientHeight)\b/,
      (rel) => rel.startsWith('play/')
    ),
    'the DOM in src/play'
  );
});

test('ui-data: the UI draws plain data; src/ui imports nothing from play/, three or what draws the world', () => {
  const DRAWS = [
    'sky/',
    'water/',
    'land/',
    'ship/',
    'gunfire/',
    'view/',
    'post/',
    'loot/',
    'play/',
    'frame.ts',
    'gpu.ts',
    'tsl.ts',
    'three',
  ];
  const found = files
    .filter((f) => f.rel.startsWith('ui/'))
    .flatMap((f) =>
      imports(f)
        .filter((i) =>
          DRAWS.some(
            (d) => i.to === d || (d.endsWith('/') && i.to.startsWith(d))
          )
        )
        .map((i) => ({ file: f.at, line: i.line, text: `imports '${i.spec}'` }))
    );
  none('ui-data', found, 'src/ui importing play/, three or a render module');
});

test('camera: the view owns the eye; a perspective camera is named only in src/frame.ts and src/view/, and only they read one', () => {
  const eyes = (rel: string) => rel !== 'frame.ts' && !rel.startsWith('view/');
  none(
    'camera',
    hits(/\bPerspectiveCamera\b/, eyes),
    'PerspectiveCamera outside src/frame.ts and src/view/ (take the eye: view.eye)'
  );
  none(
    'camera',
    hits(
      /\b(projectionMatrix|matrixWorldInverse|projectionMatrixInverse|getWorldPosition)\b/,
      eyes
    ),
    "a camera's matrices read outside src/frame.ts and src/view/ (view.eye has them)"
  );
});

test("colour: luma is three's luminance(), and only the excepted move a colour toward its grey", () => {
  // (the palette's tint works on the CPU, before any shader)
  none(
    'colour',
    hits(
      /0\.2126|0\.7152|\b0\.299\b|\b0\.587\b/,
      (rel) => rel !== 'palette.ts'
    ),
    "hand-written luma weights (three's luminance())"
  );
  none(
    'desaturate',
    hits(/mix\(\s*vec3\(\s*(luminance|dot)\(/),
    "a desaturation (a colour moved toward its grey): the look is the grade's"
  );
});

test('citations: comments say why, not which review, reference or other codebase asked', () => {
  // raw text, comments and all: a review round, a reference image, the prototype this was ported from, a commit's hash
  const CITED =
    /\breview\s*#?\d|\bround\s*#?\d+\b(?!\s*(trip|off|up|down))|idea\.png|art\/target|reference image|\btarget\.png\b|\b0117\b|agent-initial|\bold game\b|\bported from\b|\bthe [\w-]+ branch\b|\bcommit\s+[0-9a-f]{7,40}\b|(?<![0-9a-fx#])\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,12}\b(?![0-9a-f])/i;
  const found = [
    ...files,
    ...everywhere.filter((f) => f.at.startsWith('tools/')),
  ].flatMap((f) =>
    f.text
      .split('\n')
      .flatMap((line, i) =>
        CITED.test(line) ? [{ file: f.at, line: i + 1, text: line.trim() }] : []
      )
  );
  none(
    'citations',
    found,
    'a review round, reference image, other codebase or commit named'
  );
});

/** The most parameters an exported function takes: past this, the caller passes a named record (water/optics.ts Surface). */
const MOST = 5;

test('parameters: an exported function takes at most MOST parameters (the excepted, at most what they took when the rule came in)', () => {
  const found: Hit[] = [];
  for (const f of files) {
    for (const s of tree(f).statements) {
      const exported =
        ts.canHaveModifiers(s) &&
        ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      const fns: [string, ts.SignatureDeclaration][] =
        ts.isFunctionDeclaration(s) && s.name
          ? [[s.name.text, s]]
          : ts.isVariableStatement(s)
            ? s.declarationList.declarations.flatMap((d) =>
                ts.isIdentifier(d.name) &&
                d.initializer &&
                (ts.isArrowFunction(d.initializer) ||
                  ts.isFunctionExpression(d.initializer))
                  ? [
                      [d.name.text, d.initializer] as [
                        string,
                        ts.SignatureDeclaration,
                      ],
                    ]
                  : []
              )
            : [];
      for (const [name, fn] of fns) {
        const n = fn.parameters.length;
        const at =
          EXCEPTIONS.find(
            (e) => e.rule === 'parameters' && e.file === f.at && e.name === name
          )?.at ?? MOST;
        if (n > MOST)
          found.push({
            file: f.at,
            line: lineOf(f, fn.getStart()),
            name,
            text: `takes ${n}${n > at ? ` (at most ${at})` : ''}`,
          });
        if (n > at)
          found.push({
            file: f.at,
            line: lineOf(f, fn.getStart()),
            name: `${name} (over what it took)`,
            text: `takes ${n}, at most ${at}`,
          });
        if (at > MOST && n < at)
          found.push({
            file: f.at,
            line: lineOf(f, fn.getStart()),
            name: `${name} (came down)`,
            text: `takes ${n}: lower its exception to ${n}`,
          });
      }
    }
  }
  none(
    'parameters',
    found,
    `exported functions over ${MOST} parameters, or apart from what their exception says`
  );
});

test('light: the lighting interface is the six ways a surface is lit (sky/light.ts Light); a new look is a tone, not a new member', () => {
  const text = files.find((f) => f.rel === 'sky/light.ts')!.text;
  const body = /export interface Light \{([\s\S]*?)\n\}/.exec(text)![1];
  const members = [...body.matchAll(/^\s{2}(\w+)\s*[(:]/gm)].map((m) => m[1]);
  assert.deepEqual(members, [
    'toon',
    'polished',
    'leaf',
    'band',
    'sides',
    'level',
  ]);
});

test('temporary: nothing in src says it is temporary or a hack, comments included', () => {
  const found = files.flatMap((f) =>
    f.text
      .split('\n')
      .flatMap((line, i) =>
        /\b(temporary|for now|placeholders?|hacks?|hacky|workarounds?|fixme|todo)\b/i.test(
          line
        )
          ? [{ file: f.at, line: i + 1, text: line.trim() }]
          : []
      )
  );
  none(
    'temporary',
    found,
    'words of temporary work (temporary, for now, placeholder, hack, workaround, FIXME, TODO)'
  );
});

test('the exceptions: each has a reason, names a rule that exists and a file that does, and a gap in three was checked against this three', () => {
  const three = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
    .dependencies.three;
  const known = new Set([...RULES, ...EXCEPTION_RULES_ELSEWHERE]);
  const bad = EXCEPTIONS.flatMap((e) => [
    ...(e.why.trim().length < 12 ? [`${e.rule} ${e.file}: no reason`] : []),
    ...(!known.has(e.rule) ? [`${e.rule} ${e.file}: no such rule`] : []),
    ...(!existsSync(resolve(ROOT, e.file))
      ? [`${e.rule} ${e.file}: no such file or folder`]
      : []),
    ...(e.three !== undefined && e.three !== three
      ? [
          `${e.rule} ${e.file}: checked against three ${e.three}, now ${three}: check the gap again`,
        ]
      : []),
  ]);
  assert.deepEqual(bad, []);
});

/** The rules of architecture-graph.test.ts and architecture-hygiene.test.ts, which their exceptions may name. */
const EXCEPTION_RULES_ELSEWHERE = [
  'exports',
  'cycles',
  'world',
  'extensions',
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
  'strict',
];

test('the exceptions to these rules all excuse something', () => {
  assert.deepEqual(
    unused(RULES).map(
      (e) => `${e.rule} ${e.file}${e.name ? ` ${e.name}` : ''}`
    ),
    [],
    'stale exceptions: remove them'
  );
});

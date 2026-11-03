import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root } from './harness.ts';

const SOURCES = ['src', 'index.html', 'public', 'ios/App'];
const BUILD = 'dist';
const BUILD_BUDGET = 1024 ** 3;
const OUTSIDE = /(^|\/)node_modules\//;

const EXTENSIONS = new Set([
  'gltf', 'glb', 'obj', 'mtl', 'fbx', 'dae', 'stl', 'ply', '3ds', 'blend', 'usd', 'usda', 'usdc', 'usdz', 'abc', 'drc',
]);

const at = (b: Buffer, offset: number, s: string) => b.toString('latin1', offset, offset + s.length) === s;

const SIGNATURES: [kind: string, test: (b: Buffer) => boolean][] = [
  ['glTF binary model', (b) => at(b, 0, 'glTF')],
  ['FBX model', (b) => at(b, 0, 'Kaydara FBX Binary')],
  ['PLY model', (b) => at(b, 0, 'ply\n') || at(b, 0, 'ply\r\n')],
  ['Blender file', (b) => at(b, 0, 'BLENDER')],
  ['Draco mesh', (b) => at(b, 0, 'DRACO')],
];

const identify = (b: Buffer) => SIGNATURES.find(([, test]) => test(b))?.[0];

function inspect(path: string): string[] {
  const found: string[] = [];
  const ext = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext && EXTENSIONS.has(ext)) found.push(`.${ext} file`);
  const bytes = readFileSync(path);
  const kind = identify(bytes);
  if (kind) found.push(kind);
  if (bytes.subarray(0, 8192).includes(0)) return found;
  const text = bytes.toString('utf8');
  if (/"asset"\s*:\s*\{[^}]*"version"/.test(text) && /"(meshes|scenes|nodes)"\s*:/.test(text)) found.push('glTF model');
  if ((text.match(/^v\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+/gm)?.length ?? 0) >= 3 && /^f\s+\d/m.test(text)) found.push('OBJ model');
  for (const [run] of text.matchAll(/(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{32,}={0,2}/g)) {
    const embedded = identify(Buffer.from(run.slice(0, 64), 'base64'));
    if (embedded) found.push(`base64-embedded ${embedded} (${run.slice(0, 16)}…)`);
  }
  return found;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile()).map((e) => relative(root, join(e.parentPath, e.name)));
}

const sources = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...SOURCES], {
  cwd: root, encoding: 'utf8',
}).split('\0').filter((f) => f && existsSync(join(root, f)));
if (!existsSync(join(root, BUILD))) throw new Error(`no ${BUILD}/: build the game first (npm run build)`);
const build = walk(join(root, BUILD));
const files = [...new Set([...sources, ...build])].filter((f) => !OUTSIDE.test(f)).sort();

const offenders = files.map((f) => [f, inspect(join(root, f))] as const).filter(([, found]) => found.length);
for (const [f, found] of offenders) console.log(`${f}: ${found.join('; ')}`);
console.log(`${offenders.length} model file(s) among ${files.length} files of source and build`);

const size = build.reduce((sum, f) => sum + statSync(join(root, f)).size, 0);
console.log(`build ${(size / 1024 ** 2).toFixed(1)} MB of a ${BUILD_BUDGET / 1024 ** 2} MB budget`);
process.exitCode = offenders.length || size > BUILD_BUDGET ? 1 : 0;

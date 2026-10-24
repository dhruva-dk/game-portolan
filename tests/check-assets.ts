// Acceptance check 7, first half: the game's source code and its build contain no image, model, font, or audio
// files. Scans src/, index.html, public/ and the iOS project (files git tracks or would track, so Xcode's build
// products and the synced copy of the web build are skipped), and the web build in dist/. Files are recognised by
// extension and by content: magic bytes, glTF, OBJ and SVG documents, and files embedded as base64 in text
// (data: URIs and the like). The screenshots in progress/ are outside the game. Lists every offender and exits 1.
//   npm run check:assets        (builds dist/ first)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root } from './harness.ts';

const SOURCES = ['src', 'index.html', 'public', 'ios/App'];
const BUILD = 'dist';
const OUTSIDE = /(^|\/)(node_modules|progress)\//;

const EXTENSIONS = new Set([
  // images and video
  'png', 'apng', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'avif', 'heic', 'heif', 'bmp', 'ico', 'icns', 'cur', 'tif',
  'tiff', 'svg', 'svgz', 'psd', 'tga', 'dds', 'ktx', 'ktx2', 'basis', 'exr', 'hdr', 'jxl', 'mp4', 'm4v', 'mov',
  'webm', 'avi', 'mkv',
  // models
  'gltf', 'glb', 'obj', 'mtl', 'fbx', 'dae', 'stl', 'ply', '3ds', 'blend', 'usd', 'usda', 'usdc', 'usdz', 'abc', 'drc',
  // fonts
  'ttf', 'otf', 'ttc', 'woff', 'woff2', 'eot', 'fnt', 'pfb', 'pfm',
  // audio
  'mp3', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'flac', 'weba', 'caf', 'aif', 'aiff', 'mid', 'midi',
]);

const at = (b: Buffer, offset: number, s: string) => b.toString('latin1', offset, offset + s.length) === s;

/**
 * What a file's leading bytes say it is. Strong signatures are long or distinctive enough to trust anywhere, even
 * in a few decoded bytes of base64; weak ones are only trusted for whole binary files.
 */
const SIGNATURES: [kind: string, strong: boolean, test: (b: Buffer) => boolean][] = [
  ['PNG image', true, (b) => at(b, 0, '\x89PNG\r\n\x1a\n')],
  ['JPEG image', true, (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['GIF image', true, (b) => at(b, 0, 'GIF87a') || at(b, 0, 'GIF89a')],
  ['WebP image', true, (b) => at(b, 0, 'RIFF') && at(b, 8, 'WEBP')],
  ['WAV audio', true, (b) => at(b, 0, 'RIFF') && at(b, 8, 'WAVE')],
  ['AVI video', true, (b) => at(b, 0, 'RIFF') && at(b, 8, 'AVI ')],
  ['MP4/M4A/MOV/HEIC/AVIF media', true, (b) => at(b, 4, 'ftyp')],
  ['WebM/Matroska media', true, (b) => at(b, 0, '\x1a\x45\xdf\xa3')],
  ['TIFF image', true, (b) => at(b, 0, 'II*\0') || at(b, 0, 'MM\0*')],
  ['Photoshop image', true, (b) => at(b, 0, '8BPS')],
  ['KTX texture', true, (b) => at(b, 0, '\xabKTX ')],
  ['DDS texture', true, (b) => at(b, 0, 'DDS |')],
  ['OpenEXR image', true, (b) => at(b, 0, '\x76\x2f\x31\x01')],
  ['Radiance HDR image', true, (b) => at(b, 0, '#?RADIANCE') || at(b, 0, '#?RGBE')],
  ['JPEG XL image', true, (b) => at(b, 4, 'JXL ')],
  ['JPEG XL image', false, (b) => at(b, 0, '\xff\x0a')],
  ['icon image', false, (b) => at(b, 0, '\0\0\x01\0') || at(b, 0, 'icns')],
  ['BMP image', false, (b) => at(b, 0, 'BM') && b.length >= 26 && b.readUInt32LE(2) === b.length],
  ['glTF binary model', true, (b) => at(b, 0, 'glTF')],
  ['FBX model', true, (b) => at(b, 0, 'Kaydara FBX Binary')],
  ['PLY model', true, (b) => at(b, 0, 'ply\n') || at(b, 0, 'ply\r\n')],
  ['Blender file', true, (b) => at(b, 0, 'BLENDER')],
  ['Draco mesh', true, (b) => at(b, 0, 'DRACO')],
  ['OpenType font', true, (b) => at(b, 0, 'OTTO')],
  ['WOFF font', true, (b) => at(b, 0, 'wOFF')],
  ['WOFF2 font', true, (b) => at(b, 0, 'wOF2')],
  ['font collection', true, (b) => at(b, 0, 'ttcf')],
  ['TrueType font', false, (b) => at(b, 0, '\0\x01\0\0') || at(b, 0, 'true')],
  ['EOT font', false, (b) => at(b, 34, 'LP')],
  ['MP3 audio', true, (b) => at(b, 0, 'ID3')],
  ['MPEG audio', false, (b) => b[0] === 0xff && (b[1] & 0xe0) === 0xe0],
  ['Ogg audio', true, (b) => at(b, 0, 'OggS')],
  ['FLAC audio', true, (b) => at(b, 0, 'fLaC')],
  ['AIFF audio', true, (b) => at(b, 0, 'FORM') && (at(b, 8, 'AIFF') || at(b, 8, 'AIFC'))],
  ['CAF audio', true, (b) => at(b, 0, 'caff')],
  ['MIDI file', true, (b) => at(b, 0, 'MThd')],
];

const identify = (b: Buffer, strongOnly: boolean) =>
  SIGNATURES.find(([, strong, test]) => (strong || !strongOnly) && test(b))?.[0];

/** Every way a file is an image, model, font, or audio file. */
function inspect(path: string): string[] {
  const found: string[] = [];
  const ext = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext && EXTENSIONS.has(ext)) found.push(`.${ext} file`);
  const bytes = readFileSync(path);
  const binary = bytes.subarray(0, 8192).includes(0) || identify(bytes, true);
  if (binary) {
    const kind = identify(bytes, false);
    if (kind) found.push(kind);
    return found;
  }
  const text = bytes.toString('utf8');
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text)) found.push('SVG image');
  if (/"asset"\s*:\s*\{[^}]*"version"/.test(text) && /"(meshes|scenes|nodes)"\s*:/.test(text)) found.push('glTF model');
  if ((text.match(/^v\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+/gm)?.length ?? 0) >= 3 && /^f\s+\d/m.test(text)) found.push('OBJ model');
  // Files hidden in text as base64, in data: URIs or string literals.
  for (const [run] of text.matchAll(/(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{32,}={0,2}/g)) {
    const kind = identify(Buffer.from(run.slice(0, 64), 'base64'), true);
    if (kind) found.push(`base64-embedded ${kind} (${run.slice(0, 16)}…)`);
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
const files = [...new Set([...sources, ...walk(join(root, BUILD))])].filter((f) => !OUTSIDE.test(f)).sort();

const offenders = files.map((f) => [f, inspect(join(root, f))] as const).filter(([, found]) => found.length);
for (const [f, found] of offenders) console.log(`${f}: ${found.join('; ')}`);
console.log(`${offenders.length} image, model, font, or audio file(s) among ${files.length} files of source and build`);
process.exitCode = offenders.length ? 1 : 0;

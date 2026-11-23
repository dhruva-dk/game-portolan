// The chartroom kit's one rule (UI-TOKENS.md): a piece of it, and a screen
// built on it, is styled by the tokens alone. Outside its token module
// (src/ui/chartroom/tokens.ts), such a file takes no colour from ink.ts (TONE carries them), writes no CSS
// length but in drawn units, names no colour by its CSS name, sets no font's
// size but by the type scale, reads no custom property the tokens do not
// define or the file does not set itself, and writes no star rating as a
// number (stars() draws it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKENS } from '../src/ui/chartroom/tokens.ts';
import { code, files, imports, none, type Hit } from './architecture/scan.ts';

/** The kit's folder, src-relative; its one file that may hold values. */
const KIT = 'ui/chartroom/',
  HOME = 'ui/chartroom/tokens.ts';

/** ink.ts's colours: the kit takes them through its tokens. */
const COLOURS = new Set([
  'INK',
  'WASH',
  'PAPER',
  'CUT',
  'GILT',
  'BRASS',
  'SHADOW',
  'DUSK',
  'PARCHMENT',
  'LIGHT',
  'RARITY',
  'LAND',
  'OFFICE',
  'PLUMAGE',
  'CHARTROOM',
]);

/** What a line of a kit file's code may not say, and why. */
const BANNED: readonly (readonly [RegExp, string])[] = [
  [
    /(?<![\w$.#-])\d*\.?\d+(px|pt|em|rem|vw|vh|vmin|vmax)\b/,
    'a CSS length (a token, or u() for drawn units)',
  ],
  [
    /(?<![\w$.#-])(white|black|red|gray|grey|yellow|orange|purple|pink|brown|navy|maroon)(?![\w-])/,
    'a colour by its CSS name (a token)',
  ],
  [/\bfont(-size)?\s*:[^;{}`]*\$\{/, "a font's size not on the type scale"],
  [/\$\{[^}]*\}\s*(★|stars?)\b/i, 'a star rating as a number (stars())'],
];

/**
 * Custom properties `line` reads that neither the tokens nor its file (`own`)
 * define; one named in part by a template (`--q${q}`) is the ladder's, and
 * stands.
 */
const unknownVars = (line: string, own: ReadonlySet<string>) =>
  [...line.matchAll(/var\(--([\w-]+)(\$\{)?/g)]
    .filter((m) => !m[2])
    .map((m) => m[1] ?? '')
    .filter((name) => name !== 'u' && !(name in TOKENS) && !own.has(name));

/** What in `text` (a kit file's source) is not a token, line by line. A letter's spacing is a share of its size (em). */
function offences(text: string): { line: number; text: string }[] {
  const lines = code(text),
    found: { line: number; text: string }[] = [];
  const own = new Set(
    [...lines.join('\n').matchAll(/['"`\s;{(]--([\w-]+)\s*[:'"]/g)].map(
      (m) => m[1] ?? ''
    )
  );
  lines.forEach((raw, i) => {
    const line = raw.replace(/letter-spacing:\s*-?[\d.]+em/g, '');
    for (const [pattern, what] of BANNED)
      if (pattern.test(line)) found.push({ line: i + 1, text: what });
    for (const name of unknownVars(line, own))
      found.push({ line: i + 1, text: `var(--${name}), not a token` });
  });
  return found;
}

/** The kit's files, and every screen built on it (it imports the kit). */
const kit = files.filter(
  (f) =>
    f.rel !== HOME &&
    (f.rel.startsWith(KIT) || imports(f).some((i) => i.to.startsWith(KIT)))
);

test('tokens: the chartroom kit is styled by its tokens alone', () => {
  assert.ok(kit.length > 0, 'the kit has files');
  const found: Hit[] = [];
  for (const f of kit) {
    for (const o of offences(f.text))
      found.push({ file: f.at, line: o.line, text: o.text });
    for (const i of imports(f))
      if (i.to === 'ui/ink.ts')
        for (const name of i.names.filter((n) => COLOURS.has(n)))
          found.push({
            file: f.at,
            line: i.line,
            text: `takes ${name} from ink.ts (TONE)`,
          });
  }
  none('tokens', found, 'a value in the kit that is not a token');
});

test('tokens: the rule finds what it bans', () => {
  const bad = [
    '.x { padding: 4px; }',
    '.x { color: white; }',
    '.x { font: 700 ${u(9)} var(--face); }',
    '.x { color: var(--crimson); }',
    "['Its staff', `${v.staff.toFixed(1)} stars on average`],",
  ];
  for (const text of bad)
    assert.equal(offences(text).length, 1, `not found in: ${text}`);
  const good =
    '.x { --share: 1; padding: var(--s2) ${u(3)}; font: 700 var(--t-body) var(--face); width: var(--share); letter-spacing: .1em; background: var(--q${q}); }';
  assert.deepEqual(offences(good), []);
});

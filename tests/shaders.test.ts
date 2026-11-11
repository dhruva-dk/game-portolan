// The generated-shader check: a value given in a branch and lost to a second declaration is found; a value worked
// out again, a branch's sibling and a local of the same name are not.
//   node --test tests/shaders.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resets } from '../tools/shaders.ts';

const shader = (body: string) => `var<private> foam : f32;\nvar<private> shade : f32;\n\n@fragment\nfn main() -> @location(0) vec4<f32> {\n${body}\n}\n`;

test('a value given in a branch and declared again before it is read is lost', () => {
  const found = resets(shader([
    '\tif ( c > 0.0 ) {',
    '\t\tfoam = 0.0;',
    '\t\tfoam = n * 2.0;',
    '\t}',
    '\tfoam = 0.0;',
    '\tlet white = clamp( foam, 0.0, 1.0 );',
  ].join('\n')));
  assert.deepEqual(found.map((r) => r.name), ['foam']);
  assert.match(found[0].read, /clamp\( foam/);
});

test('a value worked out again from its start loses nothing', () => {
  assert.deepEqual(resets(shader([
    '\tif ( a ) {',
    '\t\tshade = 1.0;',
    '\t\tshade = ( shade - k );',
    '\t}',
    '\tif ( b ) {',
    '\t\tshade = 1.0;',
    '\t\tshade = ( shade - k );',
    '\t}',
  ].join('\n'))), []);
});

test('the other branch of the same choice starts afresh', () => {
  assert.deepEqual(resets(shader([
    '\tif ( a ) {',
    '\t\tfoam = n;',
    '\t} else {',
    '\t\tfoam = 0.0;',
    '\t\tlet w = foam;',
    '\t}',
  ].join('\n'))), []);
});

test('a local of the same name hides the global', () => {
  assert.deepEqual(resets(shader([
    '\tvar foam : f32;',
    '\tif ( a ) {',
    '\t\tfoam = n;',
    '\t}',
    '\tfoam = 0.0;',
    '\tlet w = foam;',
  ].join('\n'))), []);
});

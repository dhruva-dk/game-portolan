// The tuning pin (D36, Phase B section 1): a hash of TUNING is pinned to TUNING_VERSION, so a changed number without a
// bumped version fails here. To change a number: change it, bump TUNING_VERSION, and set PINNED to the new pair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, fnv, hex } from '../src/career/canon.ts';
import { TUNING, TUNING_VERSION } from '../src/career/tuning.ts';

const PINNED = { version: 8, hash: 'e1785b6b' };

test('TUNING is pinned to TUNING_VERSION', () => {
  const hash = hex(fnv(canonical(TUNING)));
  assert.deepEqual(
    { version: TUNING_VERSION, hash },
    PINNED,
    'a starting value changed: bump TUNING_VERSION and pin the new hash'
  );
});

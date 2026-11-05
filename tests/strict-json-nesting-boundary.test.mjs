// Host JSON preflight boundary tests; not compiler/guest execution evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

const arrayAtDepth = depth => '['.repeat(depth) + '0' + ']'.repeat(depth);
const objectsAtDepth = depth => '{"v":'.repeat(depth) + '0' + '}'.repeat(depth);

test('the trusted 128-level JSON nesting ceiling is inclusive for arrays and objects', () => {
  for (const make of [arrayAtDepth, objectsAtDepth]) {
    for (const depth of [1, 64, 127, 128]) {
      const source = make(depth);
      assert.doesNotThrow(() => rejectDuplicateJsonKeys(source));
      assert.doesNotThrow(() => JSON.parse(source));
    }
    assert.throws(() => rejectDuplicateJsonKeys(make(129)), /nesting limit exceeded/);
  }
});

test('a stricter caller ceiling applies to both nested arrays and nested objects', () => {
  for (const make of [arrayAtDepth, objectsAtDepth]) {
    rejectDuplicateJsonKeys(make(4), 4);
    assert.throws(() => rejectDuplicateJsonKeys(make(5), 4), /nesting limit exceeded/);
  }
  for (const limit of [-1, 0, 129, 1.5, Infinity, NaN]) {
    assert.throws(() => rejectDuplicateJsonKeys('{}', limit), /invalid JSON key admission input/);
  }
});

test('same decoded key in separate siblings is not a duplicate in one object', () => {
  const safe = '{"left":{"x":1},"right":{"\\u0078":2},"items":[{"x":3},{"\\u0078":4}]}';
  assert.doesNotThrow(() => rejectDuplicateJsonKeys(safe));
  assert.deepEqual(JSON.parse(safe).items.map(x => x.x), [3,4]);
  for (const invalid of [
    '{"left":{"x":1,"\\u0078":2}}',
    '{"items":[{"x":1,"\\u0078":2}]}',
    '{"x":1,"\\u0078":2}'
  ]) assert.throws(() => rejectDuplicateJsonKeys(invalid), /duplicate object key/);
});

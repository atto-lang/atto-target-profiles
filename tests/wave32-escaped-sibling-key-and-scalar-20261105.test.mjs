// Host-side JSON authority regression only; not compiler or guest execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

const admit = raw => { rejectDuplicateJsonKeys(raw); return JSON.parse(raw); };

test('escaped identity names can recur in independent sibling records', () => {
  const raw = '{"first":{"\\u0069d":1},"second":{"id":2},"items":[{"id":3},{"\\u0069d":4}]}';
  const parsed = admit(raw);
  assert.equal(parsed.first.id, 1);
  assert.equal(parsed.second.id, 2);
  assert.equal(parsed.items[0].id, 3);
  assert.equal(parsed.items[1].id, 4);
});

test('duplicate authority inside one array element is still rejected', () => {
  for (const raw of [
    '{"items":[{"\\u0069d":1,"id":2},{"id":3}]}',
    '{"nested":{"\\u0074arget":"wasm","target":"llvm"}}',
    '{"a":1,"\\u0061":2}'
  ]) {
    assert.throws(() => rejectDuplicateJsonKeys(raw), /duplicate object key/);
  }
});

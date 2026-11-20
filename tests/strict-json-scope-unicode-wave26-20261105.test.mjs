// Host duplicate-member preflight only; JSON.parse remains the syntax authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

test('identical keys in distinct array elements and sibling objects stay valid', () => {
  for(const source of [
    '{"a":{"tag":1},"b":{"tag":2}}',
    '[{"key":1},{"key":2},{"nested":{"key":3}}]',
    '{"outer":{"emoji":"😀"},"other":{"emoji":"😀"}}'
  ]) assert.doesNotThrow(()=>rejectDuplicateJsonKeys(source));
});

test('escaped Unicode identity collides only within the containing object', () => {
  const escapedX='{"'+'\\u0078'+'":1,"x":2}';
  const escapedEmoji='{"'+'\\ud83d\\ude00'+'":1,"😀":2}';
  for(const source of [escapedX,escapedEmoji,
    '{"parent":{"'+'\\u006b'+'":1,"k":2}}',
    '[{"k":1},{"'+'\\u006b'+'":2,"k":3}]']) {
    assert.throws(()=>rejectDuplicateJsonKeys(source),/duplicate object key/);
  }
  assert.doesNotThrow(()=>rejectDuplicateJsonKeys(
    '{"parent":{"'+'\\u006b'+'":1},"sibling":{"k":2}}'));
});

test('depth restriction, BOM and trailing JSON frames are rejected', () => {
  assert.throws(()=>rejectDuplicateJsonKeys('[[0]]',1),/nesting limit exceeded/);
  assert.doesNotThrow(()=>rejectDuplicateJsonKeys('[[0]]',2));
  assert.throws(()=>rejectDuplicateJsonKeys('\uFEFF{}'),/BOM/);
  assert.throws(()=>rejectDuplicateJsonKeys('{} {}'),/trailing input/);
});

test('caller cannot disable trusted depth ceiling with noninteger or excess depth', () => {
  for(const limit of [0,129,1.5,'128',NaN,Infinity]) {
    assert.throws(()=>rejectDuplicateJsonKeys('{}',limit),/invalid JSON key admission input/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

const admitted = source => { rejectDuplicateJsonKeys(source); return JSON.parse(source); };

test('escaped and literal astral key aliases cannot overwrite an object member', () => {
  for (const pair of [
    ['"\\uD83D\\uDE80"', '"🚀"'],
    ['"\\u0061"', '"a"'],
    ['"\\/"', '"/"'],
    ['"\\u005c"', '"\\\\"'],
    ['"\\u0022"', '"\\\""']
  ]) {
    const source = `{${pair[0]}:1,${pair[1]}:2}`;
    assert.throws(() => rejectDuplicateJsonKeys(source), /duplicate object key/, source);
  }
});

test('escaped names may be reused in separate nested object scopes', () => {
  const source = '{"a":{"\\uD83D\\uDE80":1},"b":[{"🚀":2},{"\\uD83D\\uDE80":3}]}';
  assert.equal(admitted(source).b[1]['🚀'], 3);
  assert.deepEqual(admitted('{"a":1,"\\u0062":2}'), {a:1,b:2});
});

test('the maximum nesting boundary is enforced after unescaping keys', () => {
  const atLimit = '['.repeat(128) + '{"\\u006b":1}' + ']'.repeat(128);
  assert.throws(() => rejectDuplicateJsonKeys(atLimit), /nesting limit/);
  const exact = '['.repeat(127) + '{"\\u006b":1}' + ']'.repeat(127);
  assert.equal(admitted(exact).length, 1);
});

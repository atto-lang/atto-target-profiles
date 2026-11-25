// Host-only JSON admission; not runtime or compiler execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

test('escaped and literal astral keys may recur in separate sibling records', () => {
  const raw = '{"first":{"\\ud83d\\ude00":1},"second":{"😀":2}}';
  assert.doesNotThrow(() => rejectDuplicateJsonKeys(raw));
  const parsed=JSON.parse(raw);
  assert.equal(parsed.first['😀'],1);
  assert.equal(parsed.second['😀'],2);
});

test('escaped and literal astral keys cannot double-own the same object', () => {
  const raw = '{"first":{"\\ud83d\\ude00":1,"😀":2},"second":{"safe":3}}';
  assert.throws(() => rejectDuplicateJsonKeys(raw),/duplicate object key/);
});

test('caller cannot weaken the trusted nesting ceiling or its stricter choice', () => {
  const raw='{"outer":{"inner":true}}';
  assert.doesNotThrow(() => rejectDuplicateJsonKeys(raw,2));
  assert.throws(() => rejectDuplicateJsonKeys(raw,1),/nesting limit/);
  for (const bad of [0,-1,129,1.5,Infinity,'2']) {
    assert.throws(() => rejectDuplicateJsonKeys('{"safe":1}',bad),/invalid JSON key admission/);
  }
});

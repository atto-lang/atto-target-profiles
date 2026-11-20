// Host-only JSON key preflight, not an independently authenticated compiler artifact.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

test('escaped surrogate-pair and direct astral keys are the same object member',()=>{
  const duplicate='{"\\uD83D\\uDE00":1,"😀":2}';
  assert.throws(()=>rejectDuplicateJsonKeys(duplicate),/duplicate object key/);
  const safe='{"left":{"\\uD83D\\uDE00":1},"right":{"😀":2}}';
  assert.doesNotThrow(()=>rejectDuplicateJsonKeys(safe));
  assert.deepEqual(JSON.parse(safe).left,{'😀':1});
});

test('escaped ASCII and direct names collide only in their own object scope',()=>{
  const inputs=[
    '{"a":1,"\\u0061":2}',
    '{"\\u0061":1,"a":2}',
    '{"outer":{"x":1,"\\u0078":2}}'
  ];
  for(const value of inputs)
    assert.throws(()=>rejectDuplicateJsonKeys(value),/duplicate object key/);
  const siblings='[{"x":1},{"\\u0078":2}]';
  assert.doesNotThrow(()=>rejectDuplicateJsonKeys(siblings));
});

test('caller depth overrides cannot weaken trusted nesting bound',()=>{
  for(const maxDepth of [0,-1,1.25,129,Number.MAX_SAFE_INTEGER,Infinity])
    assert.throws(()=>rejectDuplicateJsonKeys('{}',maxDepth),/invalid JSON key admission input/);
  const exact='['.repeat(128)+'0'+']'.repeat(128);
  rejectDuplicateJsonKeys(exact);
  assert.throws(()=>rejectDuplicateJsonKeys('['+exact+']'),/nesting limit exceeded/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys as preflight} from '../src/strict-json-keys.mjs';

test('duplicate escaped member spellings fail within a nested object',()=>{
  const slash=String.fromCharCode(92);
  const raw='[{"child":{"key":1,"'+slash+'u006bey":2}}]';
  assert.throws(()=>preflight(raw),/duplicate object key/);
  assert.throws(()=>preflight('[{"x":1,"x":2}]'),/duplicate object key/);
});

test('reused key identities across adjacent objects are not duplicates',()=>{
  const raw='[{"x":1,"child":{"x":2}},{"x":3,"child":{"x":4}}]';
  assert.doesNotThrow(()=>preflight(raw));
  assert.equal(JSON.parse(raw)[1].child.x,4);
});

test('a stricter depth and root exhaustion remain fail-closed',()=>{
  assert.doesNotThrow(()=>preflight('[{"x":1}]',2));
  assert.throws(()=>preflight('[[{"x":1}]]',2),/nesting limit exceeded/);
  assert.throws(()=>preflight('{} {}'),/trailing input/);
  assert.throws(()=>preflight(String.fromCharCode(0xfeff)+'{}'),/JSON BOM is not admitted/);
});

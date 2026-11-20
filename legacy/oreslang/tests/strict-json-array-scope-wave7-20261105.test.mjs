import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys as preflight} from '../src/strict-json-keys.mjs';

test('equal member names in separate sibling objects remain independent',()=>{
  const source='[{"id":1,"nested":{"id":2}},{"id":3,"nested":{"id":4}}]';
  assert.doesNotThrow(()=>preflight(source));
  assert.equal(JSON.parse(source).length,2);
});

test('escaped aliases collide in their own object even inside an array',()=>{
  const escaped='[{"name":1,"'+String.fromCharCode(92)+'u006eame":2}]';
  assert.throws(()=>preflight(escaped),/duplicate object key/);
  assert.throws(()=>preflight('[{"a":1,"a":2}]'),/duplicate object key/);
  assert.doesNotThrow(()=>preflight('[{"a":1},{"a":2}]'));
});

test('caller may tighten but not loosen structural depth; UTF-8 BOM fails',()=>{
  assert.doesNotThrow(()=>preflight('[[1]]',2));
  assert.throws(()=>preflight('[[[1]]]',2),/nesting limit exceeded/);
  assert.throws(()=>preflight('[]',129),/invalid JSON key admission input/);
  assert.throws(()=>preflight(String.fromCharCode(0xfeff)+'{}'),/JSON BOM is not admitted/);
});

// Host strict-JSON authority preflight only, not an Oreslang guest test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

test('decoded names may repeat in independent nested array/object scopes',()=>{
  const raw=String.raw`{"a":[{"\u0069d":1},{"id":2}],"b":{"id":3},"c":{"\u0069d":4}}`;
  assert.doesNotThrow(()=>rejectDuplicateJsonKeys(raw));
  const parsed=JSON.parse(raw);
  assert.deepEqual(parsed.a.map(x=>x.id),[1,2]);
  assert.equal(parsed.b.id,3);
  assert.equal(parsed.c.id,4);
});

test('the same decoded name repeated inside any single scope is refused',()=>{
  for(const raw of [
    String.raw`{"a":[{"id":1,"\u0069d":2}]}`,
    String.raw`{"a":{"id":1,"\u0069d":2}}`,
    String.raw`{"\u0069d":1,"id":2}`,
    String.raw`{"arr":[{},{"x":1,"\u0078":2}]}`
  ]) assert.throws(()=>rejectDuplicateJsonKeys(raw),/duplicate object key/);
});

test('BOM and forged depth overrides cannot skip JSON admission',()=>{
  assert.throws(()=>rejectDuplicateJsonKeys('\ufeff{"id":1}'),/BOM is not admitted/);
  for(const depth of [0,-1,129,1.5,NaN,Infinity])
    assert.throws(()=>rejectDuplicateJsonKeys('{"id":1}',depth),/invalid JSON key admission input/);
});
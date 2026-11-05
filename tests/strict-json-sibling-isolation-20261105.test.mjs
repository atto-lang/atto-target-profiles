import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

// Host-only strict JSON preflight checks, not compiler or backend execution.
test('same key in separate records allowed; escaped aliases within one record denied',()=>{
 assert.doesNotThrow(()=>rejectDuplicateJsonKeys('[{"k":1},{"k":2}]'));
 assert.throws(()=>rejectDuplicateJsonKeys('{"left":{"k":1,"\\u006b":2}}'),/duplicate object key/);
 assert.throws(()=>rejectDuplicateJsonKeys('{"k":1,"k":2}'),/duplicate object key/);
});
test('the caller depth bound applies to every branch without confusing siblings',()=>{
 assert.doesNotThrow(()=>rejectDuplicateJsonKeys('[{},{}]',2));
 assert.doesNotThrow(()=>rejectDuplicateJsonKeys('{"a":{"b":0}}',2));
 assert.throws(()=>rejectDuplicateJsonKeys('{"a":{"b":0}}',1),/nesting limit exceeded/);
});
test('trailing comma and additional top-level text fail before JSON.parse',()=>{
 for(const source of ['{"a":1,}','[1,]','{"a":1}{"b":2}'])
  assert.throws(()=>rejectDuplicateJsonKeys(source),/invalid or ambiguous JSON/);
});
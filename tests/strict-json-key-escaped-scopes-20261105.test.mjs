import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

test('escaped names share the same object key identity as raw Unicode names',()=>{
 for(const source of [
  '{"x":1,"\\u0078":2}',
  '{"\\u00e9":1,"é":2}',
  '{"\\ud83d\\ude00":1,"😀":2}'
 ])assert.throws(()=>rejectDuplicateJsonKeys(source),/duplicate object key/);
});

test('duplicate spelling in separate nested objects is valid and independent',()=>{
 for(const source of [
  '{"a":{"x":1},"b":{"x":2}}',
  '[{"x":1},{"x":2}]',
  '{"a":{"\\u0078":1},"b":{"x":2}}'
 ])assert.doesNotThrow(()=>rejectDuplicateJsonKeys(source));
});

test('BOM, trailing garbage and stricter depth are rejected before JSON consumers',()=>{
 assert.throws(()=>rejectDuplicateJsonKeys('\ufeff{"a":1}'),/JSON BOM/);
 assert.throws(()=>rejectDuplicateJsonKeys('{"a":1}{"b":2}'),/trailing input/);
 assert.doesNotThrow(()=>rejectDuplicateJsonKeys('{"a":{"b":0}}',2));
 assert.throws(()=>rejectDuplicateJsonKeys('{"a":{"b":{"c":0}}}',2),/nesting limit/);
 assert.throws(()=>rejectDuplicateJsonKeys('{}',129),/invalid JSON key admission input/);
});
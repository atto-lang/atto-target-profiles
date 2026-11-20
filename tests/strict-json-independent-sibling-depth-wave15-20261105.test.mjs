// Source-local JSON authority preflight, not backend or parser certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

test('a thousand sibling object maps never share duplicate-key state',()=>{
 const siblings=Array.from({length:1000},(_,i)=>({same:i,tag:'v'+i}));
 const text=JSON.stringify(siblings);
 assert.doesNotThrow(()=>rejectDuplicateJsonKeys(text,2));
 assert.equal(JSON.parse(text).length,1000);
 const bad=text.slice(0,-2)+',"same":9999}]';
 assert.throws(()=>rejectDuplicateJsonKeys(bad,2),/duplicate object key/);
});

test('depth ceiling applies to each sibling path, never the sum of siblings',()=>{
 const inputs=[
  '[{"a":[1]},{"b":[2]}]',
  '[{"a":[{"x":1}]},{"a":[{"x":2}]}]'
 ];
 assert.doesNotThrow(()=>rejectDuplicateJsonKeys(inputs[0],3));
 assert.throws(()=>rejectDuplicateJsonKeys(inputs[0],2),/nesting limit exceeded/);
 assert.doesNotThrow(()=>rejectDuplicateJsonKeys(inputs[1],4));
 assert.throws(()=>rejectDuplicateJsonKeys(inputs[1],3),/nesting limit exceeded/);
});

test('escaped JSON delimiters inside string values do not open false containers',()=>{
 const data=JSON.stringify([{k:'{"not-a-member":1, [ ]'},{k:'a,b:c}'}]);
 assert.doesNotThrow(()=>rejectDuplicateJsonKeys(data,2));
 assert.equal(JSON.parse(data).length,2);
 const alias='[{"name":1,"\\u006eame":2}]';
 assert.throws(()=>rejectDuplicateJsonKeys(alias),/duplicate object key/);
});

test('truncated siblings and trailing commas are never mistaken for valid completion',()=>{
 for(const bad of ['[{"a":1},{"b":2}','[{"a":1},]', '[{"a":1}, {"b":2},]',
                   '{"a":1} {"b":2}', '[{"a":1},{"a":2}] garbage'])
  assert.throws(()=>rejectDuplicateJsonKeys(bad),/invalid or ambiguous JSON/);
});

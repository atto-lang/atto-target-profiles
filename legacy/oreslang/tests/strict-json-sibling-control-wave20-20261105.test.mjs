import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys as check} from '../src/strict-json-keys.mjs';

test('escaped key aliases collide within their own object and not neighboring objects',()=>{
  const repeated=String.raw`[{"alpha":1},{"\u0061lpha":2},{"child":{"alpha":3}}]`;
  assert.doesNotThrow(()=>check(repeated,3));
  const forged=String.raw`[{"alpha":1,"\u0061lpha":2}]`;
  assert.throws(()=>check(forged,2),/duplicate object key/);
});

test('a full set of independent sibling scopes does not exhaust the nesting budget',()=>{
  const text=JSON.stringify(Array.from({length:256},(_,i)=>({same:i,child:{same:i}})));
  assert.doesNotThrow(()=>check(text,3));
  assert.throws(()=>check(text,2),/nesting limit exceeded/);
});

test('escaped quotes in JSON values are inert, not container delimiters',()=>{
  const data=JSON.stringify([{payload:'"}] , {"not-a-key":2'}, {payload:'\\\\" : false'}]);
  assert.doesNotThrow(()=>check(data,2));
  assert.equal(JSON.parse(data)[0].payload.includes('not-a-key'),true);
});

test('truncated siblings and duplicate nested aliases fail without a successful preflight',()=>{
  for(const raw of ['[{"a":1},]', '[{"a":1},{"b":2}', '{"outer":{"key":1,"key":2}}', '{} {}']){
    assert.throws(()=>check(raw),/duplicate object key|invalid or ambiguous JSON/);
  }
  assert.throws(()=>check('{}',0),/invalid JSON key admission input/);
});

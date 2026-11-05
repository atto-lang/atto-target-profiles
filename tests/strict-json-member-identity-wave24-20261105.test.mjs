import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys as preflight} from '../src/strict-json-keys.mjs';

test('escaped spelling and literal member collide within one object',()=>{
 const slash=String.fromCharCode(92);
 assert.throws(()=>preflight('{"key":1,"'+slash+'u006bey":2}'),/duplicate object key/);
 assert.throws(()=>preflight('{"nested":{"x":1,"'+slash+'u0078":2}}'),/duplicate object key/);
});

test('the same member names are legal across siblings and array object elements',()=>{
 const text='{"left":{"name":1},"right":{"name":2},"items":[{"name":3},{"name":4}]}';
 assert.doesNotThrow(()=>preflight(text));
 assert.equal(JSON.parse(text).items[1].name,4);
});

test('container budget is enforced even when child objects are empty',()=>{
 assert.doesNotThrow(()=>preflight('{"a":{}}',2));
 assert.throws(()=>preflight('{"a":{}}',1),/nesting limit exceeded/);
 assert.throws(()=>preflight('[]',129),/invalid JSON key admission input/);
 assert.throws(()=>preflight('[]',0),/invalid JSON key admission input/);
});

test('ambiguous separators, additional roots and BOM are refused',()=>{
 assert.throws(()=>preflight('{"x" 1}'),/expected colon/);
 assert.throws(()=>preflight('{"x":1,}'),/expected string/);
 assert.throws(()=>preflight('{"x":1} {"y":2}'),/trailing input/);
 assert.throws(()=>preflight(String.fromCharCode(0xfeff)+'{}'),/JSON BOM is not admitted/);
});

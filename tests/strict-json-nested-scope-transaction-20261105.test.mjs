import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

const check = raw => {rejectDuplicateJsonKeys(raw); return JSON.parse(raw);};

test('same decoded key is legal in independent sibling array elements and record scopes', () => {
  const raw = '{"items":[{"\\u0061":1},{"a":2}],"other":{"a":3}}';
  assert.deepEqual(check(raw), {items:[{a:1},{a:2}],other:{a:3}});
  for (const invalid of [
    '{"items":[{"a":1,"\\u0061":2}]}',
    '{"wrapper":{"inner":{"a":1,"\\u0061":2}}}',
    '{"outer":1,"\\u006futer":2}'
  ]) assert.throws(() => rejectDuplicateJsonKeys(invalid), /duplicate object key/);
});

test('malformed object separators and dangling members are denied before normal parsing', () => {
  for (const raw of ['{"a":1 "b":2}', '{"a":1,}', '{"a":1,,"b":2}', '{"a" 1}'])
    assert.throws(() => rejectDuplicateJsonKeys(raw), /invalid or ambiguous JSON/);
  assert.deepEqual(check('{"a":1,"b":[true,false,null]}'), {a:1,b:[true,false,null]});
});

test('BOM denial is exact; allowed JSON whitespace must not bypass duplicate checking', () => {
  assert.throws(() => rejectDuplicateJsonKeys('\uFEFF{"a":1}'), /JSON BOM is not admitted/);
  assert.throws(() => rejectDuplicateJsonKeys(' \n {"a":1,"\\u0061":2} \t'), /duplicate object key/);
  assert.deepEqual(check('\n {"a":1} \t'), {a:1});
});

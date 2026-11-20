// Host-only JSON authority boundaries; not runtime or backend parity.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

const accept = source => { rejectDuplicateJsonKeys(source); JSON.parse(source); };
const reject = source =>
  assert.throws(() => rejectDuplicateJsonKeys(source), /duplicate object key/);

test('escaped and raw astral keys denote the same object authority name', () => {
  reject('{"\\ud83d\\ude00":1,"😀":2}');
  reject('{"\\u0078":1,"x":2}');
});

test('identically named keys are valid in different sibling objects', () => {
  accept('{"left":{"grant":"read"},"right":{"grant":"write"}}');
  accept('{"items":[{"id":1},{"id":2},{"id":3}]}');
});

test('nested duplicate names are denied per object frame', () => {
  reject('{"items":[{"grant":1,"grant":2}]}');
  reject('{"outer":{"key":0,"key":1},"other":{"key":2}}');
});

test('decoded NUL and newline key identities cannot hide duplicates', () => {
  reject('{"\\u0000":1,"\\u0000":2}');
  reject('{"line\\nfeed":1,"line\\u000afeed":2}');
});

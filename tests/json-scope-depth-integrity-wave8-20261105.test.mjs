import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

test('duplicate key scope is local to one object, not its siblings', () => {
  assert.doesNotThrow(() => rejectDuplicateJsonKeys('{"a":{"id":1},"b":[{"id":2},{"id":3}]}'));
  assert.throws(() => rejectDuplicateJsonKeys('{"a":{"id":1,"\\u0069d":2}}'), /duplicate object key/);
});

test('depth limit gates each new container without blocking root scalar entries', () => {
  assert.doesNotThrow(() => rejectDuplicateJsonKeys('{"a":1}', 1));
  assert.doesNotThrow(() => rejectDuplicateJsonKeys('[1]', 1));
  assert.throws(() => rejectDuplicateJsonKeys('{"a":[]}', 1), /nesting limit exceeded/);
  assert.throws(() => rejectDuplicateJsonKeys('[[]]', 1), /nesting limit exceeded/);
  assert.throws(() => rejectDuplicateJsonKeys('{}', 129), /invalid JSON key admission input/);
});

test('quoted punctuation is not a structural token; extra texts and BOM are refused', () => {
  assert.doesNotThrow(() => rejectDuplicateJsonKeys('{"token":"a,b:{x}","more":[]}'));
  assert.throws(() => rejectDuplicateJsonKeys('{"ok":1}{"ok":2}'), /trailing input/);
  assert.throws(() => rejectDuplicateJsonKeys('\ufeff{}'), /JSON BOM/);
});

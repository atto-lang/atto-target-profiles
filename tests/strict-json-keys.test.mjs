import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {rejectDuplicateJsonKeys} from '../src/strict-json-keys.mjs';

const accepts = text => {rejectDuplicateJsonKeys(text); JSON.parse(text);};
const refuses = text => assert.throws(() => rejectDuplicateJsonKeys(text));

test('unique JSON names are scoped to each object, including nested graph nodes', () => {
  for (const text of [
    '{}', '[]', 'null', 'true', '0', '-0.5e2',
    '{"x":1,"y":2}',
    '{"x":[{}, {"x":1}], "y":{"x":2}}',
    '{"data":"escaped \\" quote", "names":["a","b"]}'
  ]) accepts(text);
});

test('duplicate names fail closed, including escaped/Unicode-equivalent keys', () => {
  for (const text of [
    '{"grants":[],"grants":["fs.write"]}',
    '{"target":"ebpf","tar\\u0067et":"server"}',
    '{"x":1,"\\u0078":2}',
    '{"\\uD83D\\uDE00":1,"😀":2}',
    '{"nodes":[{"id":"a","id":"b"}]}',
    '{"a":{"b":1,"b":2}}',
    '{"a":[{"b":1,"b":2}]}'
  ]) refuses(text);
});

test('malformed text and excessive nesting cannot bypass admission', () => {
  for (const text of [
    '\ufeff{"entry":"a"}', '{"a":1', '{"a":1,}',
    '{"a":1} trailing', '[1,]', '[1,,2]', '{"a":1,,"b":2}'
  ]) assert.throws(() => {rejectDuplicateJsonKeys(text); JSON.parse(text);});
  let nested = '0';
  for (let depth = 0; depth < 130; ++depth) nested = '[' + nested + ']';
  refuses(nested);
});

test('seeded unique/duplicate JSON key differential matrix', () => {
  for (let n = 0; n < 1000; ++n) {
    const keys = Array.from({length: n % 19 + 1}, (_, i) => 'field_' + i);
    const clean = '{' + keys.map(k => JSON.stringify(k) + ':' + JSON.stringify(k + n)).join(',') + '}';
    accepts(clean);
    refuses(clean.slice(0, -1) + ',' + JSON.stringify(keys[0]) + ':false}');
  }
});

test('actual target-profile CLI denies a duplicate key with no valid output', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'ores-duplicate-closure-'));
  const path = join(folder, 'closure.json');
  try {
    const graph = '{"schemaVersion":1,"entry":"ores_xdp","entry":"ores_xdp",' +
      '"nodes":[{"id":"ores_xdp","targets":["ebpf"],"requires":[],"imports":[]}]}';
    await writeFile(path, graph, 'utf8');
    const cli = new URL('../bin/oreslang-target.mjs', import.meta.url).pathname;
    const result = spawnSync(process.execPath,
      [cli, 'check-closure', path, '--target=ebpf', '--backend=llvm', '--grants='],
      {encoding:'utf8', timeout:15000});
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /duplicate object key/);
  } finally {
    await rm(folder, {recursive:true, force:true});
  }
});

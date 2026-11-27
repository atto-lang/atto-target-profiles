import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateHostedLinuxObject as validate} from '../src/hosted-linux-object.mjs';

const targets = ['x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu',
  'i686-unknown-linux-gnu', 'armv7-unknown-linux-gnueabihf'];
for (const triple of targets) {
  test(`${triple}: real object mutation matrix (toolchain-only)`, {skip: !process.env.ATTO_CLANG}, async t => {
    const dir = mkdtempSync(join(tmpdir(), 'atto-elf-mutations-'));
    try {
      const path = join(dir, 'probe.o');
      const p = spawnSync(process.env.ATTO_CLANG,
        [`--target=${triple}`, '-ffreestanding', '-x', 'c', '-c', '-', '-o', path],
        {input: 'long long probe(long long x) { return x + 4294967296LL; }', encoding: 'utf8', timeout: 20000});
      assert.equal(p.status, 0, p.stderr || String(p.error));
      const bytes = readFileSync(path);
      const wide = triple === targets[0] || triple === targets[1];
      await t.test('expected bit width', () => assert.equal(validate(bytes, triple, triple).pointerBits, wide ? 64 : 32));
      for (const other of targets.filter(x => x !== triple)) {
        await t.test(`reject ${other}`, () => assert.throws(() => validate(bytes, other, other), /E_TARGET_OBJECT/));
      }
      const mutants = [['truncated', bytes.subarray(0, bytes.length - 1)]];
      for (const [name, offset, size, value] of [
        ['overflow section offset', wide ? 40 : 32, wide ? 8 : 4, 255],
        ['zero section count', wide ? 60 : 48, 2, 0],
        ['zero section size', wide ? 58 : 46, 2, 0],
        ['zero section-name index', wide ? 62 : 50, 2, 0],
        ['entry address', 24, 1, 1],
        ['program table offset', wide ? 32 : 28, 1, 1],
      ]) {
        const bad = Buffer.from(bytes);
        bad.fill(value, offset, offset + size);
        mutants.push([name, bad]);
      }
      for (const [name, bad] of mutants) {
        await t.test(name, () => assert.throws(() => validate(bad, triple, triple), /E_TARGET_OBJECT/));
      }
    } finally { rmSync(dir, {recursive: true, force: true}); }
  });
}

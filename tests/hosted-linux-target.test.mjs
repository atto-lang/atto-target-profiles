import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveHostedLinuxTarget as resolve} from '../src/hosted-linux-target.mjs';

const cases = [
  ['x86_64-unknown-linux-gnu', 'x86_64-linux-musl', 64, 62, 'sysv'],
  ['aarch64-unknown-linux-gnu', 'aarch64-linux-musl', 64, 183, 'aapcs64'],
  ['i686-unknown-linux-gnu', 'x86-linux-musl', 32, 3, 'sysv'],
  ['armv7-unknown-linux-gnueabihf', 'arm-linux-musleabihf', 32, 40, 'aapcs32-hardfp'],
];
for (const [ir, musl, bits, machine, abi] of cases) {
  for (const [link, libc] of [[ir, 'glibc'], [musl, 'musl']]) {
    test(`${ir} / ${libc}: explicit candidate`, () => {
      const target = resolve(ir, link);
      assert.deepEqual(target, {irTriple: ir, linkTriple: link, libc, pointerBits: bits,
        actorRefBits: 32, endian: 'little', objectFormat: 'elf', elfMachine: machine,
        callingConvention: abi, classification: 'DECLARED_CANDIDATE_ONLY'});
      assert.ok(Object.isFrozen(target));
    });
  }
  for (const [other, otherMusl] of cases.filter(row => row[0] !== ir)) {
    test(`${ir} rejects ${other} and ${otherMusl}`, () => {
      assert.throws(() => resolve(ir, other), /E_TARGET_ABI/);
      assert.throws(() => resolve(ir, otherMusl), /E_TARGET_ABI/);
    });
  }
}
for (const bad of [undefined, null, '', 'host', 'amd64', 'constructor', '__proto__', 'wasm32-unknown-unknown', 'armv7-unknown-linux-gnueabi', 'riscv64gc-unknown-linux-gnu', {}]) {
  test(`reject invalid triple ${String(bad)}`, () => {
    assert.throws(() => resolve(bad, cases[0][0]), /E_TARGET_ABI/);
    assert.throws(() => resolve(cases[0][0], bad), /E_TARGET_ABI/);
  });
}

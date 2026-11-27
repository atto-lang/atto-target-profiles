import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateHostedLinuxObject as validate} from '../src/hosted-linux-object.mjs';

const lanes = [
  ['x86_64-unknown-linux-gnu', 64, 62], ['aarch64-unknown-linux-gnu', 64, 183],
  ['i686-unknown-linux-gnu', 32, 3], ['armv7-unknown-linux-gnueabihf', 32, 40],
];
function header(bits, machine) {
  const wide = bits === 64, size = wide ? 64 : 52, sectionSize = wide ? 64 : 40;
  const b = Buffer.alloc(size + 2 * sectionSize);
  b.writeUInt32BE(0x7f454c46); b[4] = wide ? 2 : 1; b[5] = b[6] = 1;
  b.writeUInt16LE(1,16); b.writeUInt16LE(machine,18); b.writeUInt32LE(1,20);
  if (wide) b.writeBigUInt64LE(BigInt(size),40); else b.writeUInt32LE(size,32);
  if (machine === 40) b.writeUInt32LE(0x05000000,36);
  b.writeUInt16LE(size,wide ? 52 : 40); b.writeUInt16LE(sectionSize,wide ? 58 : 46);
  b.writeUInt16LE(2,wide ? 60 : 48); b.writeUInt16LE(1,wide ? 62 : 50);
  return b;
}
for (const [triple,bits,machine] of lanes) {
  test(`${triple}: structural candidate and all other CPU lanes rejected`, () => {
    const b = header(bits,machine);
    assert.equal(validate(b,triple,triple).classification,'ELF_OBJECT_STRUCTURE_ONLY');
    for (const [other] of lanes) if (other !== triple) assert.throws(() => validate(b,other,other),/E_TARGET_OBJECT/);
  });
  test(`${triple}: truncated, executable, wrong class, wrong endian, bad version and section table rejected`, () => {
    const b = header(bits,machine), wide = bits === 64;
    const variants = [b.subarray(0,20), b.subarray(0,b.length-1)];
    for (const [offset,value] of [[4,3],[5,2],[6,0],[16,2],[20,0],[24,1],[wide ? 52 : 40,0],[wide ? 56 : 44,1],[wide ? 58 : 46,0],[wide ? 60 : 48,0],[wide ? 62 : 50,2]]) {
      const bad = Buffer.from(b); bad[offset] = value; variants.push(bad);
    }
    const bad = Buffer.from(b); if(wide) bad.writeBigUInt64LE(0xffffffffffffffffn,40); else bad.writeUInt32LE(0xffffffff,32); variants.push(bad);
    for (const v of variants) assert.throws(() => validate(v,triple,triple),/E_TARGET_OBJECT/);
  });
  test(`${triple}: real Clang relocatable (toolchain probe only)`, {skip: !process.env.ATTO_CLANG}, () => {
    const dir = mkdtempSync(join(tmpdir(),'atto-object-'));
    try {
      const path = join(dir,'probe.o');
      const p = spawnSync(process.env.ATTO_CLANG,[`--target=${triple}`,'-ffreestanding','-x','c','-c','-','-o',path],{input:'long long probe(long long n) { return n + 4294967296LL; }',encoding:'utf8',timeout:20000});
      assert.equal(p.status,0,p.stderr || String(p.error));
      const bytes = readFileSync(path);
      assert.equal(validate(bytes,triple,triple).machine,machine);
      for (const [other] of lanes) if (other !== triple) assert.throws(() => validate(bytes,other,other),/E_TARGET_OBJECT/);
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
}
test('ARM soft-float, conflicting float flags, wrong EABI rejected', () => {
  const triple = lanes[3][0];
  for (const flags of [0x05000200,0x05000600,0x04000000]) {
    const b = header(32,40); b.writeUInt32LE(flags,36);
    assert.throws(() => validate(b,triple,triple),/E_TARGET_OBJECT/);
  }
});
test('non-byte input and wrong link target rejected', () => {
  const triple = lanes[0][0];
  assert.throws(() => validate({},triple,triple),/E_TARGET_OBJECT/);
  assert.throws(() => validate(header(64,62),triple,lanes[1][0]),/E_TARGET_ABI/);
});

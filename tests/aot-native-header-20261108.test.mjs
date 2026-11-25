import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNativeMachineHeader as inspect} from '../src/aot-native-header.mjs';

function elf(machine) {
  const b=Buffer.alloc(64);
  b.set([0x7f,0x45,0x4c,0x46,2,1,1]);
  b.writeUInt16LE(machine,18);
  return b;
}
function pe(machine) {
  const b=Buffer.alloc(128);
  b.write('MZ',0,'ascii');
  b.writeUInt32LE(64,0x3c);
  b.set([0x50,0x45,0,0],64);
  b.writeUInt16LE(machine,68);
  return b;
}
function macho(cpu) {
  const b=Buffer.alloc(32);
  b.set([0xcf,0xfa,0xed,0xfe],0);
  b.writeUInt32LE(cpu,4);
  return b;
}
const cases=[
  ['linux-x86_64',elf(62)],['linux-aarch64',elf(183)],
  ['windows-x86_64',pe(0x8664)],['windows-aarch64',pe(0xaa64)],
  ['macos-x86_64',macho(0x01000007)],
  ['macos-aarch64',macho(0x0100000c)]
];

test('six OS/CPU formats prove only a header, never compiled guest execution',()=>{
  for(const [target,bytes] of cases) {
    const v=inspect(bytes,target);
    assert.equal(v.classification,'STRUCTURAL_MACHINE_HEADER_ONLY');
    assert.equal(v.target,target);
    assert.equal(v.fullTargetAbi,'NOT_VERIFIED');
    assert.equal(v.signature,'NOT_VERIFIED');
    assert.equal(v.compiledGuestExecution,'NOT_EXECUTED');
    assert.ok(Object.isFrozen(v));
  }
});

test('valid format magic cannot launder a wrong CPU or target OS',()=>{
  for(let i=0;i<cases.length;i++){
    const [target,bytes]=cases[i];
    const alternate=target.replace('x86_64','XXX').replace('aarch64','x86_64').replace('XXX','aarch64');
    assert.throws(()=>inspect(bytes,alternate),/machine|cpuType/);
    const otherOs=target.startsWith('linux')?'windows-x86_64':'linux-x86_64';
    assert.throws(()=>inspect(bytes,otherOs),/header|signature/);
  }
});
test('truncated, corrupt and 32-bit target headers fail closed',()=>{
  for(const [target,bytes] of cases) {
    assert.throws(()=>inspect(bytes.subarray(0,8),target),/header|signature/);
    const changed=Buffer.from(bytes);changed[0]=0;
    assert.throws(()=>inspect(changed,target),/header|signature/);
  }
  const elf32=elf(62);elf32[4]=1;
  assert.throws(()=>inspect(elf32,'linux-x86_64'),/ELF64/);
  const badPe=pe(0x8664);badPe.writeUInt32LE(0xfffffff0,0x3c);
  assert.throws(()=>inspect(badPe,'windows-x86_64'),/PE signature/);
  const fatMacho=Buffer.from('cafebabe000000010100000700000000', 'hex');
  assert.throws(()=>inspect(fatMacho,'macos-x86_64'),/Mach-O/);
});
test('unsupported target and forged object shapes cannot make a header claim',()=>{
  const bytes=elf(62);
  for(const target of ['ios-x86_64','linux-i386','darwin-x86_64',null,{}])
    assert.throws(()=>inspect(bytes,target),/unsupported/);
  assert.throws(()=>inspect({},'linux-x86_64'),/bytes/);
  const proxy=new Proxy(bytes,{});
  assert.throws(()=>inspect(proxy,'linux-x86_64'),/bytes/);
});

test('prototype and shadow accessor attacks never execute caller-controlled code',()=>{
  let getterCalls=0;
  class PoisonedArray extends Uint8Array {
    get byteLength(){ getterCalls++; throw new Error('poisoned view'); }
    *[Symbol.iterator](){ getterCalls++; throw new Error('poisoned iterator'); }
  }
  assert.throws(()=>inspect(new PoisonedArray(elf(62)), 'linux-x86_64'),/bytes/);
  const shadowed=Uint8Array.from(elf(62));
  Object.defineProperty(shadowed,'byteLength',{get(){getterCalls++;throw new Error('poisoned length')}});
  Object.defineProperty(shadowed,Symbol.iterator,{get(){getterCalls++;throw new Error('poisoned iteration')}});
  assert.equal(inspect(shadowed,'linux-x86_64').classification,'STRUCTURAL_MACHINE_HEADER_ONLY');
  assert.equal(getterCalls,0);
});

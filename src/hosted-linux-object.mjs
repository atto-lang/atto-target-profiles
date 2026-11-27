import {resolveHostedLinuxTarget} from './hosted-linux-target.mjs';

// Structural relocatable-object preflight shared by native backend adapters.
// It does not verify relocations, ARM attributes, libc, provenance or execution.
export function validateHostedLinuxObject(bytes, irTriple, linkTriple) {
  const target = resolveHostedLinuxTarget(irTriple, linkTriple);
  const fail = () => { throw new Error('E_TARGET_OBJECT: invalid or mismatched ELF relocatable'); };
  if (!Buffer.isBuffer(bytes)) fail();
  const wide = target.pointerBits === 64;
  const size = wide ? 64 : 52;
  const sectionSize = wide ? 64 : 40;
  if (bytes.length < size || bytes.readUInt32BE(0) !== 0x7f454c46 ||
      bytes[4] !== (wide ? 2 : 1) || bytes[5] !== 1 || bytes[6] !== 1 ||
      bytes.readUInt16LE(16) !== 1 || bytes.readUInt16LE(18) !== target.elfMachine ||
      bytes.readUInt32LE(20) !== 1 || bytes.readUInt16LE(wide ? 52 : 40) !== size) fail();
  const word = offset => wide ? bytes.readBigUInt64LE(offset) : BigInt(bytes.readUInt32LE(offset));
  // Relocatable objects must not have an entry point or loadable program table.
  if (word(24) !== 0n || word(wide ? 32 : 28) !== 0n || bytes.readUInt16LE(wide ? 56 : 44) !== 0) fail();
  const flags = bytes.readUInt32LE(wide ? 48 : 36);
  if (target.elfMachine === 40 && ((flags >>> 24) !== 5 || ![0, 0x400].includes(flags & 0x600))) fail();
  const sections = word(wide ? 40 : 32);
  const count = bytes.readUInt16LE(wide ? 60 : 48);
  const names = bytes.readUInt16LE(wide ? 62 : 50);
  // Extended section numbering is deliberately unsupported in this bounded gate.
  if (sections < BigInt(size) || count === 0 || names === 0 || names >= count ||
      bytes.readUInt16LE(wide ? 58 : 46) !== sectionSize ||
      sections + BigInt(count) * BigInt(sectionSize) > BigInt(bytes.length)) fail();
  return Object.freeze({classification: 'ELF_OBJECT_STRUCTURE_ONLY', machine: target.elfMachine,
    pointerBits: target.pointerBits, irTriple: target.irTriple, linkTriple: target.linkTriple});
}

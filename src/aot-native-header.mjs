// Supplemental, source-only native executable machine-header admission.
// This is NOT a linker proof, signed artifact, complete ABI validation or guest execution.
import {types as nodeTypes} from 'node:util';

const targets = new Set([
  'linux-x86_64', 'linux-aarch64',
  'windows-x86_64', 'windows-aarch64',
  'macos-x86_64', 'macos-aarch64'
]);

function reject(reason) { throw new Error('NATIVE_HEADER_UNVERIFIED: ' + reason); }

/** Inspect only the declared executable's OS format and CPU machine header.
 * Always independently verify full bytes/digest, compiler provenance and
 * native guest execution before making a stronger release claim. */
export function inspectNativeMachineHeader(bytes, target) {
  if (typeof target !== 'string' || !targets.has(target))
    reject('unsupported OS/architecture target');
  if (!(bytes instanceof Uint8Array) || nodeTypes.isProxy(bytes) ||
      bytes.byteLength > 64 * 1024 * 1024)
    reject('expected bounded non-proxy artifact bytes');
  const b = Buffer.from(bytes); // snapshot before reading any untrusted data
  const expectedCpu = target.endsWith('x86_64') ? 'x86_64' : 'aarch64';

  if (target.startsWith('linux-')) {
    // ELF64, little endian. A header magic alone is insufficient.
    if (b.length < 64 || b.toString('hex', 0, 4) !== '7f454c46' ||
        b[4] !== 2 || b[5] !== 1 || b[6] !== 1)
      reject('missing canonical little-endian ELF64 header');
    const machine = b.readUInt16LE(18);
    if (machine !== (expectedCpu === 'x86_64' ? 62 : 183))
      reject('ELF machine does not match declared target');
  } else if (target.startsWith('windows-')) {
    if (b.length < 64 || b.toString('ascii', 0, 2) !== 'MZ')
      reject('missing DOS/PE header');
    const pe = b.readUInt32LE(0x3c);
    if (pe < 64 || pe > b.length - 24 ||
        b.toString('hex', pe, pe + 4) !== '50450000')
      reject('PE signature is absent, out of bounds or malformed');
    const machine = b.readUInt16LE(pe + 4);
    if (machine !== (expectedCpu === 'x86_64' ? 0x8664 : 0xaa64))
      reject('PE COFF machine does not match declared target');
  } else {
    // Mach-O 64, little endian, thin binaries only. Fat/universal images need
    // dedicated bounded arch-slice parsing and are deliberately not accepted.
    if (b.length < 32 || b.toString('hex', 0, 4) !== 'cffaedfe')
      reject('expected thin little-endian 64-bit Mach-O header');
    const machine = b.readUInt32LE(4);
    if (machine !== (expectedCpu === 'x86_64' ? 0x01000007 : 0x0100000c))
      reject('Mach-O cpuType does not match declared target');
  }
  return Object.freeze({
    classification: 'STRUCTURAL_MACHINE_HEADER_ONLY',
    target,
    architecture: expectedCpu,
    fullTargetAbi: 'NOT_VERIFIED',
    signature: 'NOT_VERIFIED',
    compiledGuestExecution: 'NOT_EXECUTED'
  });
}

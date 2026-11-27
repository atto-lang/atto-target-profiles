// Candidate target metadata only: never grants compiler or release support.
const rows = [
  ['x86_64-unknown-linux-gnu', 'x86_64-linux-musl', 64, 62, 'sysv'],
  ['aarch64-unknown-linux-gnu', 'aarch64-linux-musl', 64, 183, 'aapcs64'],
  ['i686-unknown-linux-gnu', 'x86-linux-musl', 32, 3, 'sysv'],
  ['armv7-unknown-linux-gnueabihf', 'arm-linux-musleabihf', 32, 40, 'aapcs32-hardfp'],
];
const targets = new Map(rows.map(row => [row[0], Object.freeze(row)]));

// The LLVM experiment emits GNU-labelled IR and links a musl executable.
// Do not claim GNU runtime parity from a musl link or infer host fallback.
export function resolveHostedLinuxTarget(irTriple, linkTriple) {
  const row = targets.get(irTriple);
  if (!row || typeof linkTriple !== 'string' || (linkTriple !== row[0] && linkTriple !== row[1])) {
    throw new Error('E_TARGET_ABI: unknown or incompatible IR/link target');
  }
  const musl = linkTriple === row[1];
  return Object.freeze({
    irTriple, linkTriple, libc: musl ? 'musl' : 'glibc',
    pointerBits: row[2], actorRefBits: 32, endian: 'little',
    objectFormat: 'elf', elfMachine: row[3], callingConvention: row[4],
    classification: 'DECLARED_CANDIDATE_ONLY',
  });
}

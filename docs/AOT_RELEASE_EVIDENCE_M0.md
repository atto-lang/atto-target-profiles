# Native AOT release evidence — local artifact gate (M0)

`src/aot-release-evidence.mjs` checks a caller-supplied **regular local file**
against a bounded, exact-field provenance manifest (full source and compiler
Git head/tree IDs, compiler binary SHA-256, artifact SHA-256/byte count,
target/backend labels). It checks only platform magic bytes for ELF, PE, and
Mach-O, then reports `LOCAL_BINARY_INTEGRITY_ONLY`.

This does **not** verify the compiler build provenance, target machine
architecture or ABI, signatures, dynamic dependencies, OS sandbox, native
execution, release reproducibility, macOS/iOS entitlements or Windows codesign.
The manifest is a declaration from the caller, not an independent attestation.

A real release gate still needs an independently verified source checkout,
compiler binary, target ABI inspector, signed release records, and executed
per-target positive/negative guest cases with nonzero workflow steps. Never
replace compiler-backed proof with a locally matching checksum.


The supplemental synchronous integrity inspector does not replace the existing async `admitAotCandidate` / `verifyLocalAotArtifact` APIs; both remain available. The inspector uses a bounded read and explicitly reports that guest execution, signature and target ABI are unverified.

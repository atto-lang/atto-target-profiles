# Experimental core Wasm scalar artifact manifest v1

The existing `oreslang.core-wasm.i64-v1` artifact identity is unchanged.
An opt-in, explicit `oreslang.core-wasm.f64-v1` identity describes a zero-argument
`() -> f64` scalar guest. Both identities are strictly allowlisted, and every
other name, including f32 and future/unknown versions, is rejected.

Required fields remain unchanged: `schemaVersion: 1`, `artifactType`,
`target: wasm32`, `backend: wasm`, `environment` (browser, edge-js or
edge-wasi), `entry`, exact SHA-256 and byte size, empty imports and required
capabilities, bounded private memory and compiler/source/LLVM IR SHA-256
provenance.

This registry validates **manifest metadata**, not a Wasm binary or source
effects. A manifest cannot authorize host capabilities, attest compiler origin,
prove Java/LLVM semantic parity, or authorize runtime/tenant isolation. The
consumer must independently hash the original unmodified Wasm bytes, inspect
actual imports/exports/memory, verify the selected exact `() -> i64` or
`() -> f64` binary ABI, and enforce worker limits before guest execution.

The f64 identity is coordinated with the **draft** Wasm backend PR
[oreslang-source.wasm #408](https://github.com/ores-truffle-oreslang/oreslang-source.wasm/pull/408).
This is a source-free contract extension, not a release certificate or proof
that the Wasm compiler-backed float guest test has executed. Independent
review and exact-head tests are still required; do not mark float parity
verified from a passing manifest validator.

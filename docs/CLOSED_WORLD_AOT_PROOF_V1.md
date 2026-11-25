# Closed-world AttoLang AOT manifest and proof admission (v1 proposal)

Roadmap tasks #31 and #40, 2026-11-08. SOURCE-FREE STRUCTURAL REFERENCE ONLY.

src/aot-admission.mjs checks own-data-only records and cross-field identities; tests/aot-admission.test.mjs exercises SHA-256 hashing and adversarial mutations.

## Closed-world source contract
Require an exact source commit and tree, compiler hash, backend, target triple, compressed 32-bit guest-pointer width, at least one digest-pinned .atto source, and sorted bounded modules/types/exports/actor roots/static specializations/import ABI symbols. Every actor entry must be a declared export. Dynamic loading, mandatory runtime reflection, runtime JIT and open-world source admission are forbidden. A caller-written manifest cannot prove reachability.

## Receipt schema and trust
Bind the manifest SHA-256, source/tree and compiler SHA-256, target, artifact bytes/digest/format, first-party workflow run attempt, job ID and runner ID, nonempty successfully executed named job steps, executed compiled guest positives, no-artifact compiler negatives, zero runtime compiler invocations, and zero tracing-GC events. verifyArtifactBytes hashes the actual supplied binary, never merely a ZIP or claimed digest.

Even a plausible receipt can be forged. All API outcomes always mark authenticated=false and certified=false; this structural reference NEVER authorizes an AOT release, PR merge, or private-source export. A recorded zero tracing-GC count is self-asserted metadata, not a measurement. Independent native execution, trusted GitHub provider and review readback, authentic exact-head steps, binary provenance, post-opt closed-world compiler reachability, and mutation evidence remain mandatory.

## Compiler-facing follow-up
Make real Java/GraalVM, LLVM, .NET NativeAOT, Wasm and Forge/Cranelift compile final typed program graphs, all callbacks/actor entries/static generic witnesses, and reject unlisted imports, runtime code generation, unbounded specializations and forbidden reflection BEFORE any executable artifact. Publish separate authenticated source/target/compiler and actual native guest execution receipts. No external private-source mirrors without explicit independent approval.

Structural model command: node --test tests/aot-admission.test.mjs

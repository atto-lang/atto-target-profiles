> **AI agent instructions (organization-wide):** Before working on code, issues, or pull requests, read and follow the [organization `AGENTS.md`](https://github.com/atto-lang/.github/blob/main/AGENTS.md), including its **merge-first stealth-development policy**. Honor any repository-local `AGENTS.md`, explicit holds, and GitHub-enforced rules.

# atto-target-profiles

Target platform profiles, runtime capabilities, and portability constraints for AttoLang.

## Naming migration and language authority

This repository is maintained at [atto-lang/atto-target-profiles](https://github.com/atto-lang/atto-target-profiles); use `https://github.com/atto-lang/atto-target-profiles.git` for Git remotes and canonical `.atto` source examples. The normative language contract is [atto-spec](https://github.com/atto-lang/atto-spec), with executable guest evidence tracked by [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance). Follow current ownership, borrowing, effects, actor, and syntax rules there; do not infer implemented features from a README or unexecuted CI.

## Purpose

Declare supported backend/host capabilities and explicit unsupported target combinations.

## Repository responsibilities

- Keep interfaces, schemas, and behavior documented in a backend-neutral form where applicable.
- Use test fixtures and reproducible evidence to distinguish proposed behavior from implemented behavior.
- Record breaking changes, migration notes, and dependencies on other AttoLang components.

## Validation

Validation should rely on checked-in tests and exact-commit CI results. When reporting parity, distinguish **passed**, **failed**, **unsupported**, and **not executed**. Avoid inferring guest-runtime support from host-only tests.

## Status and development

This README records the intended role of this repository; it is not a claim of feature completeness. Consult the source tree and workflow files for actual implementation and verified build commands. Contributions should preserve compatibility with the canonical language contract.

## Ecosystem

- [AttoLang](https://github.com/atto-lang)
- [Language specification](https://github.com/atto-lang/atto-spec)
- [Cross-platform conformance](https://github.com/atto-lang/atto-platform-conformance)

## Repository ownership and contribution routing

**Belongs here:** Machine-readable target profiles, backend capability names, supported host/ABI combinations, memory constraints and explicit exclusions.

**Belongs elsewhere:** Device drivers belong in atto-platform.*; compiler implementers enforce the profiles inside atto-source.*; language semantics remain in atto-spec.

**Security and portability boundary:** Profiles are declarations, not proof: require conformance receipts for feature support and fail-closed capability admission on unsupported targets.

AttoLang is the canonical project name; new source, examples and documentation use `.atto` and the `atto-lang` repository organization. This README defines scope, not feature readiness.

**Acceptance:** name the exact source SHA/tree, runtime/toolchain, positive and negative checks and execution receipt before claiming support. Host-only tests and empty CI steps do not prove guest execution.

## Migration history and maintainer safeguards

The archived predecessor is [ores-truffle-oreslang/oreslang-target-profiles](https://github.com/ores-truffle-oreslang/oreslang-target-profiles). This repository is the canonical AttoLang home; do not describe the migration as an ID-preserving GitHub transfer without independently verified evidence. Historical `.ores` fixtures and legacy CLI/package identifiers remain compatibility inputs; new source uses `.atto`. Preserve pinned source identities until their dependent evidence is regenerated.

[atto-lang](https://github.com/atto-lang) owns the language, compiler, runtime, targets and conformance; [atto-co](https://github.com/atto-co) is separately scoped to hosted control planes, deployment, tenancy and billing. A future transfer or carve-out requires owner authorization and security review. Verify repository ID, exact tree/history, access, branch rules, open work, releases, workflows/runners, secrets/environments, packages, webhooks/Apps, Pages, deploy keys and consumers. Preserve private-source boundaries and rollback readiness.

Historical planning: [coordination issue #26](https://github.com/ores-truffle-oreslang/.github/issues/26) and [migration runbook #25](https://github.com/ores-truffle-oreslang/.github/pull/25). After an authorized transfer, recheck identity/history, restore controls, update dependencies and execute exact-head tests. Empty job steps are NOT_EXECUTED; host-only checks do not prove guest parity, zero-GC, AOT or production readiness.

## AOT release envelope candidate (host-only)

`src/aot-release-envelope.mjs` checks that an independently gathered release
candidate declares an exact compiler commit/tree/binary, platform-native
format/triple, artifact digest, bound guest output, and three distinct successful
compile/link/guest-execution steps with a runner and run attempt. Run the
source-only negative regressions with `npm test`.

Passing this schema only returns `STRUCTURAL_CANDIDATE_ONLY`. It does **not**
authenticate caller-supplied workflow IDs, execute a native binary, prove that
a GitHub job was stepful, establish provenance, or certify Linux/Windows/macOS.
A trusted release publisher must independently read live job/step and binary
identities, compare the complete immutable artifact closure, confirm reviewer
and protected-branch policy, then execute the actual target application.

## Machine-readable backend capability inventory (Rust-only, draft)

The architecture matrix is [published on main](https://github.com/atto-lang/.github/blob/main/docs/compiler-feature-matrix.md). The new `profiles/compiler-feature-capabilities-v1.tsv` records all 11 backend components and 10 common features (110 rows), with distinct `soft_real_time` and `hard_real_time`. The `intent` field is an architectural responsibility designation, not demonstrated support. The `outcome` field uses `PASSED`, `FAILED`, `UNSUPPORTED` or `NOT_EXECUTED`; **all 110 initial entries are NOT_EXECUTED because no authenticated guest receipts have been imported.**

The draft's unmerged Python-only reference validator and Python tests are replaced by `src/capability_matrix.rs`, a dependency-free Rust schema validator and 15 Rust tests. CI uses `rustc --edition=2021 --test src/capability_matrix.rs` and runs the compiled checker on the TSV. This is a deliberate migration from the draft's unused JSON v1 prototype to TSV v1, not a claim of historical data-format compatibility.

The Rust tool enforces complete inventory coverage, no duplicate or unknown backend/feature/intent, and fail-closed execution metadata. A synthetic hash string can satisfy **structural** validation; it is *not* proof of compiled guest execution. Only `atto-platform-conformance` may provide independently authenticated execution receipts. This repository's checks are host-model only; no actual Atto guest is compiled or run here.

The candidate hybrid actor-memory evidence matrix lives in `contracts/hybrid-actor-memory-v1.json`, outside the authority-bearing `profiles/` registry. It does not grant runtime capabilities or certify execution.

## Proposed freestanding library modes

[Freestanding target modes v1](contracts/freestanding-target-modes-v1.json) defines strict core-only, allocator-explicit, and hosted-standard-library profiles. The [declaration validator](src/freestanding-modes.mjs) rejects forbidden libraries, host services, missing allocators, unknown capabilities, and forged execution evidence. Run `node --test tests/freestanding-modes.test.mjs` to execute the host-only negative matrix. This does not compile or execute any Atto guest and does **not** establish bare-metal backend parity; it complements the capability inventory PR #3 and complements `atto-spec` PR #42.

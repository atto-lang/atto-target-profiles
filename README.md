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

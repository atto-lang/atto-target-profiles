# atto-target-profiles

Target platform profiles, runtime capabilities, and portability constraints for AttoLang.

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

## Experimental capability profile validation (host-only)

`reference/capability_profile.py` validates proposed `schema_version: 1` metadata for named backends/targets and a bounded feature map. Each feature must be `unsupported`, `unverified`, or `verified`; `verified` requires exact source SHA, evidence SHA-256, and a positive executed-case count. `unsupported`/`unverified` must not carry success metadata. Run `python3 -m unittest discover -s tests -v` for host validation tests.

This is a draft schema, **not** a capability declaration or independent attestation. A syntactically valid digest is not proof of real guest execution. Trustworthy parity requires verifier-signed exact-head receipts, negative tests and target-local execution. No backend is marked supported by this repository change.

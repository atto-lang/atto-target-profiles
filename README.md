# Oreslang target profiles

Versioned declarative **upper bounds** for Oreslang targets and capabilities.

**Status:** Implemented standalone registry validator and resolved-graph admission checker. This is *not* a language compiler or a security sandbox. Compiler effect inference and real import resolution belong in oreslang-common-source and the Java/LLVM compiler implementations.

## Quick start

~~~sh
npm test
npm run validate
node bin/oreslang-target.mjs list
node bin/oreslang-target.mjs check-closure examples/portable-closure.json --target=browser --backend=wasm --grants=clock,net.client
~~~

Eight JSON profiles: server, desktop, browser, edge-js, edge-wasi, ios, android, embedded.
The declared backend and capabilities are *possible* host features, not proof of backend readiness or permission grants. Browser threads and dynamic code, embedded GPIO and most host APIs require additional host-specific checks.

The admission checker consumes a **versioned, already resolved, pinned import graph** in JSON (`schemaVersion: 1`, `entry`, `nodes`). Every validated invocation must also supply an explicit backend. It checks every unconditional edge A -> B with targets(A) subset-of targets(B) and requires(B) subset-of requires(A), enforces requested-target access and a separate, explicitly granted build capability budget. Rejects unknown targets/capabilities, bad imports, duplicates and unreachable units. Input is bounded to 4,096 source units, 256 imports per unit, and 65,536 examined edges; the traversal is iterative for cyclic or deep graphs.

## Integration
1. Pin this repository's immutable commit or eventual contract release; do not build against floating main.
2. Have the language compiler emit the exact resolved closure and inferred effects; do not reimplement source parsing here.
3. Expand file and package declarations into source-unit metadata before checking.
4. Enforce approved capabilities again at runtime; the policy metadata is not a sandbox.
5. Keep the schema vocabulary consistent with Java admission PR #586; LLVM admission PR #74 closed unmerged.

See https://ores-truffle-oreslang.github.io/logs/2/

## Opt-in freestanding library admission

A resolved graph may optionally declare `libraryProfile`, `providers`, and a
`layer` on **every** source unit. Profiles are `freestanding-core`,
`freestanding-alloc`, `freestanding-actor`, `freestanding-otp`, and
`hosted`. These are library dependency contracts, **not** claims about
supported executable backend targets.

- `core` depends on `core` only, and never requires host capabilities.
- `alloc` can depend on `core/alloc` and requires `allocator.explicit`
  if present in the closure.
- `actor` can depend on `core/alloc/actor` and requires an explicit
  executor, bounded mailbox, and trusted CONTROL provider (even without alloc).
- `otp` can depend on `core/alloc/actor/otp` but not `std`; the
  six OTP behaviours are a separate implementation milestone.
- `std` is admitted only in `hosted`; even there, `core`
  cannot depend on higher layers.
  A hosted `std` unit may explicitly require `allocator.explicit` or
  `clock.monotonic` without importing actor/alloc modules. This never grants
  `control.trusted`, `executor.explicit`, or `mailbox.bounded` by itself,
  and the importer must declare the same required provider.
- Compiler-owned `std` must never import application modules (`std -> app` is
  forbidden), including on hosted platforms.
- Every `otp` unit must have a genuine transitive import path to an `actor`
  unit; an unrelated actor elsewhere in the graph is insufficient.
- Runtime providers are least-authority: a `freestanding-core` closure accepts
  none; `alloc` requires explicit allocation, and actor/OTP providers may
  include an optional allocator or monotonic clock where needed. Extra
  unrelated provider grants are rejected.
- Every unit of an opted-in closure must declare `providerRequires`. The
  validator requires per-unit demands to be granted, requires every importer to
  propagate those demands, and rejects undeclared, unused or overbroad grants.
  An `alloc` unit must require `allocator.explicit`; an `actor` unit must
  require explicit executor, bounded mailbox, and trusted CONTROL providers.
  Optional actor clocks/arenas are admitted **only when a unit requires them**.
- `providerRequires` remains **untrusted metadata** until the compiler infers
  it from authenticated source, intrinsics, and generated code. Neither the
  validator nor a user-supplied manifest confers security authority.
- Every freestanding resolved node has an empty *ambient host capability*
  `requires` set. Explicit provider declarations are separately checked.
  Source calls to target-specific HAL/device interfaces need later
  compiler-level effect typing and may not be mislabeled `core`.

For example:

~~~sh
node bin/oreslang-target.mjs check-closure \
  examples/freestanding-core-closure.json \
  --target=embedded --backend=llvm --grants=
~~~

The `app` layer identifies application source, not a new privileged library.
**Trusted build selection:** Use
`validateClosure(graph, profiles, requiredLibraryProfile)` when an embedding
compiler/build has explicitly selected `freestanding-core`,
`freestanding-alloc`, `freestanding-actor`, `freestanding-otp`, or
`hosted` outside the resolved-graph file. The third argument is a *trusted
build setting*, not read from untrusted project source; if the graph omits
`libraryProfile` or tries to change it, validation fails closed. The existing
CLI still needs to wire its selected profile into this API, and Java/LLVM must
supply authenticated inferred layers/effects before it becomes an enforcement
boundary. Without that third argument, legacy behavior remains by design.

Legacy v1 closures **without** `libraryProfile` retain the existing behavior;
supplying `providers` or node `layer` without the opt-in is rejected.
The compiler must infer `layer` from trusted canonical import resolution;
this JSON validator cannot independently prove that a claimed `core` unit
contains only core source, nor that LLVM/native is actually freestanding.
Never trust a manifest authored by untrusted application code as proof of
library origin or effects.

This step can report only **contract admission**. It does not modify
the Java/GraalVM `std/core` loader, implement a no-main entry point, provide a
panic hook, link without libc, or demonstrate guest execution on Cortex-M.
Native linker/undefined-symbol checks and backend conformance tests are
required before advertising `no_std` support.

Related upstream architecture:
- [Java core/alloc/actor/std proposal](https://github.com/ores-truffle-oreslang/oreslang-source.java/blob/main/docs/CORE_ALLOC_STD_BOUNDARY.md)
- [Shared freestanding/OTP contract PR #66](https://github.com/ores-truffle-oreslang/oreslang-common-source/pull/66)

## Integration warning: overlapping admission proposal

[PR #17](https://github.com/ores-truffle-oreslang/oreslang-target-profiles/pull/17)
introduces a **different** standalone freestanding validator. The contracts
are currently incompatible: PR #17 overloads `target` with the freestanding
tier, uses `host` rather than `std`, omits application-layer units,
uses different provider/effect names, and excludes optional `alloc` from its
actor tier. Neither should be merged independently as the canonical API.
Converge on the existing platform `target` + `backend` contract with a
separate `libraryProfile`; retain a separate field for compiler-inferred
provider/effect requirements once the Java and LLVM compilers actually emit
them. This PR remains draft until exact-head test evidence and agreement on
that unified contract.

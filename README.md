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

Thirteen JSON profiles: server, desktop, browser, edge-js, edge-wasi, ios, android, embedded, fpga, asic, litegraph, ebpf, carrier-linux. Hardware profiles use an explicit `hdl` backend and zero host capabilities; they are metadata admission only, not evidence of the Oreslang hardware compiler.

The declared backend and capabilities are *possible* host features, not proof of backend readiness or permission grants. Browser threads and dynamic code, embedded GPIO and most host APIs require additional host-specific checks.

The admission checker consumes a **versioned, already resolved, pinned import graph** in JSON (`schemaVersion: 1`, `entry`, `nodes`). Every validated invocation must also supply an explicit backend. It checks every unconditional edge A -> B with targets(A) subset-of targets(B) and requires(B) subset-of requires(A), enforces requested-target access and a separate, explicitly granted build capability budget. Rejects unknown targets/capabilities, bad imports, duplicates and unreachable units. Input is bounded to 4,096 source units, 256 imports per unit, and 65,536 examined edges; the traversal is iterative for cyclic or deep graphs.

## Integration
1. Pin this repository's immutable commit or eventual contract release; do not build against floating main.
2. Have the language compiler emit the exact resolved closure and inferred effects; do not reimplement source parsing here.
3. Expand file and package declarations into source-unit metadata before checking.
4. Enforce approved capabilities again at runtime; the policy metadata is not a sandbox.
5. Keep the schema vocabulary consistent with Java admission PR #586; LLVM admission PR #74 closed unmerged.

See https://ores-truffle-oreslang.github.io/logs/2/

### LiteGraph

`litegraph` is a Wasm-only policy upper bound for LiteGraph deployments. It permits explicit clock, randomness, network and heap capabilities; it does not grant them. Filesystem, GC, threads, dynamic code and native/Java interop remain denied. Deployment must supply explicit grants and enforce them at runtime. This registry entry is not runtime execution certification.

## eBPF and Carrier-Grade Linux pilot admission

- `ebpf`: LLVM BPF compilation target **metadata only**, not a verifier-loaded program. The only potential external effect is `bpf.packet.read` for verifier-bounded packet reads. The stage-0 constant-action programs require **no grants**. No heap, GC, OS threads, blocking I/O, dynamic code, arbitrary native interop, map access, helpers or kfuncs are granted. A requested packet read MUST have an explicitly inferred effect and an independent program-type/attachment verifier gate. The current resolved-closure format cannot establish valid eBPF attach ABI, packet pointer provenance, bytecode budgets or kernel verifier admission.
- `carrier-linux`: LLVM/Graal Linux host compatibility metadata (soft-real-time/availability **candidate only**). It allows an explicitly granted subset of OS capabilities but cannot prove PREEMPT_RT behavior, deterministic latency, safety certification, redundancy or vendor carrier-grade qualification. `gc` and `dynamic.code` remain *possible* to accommodate Graal; they are **not** permissible evidence for a strict no-GC/no-JIT profile. Enforce the latter in a distinct, stronger admission/qualification gate.

The bounded LLVM XDP follow-on compiler slice supplies a source-derived
`--emit-target-closure` (see LLVM stacked PR based on #544). For constant
XDP action, its `requires` list is empty; for `packet_u8` guards, the
compiler infers `bpf.packet.read`. It must emit `grants: []` in both cases:
a build policy is responsible for explicit grants, and an ungranted packet
program must fail `check-closure`. The source-shaped regression fixtures
in `examples/bpf-xdp-{constant,packet}-closure.json` exercise the real
policy CLI without importing private compiler source or claiming matching
compiler/ELF provenance.

Input admission: the `check-closure` CLI rejects final-component symlinks,
special files, malformed UTF-8, UTF-8 BOMs, JSON nesting above 128, and
duplicate object member names at any depth (including escaped Unicode-equivalent
names). Its scan precedes `JSON.parse` so a last-wins duplicate cannot
silently replace an earlier authority declaration. Parser validation is not a
digital signature or source-provenance guarantee. The 16 MiB read bound and
4096-node graph budgets remain independent.

### Bounded eBPF build admission sequence

Compiler-produced XDP closure manifests are declarations, **not authority**.
A trusted build controller should pin both the LLVM compiler commit and
this registry's commit. The experimental sequence is:

```sh
# Source fixture belongs to the pinned LLVM compiler repository.
SOURCE=/path/to/oreslang-source.llvm/examples/xdp_packet_u8.ores
oreslang-llvmc --target=bpfel --bpf-program=xdp \
  --emit-target-closure "$SOURCE" > xdp.closure.json
node bin/oreslang-target.mjs check-closure xdp.closure.json \
  --target=ebpf --backend=llvm --grants=bpf.packet.read
oreslang-llvmc --target=bpfel --bpf-program=xdp \
  --bpf-grants=bpf.packet.read "$SOURCE" > xdp.ll
```

The compiler deliberately emits `grants: []` in its closure; the
`--grants=bpf.packet.read` argument comes from an independently approved
build policy. A compiler closure declaring the wrong target/backend or
pre-populated grants is rejected before approval. The LLVM
`--bpf-grants=bpf.packet.read` argument is **only** a local emission
acknowledgement, not authorization: a caller can pass it without running
the checker. Production build orchestration must bind approved policy,
source/tree SHA, emitted IR/object digest, compiler binary and Linux
verifier/attach receipts under a trusted provenance contract. None of those
cryptographic/external evidence bindings are supplied by this pilot.

The **profile registry itself** is also parsed as authority-bearing input:
`loadProfiles()` now requires regular, non-symlink `.json` files, bounded at
64 KiB each, with strict UTF-8, no BOM, and no duplicate object names at any
nesting depth. Unsupported hosts must fail closed rather than silently
dropping `O_NONBLOCK` or `O_NOFOLLOW`. A policy registry is valid only after
both strict file parsing and `validateRegistry()` succeed. This cannot
authenticate a mutable checkout, replace source-review provenance, or
prevent a compromised parent directory from being swapped externally.

Both profiles require pinned compiler/target evidence and runtime enforcement. An upper-bound registry PASS is never an executed program, eBPF verifier result, deadline proof or hardware/physical signoff. See LLVM source PR #544 (BPF) and #660 (CGL), and Java source PR #1442 (CGL). Do not merge this change until downstream profile consumers and schema version-1 compatibility are reviewed; the vocabulary is expanded without changing the schema number.
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

## Admission proposal consolidation

The provider requirements from closed PR #17 are consolidated into this API.
Platform `target` and `backend` retain their existing meaning; freestanding
selection uses `libraryProfile`, with per-unit `providerRequires` propagated
through imports. Compiler-inferred provenance and effects remain a separate
integration gate; self-declared metadata does not establish them.

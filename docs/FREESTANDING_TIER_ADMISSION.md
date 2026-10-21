# Freestanding library-tier admission (issue #21)

The **compiler** must distinguish freestanding `core` from opt-in `alloc`,
OS-independent actor primitives, and hosted `stdlib`. This repository's
existing resolved-closure validator is an **effect-admission checker**, not a
source compiler, linker, allocator, WIT parser, or evidence of a bare-metal ELF.

| Tier | Dependencies | Required conditions |
| --- | --- | --- |
| `core` | `core` only | No host capabilities, allocator, OS, clocks, threads, FFI, Wasm, WIT or reflection |
| `alloc` | `core`, `alloc` | Explicit allocator availability and heap effect granted at target and build |
| `actor` | `core`, OS-independent actor primitives | No implied heap, threads or clock; hosted adapters opt in separately |
| `stdlib` | Admitted lower tiers | Specific inferred I/O/OS effects and target grants; never part of mandatory `core` |
| `zorde` | Independent admitted validation contract | Static schema validation may be freestanding; TypeSpec and WIT tooling is **build time only** |

`profiles/embedded.json` describes the *upper bound* of a potentially
hosted embedded environment. It is **not** a freestanding-core promise:
some embedded hosts may offer a heap, clock, GPIO, or filesystem. A truly
freestanding build must pass a resolved closure with no grants, and a
post-link negative-symbol/import check. The latter gate is not implemented
in this repository.

`tests/freestanding-boundary.test.mjs` adds negative admission probes for
a pure `core` dependency on `alloc` or hosted effects. The tests require
the graph to declare the compiler-inferred effects truthfully; a dishonest
compiler graph is not caught by a JSON metadata check.

## Browser/Node host matrix

**Freestanding core is OS- and environment-agnostic.** This is a source and transitive-dependency requirement, not a promise that JavaScript engines perform no managed allocations. A browser implementation may use JavaScript BigInt and GC to execute a pure function without giving the Oreslang program heap, clock, filesystem or network *capabilities*.

| Target | `core` | optional `alloc` | optional `actor` provider | `std` provider |
| --- | --- | --- | --- | --- |
| Browser JS | pure ESM, no Node/DOM imports | explicit JS allocator/heap profile | explicit module Web Worker adapter, if available | browser-approved capabilities only (e.g. fetch/WebSocket/timers), no POSIX process/filesystem assumptions |
| Node JS | same pure ESM core | explicit JS allocator/heap profile | explicit worker_threads adapter | Node-approved filesystem, process and network modules |
| Browser Wasm | pure wasm guest code/ABI with no mandatory host imports | explicit linear-memory allocator | explicitly admitted host workers/IPC | only reviewed WebAssembly host imports and WIT adapters |
| Native LLVM | pure freestanding code, no libc | optional explicit allocator | platform scheduler/transport selected by target | Linux/Windows/embedded implementation selected and admitted |

`profiles/browser.json` and `profiles/edge-js.json` describe **possible upper-bound capabilities**, not implicit grants. In particular, the presence of `threads`, `heap`, `dynamic.code` or `net.client` in such a profile cannot make it a mandatory transitive dependency of `core`. Environment-specific optional `std` modules are legal only when the compiler proves their effect closure and the host explicitly grants the capability.

The first experimental executable test is the pure integer `oreslang-source.java/stdlib/core.ores` module compiled to browser-safe JavaScript by `oreslang-source.js` PR #28. The legacy `stdlib/core.ores` file path and `std/core` spelling **do not grant it hosted effects**; they require a coordinated module-path migration, not duplicated competing source definitions. The JS experiment proves a narrow source subset, not complete compiler-side `libraryTier` inference or freestanding link proof.

## Outstanding hard gates

1. Introduce a versioned `libraryTier` field in a separately reviewed
   compiler-emitted manifest; reject forbidden tier-to-tier imports *before*
   accepting a resolved closure. Do not silently assign tiers from names.
2. Independently authored TypeSpec and JSON Schema must agree under
   pinned `tjsv` with deliberately failing mutation fixtures.
3. Define WIT Component Model version/world/import/export/resource/borrow
   constraints for hosted Wasm **without** adding WIT requirements to bare metal.
4. Pin the exact LLVM source, compile and link a freestanding program and
   reject forbidden OS/libc/allocator symbols and imports.
5. Emit exact source tree, compiler binary hash, linker/target, dependency
   closure and negative proof receipts before any release certification.

These checks do **not** certify a working freestanding compiler or native
runtime. The named tiers above are a proposed enforcement matrix, not yet a
compiler-checked feature.

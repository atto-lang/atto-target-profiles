# Oreslang build profiles v1

This document defines the backend-neutral build-profile contract used by the Oreslang CLIs and compilers.

The normative machine-readable copy is `build-profiles/v1.json`. A backend may support only a subset of these profiles, but it must **fail closed** rather than silently weakening a requested profile.

## Common rule: no runtime reflection

Runtime reflection is forbidden in every v1 build profile. Oreslang should use compile-time introspection, generated serializers/deserializers, explicit registries, explicit FFI/export roots, and closed-world dispatch metadata instead.

Compile-time inspection is not runtime reflection. Metadata generated at build time is allowed when it has an explicit consumer and can itself be tree-shaken.

## Profiles

| Profile | Required behavior |
| --- | --- |
| `dev` | Development build. Runtime reflection remains forbidden. JIT/dynamic code may be available on backends that support them. Tree shaking and metadata/runtime pruning are optional. |
| `release` | Requires semantic tree shaking, runtime-feature pruning, metadata pruning, and backend DCE/LTO where supported. Runtime reflection remains forbidden. |
| `strict-aot` | Inherits `release`. Requires a closed-world full-AOT artifact. JIT and unresolved dynamic code loading are forbidden. All external roots must be explicit or compiler-generated. |
| `hard-rt` | Inherits `strict-aot`. Also forbids GC, unbounded allocation and unbounded waits; requires cooperative/bounded code and WCET/deadline admission evidence. This profile is an admission contract, not a safety certification by itself. |

The convenience CLI spellings are `--release`, `--strict-aot`, and `--hard-rt`. They are mutually exclusive selectors; inheritance is semantic, so `--hard-rt` already includes the requirements of `strict-aot` and `release`.

## Accelerator policy

Heterogeneous compute follows the same closed-world rules as the rest of the
runtime. Providers are explicitly registered; source code cannot forge
`Device`, `Buffer<T>`, `Fence`, or `KernelContext` authority; CPU/device
transfers are explicit; and missing/incompatible accelerators never trigger an
implicit CPU fallback.

For `strict-aot`, every Oreslang accelerator kernel variant must be selected
and compiled ahead of time. Runtime selection among compatible precompiled
variants is allowed, but Oreslang must not JIT a missing kernel. Vendor-driver
internal compilation of a precompiled portable device artifact is outside this
language-level rule and must still obey the selected provider/profile contract.

For `hard-rt`, accelerator queue depth, memory reservations, transfer bounds,
kernel completion policy, and timeout/WCET evidence must be bounded and admitted.
Provider/driver compilation or first-use preparation is forbidden inside the
admitted hard-real-time execution phase unless it has already been completed
outside that phase. Runtime selection among prepared variants remains allowed.
Cancellation alone is never proof of quiescence; reclamation requires an
authenticated completion/reset fence.

The G2 CPU reference provider is an explicit conformance backend only. It must
never be selected implicitly when a GPU request is unavailable or rejected, and
it is not hard-realtime evidence. Source accelerator syntax remains fail-closed
until typed source effects and lowering are implemented. Portable kernel IR is
reflection-free, and emitting OpenCL/device source is not evidence that a device
provider authenticated, enqueued, completed, or retired real hardware work.

The G3 physical provider is trusted runtime code only. The first admitted
backend is OpenCL 1.2, loaded explicitly by the runtime rather than by guest
code or reflection. Provider-owned quotas cover resident bytes, pinned host
bytes, events, and queue slots. Pre-enqueue abort is legal only while the host
fence pair is RESERVED; once the driver returns an accepted event, only
completion/cancellation and verified quiescence may terminate it.

A mock/injected OpenCL ABI validates state-machine behavior but is not GPU
execution evidence. Real GPU evidence requires a compatible physical device,
the exact submitted device event, successful explicit download/result
verification, and physical resource release. Hard-RT may use a physical
provider only when that provider and its queue/memory/event bounds are
independently admitted/certified; ordinary OpenCL presence is insufficient.

## Freestanding

`--freestanding` is an orthogonal constraint and may be combined with any build profile. It forbids hosted stdlib roots, OS/libc dependencies, and implicit platform providers. Any target provider must be selected explicitly.

## Required backend behavior

A backend must never claim a stronger profile than it can prove. Until a backend has the necessary admission pass, it must reject that profile with a diagnostic explaining the missing gate.

Initial integration status:

- Java/GraalVM: `release` and `strict-aot` can reuse existing tree shaking and AOT execution-mode checks. `hard-rt` must remain fail-closed until the active realtime-admission work is wired into the launcher/build path.
- LLVM: full-AOT is the natural code-generation model. `hard-rt` must additionally pass bounded realtime admission; a target merely producing LLVM IR is not sufficient evidence.
- Rust/Cranelift: the current scalar compiler is already reflection-free and native-AOT. The first hard-RT gate should reject recursive/unbounded call graphs and remain intentionally narrower than the full language.

## Tree shaking and explicit roots

Release-or-stronger builds retain only the semantic closure of explicit roots. Core, alloc, actor runtime, stdlib, user code, generic instantiations, error paths, metadata, dispatch tables, async continuations, and runtime subsystems are all removable when unreachable.

Reflection must not be used as a reason to conservatively retain arbitrary code. External reachability is expressed through explicit FFI/export roots, generated registries, reload contracts, or future versioned reachability manifests.


## WASM deployments on browser, server and desktop (strict candidate gate)

Target profiles now declare the `wasm` backend as a **potential** backend
for `server` and `desktop`, in addition to `browser`. The new hosted
Wasm admission gate permits **zero host capability grants** for those two
targets. Any request for clock, filesystem, network, threads, reflection,
interop, runtime dynamic code, host GC or other ambient host effects rejects
at resolved-graph validation, even when the generic desktop/server
environment might allow such effects through a different backend.

This is a registration of the existing zero-import `main:()->i64`
`core-wasm.i64-v1` profile; it is **not** a general WASI/WIT host, desktop
UI toolkit, native compiler, scheduler, or proof of Java/LLVM semantic
parity. `oreslang-source.wasm` currently emits portable wasm32 from a
separately trusted LLVM compiler and supplies experimental Node workers.
Its native Wasmtime path compiles ahead of time in a trusted Rust builder
and uses a separately built compiler-free runner; release execution remains
disabled until a trusted artifact approval and OS process-isolation path
exists.

`strict-aot` describes no compiler or JIT **inside the admitted deployed
native runtime**; it cannot be inferred just because portable `.wasm`
bytes were emitted ahead of time. Browser/Node WebAssembly engines may
internally JIT/tier. Native Wasmtime `.cwasm` is not browser portable and
depends on the host engine/CPU/OS compatibility tuple. Likewise,
zero guest tracing-GC does not mean zero host JS/Rust allocations, and
hard-RT requires deadline and worst-case execution evidence in addition
to explicit memory ownership.

Future hosted effects require a separately versioned source-checked
capability manifest, explicit asynchronous adapters, authenticated broker
grants and end-to-end host execution tests. This registry never grants
authority or proves that a deployment supports the selected profile.

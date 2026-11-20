# Strict realtime / zero-allocation / data-layout qualification — stage 0

Draft proposal for [target-profiles #25](https://github.com/ores-truffle-oreslang/oreslang-target-profiles/issues/25), [LLVM #688](https://github.com/ores-truffle-oreslang/oreslang-source.llvm/issues/688) and [cross-backend conformance #144](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/issues/144). The existing `build-profiles/v1.json` hard-rt contract remains authoritative.

## Three distinct guarantees

- **Zero tracing GC**: no tracing collector in a *proven closed critical image/FFI closure*. An arena allocator is not sufficient. Java/GraalVM off-heap actor arenas reduce managed allocations; their existence does **not** imply GC-free JVM execution. Do not infer no GC from native-image AOT or Epsilon GC.
- **Zero allocation and zero copy**: compiler-proven `alloc_bytes == 0` and `copied_bytes == 0` along *all* reachable critical-turn, message, cancellation, error and teardown paths. Copy-free movement must have proven sender invalidation, owner transfer and quiescent retirement. Host/driver/Worker APIs are not presumed physically zero-copy.
- **Hard real time**: qualified source, image, scheduler and hardware with bounded WCET/response time, release jitter, blocking, preemption, mailbox, memory, stack, ISR, I/O, and teardown. Nanosecond measurements are supporting evidence, never a mathematical WCET proof.

## Initially support a narrow named LLVM target only

The first qualification candidate is `llvm-aot-rt-strict`: one periodic RT actor, fixed-priority preemptive scheduler, resolved closed call/FFI graph, no unknown indirect calls, dynamic loading, unbounded loops or recursion. A named board/OS/kernel config, complete AOT binary, explicit CPU frequency and scheduling assumptions are required.

The declaration must include period, deadline, minimum inter-arrival, WCET bound, release jitter, bounded blocking, dispatch/ISR interference, fixed stack and continuation frames, preallocated actor arenas, mailbox slots, reserved CONTROL credits, pinned I/O buffers and bounded shutdown. For the initial one-actor model, a necessary arithmetic check is:

```
release_jitter + WCET + bounded_blocking + dispatch + IRQ_interference <= deadline <= period
```

Use overflow-checked integers. This is **necessary but insufficient** for hard-RT qualification. Reject unknown effects, resource bounds, physical providers, FFI and unqualified schedulers. A deadline-admission API must not return hard-RT certification based only on this inequality or a user-supplied report.

The initial zero-allocation critical turn allows only `compute`, `memory.read`, `memory.write`, `clock.monotonic` and bounded actor-send effects. Reject GC, allocation, implicit copies, blocking I/O, reflection, JIT, unknown FFI and dynamic code. Any use of a faster but uncertified operation fails closed instead of silently downgrading to soft RT.

## Data-oriented storage and ownership

AoS, SoA, AoSoA and SoAoS are **four distinct physical storage layouts**. SoAoS means nested field groups of row-wise records and must never be an alias for AoSoA. One authoritative backing store per collection; layout transforms are explicit and their allocation/copy budgets are tracked. Emit actual per-field alignment, offsets/strides, overflow-checked indexing, tile tail masks and generational handles. SIMD requires semantic equivalence with a scalar fallback.

The actor owns its arena, region and data. Zero-copy views are bounded field-sensitive loans; a moved buffer invalidates the sender's authority; shared immutable regions require explicit capability grants. A scratch arena cannot reset while another suspended message, callback, borrow, DMA, driver event or cancellation completion retains a lease. A teardown failure quarantines the old actor generation rather than freeing it unsafely.

### Five-backend obligations

| Backend | Required direction | Hard-RT status |
|---|---|---|
| LLVM | independently owned heaps; closed native image; bounded no-alloc critical turn; qualified WCET/RTOS | only a **candidate**, not certified |
| Java/GraalVM | actor-private native regions, managed allocation/copy instrumentation, soft-RT bounds | no generic hard-RT claim |
| .NET NativeAOT | unmanaged actor arenas and source-generated drop paths; no guest managed allocation in strict paths | no hard-RT claim |
| Wasm | private linear memory, bounded ownership and growth, measured transfer/copy cost | no hard-RT claim |
| Forge | native AOT ownership/layout lowering, closed effect graph, explicit alloc/copy and scheduler evidence | no hard-RT claim |

## Required proof and test ladder

1. Compiler-generated closed HIR/MIR effect + call + stack/loop/loan/alloc/copy proof, including all exits, FFI and intrinsic calls; reject hand-authored manifest authority.
2. Versioned digest-bound evidence: exact Git source tree, canonical source hash, compiler/runtime/linker hashes, linked image, board/kernel config and declared assumptions. Verify signatures/attestation separately; hash-shaped strings prove nothing by themselves.
3. Whole-image tracing-GC/allocator/FFI audit, post-init allocation/copy traces, exhaustive negative tests, ASan/UBSan/race diagnostics, cancellation/restart/quiescence adversarial tests.
4. Named-hardware WCET/response-time analysis, max release-to-start and completion latency, watchdog/priority inversion measurements; distinguish observations from proof.
5. Compile and execute actual `.ores` fixtures in all five backends, plus four-layout ECS/SIMD benchmarks, cache misses, allocation and copy byte distributions, no stale loan and no hidden per-row boxing.

**Release rule:** contract documents, model tests, zero-step GitHub Actions failures or private mirrors without authorization are never evidence of compiled guest or hardware qualification. Existing carrier security approval and exact-blob binding requirements still apply.
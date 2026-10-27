# Oreslang core / std admission

Oreslang has exactly two public library layers:

| Layer | Meaning | Dependency rule |
| --- | --- | --- |
| `ores.core` | Freestanding, no operating-system dependency | may depend only on `ores.core` |
| `ores.std` | Hosted/platform services such as filesystem, network, process and host adapters | may depend on `ores.core` and `ores.std` |

Application source is represented as `app` in resolved compiler metadata, but
it is not a third library.

Allocation, actors, supervision and clocks are **not separate library tiers**.
When they can operate without an OS, they may live in `ores.core` and declare
explicit implementation providers such as `allocator.explicit`,
`executor.explicit`, `mailbox.bounded`, `control.trusted`, or
`clock.monotonic`. Hosted adapters belong in `ores.std`.

The `core` library profile admits only application + `ores.core` units and
forbids ambient host capabilities. The `std` profile additionally admits
`ores.std`; `ores.core` remains host-effect-free even inside a `std`
build.

This repository validates compiler-resolved metadata. It does not prove that a
compiler emitted freestanding machine code, that an allocator or actor provider
is correct, or that a linked artifact is free of libc/OS symbols.

## Browser, Wasm and native hosts

The same `ores.core` source can be executed by JavaScript, Wasm, Java/Graal or
LLVM where supported. A managed host may internally allocate or garbage collect;
that does not give the Oreslang program an OS capability. `ores.std` adapters
are host-specific and require the target profile and explicit grants to admit
their effects.

For true bare-metal proof, LLVM/native validation must additionally show a
freestanding link with no forbidden libc/OS imports and execute the resulting
artifact on an appropriate emulator or device.

## Hard gates

1. Compilers must infer `core` versus `std` from compiler-owned source
   provenance, not trust application-authored labels.
2. `ores.core -> ores.std` edges must fail before artifact emission.
3. Provider requirements must be inferred, propagated and explicitly granted.
4. Native core builds need negative-symbol/import audits in addition to metadata
   validation.
5. Cross-backend conformance must use the same canonical `ores.core` source
   semantics.

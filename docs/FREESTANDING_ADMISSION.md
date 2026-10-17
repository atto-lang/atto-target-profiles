# Freestanding library layer admission (metadata phase)

This new checker rejects illegal transitive **core / alloc / actor / otp / host**
imports in an **already compiler-resolved, effect-inferred, exact source
closure**. It does not parse or typecheck Oreslang and cannot establish that a
caller-provided declaration of `core` is truthful. Java/LLVM compiler
integrations must emit those layer and effect labels from trusted typechecked
source before relying on this validator.

Allowed dependencies:

| importer | allowed dependencies |
| --- | --- |
| core | core |
| alloc | core, alloc |
| actor | core, actor (no mandatory heap) |
| otp | core, alloc, actor, otp |
| host | core, alloc, actor, otp, host |

Four target profiles are recognized:
- `freestanding-core`: effect-free core only
- `freestanding-alloc`: explicit memory provider
- `freestanding-actor`: executor, bounded mailbox and authenticated CONTROL
- `freestanding-otp`: same, with optional allocator and monotonic clock

No profile provides Linux, libc, filesystem, process, Java interop or threads.
Every provider must be explicitly required by a typed unit and granted by the
build. The closure is bounded, contains exactly linked units and refuses
unresolved imports and authority that no unit uses.

Run `node --test tests/freestanding.test.mjs`, or use
`node bin/oreslang-freestanding.mjs exact-closure.json`.

**Not a compiler, backend evidence, trusted producer, source-language parser,
bare-metal build, OTP implementation or physical isolation guarantee.**
Existing eight platform profiles remain unchanged. Do not enable this as a
security boundary until compiler provenance and real effect inference are wired.

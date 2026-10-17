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

Nine JSON profiles: server, desktop, browser, edge-js, edge-wasi, ios, android, embedded, litegraph.
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

`litegraph` is the Ores Stack target profile for persistent Wasmtime actor execution on LiteGraph. It is deliberately narrower than general `edge-wasi`: Wasm is the only admitted backend, and filesystem, GC, threads, dynamic code and host/native interop remain unavailable unless a later separately reviewed profile version adds them. The profile is an upper bound, not a grant; deployment still supplies explicit capability grants and LiteGraph must enforce them again at runtime.

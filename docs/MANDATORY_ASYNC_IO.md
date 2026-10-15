# Mandatory nonblocking I/O profiles

Every committed target profile now requires the own data field
`coreIoPolicy: native-async-only`, enforced by registry admission and JSON
Schema. Linked graphs inherit this invariant when omitted. An explicit value
must be the same constant; off, legacy, undefined, null and false reject.
Grants cannot change the scheduling policy. This is a breaking registry
contract: old profile records missing the field must be migrated.

The backend vocabulary includes net and forge for server/desktop host upper
bounds alongside graal, llvm and wasm. A profile is potential host authority,
not proof a compiler implements an operation. In particular all unsupported
I/O remains rejected even where a target lists fs/net capabilities.

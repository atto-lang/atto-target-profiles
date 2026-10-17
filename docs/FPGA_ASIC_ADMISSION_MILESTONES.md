# FPGA and ASIC admission: deny by default (2026-10-17)

Do not alias FPGA/ASIC to the existing embedded or llvm profiles, which mean CPU machine code. Until the HDL backend exposes genuine hardware effect/type checking and exact-source RTL lowering, the registry intentionally rejects these target names. JSON profiles cannot establish hardware synthesis.

Next schema revision should:
1. Add a distinct hdl backend and fpga/asic profiles together only after actual compiler capability verification.
2. Require fixed-width static types, bounded loops/memory/topology, explicit clock/reset/CDC, and reject heap/GC/FFI/await/hot reload.
3. Separate static source admission from simulation, FPGA synthesis/place-route/bitstream/board execution and ASIC mapped cells/physical layout/STA/DRC/LVS/fabrication.
4. Reject signedness/overflow surprises, missing clock/timing contracts, dynamic effects, arbitrary CPU fallback and unpinned tools.
5. Preserve every existing target's backend and capability budgets.

RFC: https://github.com/ores-truffle-oreslang/oreslang-common-source/pull/65
HDL: https://github.com/ores-truffle-oreslang/oreslang-source.hdl/pull/1
FPGA: https://github.com/ores-truffle-oreslang/oreslang-platform.fpga/pull/1
ASIC: https://github.com/ores-truffle-oreslang/oreslang-platform.asic/pull/1
Tracking: https://github.com/ores-truffle-oreslang/oreslang-target-profiles/issues/13

Status: specification and negative tests only; no new hardware capability admitted.

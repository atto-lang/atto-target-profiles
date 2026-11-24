import test from "node:test";
import assert from "node:assert/strict";
import {validateArchitectures, loadArchitectures, summarize, COMPILERS, HEAP32_REQUIRED} from "../src/architectures.mjs";

const doc = await loadArchitectures();
const clone = () => structuredClone(doc);
const fails = (d, re) => { const r = validateArchitectures(d); assert.equal(r.ok, false); assert.match(r.errors.join("\n"), re); };
const t32 = d => d.targets.find(t => t.triple === "i686-unknown-linux-gnu");

test("architecture registry conforms", () => assert.deepEqual(validateArchitectures(doc), {ok: true, errors: []}));

test("every target lists every compiler with emission and heap32", () => {
  for (const t of doc.targets) assert.deepEqual(Object.keys(t.compilers).sort(), [...COMPILERS].sort());
});

test("required backends each run a verified 32-bit heap on a 32-bit target", () => {
  const s = summarize(doc);
  for (const c of HEAP32_REQUIRED) assert.ok(s[c].heap32Verified32BitTargets.length > 0, c);
});

test("32-bit guest refs are policy on every host; 64-bit refs are rejected", () => {
  const d = clone(); d.policy.guestRefBits = 64; fails(d, /guestRefBits/);
});

test("counters and identities must not be narrowed to 32 bits", () => {
  let d = clone(); d.policy.counterBits = 32; fails(d, /counterBits/);
  d = clone(); d.policy.identityBits = 32; fails(d, /identityBits/);
  d = clone(); d.policy.capabilityTokenMinBits = 64; fails(d, /capabilityTokenMinBits/);
});

test("verified needs evidence; unsupported needs a reason", () => {
  let d = clone(); t32(d).compilers.llvm.heap32 = {status: "verified"}; fails(d, /evidence/);
  d = clone(); t32(d).compilers.net.emission = {status: "unsupported"}; fails(d, /reason/);
  d = clone(); t32(d).compilers.forge.heap32 = {status: "unimplemented", evidence: ["x"]}; fails(d, /evidence only/);
});

test("losing the only 32-bit heap proof for a required backend fails", () => {
  const d = clone();
  for (const t of d.targets) if (t.pointerBits === 32) t.compilers.java.heap32 = {status: "unverified"};
  fails(d, /java: no verified 32-bit actor heap/);
});

test("unknown, missing and malformed entries fail closed", () => {
  let d = clone(); t32(d).compilers.dex = t32(d).compilers.llvm; fails(d, /unknown compiler dex/);
  d = clone(); delete t32(d).compilers.rs; fails(d, /\.rs: missing/);
  d = clone(); d.targets.push(structuredClone(d.targets[0])); fails(d, /duplicate triple/);
  d = clone(); d.targets[0].pointerBits = 16; fails(d, /pointerBits/);
  d = clone(); d.targets[0].endian = "big"; fails(d, /little-endian/);
  d = clone(); d.targets[0].compilers.llvm.emission.status = "maybe"; fails(d, /unknown status/);
  d = clone(); d.targets[0].triple = "x86_64"; fails(d, /invalid triple/);
});

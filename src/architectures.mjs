// Machine-target contract (architectures/v1.json): which atto-source.*
// compiler can emit code for which target triple, and where the 32-bit actor
// heap has actually been EXECUTED. Separate from the capability profiles in
// profiles/*.json. Fails closed on anything unknown or unproven.
import {readFile} from "node:fs/promises";

export const COMPILERS = Object.freeze(["llvm","rs","wasm","net","java","js","cranelift","forge","hdl"]);
export const STATUSES = Object.freeze(["verified","unverified","host-only","experimental","unimplemented","unsupported"]);
// The width policy: compress what is stored many times, never what counts or identifies.
export const POLICY = Object.freeze({guestRefBits:32,guestRefEncoding:"offset32-q8",counterBits:64});
// Backends that must run 32-bit actor heaps (user requirement, 2026-11-21).
export const HEAP32_REQUIRED = Object.freeze(["llvm","rs","wasm","net","java"]);
const TRIPLE = /^[a-z0-9_.]+-[a-z0-9_.]+-[a-z0-9_.]+(-[a-z0-9_.]+)?$/;

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function checkStatus(where, s, errors) {
  if (!isObj(s)) return void errors.push(`${where}: status must be an object`);
  for (const k of Object.keys(s)) if (!["status","evidence","reason","note"].includes(k)) errors.push(`${where}: unknown key ${k}`);
  if (!STATUSES.includes(s.status)) return void errors.push(`${where}: unknown status ${JSON.stringify(s.status)}`);
  if (s.status === "verified" && !(Array.isArray(s.evidence) && s.evidence.length > 0 && s.evidence.every(e => typeof e === "string" && e.trim())))
    errors.push(`${where}: verified requires non-empty evidence`);
  if (s.status !== "verified" && own(s, "evidence")) errors.push(`${where}: evidence only allowed on verified`);
  if (s.status === "unsupported" && !(typeof s.reason === "string" && s.reason.trim()))
    errors.push(`${where}: unsupported requires a reason`);
}

export function validateArchitectures(doc) {
  const errors = [];
  if (!isObj(doc) || doc.schemaVersion !== 1) return {ok:false, errors:["schemaVersion must be 1"]};
  const p = doc.policy;
  if (!isObj(p)) errors.push("policy missing");
  else {
    for (const [k, v] of Object.entries(POLICY)) if (p[k] !== v) errors.push(`policy.${k} must be ${JSON.stringify(v)}`);
    if (!(p.identityBits >= 64)) errors.push("policy.identityBits must be >= 64");
    if (!(p.globalIdentityBits >= 128)) errors.push("policy.globalIdentityBits must be >= 128");
    if (!(p.capabilityTokenMinBits >= 128)) errors.push("policy.capabilityTokenMinBits must be >= 128");
    if (!(Array.isArray(p.handleRefProfiles) && p.handleRefProfiles.includes(32) && p.handleRefProfiles.every(b => b === 32 || b === 64)))
      errors.push("policy.handleRefProfiles must include 32 and only use 32/64");
  }
  if (!Array.isArray(doc.targets) || doc.targets.length === 0) return {ok:false, errors:[...errors, "targets must be a non-empty array"]};
  const seen = new Set();
  doc.targets.forEach((t, i) => {
    const at = `targets[${i}]`;
    if (!isObj(t)) return void errors.push(`${at}: must be an object`);
    if (typeof t.triple !== "string" || !TRIPLE.test(t.triple)) errors.push(`${at}: invalid triple`);
    else if (seen.has(t.triple)) errors.push(`${at}: duplicate triple ${t.triple}`);
    else seen.add(t.triple);
    if (t.pointerBits !== 32 && t.pointerBits !== 64) errors.push(`${at}: pointerBits must be 32 or 64`);
    if (t.endian !== "little") errors.push(`${at}: only little-endian targets are admitted`);
    if (typeof t.abi !== "string" || !t.abi) errors.push(`${at}: abi required`);
    if (!isObj(t.compilers)) return void errors.push(`${at}: compilers required`);
    for (const k of Object.keys(t.compilers)) if (!COMPILERS.includes(k)) errors.push(`${at}: unknown compiler ${k}`);
    for (const c of COMPILERS) {
      const e = t.compilers[c];
      if (!isObj(e)) { errors.push(`${at}.${c}: missing`); continue; }
      for (const k of Object.keys(e)) if (k !== "emission" && k !== "heap32") errors.push(`${at}.${c}: unknown key ${k}`);
      checkStatus(`${t.triple}.${c}.emission`, e.emission, errors);
      checkStatus(`${t.triple}.${c}.heap32`, e.heap32, errors);
    }
  });
  if (errors.length === 0)
    for (const c of HEAP32_REQUIRED)
      if (!doc.targets.some(t => t.pointerBits === 32 && t.compilers[c].heap32.status === "verified"))
        errors.push(`${c}: no verified 32-bit actor heap on any 32-bit target`);
  return {ok: errors.length === 0, errors};
}

/** Per compiler: 32-bit targets with a verified heap, and targets it can emit for. */
export function summarize(doc) {
  return Object.fromEntries(COMPILERS.map(c => [c, {
    heap32Verified32BitTargets: doc.targets.filter(t => t.pointerBits === 32 && t.compilers[c].heap32.status === "verified").map(t => t.triple),
    emission: Object.fromEntries(doc.targets.map(t => [t.triple, t.compilers[c].emission.status])),
  }]));
}

export async function loadArchitectures(url = new URL("../architectures/v1.json", import.meta.url)) {
  return JSON.parse(await readFile(url, "utf8"));
}

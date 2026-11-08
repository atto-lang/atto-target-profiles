import { createHash } from 'node:crypto';

/**
 * Source-free structural verifier. It does NOT authenticate a GitHub Actions
 * identity, compiler binary, native guest run or a zero-tracing-GC claim.
 */
const sha40 = /^[0-9a-f]{40}$/;
const sha64 = /^[0-9a-f]{64}$/;
const id = /^[A-Za-z_][A-Za-z0-9_.:<>,-]{0,159}$/;
const pathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9_.\/-]+\.atto$/;
const backendSet = new Set(['java-graal', 'llvm', 'net', 'wasm', 'forge']);
const triples = new Map([
  ['wasm32-unknown-unknown', 'wasm'],
  ['x86_64-unknown-linux-gnu', 'elf'],
  ['aarch64-unknown-linux-gnu', 'elf'],
  ['aarch64-apple-darwin', 'macho'],
  ['x86_64-apple-darwin', 'macho'],
  ['x86_64-pc-windows-msvc', 'pe'],
  ['aarch64-pc-windows-msvc', 'pe'],
]);
function fail(msg) { throw new TypeError('AOT_' + msg); }
function own(v, fields) {
  if (v === null || typeof v !== 'object' || Array.isArray(v) ||
      Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
    fail('OBJECT');
  const names = Reflect.ownKeys(v);
  if (names.length !== fields.length || names.some(k => typeof k !== 'string' || !fields.includes(k)))
    fail('FIELDS');
  for (const k of fields) {
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) fail('ACCESSOR');
  }
}
function ordered(arr, predicate, limit = 2048) {
  if (!Array.isArray(arr) || arr.length > limit ||
      arr.some(v => !predicate(v))) fail('LIST');
  for (let i = 1; i < arr.length; i++) if (arr[i - 1] >= arr[i]) fail('LIST_ORDER');
}
function equal(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).sort()
    .map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}
export function hashBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('BYTES');
  return createHash('sha256').update(bytes).digest('hex');
}
export function manifestDigest(manifest) {
  admitClosedWorldManifest(manifest);
  return hashBytes(new TextEncoder().encode(canonicalJson(manifest)));
}
export function admitClosedWorldManifest(m) {
  own(m, ['schema', 'source', 'compiler', 'target', 'sourceFiles', 'modules',
    'types', 'exports', 'actorEntries', 'genericSpecializations', 'imports',
    'closedWorld', 'dynamicLoading', 'runtimeReflection', 'runtimeJit']);
  if (m.schema !== 'atto.aot.closed-world.v1' || m.closedWorld !== true ||
      m.dynamicLoading !== false || m.runtimeReflection !== false ||
      m.runtimeJit !== false) fail('OPEN_WORLD');
  own(m.source, ['commit', 'tree']);
  if (!sha40.test(m.source.commit) || !sha40.test(m.source.tree)) fail('SOURCE_SHA');
  own(m.compiler, ['name', 'sha256']);
  if (!id.test(m.compiler.name) || !sha64.test(m.compiler.sha256)) fail('COMPILER');
  own(m.target, ['backend', 'triple', 'guestPointerBits']);
  if (!backendSet.has(m.target.backend) || !triples.has(m.target.triple) ||
      m.target.guestPointerBits !== 32) fail('TARGET');
  ordered(m.modules, v => typeof v === 'string' && id.test(v), 256);
  if (!m.modules.length) fail('MODULES_EMPTY');
  for (const key of ['types', 'exports', 'actorEntries', 'genericSpecializations'])
    ordered(m[key], v => typeof v === 'string' && id.test(v), 4096);
  for (const entry of m.actorEntries)
    if (!m.exports.includes(entry)) fail('ACTOR_ROOT_NOT_RETAINED');
  const isModuleMember = s => m.modules.some(mod => s === mod || s.startsWith(mod + '.'));
  for (const key of ['types','exports','actorEntries','genericSpecializations'])
    if (m[key].some(s => !isModuleMember(s))) fail('UNDECLARED_MODULE');
  if (!Array.isArray(m.sourceFiles) || !m.sourceFiles.length || m.sourceFiles.length > 4096)
    fail('SOURCE_FILES');
  let priorPath = '';
  for (const src of m.sourceFiles) {
    own(src, ['path', 'sha256']);
    if (typeof src.path !== 'string' || !pathPattern.test(src.path) || !sha64.test(src.sha256) ||
        src.path <= priorPath) fail('SOURCE_FILES');
    if (src.path.split('/').some(c => c === '.' || c === '..' || c === '')) fail('SOURCE_TRAVERSAL');
    priorPath = src.path;
  }
  if (!Array.isArray(m.imports) || m.imports.length > 256) fail('IMPORTS');
  let priorImport = '';
  for (const imp of m.imports) {
    own(imp, ['capability', 'abiSha256']);
    if (typeof imp.capability !== 'string' || !id.test(imp.capability) ||
        !sha64.test(imp.abiSha256) || imp.capability <= priorImport ||
        /(?:^|[.:])(?:dynamic|unknown|eval|reflect)(?:$|[.:])/i.test(imp.capability)) fail('IMPORTS');
    priorImport = imp.capability;
  }
  return { structurallyValid: true, authenticated: false, certified: false,
    reason: 'REQUIRES_COMPILER_BACKED_EVIDENCE' };
}
export function inspectAotProofReceipt(r, m) {
  admitClosedWorldManifest(m);
  own(r, ['schema', 'manifestSha256', 'source', 'compiler', 'target',
    'artifact', 'runner', 'execution']);
  if (r.schema !== 'atto.aot.proof.v1' || r.manifestSha256 !== manifestDigest(m)) fail('MANIFEST_PIN');
  own(r.source, ['commit', 'tree']);
  own(r.compiler, ['name', 'sha256']);
  own(r.target, ['backend', 'triple', 'guestPointerBits']);
  if (!equal(r.source, m.source) || !equal(r.compiler,m.compiler) ||
      !equal(r.target,m.target)) fail('STALE_BUILD');
  own(r.artifact, ['sha256','bytes','format']);
  if (!sha64.test(r.artifact.sha256) || !Number.isSafeInteger(r.artifact.bytes) ||
      r.artifact.bytes <= 0 || r.artifact.bytes > 2_147_483_648 ||
      r.artifact.format !== triples.get(m.target.triple)) fail('ARTIFACT');
  own(r.runner, ['source','workflowRunId','runAttempt','jobId','runnerId','steps']);
  if (r.runner.source !== 'github-actions' ||
      [r.runner.workflowRunId,r.runner.runAttempt,r.runner.jobId,r.runner.runnerId]
        .some(v => !Number.isSafeInteger(v) || v <= 0) ||
      !Array.isArray(r.runner.steps) || !r.runner.steps.length ||
      r.runner.steps.length > 256) fail('NOT_EXECUTED');
  const seenSteps = new Set();
  for (const step of r.runner.steps) {
    own(step, ['name', 'conclusion']);
    if (typeof step.name !== 'string' || step.name.trim() !== step.name ||
        !/^[\x20-\x7e]{1,128}$/.test(step.name) || seenSteps.has(step.name) ||
        step.conclusion !== 'success') fail('NOT_EXECUTED');
    seenSteps.add(step.name);
  }
  own(r.execution, ['exitCode','compiledGuestCases','negativeNoArtifactCases',
    'tracingGcEvents','runtimeCompilerInvocations','unsupportedFeatures']);
  if (r.execution.exitCode !== 0 ||
      !Number.isSafeInteger(r.execution.compiledGuestCases) || r.execution.compiledGuestCases < 1 ||
      !Number.isSafeInteger(r.execution.negativeNoArtifactCases) ||
      r.execution.negativeNoArtifactCases < 1 ||
      r.execution.tracingGcEvents !== 0 ||
      r.execution.runtimeCompilerInvocations !== 0 ||
      !Array.isArray(r.execution.unsupportedFeatures) ||
      r.execution.unsupportedFeatures.some(v => typeof v !== 'string' || !id.test(v)))
    fail('EXECUTION_EVIDENCE');
  ordered(r.execution.unsupportedFeatures, v => typeof v === 'string' && id.test(v));
  // Even a perfect structural receipt can be forged: only trusted provider
  // fetch + artifact rehash + source/steps binding can grant certification.
  return { structurallyValid: true, authenticated: false, certified: false,
    reason: 'REQUIRES_AUTHENTICATED_PROVIDER_AND_ARTIFACT_BYTES' };
}
export function verifyArtifactBytes(bytes, receipt) {
  if (!(bytes instanceof Uint8Array) || !receipt?.artifact ||
      !Number.isSafeInteger(receipt.artifact.bytes) ||
      bytes.byteLength !== receipt.artifact.bytes ||
      hashBytes(bytes) !== receipt.artifact.sha256) fail('ARTIFACT_MISMATCH');
  return { bytesMatch: true, authenticated: false, certified: false };
}

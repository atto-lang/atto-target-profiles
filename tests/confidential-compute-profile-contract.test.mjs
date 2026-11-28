import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
test('ordinary server/carrier target profiles cannot imply confidential compute', () => {
  const policy = read('confidential-compute/v1.json');
  assert.equal(policy.schema, 'atto.target.confidential-compute.v1');
  assert.equal(policy.default_confidential_support, false);
  assert.equal(policy.may_authorize_guest, false);
  assert.equal(policy.may_release_secrets, false);
  assert.equal(policy.preflight_verdict, 'UNVERIFIED_CLAIMS_MATCH');
  for (const name of ['server', 'carrier-linux']) {
    const profile = read(`profiles/${name}.json`);
    assert.ok(!profile.capabilities.some(x => /confidential|tee|attestation/i.test(x)),
      `${name}: generic capabilities must not assert a TEE`);
    assert.equal(policy.known_host_profiles[name], 'NOT_EXECUTED');
  }
  for (const status of Object.values(policy.backend)) assert.equal(status, 'NOT_EXECUTED');
});

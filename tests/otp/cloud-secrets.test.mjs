import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleApiError } from '../../tools/otp-google-api.mjs';
import { PROJECT_ID, SA_EMAIL, MEMBER, AUTH_ROLE } from '../../tools/otp-cloud-policy.mjs';
import { APPROVED_PROJECT_NUMBER, APPROVED_GOOGLE_SUBJECT, SECRET_ACCESS_ROLE, SECRET_NAMES,
  assertSecretMetadata, assertVersionMetadata, assertInitialVersion, secretIamGrant, crc32c } from '../../tools/otp-secret-policy.mjs';
import { readSecretState, readSecretPreparation, applySecretPreparation, updateSecretPolicy,
  publicSecretReport } from '../../tools/prepare-otp-secrets.mjs';

const resource = name => `projects/${PROJECT_ID}/secrets/${name}`;
const metadata = name => ({ name: `projects/${APPROVED_PROJECT_NUMBER}/secrets/${name}`, replication: { automatic: {} } });
const version = (name, id = '1', state = 'ENABLED') => ({ name: `${resource(name)}/versions/${id}`, state, replicationStatus: { automatic: {} } });
const policy = (granted = false) => ({ version: 3, etag: 'current-etag', auditConfigs: [{ service: 'allServices', auditLogConfigs: [{ logType: 'ADMIN_READ' }] }], bindings: [
  { role: SECRET_ACCESS_ROLE, members: ['user:other@example.test'], condition: { title: 'temporary', expression: 'request.time < timestamp("2030-01-01T00:00:00Z")' } },
  ...(granted ? [{ role: SECRET_ACCESS_ROLE, members: [MEMBER] }] : []),
] });
const google = () => ({ projectNumber: APPROVED_PROJECT_NUMBER, account: { uniqueId: APPROVED_GOOGLE_SUBJECT, email: SA_EMAIL },
  actions: [], apiState: 'ENABLED', canActAs: true, projectPolicy: { version: 3, etag: 'project-etag', bindings: [
    { role: AUTH_ROLE, members: [MEMBER] }, { role: 'roles/datastore.user', members: [MEMBER] },
  ] } });
function fixture({ hmac = false, turnstile = true, granted = false, serviceState = 'ENABLED', fault, readGoogle = async () => google() } = {}) {
  const secrets = new Map();
  for (const [name, exists] of [['OTP_HMAC_SECRET', hmac], ['OTP_TURNSTILE_SECRET', turnstile]]) {
    if (exists) secrets.set(name, { metadata: metadata(name), policy: policy(granted), versions: [version(name)] });
  }
  const calls = [];
  const request = async (service, method, path, body) => {
    calls.push({ service, method, path, body: structuredClone(body) });
    const injected = fault?.({ service, method, path, body, secrets, calls });
    if (injected !== undefined) return injected;
    assert.ok(!path.includes(':access'), 'preparation never accesses secret payloads');
    if (service === 'services') return { state: serviceState };
    if (service === 'projects' && path.endsWith(':testIamPermissions')) return { permissions: body.permissions };
    assert.equal(service, 'secretmanager');
    if (method === 'POST' && path === `/v1/projects/${PROJECT_ID}/secrets?secretId=OTP_HMAC_SECRET`) {
      assert.deepEqual(body, { replication: { automatic: {} } });
      if (secrets.has('OTP_HMAC_SECRET')) throw new GoogleApiError(409, 'ALREADY_EXISTS', service, path);
      const created = { metadata: metadata('OTP_HMAC_SECRET'), policy: policy(), versions: [] };
      secrets.set('OTP_HMAC_SECRET', created); return structuredClone(created.metadata);
    }
    const matched = /^\/v1\/projects\/majstorsada-b2ad4\/secrets\/(OTP_HMAC_SECRET|OTP_TURNSTILE_SECRET)(.*)$/.exec(path);
    assert.ok(matched, `unexpected fixture request: ${path}`);
    const [, name, suffix] = matched, secret = secrets.get(name);
    if (!secret) throw new GoogleApiError(404, 'NOT_FOUND', service, path);
    if (method === 'GET' && suffix === '') return structuredClone(secret.metadata);
    if (method === 'GET' && suffix === ':getIamPolicy?options.requestedPolicyVersion=3') return structuredClone(secret.policy);
    if (method === 'GET' && suffix === '/versions/latest') return structuredClone(secret.versions.at(-1));
    if (method === 'GET' && suffix.startsWith('/versions?pageSize=100')) return { versions: structuredClone(secret.versions) };
    if (method === 'POST' && suffix === ':addVersion') {
      assert.equal(name, 'OTP_HMAC_SECRET');
      const payload = Buffer.from(body.payload.data, 'base64');
      assert.equal(payload.length, 43);
      assert.match(payload.toString(), /^[A-Za-z0-9_-]{43}$/);
      assert.equal(body.payload.dataCrc32c, crc32c(payload));
      const created = { ...version(name, String(secret.versions.length + 1)), clientSpecifiedPayloadChecksum: true };
      secret.versions.push(created); return structuredClone(created);
    }
    if (method === 'POST' && suffix === ':setIamPolicy') {
      assert.equal(body.policy.etag, secret.policy.etag);
      secret.policy = { ...structuredClone(body.policy), etag: `${secret.policy.etag}-updated` };
      return structuredClone(secret.policy);
    }
    assert.fail(`unexpected fixture operation: ${method} ${path}`);
  };
  const inventory = async () => [{ name: `projects/${PROJECT_ID}/locations/europe-west3/functions/existingFunction`, state: 'ACTIVE', updateTime: 'unchanged' }];
  return { request, calls, secrets, options: { readGoogle, inventory } };
}
const writes = calls => calls.filter(call => call.service === 'secretmanager' && call.method === 'POST');

test('CRC32C uses the published Castagnoli check value', () => {
  assert.equal(crc32c(Buffer.from('123456789')), String(0xe3069283));
  assert.equal(crc32c(Buffer.alloc(0)), '0');
});
test('global automatic metadata accepts only approved project aliases', () => {
  for (const name of SECRET_NAMES) {
    assertSecretMetadata(metadata(name), name, APPROVED_PROJECT_NUMBER);
    assertSecretMetadata({ ...metadata(name), name: resource(name) }, name, APPROVED_PROJECT_NUMBER);
  }
  assert.throws(() => assertSecretMetadata({ ...metadata('OTP_HMAC_SECRET'), name: 'projects/999999/secrets/OTP_HMAC_SECRET' }, 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER), /unexpected resource/);
  assert.throws(() => assertSecretMetadata(metadata('OTP_HMAC_SECRET'), 'OTP_HMAC_SECRET', '999999'), /approved boundary/);
  assert.throws(() => assertSecretMetadata(metadata('OTP_HMAC_SECRET'), 'FOREIGN_SECRET', APPROVED_PROJECT_NUMBER), /approved boundary/);
});
test('regional, CMEK, rotation, expiry, and aliases require separate review', () => {
  for (const changed of [
    { name: `projects/${PROJECT_ID}/locations/europe-west3/secrets/OTP_HMAC_SECRET` },
    { replication: { userManaged: { replicas: [{ location: 'europe-west3' }] } } },
    { replication: { automatic: { customerManagedEncryption: { kmsKeyName: 'unexpected' } } } },
    { replication: { automatic: {}, userManaged: {} } }, { rotation: {} }, { expireTime: '2030-01-01T00:00:00Z' },
    { ttl: '600s' }, { topics: [{ name: 'unexpected' }] }, { versionAliases: { custom: '1' } }, { payload: { data: 'hidden' } },
  ]) assert.throws(() => assertSecretMetadata({ ...metadata('OTP_HMAC_SECRET'), ...changed }, 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER));
});
test('metadata rejects foreign, malformed, payload, and unspecified version states', () => {
  for (const changed of [ { name: 'projects/foreign/secrets/OTP_HMAC_SECRET/versions/1' },
    { name: `${resource('OTP_HMAC_SECRET')}/versions/latest` }, { name: `${resource('OTP_HMAC_SECRET')}/versions/01` },
    { name: `${resource('OTP_HMAC_SECRET')}/versions/9223372036854775808` },
    { name: `${resource('OTP_HMAC_SECRET')}/versions/100000000000000000000000000000` },
    { state: 'STATE_UNSPECIFIED' }, { payload: {} }, { replicationStatus: { userManaged: {} } },
  ]) assert.throws(() => assertVersionMetadata({ ...version('OTP_HMAC_SECRET'), ...changed }, 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER));
});
test('initial version requires exactly one enabled latest version', () => {
  const one = version('OTP_HMAC_SECRET');
  assert.equal(assertInitialVersion([one], one, 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER), '1');
  for (const states of [[], [one, version('OTP_HMAC_SECRET', '2')], [version('OTP_HMAC_SECRET', '1', 'DISABLED')],
    [version('OTP_HMAC_SECRET', '1', 'DESTROYED')]]) {
    assert.throws(() => assertInitialVersion(states, one, 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER));
  }
  assert.throws(() => assertInitialVersion([one], version('OTP_HMAC_SECRET', '2'), 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER));
  assert.throws(() => assertInitialVersion([version('OTP_HMAC_SECRET', '2')], version('OTP_HMAC_SECRET', '2'), 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER));
  assert.equal(assertVersionMetadata(version('OTP_HMAC_SECRET', '9223372036854775807'), 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER).id, '9223372036854775807');
});
test('scoped IAM preserves foreign conditional bindings, audits, and etag', () => {
  const before = policy(), copy = structuredClone(before), result = secretIamGrant(before);
  assert.equal(result.changed, true);
  assert.deepEqual(before, copy);
  assert.deepEqual(result.policy.bindings[0], before.bindings[0]);
  assert.deepEqual(result.policy.auditConfigs, before.auditConfigs);
  assert.equal(result.policy.etag, before.etag);
  assert.equal(result.policy.version, 3);
  assert.deepEqual(result.policy.bindings.at(-1), { role: SECRET_ACCESS_ROLE, members: [MEMBER] });
});
test('unexpected runtime secret permissions and missing etag fail closed', () => {
  assert.throws(() => secretIamGrant({ ...policy(), bindings: [{ role: 'roles/secretmanager.admin', members: [MEMBER] }] }), /unexpected direct/);
  const missing = policy(); delete missing.etag;
  assert.throws(() => secretIamGrant(missing), /etag/);
  assert.equal(secretIamGrant(policy(true)).changed, false);
});
test('disabled API returns structured owner prerequisite without secret calls', async () => {
  const f = fixture({ serviceState: 'DISABLED' });
  const state = await readSecretPreparation(f.request, f.options);
  assert.equal(state.status, 'awaiting_owner');
  assert.equal(state.secrets.length, 0);
  assert.equal(f.calls.filter(call => call.service === 'secretmanager').length, 0);
});
test('missing owner Turnstile secret prevents any mutation or HMAC generation', async () => {
  const f = fixture({ turnstile: false });
  const state = await readSecretPreparation(f.request, f.options);
  assert.equal(state.status, 'awaiting_owner'); assert.deepEqual(state.actions, []);
  let generated = false;
  await assert.rejects(applySecretPreparation(f.request, { ...f.options, bytes: () => { generated = true; return Buffer.alloc(32); } }), /prerequisites are incomplete/);
  assert.equal(generated, false); assert.deepEqual(writes(f.calls), []);
});
test('owner Turnstile resource with no version also prevents every mutation', async () => {
  const f = fixture(); f.secrets.get('OTP_TURNSTILE_SECRET').versions = [];
  await assert.rejects(applySecretPreparation(f.request, f.options), /prerequisites are incomplete/);
  assert.deepEqual(writes(f.calls), []);
});
test('existing empty HMAC is ambiguous and never automatically assigned a new value', async () => {
  const f = fixture({ hmac: true }); f.secrets.get('OTP_HMAC_SECRET').versions = [];
  const state = await readSecretPreparation(f.request, f.options);
  assert.match(state.blockers.join(' '), /interrupted/);
  await assert.rejects(applySecretPreparation(f.request, f.options)); assert.deepEqual(writes(f.calls), []);
});
test('HTTP403 is not mistaken for a missing secret', async () => {
  const f = fixture({ fault: ({ path }) => { if (path === `/v1/${resource('OTP_HMAC_SECRET')}`) throw new GoogleApiError(403, 'PERMISSION_DENIED', 'secretmanager', path); } });
  await assert.rejects(readSecretPreparation(f.request, f.options), error => error.status === 403);
  assert.deepEqual(writes(f.calls), []);
});
test('foreign project, changed identity, incomplete IAM, and project-wide accessor stop before secret API', async () => {
  for (const modify of [g => { g.projectNumber = '999999'; }, g => { g.account.uniqueId = '999999999999999999999'; },
    g => { g.actions.push('missing IAM'); }, g => { g.canActAs = false; },
    g => { g.projectPolicy.bindings.push({ role: SECRET_ACCESS_ROLE, members: [MEMBER] }); },
  ]) {
    const g = google(); modify(g); const f = fixture({ readGoogle: async () => g });
    await assert.rejects(readSecretPreparation(f.request, f.options)); assert.deepEqual(f.calls, []);
  }
});
test('extra enabled or disabled versions stop without rotate, disable, or delete', async () => {
  for (const state of ['ENABLED', 'DISABLED', 'DESTROYED']) {
    const f = fixture({ hmac: true }); f.secrets.get('OTP_TURNSTILE_SECRET').versions.push(version('OTP_TURNSTILE_SECRET', '2', state));
    await assert.rejects(applySecretPreparation(f.request, f.options), /exactly one initial/);
    assert.deepEqual(writes(f.calls), []);
  }
});
test('latest metadata must match the complete version inventory', async () => {
  const f = fixture({ fault: ({ path }) => path.endsWith('OTP_TURNSTILE_SECRET/versions/latest') ? version('OTP_TURNSTILE_SECRET', '2') : undefined });
  await assert.rejects(readSecretPreparation(f.request, f.options), /one enabled version/); assert.deepEqual(writes(f.calls), []);
});
test('pagination reads all version metadata and rejects duplicate IDs', async () => {
  let page = 0;
  const f = fixture({ fault: ({ path }) => {
    if (path.includes('OTP_TURNSTILE_SECRET/versions?pageSize=100')) return ++page === 1
      ? { versions: [version('OTP_TURNSTILE_SECRET')], nextPageToken: 'next-token' }
      : { versions: [version('OTP_TURNSTILE_SECRET')] };
  } });
  await assert.rejects(readSecretPreparation(f.request, f.options), /Repeated secret-version/);
  assert.equal(page, 2); assert.deepEqual(writes(f.calls), []);
});
test('pagination repeated tokens stop safely', async () => {
  let page = 0;
  const f = fixture({ fault: ({ path }) => path.includes('OTP_TURNSTILE_SECRET/versions?pageSize=100')
    ? { versions: [version('OTP_TURNSTILE_SECRET', String(++page))], nextPageToken: 'repeat' } : undefined });
  await assert.rejects(readSecretPreparation(f.request, f.options), /repeated secret-version page token/);
  assert.equal(page, 2);
});
test('apply generates exactly one HMAC version and grants only both individual secrets', async () => {
  const f = fixture(), entropy = Buffer.alloc(32, 0xa7);
  const result = await applySecretPreparation(f.request, { ...f.options, bytes: length => { assert.equal(length, 32); return entropy; } });
  assert.equal(result.state.status, 'verified'); assert.equal(result.generatedHmac, true);
  assert.equal(entropy.every(byte => byte === 0), true);
  assert.deepEqual(writes(f.calls).map(call => call.path), [
    `/v1/projects/${PROJECT_ID}/secrets?secretId=OTP_HMAC_SECRET`, `/v1/${resource('OTP_HMAC_SECRET')}:addVersion`,
    `/v1/${resource('OTP_HMAC_SECRET')}:setIamPolicy`, `/v1/${resource('OTP_TURNSTILE_SECRET')}:setIamPolicy`,
  ]);
  assert.equal(f.calls.some(call => call.path.includes(':access') || call.path.includes(':enable') || call.path.includes(':disable') || call.path.includes(':destroy')), false);
  for (const name of SECRET_NAMES) assert.equal(secretIamGrant(f.secrets.get(name).policy).changed, false);
});
test('reapply of prepared secrets is a no-op and never reads or rotates either value', async () => {
  const f = fixture({ hmac: true, granted: true });
  const result = await applySecretPreparation(f.request, { ...f.options, bytes: () => assert.fail('must not regenerate HMAC') });
  assert.equal(result.generatedHmac, false); assert.equal(result.state.status, 'verified'); assert.deepEqual(writes(f.calls), []);
});
test('existing HMAC gains only IAM access without payload reads or changes', async () => {
  const f = fixture({ hmac: true });
  const result = await applySecretPreparation(f.request, { ...f.options, bytes: () => assert.fail('must not rotate HMAC') });
  assert.equal(result.generatedHmac, false);
  assert.equal(writes(f.calls).length, 2);
  assert.equal(writes(f.calls).every(call => call.path.endsWith(':setIamPolicy')), true);
});
test('permission precheck denies all mutations when the operator is insufficiently authorized', async () => {
  const f = fixture({ fault: ({ service }) => service === 'projects' ? { permissions: [] } : undefined });
  await assert.rejects(applySecretPreparation(f.request, f.options), /lacks required/); assert.deepEqual(writes(f.calls), []);
});
test('already deployed OTP functions prevent initial secret changes', async () => {
  const f = fixture();
  await assert.rejects(applySecretPreparation(f.request, { ...f.options, inventory: async () => [{ name: 'projects/p/locations/l/functions/requestClientOtp' }] }), /already deployed/);
  assert.deepEqual(writes(f.calls), []);
});
test('ambiguous create and addVersion failures are attempted once, with no IAM writes', async () => {
  for (const suffix of ['?secretId=OTP_HMAC_SECRET', ':addVersion']) {
    let attempted = 0;
    const f = fixture({ fault: ({ service, method, path }) => { if (service === 'secretmanager' && method === 'POST' && path.endsWith(suffix)) {
      attempted++; throw new GoogleApiError(0, 'OUTCOME_UNKNOWN_REPLAN', service, path);
    } } });
    await assert.rejects(applySecretPreparation(f.request, f.options), error => error.code === 'OUTCOME_UNKNOWN_REPLAN');
    assert.equal(attempted, 1); assert.equal(writes(f.calls).some(call => call.path.endsWith(':setIamPolicy')), false);
  }
});
test('checksum acknowledgement missing stops before IAM without another addVersion', async () => {
  const f = fixture({ fault: ({ path }) => path.endsWith(':addVersion') ? version('OTP_HMAC_SECRET') : undefined });
  await assert.rejects(applySecretPreparation(f.request, f.options), /checksum acknowledgement/);
  assert.equal(writes(f.calls).filter(call => call.path.endsWith(':addVersion')).length, 1);
  assert.equal(writes(f.calls).some(call => call.path.endsWith(':setIamPolicy')), false);
});
test('etag conflict re-reads and preserves a concurrent external IAM grant', async () => {
  let attempts = 0;
  const f = fixture({ hmac: true, fault: ({ path, secrets }) => {
    if (path.endsWith('OTP_HMAC_SECRET:setIamPolicy') && ++attempts === 1) {
      const current = secrets.get('OTP_HMAC_SECRET');
      current.policy.etag = 'concurrent-etag'; current.policy.bindings.push({ role: 'roles/secretmanager.viewer', members: ['user:concurrent@example.test'] });
      throw new GoogleApiError(409, 'ABORTED', 'secretmanager', path);
    }
  } });
  assert.equal(await updateSecretPolicy(f.request, 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER), true);
  assert.equal(attempts, 2);
  assert.ok(f.secrets.get('OTP_HMAC_SECRET').policy.bindings.some(binding => binding.members.includes('user:concurrent@example.test')));
  assert.equal(writes(f.calls).at(-1).body.policy.etag, 'concurrent-etag');
});
test('etag conflicts stop after three attempts and network IAM errors never retry', async () => {
  for (const status of [409, 0]) {
    let attempts = 0;
    const f = fixture({ hmac: true, fault: ({ path }) => {
      if (path.endsWith('OTP_HMAC_SECRET:setIamPolicy')) { attempts++; throw new GoogleApiError(status, status ? 'ABORTED' : 'OUTCOME_UNKNOWN_REPLAN', 'secretmanager', path); }
    } });
    await assert.rejects(updateSecretPolicy(f.request, 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER));
    assert.equal(attempts, status ? 3 : 1);
  }
});
test('changed identity immediately before grants stops without secret IAM access', async () => {
  let reads = 0;
  const f = fixture({ readGoogle: async () => { const value = google(); if (++reads === 2) value.account.uniqueId = '999999999999999999999'; return value; } });
  await assert.rejects(applySecretPreparation(f.request, f.options), /Approved Google identity/);
  assert.equal(writes(f.calls).some(call => call.path.endsWith(':setIamPolicy')), false);
});
test('changed deployment during preparation is reported for separate review', async () => {
  const f = fixture(); let inventories = 0;
  await assert.rejects(applySecretPreparation(f.request, { ...f.options,
    inventory: async () => [{ name: 'projects/p/locations/l/functions/old', updateTime: String(++inventories) }] }), /Deployed functions changed/);
});
test('public report contains only metadata, never policy, payload, checksum, or value fingerprint', async () => {
  const f = fixture(); const prepared = await applySecretPreparation(f.request, f.options);
  const report = publicSecretReport(prepared.state, { generatedHmacThisRun: true });
  const text = JSON.stringify(report);
  assert.equal(report.secretValuesRead, false); assert.equal(report.deploymentPerformed, false);
  assert.match(report.valueAuditScope, /not verified/);
  assert.equal(text.includes('dataCrc32c') || text.includes('payload') || text.includes('etag') || text.includes('fingerprint'), false);
  assert.equal(text.includes(writes(f.calls).find(call => call.path.endsWith(':addVersion')).body.payload.data), false);
});
test('a create conflict never reuses a concurrently created empty HMAC', async () => {
  let attempts = 0;
  const f = fixture({ fault: ({ path }) => { if (path.endsWith('?secretId=OTP_HMAC_SECRET')) {
    attempts++; throw new GoogleApiError(409, 'ALREADY_EXISTS', 'secretmanager', path);
  } } });
  await assert.rejects(applySecretPreparation(f.request, f.options), error => error.status === 409);
  assert.equal(attempts, 1); assert.equal(writes(f.calls).length, 1);
});
test('unknown generation failure does not send an incomplete HMAC payload', async () => {
  const f = fixture();
  await assert.rejects(applySecretPreparation(f.request, { ...f.options, bytes: () => Buffer.alloc(16) }), /generation failed/);
  assert.deepEqual(writes(f.calls), []);
});
test('mutated replication or runtime grants before IAM update are rejected', async () => {
  for (const modify of [s => { s.metadata.replication = { userManaged: {} }; },
    s => { s.policy.bindings.push({ role: 'roles/secretmanager.admin', members: [MEMBER] }); },
  ]) {
    const f = fixture({ hmac: true }); modify(f.secrets.get('OTP_HMAC_SECRET'));
    await assert.rejects(updateSecretPolicy(f.request, 'OTP_HMAC_SECRET', APPROVED_PROJECT_NUMBER));
    assert.deepEqual(writes(f.calls), []);
  }
});
test('metadata pagination rejects oversized tokens and unsupported inventory structure', async () => {
  for (const result of [{ versions: {}, nextPageToken: undefined },
    { versions: [], nextPageToken: 'x'.repeat(2049) }, { versions: [], nextPageToken: '\n' },
  ]) {
    const f = fixture({ fault: ({ path }) => path.includes('OTP_TURNSTILE_SECRET/versions?pageSize=100') ? result : undefined });
    await assert.rejects(readSecretPreparation(f.request, f.options)); assert.deepEqual(writes(f.calls), []);
  }
});
test('public report allowlists optional fields so future callers cannot append secret values', async () => {
  const f = fixture({ hmac: true, granted: true });
  const state = await readSecretPreparation(f.request, f.options);
  const report = publicSecretReport(state, { mode: '--verify', payload: 'sensitive-payload', dataCrc32c: 'sensitive-checksum', secret: 'sensitive-secret' });
  assert.equal(report.mode, '--verify');
  assert.equal(JSON.stringify(report).includes('sensitive'), false);
});
test('public secret access stops preparation before HMAC generation or mutations', async () => {
  for (const principal of ['allUsers', 'allAuthenticatedUsers']) {
    const f = fixture();
    f.secrets.get('OTP_TURNSTILE_SECRET').policy.bindings.push({ role: SECRET_ACCESS_ROLE, members: [principal] });
    let generated = false;
    await assert.rejects(applySecretPreparation(f.request, { ...f.options, bytes: () => { generated = true; return Buffer.alloc(32); } }), /Public principals/);
    assert.equal(generated, false); assert.deepEqual(writes(f.calls), []);
  }
});
test('public project IAM stops preparation before any secret request or mutation', async () => {
  for (const principal of ['allUsers', 'allAuthenticatedUsers']) {
    const state = google();
    state.projectPolicy.bindings.push({ role: SECRET_ACCESS_ROLE, members: [principal] });
    const f = fixture({ readGoogle: async () => state });
    await assert.rejects(applySecretPreparation(f.request, f.options), /Public principals/);
    assert.deepEqual(f.calls, []);
  }
});
test('initial IAM policy with only an etag supports a safe scoped grant', () => {
  const empty = { etag: 'ACAB' };
  const result = secretIamGrant(empty);
  assert.equal(result.changed, true);
  assert.deepEqual(empty, { etag: 'ACAB' });
  assert.deepEqual(result.policy, { etag: 'ACAB', bindings: [{ role: SECRET_ACCESS_ROLE, members: [MEMBER] }] });
});
test('new HMAC and owner secret with minimal empty policies retain etags while granting access', async () => {
  const f = fixture({ fault: ({ path, secrets }) => {
    if (path.endsWith(':getIamPolicy?options.requestedPolicyVersion=3')) {
      const name = path.split('/secrets/')[1].split(':')[0];
      const secret = secrets.get(name);
      if (secret && !(secret.policy.bindings || []).some(binding => binding.members.includes(MEMBER))) secret.policy = { etag: 'ACAB' };
    }
  } });
  const result = await applySecretPreparation(f.request, f.options);
  assert.equal(result.state.status, 'verified');
  const iamWrites = writes(f.calls).filter(call => call.path.endsWith(':setIamPolicy'));
  assert.equal(iamWrites.length, 2);
  for (const call of iamWrites) assert.equal(call.body.policy.etag, 'ACAB');
});

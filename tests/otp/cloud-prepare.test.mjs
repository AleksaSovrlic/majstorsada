import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GoogleApiError } from '../../tools/otp-google-api.mjs';
import { readPreparation, updatePolicy, applyPreparation, functionsInventory } from '../../tools/prepare-otp-google.mjs';
import { PROJECT_ID, SA_EMAIL, SA_RESOURCE, MEMBER, AUTH_ROLE, SIGN_ROLE, AUTH_ROLE_ID,
  SIGN_ROLE_ID, AUTH_DEFINITION, SIGN_DEFINITION } from '../../tools/otp-cloud-policy.mjs';

const clone = value => structuredClone(value);
const projectGrants = [
  { role: 'roles/datastore.user', members: [MEMBER] }, { role: AUTH_ROLE, members: [MEMBER] },
];
const selfGrants = [{ role: SIGN_ROLE, members: [MEMBER] }];
const account = () => ({ projectId: PROJECT_ID, email: SA_EMAIL, name: SA_RESOURCE,
  uniqueId: '123456789012345678901', disabled: false });
const role = (definition, name) => ({ ...clone(definition), name, deleted: false });
const path = suffix => `/v1/projects/${PROJECT_ID}${suffix}`;
const saPath = `/v1/${SA_RESOURCE}`;
const credentialsPath = path('/services/iamcredentials.googleapis.com');
const policy = (bindings, etag = 'initial-etag') => ({ version: 3, etag, bindings: clone(bindings) });
const ownerBinding = { role: 'roles/owner', members: ['user:owner@example.com'] };
const preparationPermissions = ['resourcemanager.projects.setIamPolicy', 'iam.serviceAccounts.setIamPolicy',
  'iam.serviceAccounts.create', 'iam.roles.create', 'serviceusage.services.enable'];
const isMutation = request => request.method === 'POST' && !/:getIamPolicy(?:\?|$)|:testIamPermissions$/.test(request.path);

function mockCloud({ prepared = false, override } = {}) {
  const state = {
    account: prepared ? account() : null,
    authRole: prepared ? role(AUTH_DEFINITION, AUTH_ROLE) : null,
    signRole: prepared ? role(SIGN_DEFINITION, SIGN_ROLE) : null,
    projectPolicy: policy([ownerBinding, ...(prepared ? projectGrants : [])]),
    selfPolicy: policy(prepared ? selfGrants : [], 'self-etag'),
    apiState: 'ENABLED', permissions: [...preparationPermissions], canActAs: true, keys: {},
  };
  const calls = [];
  const request = async (service, method, requestPath, body) => {
    const call = { service, method, path: requestPath, body: clone(body) };
    calls.push(call);
    if (override) {
      const overridden = await override({ ...call, state, calls });
      if (overridden !== undefined) return clone(overridden);
    }
    if (service === 'projects' && method === 'GET' && requestPath === path('')) return {
      projectId: PROJECT_ID, projectNumber: '123456789012', lifecycleState: 'ACTIVE',
    };
    if (service === 'firebase' && method === 'GET') return {
      projectId: PROJECT_ID, projectNumber: '123456789012', state: 'ACTIVE',
    };
    if (requestPath === path(':getIamPolicy')) return clone(state.projectPolicy);
    if (requestPath === saPath + ':getIamPolicy?options.requestedPolicyVersion=3') return clone(state.selfPolicy);
    if (requestPath === path(':testIamPermissions')) return { permissions: clone(state.permissions) };
    if (requestPath === saPath + ':testIamPermissions') return {
      permissions: state.canActAs ? ['iam.serviceAccounts.actAs'] : [],
    };
    if (method === 'GET' && requestPath === saPath) {
      if (!state.account) throw new GoogleApiError(404, 'NOT_FOUND', service, requestPath);
      return clone(state.account);
    }
    if (method === 'GET' && requestPath === `/v1/${AUTH_ROLE}`) {
      if (!state.authRole) throw new GoogleApiError(404, 'NOT_FOUND', service, requestPath);
      return clone(state.authRole);
    }
    if (method === 'GET' && requestPath === `/v1/${SIGN_ROLE}`) {
      if (!state.signRole) throw new GoogleApiError(404, 'NOT_FOUND', service, requestPath);
      return clone(state.signRole);
    }
    if (method === 'GET' && requestPath === saPath + '/keys?keyTypes=USER_MANAGED') return clone(state.keys);
    if (method === 'GET' && requestPath === credentialsPath) return { state: state.apiState };
    if (method === 'POST' && requestPath === path('/serviceAccounts')) {
      assert.equal(body.accountId, 'otp-runtime');
      assert.equal(Object.hasOwn(body.serviceAccount, 'privateKey'), false);
      state.account = account(); return clone(state.account);
    }
    if (method === 'POST' && requestPath === path('/roles')) {
      const name = `projects/${PROJECT_ID}/roles/${body.roleId}`;
      const created = role(body.role, name);
      if (body.roleId === AUTH_ROLE_ID) state.authRole = created;
      else if (body.roleId === SIGN_ROLE_ID) state.signRole = created;
      else assert.fail('Unexpected custom role creation');
      return clone(created);
    }
    if (method === 'POST' && requestPath === credentialsPath + ':enable') {
      state.apiState = 'ENABLED'; return { name: 'operations/enable-otp', done: true };
    }
    if (method === 'POST' && requestPath === path(':setIamPolicy')) {
      assert.equal(body.policy.etag, state.projectPolicy.etag);
      state.projectPolicy = { ...clone(body.policy), etag: 'applied-project-etag' };
      return clone(state.projectPolicy);
    }
    if (method === 'POST' && requestPath === saPath + ':setIamPolicy') {
      assert.equal(body.policy.etag, state.selfPolicy.etag);
      state.selfPolicy = { ...clone(body.policy), etag: 'applied-self-etag' };
      return clone(state.selfPolicy);
    }
    assert.fail(`Unexpected mock request: ${service} ${method} ${requestPath}`);
  };
  return { request, calls, state, mutations: () => calls.filter(isMutation) };
}

test('Read-only preparation distinguishes absent resources and plans only the required bounded additions', async () => {
  const cloud = mockCloud();
  const plan = await readPreparation(cloud.request);
  assert.equal(plan.account, null); assert.equal(plan.authRole, null); assert.equal(plan.signRole, null);
  assert.equal(plan.apiState, 'ENABLED'); assert.equal(plan.actions.length, 5);
  assert.ok(plan.actions.includes('create dedicated OTP service account (no keys)'));
  assert.ok(!plan.actions.some(action => /enable|secret|key creation|deploy/.test(action)));
  assert.equal(cloud.mutations().length, 0);
  assert.deepEqual(cloud.calls.find(call => call.path === path(':getIamPolicy')).body,
    { options: { requestedPolicyVersion: 3 } });
});

test('403 on an account or role lookup is never mistaken for an absent resource', async () => {
  for (const forbiddenPath of [saPath, `/v1/${AUTH_ROLE}`, `/v1/${SIGN_ROLE}`]) {
    const cloud = mockCloud({ override: ({ service, method, path: lookup }) => {
      if (method === 'GET' && lookup === forbiddenPath) throw new GoogleApiError(403, 'PERMISSION_DENIED', service, lookup);
    } });
    await assert.rejects(() => readPreparation(cloud.request), error => error instanceof GoogleApiError && error.status === 403);
    assert.equal(cloud.mutations().length, 0);
  }
});

test('Foreign or inactive project identities block preparation before any IAM mutation', async () => {
  for (const response of [
    { projectId: 'other-project', projectNumber: '123456789012', state: 'ACTIVE' },
    { projectId: PROJECT_ID, projectNumber: '999999999999', state: 'ACTIVE' },
    { projectId: PROJECT_ID, projectNumber: '123456789012', state: 'DELETED' },
  ]) {
    const cloud = mockCloud({ override: ({ service }) => service === 'firebase' ? response : undefined });
    await assert.rejects(() => readPreparation(cloud.request), /project identity mismatch/);
    assert.equal(cloud.mutations().length, 0);
  }
});

test('Incompatible existing Auth/signer roles and disabled accounts fail closed without repairs', async () => {
  for (const mutate of [
    state => state.authRole.includedPermissions.push('firebaseauth.users.update'),
    state => state.signRole.includedPermissions.push('iam.serviceAccounts.getAccessToken'),
    state => { state.account.disabled = true; },
  ]) {
    const cloud = mockCloud({ prepared: true }); mutate(cloud.state);
    await assert.rejects(() => readPreparation(cloud.request), /approved definition|disabled/);
    assert.equal(cloud.mutations().length, 0);
  }
});

test('Unexpected direct runtime grants, user-managed keys and missing actAs stop the preparation', async () => {
  for (const mutate of [
    state => state.projectPolicy.bindings.push({ role: 'roles/editor', members: [MEMBER] }),
    state => state.selfPolicy.bindings.push({ role: 'roles/iam.serviceAccountTokenCreator', members: [MEMBER] }),
    state => state.selfPolicy.bindings.push({ role: 'roles/iam.serviceAccountUser', members: ['user:foreign@example.com'] }),
    state => state.selfPolicy.bindings[0].members.push('serviceAccount:other@example.iam.gserviceaccount.com'),
    state => { state.keys = { keys: [{ keyType: 'USER_MANAGED', disabled: true }] }; },
    state => { state.canActAs = false; },
  ]) {
    const cloud = mockCloud({ prepared: true }); mutate(cloud.state);
    await assert.rejects(() => readPreparation(cloud.request), /Unexpected direct|user-managed key|cannot actAs/);
    assert.equal(cloud.mutations().length, 0);
  }
});

test('Missing preparation permission produces zero cloud mutations', async () => {
  const cloud = mockCloud();
  const before = await readPreparation(cloud.request);
  cloud.state.permissions = preparationPermissions.filter(permission => permission !== 'iam.roles.create');
  await assert.rejects(() => applyPreparation(cloud.request, before), /lacks required preparation permissions; nothing applied/);
  assert.equal(cloud.mutations().length, 0);
});

test('IAM etag conflicts reread and preserve a concurrent unrelated grant before writing', async () => {
  for (const conflictStatus of [409, 412]) {
    let writes = 0;
    const concurrent = { role: 'roles/viewer', members: ['user:new-collaborator@example.com'],
      condition: { title: 'Preserve condition', expression: 'true' } };
    const cloud = mockCloud({ override: ({ method, path: requestPath, state }) => {
      if (method === 'POST' && requestPath === path(':setIamPolicy') && ++writes === 1) {
        state.projectPolicy = policy([ownerBinding, concurrent], 'concurrently-updated-etag');
        throw new GoogleApiError(conflictStatus, 'ABORTED', 'projects', requestPath);
      }
    } });
    assert.equal(await updatePolicy(cloud.request, 'project', projectGrants), true);
    assert.equal(writes, 2);
    const changes = cloud.mutations();
    assert.equal(changes[0].body.policy.etag, 'initial-etag');
    assert.equal(changes[1].body.policy.etag, 'concurrently-updated-etag');
    assert.ok(changes[1].body.policy.bindings.some(binding => binding.members.includes('user:new-collaborator@example.com')));
    assert.deepEqual(cloud.state.projectPolicy.bindings, [ownerBinding, concurrent, ...projectGrants]);
    assert.equal(await updatePolicy(cloud.request, 'project', projectGrants), false);
    assert.equal(writes, 2);
  }
});

test('IAM conflict attempts are bounded and ambiguous network outcomes are never retried', async () => {
  for (const [status, expectedWrites] of [[409, 3], [0, 1], [403, 1]]) {
    const cloud = mockCloud({ override: ({ method, path: requestPath }) => {
      if (method === 'POST' && requestPath === path(':setIamPolicy')) {
        throw new GoogleApiError(status, status === 0 ? 'OUTCOME_UNKNOWN_REPLAN' : 'ABORTED', 'projects', requestPath);
      }
    } });
    await assert.rejects(() => updatePolicy(cloud.request, 'project', projectGrants),
      error => error instanceof GoogleApiError && error.status === status);
    assert.equal(cloud.mutations().length, expectedWrites);
  }
});

test('IAM read errors or new unexpected grants prevent a setIamPolicy call', async () => {
  const forbidden = mockCloud({ override: ({ service, path: requestPath }) => {
    if (requestPath === path(':getIamPolicy')) throw new GoogleApiError(403, 'PERMISSION_DENIED', service, requestPath);
  } });
  await assert.rejects(() => updatePolicy(forbidden.request, 'project', projectGrants));
  assert.equal(forbidden.mutations().length, 0);
  const drift = mockCloud();
  drift.state.projectPolicy.bindings.push({ role: 'roles/owner', members: [MEMBER] });
  await assert.rejects(() => updatePolicy(drift.request, 'project', projectGrants), /Unexpected direct OTP/);
  assert.equal(drift.mutations().length, 0);
});

test('Apply creates keyless resources, validates readback and grants only the reviewed roles', async () => {
  const cloud = mockCloud();
  const before = await readPreparation(cloud.request);
  await applyPreparation(cloud.request, before);
  const after = await readPreparation(cloud.request);
  assert.deepEqual(after.actions, []); assert.equal(after.canActAs, true);
  assert.deepEqual(cloud.state.projectPolicy.bindings, [ownerBinding, ...projectGrants]);
  assert.deepEqual(cloud.state.selfPolicy.bindings, selfGrants);
  assert.equal(cloud.mutations().length, 5);
  assert.ok(!cloud.calls.some(call => /secret|:generateAccessToken|:generateIdToken|\/keys$|functions/.test(call.path)));
  const selfWrite = cloud.calls.find(call => call.path === saPath + ':setIamPolicy');
  assert.deepEqual(selfWrite.body.policy.bindings, selfGrants);
});

test('No-op reapplication and readback perform no writes when preparation is complete', async () => {
  const cloud = mockCloud({ prepared: true });
  const before = await readPreparation(cloud.request);
  assert.deepEqual(before.actions, []);
  await applyPreparation(cloud.request, before);
  const after = await readPreparation(cloud.request);
  assert.deepEqual(after.actions, []);
  assert.equal(cloud.mutations().length, 0);
});

test('Create conflicts read the concurrent exact resource and continue without overwriting it', async () => {
  const cloud = mockCloud({ override: ({ service, method, path: requestPath, body, state }) => {
    if (method !== 'POST') return;
    if (requestPath === path('/serviceAccounts')) state.account = account();
    else if (requestPath === path('/roles')) {
      if (body.roleId === AUTH_ROLE_ID) state.authRole = role(AUTH_DEFINITION, AUTH_ROLE);
      else state.signRole = role(SIGN_DEFINITION, SIGN_ROLE);
    } else return;
    throw new GoogleApiError(409, 'ALREADY_EXISTS', service, requestPath);
  } });
  const before = await readPreparation(cloud.request);
  await applyPreparation(cloud.request, before);
  assert.deepEqual((await readPreparation(cloud.request)).actions, []);
  assert.equal(cloud.mutations().length, 5);
  assert.equal(cloud.calls.filter(call => call.method === 'POST' && call.path === path('/serviceAccounts')).length, 1);
  assert.equal(cloud.calls.filter(call => call.method === 'POST' && call.path === path('/roles')).length, 2);
});

test('Create conflicts cannot reuse a disabled account or incompatible concurrent role', async () => {
  for (const resource of ['account', 'authRole']) {
    const cloud = mockCloud({ override: ({ service, method, path: requestPath, state, body }) => {
      if (method === 'POST' && resource === 'account' && requestPath === path('/serviceAccounts')) {
        state.account = { ...account(), disabled: true };
        throw new GoogleApiError(409, 'ALREADY_EXISTS', service, requestPath);
      }
      if (method === 'POST' && resource === 'authRole' && requestPath === path('/roles') && body.roleId === AUTH_ROLE_ID) {
        state.authRole = { ...role(AUTH_DEFINITION, AUTH_ROLE), includedPermissions: ['firebaseauth.users.update'] };
        throw new GoogleApiError(409, 'ALREADY_EXISTS', service, requestPath);
      }
    } });
    const before = await readPreparation(cloud.request);
    await assert.rejects(() => applyPreparation(cloud.request, before), /disabled|approved definition/);
    assert.ok(!cloud.mutations().some(call => /:setIamPolicy$/.test(call.path)));
  }
});

test('Ambiguous account creation does not retry, proceed to roles or grant permissions', async () => {
  const cloud = mockCloud({ override: ({ service, method, path: requestPath }) => {
    if (method === 'POST' && requestPath === path('/serviceAccounts')) {
      throw new GoogleApiError(0, 'OUTCOME_UNKNOWN_REPLAN', service, requestPath);
    }
  } });
  const before = await readPreparation(cloud.request);
  await assert.rejects(() => applyPreparation(cloud.request, before), error => error.code === 'OUTCOME_UNKNOWN_REPLAN');
  assert.equal(cloud.mutations().length, 1);
});

test('Resources are revalidated immediately before any policy grant', async () => {
  let reads = 0;
  const cloud = mockCloud({ override: ({ method, path: requestPath, state }) => {
    if (method === 'GET' && requestPath === `/v1/${AUTH_ROLE}` && ++reads === 2) {
      return { ...state.authRole, includedPermissions: [...AUTH_DEFINITION.includedPermissions, 'firebaseauth.users.delete'] };
    }
  } });
  const before = await readPreparation(cloud.request);
  await assert.rejects(() => applyPreparation(cloud.request, before), /approved definition/);
  assert.ok(!cloud.mutations().some(call => /:setIamPolicy$/.test(call.path)));
});

test('A disabled Credentials API is enabled once and an unsuccessful enable result blocks grants', async () => {
  const success = mockCloud({ prepared: true }); success.state.apiState = 'DISABLED';
  await applyPreparation(success.request, await readPreparation(success.request));
  assert.equal(success.mutations().length, 1);
  assert.equal(success.mutations()[0].path, credentialsPath + ':enable');
  assert.deepEqual((await readPreparation(success.request)).actions, []);
  const failure = mockCloud({ prepared: true, override: ({ method, path: requestPath }) => {
    if (method === 'POST' && requestPath === credentialsPath + ':enable') {
      return { name: 'operations/enable-otp', done: true, error: { code: 7, message: 'denied' } };
    }
  } }); failure.state.apiState = 'DISABLED';
  const failureBefore = await readPreparation(failure.request);
  await assert.rejects(() => applyPreparation(failure.request, failureBefore), /enable incomplete/);
  assert.equal(failure.mutations().length, 1);
});

const functionRecord = (name, time = '2026-10-04T00:00:00Z') => ({
  name: `projects/${PROJECT_ID}/locations/europe-west3/functions/${name}`, state: 'ACTIVE', updateTime: time,
  serviceConfig: { serviceAccountEmail: 'existing-runtime@example.iam.gserviceaccount.com' },
});
test('Function inventory follows encoded page tokens and produces stable comparable records', async () => {
  const calls = [];
  const request = async (service, method, requestPath) => {
    calls.push(requestPath); assert.equal(service, 'functions'); assert.equal(method, 'GET');
    if (calls.length === 1) return { functions: [functionRecord('zLast')], nextPageToken: 'page/with+symbols=' };
    assert.equal(requestPath, `/v2/projects/${PROJECT_ID}/locations/europe-west3/functions?pageSize=100&pageToken=page%2Fwith%2Bsymbols%3D`);
    return { functions: [functionRecord('aFirst')] };
  };
  const inventory = await functionsInventory(request);
  assert.equal(calls.length, 2);
  assert.deepEqual(inventory.map(record => record.name.split('/').at(-1)), ['aFirst', 'zLast']);
  assert.deepEqual(Object.keys(inventory[0]).sort(), ['name', 'serviceAccountEmail', 'state', 'updateTime']);
});

test('Incomplete, malformed or repeated-token function inventories cannot be accepted', async () => {
  await assert.rejects(() => functionsInventory(async () => ({ unreachable: ['europe-west3'], functions: [] })), /Incomplete/);
  await assert.rejects(() => functionsInventory(async () => ({ functions: {} })), /Invalid functions/);
  let calls = 0;
  await assert.rejects(() => functionsInventory(async () => {
    calls++; return { functions: [], nextPageToken: 'repeat' };
  }), /Repeated functions page token/);
  assert.equal(calls, 2);
});

test('Function pagination detects a cycle across more than one previous token', async () => {
  let calls = 0;
  await assert.rejects(() => functionsInventory(async () => {
    calls++;
    if (calls > 3) throw new Error('Mock safety stop: undetected token cycle');
    return { functions: [], nextPageToken: calls % 2 ? 'page-A' : 'page-B' };
  }), /Repeated functions page token/);
  assert.equal(calls, 3);
});

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  PROJECT_ID, SA_EMAIL, SA_RESOURCE, MEMBER, AUTH_ROLE_ID, SIGN_ROLE_ID, AUTH_ROLE, SIGN_ROLE,
  AUTH_DEFINITION, SIGN_DEFINITION, assertServiceAccount, assertRole, addBindings,
  unexpectedRuntimeBindings, assertNoUserKeys, awsPolicies,
} from '../../tools/otp-cloud-policy.mjs'

const subject = '123456789012345678901'
const account = () => ({ projectId: PROJECT_ID, email: SA_EMAIL, name: SA_RESOURCE, uniqueId: subject, disabled: false })
const role = (definition = AUTH_DEFINITION, name = AUTH_ROLE) => ({ ...structuredClone(definition), name, etag: 'role-etag', deleted: false })
const policy = bindings => ({ version: 3, etag: 'current-etag', bindings })
const required = [{ role: 'roles/datastore.user', members: [MEMBER] }, { role: AUTH_ROLE, members: [MEMBER] }]
const readJson = relative => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8').replace(/^\uFEFF/, ''))

test('Cloud identity and role definitions have exact project/resource scopes and minimal permissions', () => {
  assert.equal(PROJECT_ID, 'majstorsada-b2ad4')
  assert.equal(SA_EMAIL, 'otp-runtime@majstorsada-b2ad4.iam.gserviceaccount.com')
  assert.equal(SA_RESOURCE, `projects/${PROJECT_ID}/serviceAccounts/${SA_EMAIL}`)
  assert.equal(MEMBER, `serviceAccount:${SA_EMAIL}`)
  assert.equal(AUTH_ROLE_ID, 'majstorsadaOtpAuth')
  assert.equal(SIGN_ROLE_ID, 'majstorsadaOtpSigner')
  assert.equal(AUTH_ROLE, `projects/${PROJECT_ID}/roles/${AUTH_ROLE_ID}`)
  assert.equal(SIGN_ROLE, `projects/${PROJECT_ID}/roles/${SIGN_ROLE_ID}`)
  assert.deepEqual(AUTH_DEFINITION, readJson('../../ops/otp-google-auth-role.template.json'))
  assert.deepEqual([...AUTH_DEFINITION.includedPermissions].sort(), ['firebaseauth.users.create', 'firebaseauth.users.get'])
  assert.deepEqual(SIGN_DEFINITION.includedPermissions, ['iam.serviceAccounts.signBlob'])
  assert.ok(Object.isFrozen(AUTH_DEFINITION) && Object.isFrozen(AUTH_DEFINITION.includedPermissions))
  assert.ok(Object.isFrozen(SIGN_DEFINITION) && Object.isFrozen(SIGN_DEFINITION.includedPermissions))
})

test('Existing enabled account returns its precise string identity without losing decimal precision', () => {
  const value = account()
  assert.equal(assertServiceAccount(value), value)
  assert.equal(assertServiceAccount({ ...value, disabled: undefined }).uniqueId, subject)
  assert.equal(assertServiceAccount({ ...value, name: `projects/${PROJECT_ID}/serviceAccounts/${subject}` }).uniqueId, subject)
})

test('Disabled, foreign, or malformed service accounts cannot be reused', () => {
  for (const value of [null, [], {}, { ...account(), projectId: 'other-project' }, { ...account(), email: 'other@majstorsada-b2ad4.iam.gserviceaccount.com' }, { ...account(), name: 'projects/other/serviceAccounts/' + SA_EMAIL }, { ...account(), disabled: true }, { ...account(), disabled: 'false' }]) assert.throws(() => assertServiceAccount(value))
  for (const uniqueId of [undefined, Number(subject), '', '0', '123', '012345678901234567890', '*', subject + '\n', '123.45', '1'.repeat(31)]) assert.throws(() => assertServiceAccount({ ...account(), uniqueId }))
})

test('Existing exact Auth and signer roles are accepted independently of non-security metadata', () => {
  const auth = role()
  const signing = role(SIGN_DEFINITION, SIGN_ROLE)
  assert.equal(assertRole(auth, AUTH_DEFINITION, AUTH_ROLE), auth)
  assert.equal(assertRole(signing, SIGN_DEFINITION, SIGN_ROLE), signing)
  assertRole({ ...auth, includedPermissions: [...auth.includedPermissions].reverse(), title: 'Old display name' }, AUTH_DEFINITION, AUTH_ROLE)
})

test('Existing roles with extra, missing, duplicated, disabled or deleted permissions fail closed', () => {
  for (const patch of [{ name: SIGN_ROLE }, { stage: 'DISABLED' }, { stage: 'BETA' }, { deleted: true }, { deleted: 'false' }, { includedPermissions: ['firebaseauth.users.get'] }, { includedPermissions: [...AUTH_DEFINITION.includedPermissions, 'firebaseauth.users.update'] }, { includedPermissions: [...AUTH_DEFINITION.includedPermissions, AUTH_DEFINITION.includedPermissions[0]] }, { includedPermissions: null }]) assert.throws(() => assertRole({ ...role(), ...patch }, AUTH_DEFINITION, AUTH_ROLE))
  assert.throws(() => assertRole(role(SIGN_DEFINITION, SIGN_ROLE), { ...SIGN_DEFINITION, stage: 'BETA' }, SIGN_ROLE))
  assert.throws(() => assertRole(role(), AUTH_DEFINITION, 'projects/other/roles/majstorsadaOtpAuth'))
})

test('Additive merge preserves foreign bindings, conditions, audit configuration, etag and metadata', () => {
  const foreign = { role: 'roles/datastore.user', members: ['user:old@example.com'], condition: { title: 'Expiry', expression: "request.time < timestamp('2030-01-01T00:00:00Z')", description: 'Keep this exact condition' } }
  const original = { version: 3, etag: 'fresh-etag', bindings: [foreign, { role: 'roles/owner', members: ['user:owner@example.com'] }], auditConfigs: [{ service: 'allServices', auditLogConfigs: [{ logType: 'DATA_READ', exemptedMembers: ['user:auditor@example.com'] }] }], opaqueMetadata: { untouched: true } }
  const snapshot = structuredClone(original)
  const result = addBindings(original, required)
  assert.equal(result.changed, true)
  assert.deepEqual(original, snapshot)
  assert.deepEqual(result.policy.bindings[0], foreign)
  assert.deepEqual(result.policy.bindings[1], original.bindings[1])
  assert.deepEqual(result.policy.auditConfigs, original.auditConfigs)
  assert.deepEqual(result.policy.opaqueMetadata, original.opaqueMetadata)
  assert.equal(result.policy.etag, 'fresh-etag')
  assert.equal(result.policy.version, 3)
  assert.deepEqual(result.policy.bindings.slice(2), required)
  assert.notEqual(result.policy.auditConfigs, original.auditConfigs)
  assert.equal(addBindings(result.policy, required).changed, false)
})

test('An existing conditional grant does not satisfy the unconditional runtime grant', () => {
  const existing = { role: AUTH_ROLE, members: [MEMBER], condition: { title: 'Temporary', expression: 'request.time < timestamp("2030-01-01T00:00:00Z")' } }
  const result = addBindings(policy([existing]), [{ role: AUTH_ROLE, members: [MEMBER] }])
  assert.equal(result.changed, true)
  assert.deepEqual(result.policy.bindings, [existing, { role: AUTH_ROLE, members: [MEMBER] }])
})

test('Unconditional grants add only missing members once and are idempotent', () => {
  const original = policy([{ role: AUTH_ROLE, members: ['user:existing@example.com'] }])
  const result = addBindings(original, [{ role: AUTH_ROLE, members: [MEMBER, MEMBER, 'user:existing@example.com'] }, { role: AUTH_ROLE, members: [MEMBER] }])
  assert.equal(result.changed, true)
  assert.deepEqual(result.policy.bindings, [{ role: AUTH_ROLE, members: ['user:existing@example.com', MEMBER] }])
  const noop = addBindings(result.policy, [{ role: AUTH_ROLE, members: [MEMBER] }])
  assert.equal(noop.changed, false)
  assert.deepEqual(noop.policy, result.policy)
  assert.notEqual(noop.policy, result.policy)
})

test('A missing etag blocks changes but does not prevent a read-only/no-op comparison', () => {
  for (const etag of [undefined, null, '', '  ', 123]) {
    assert.throws(() => addBindings({ etag, bindings: [] }, required), /etag/)
    const satisfied = { etag, bindings: structuredClone(required) }
    assert.equal(addBindings(satisfied, required).changed, false)
  }
  const empty = addBindings({ etag: 'new-account-policy' }, [{ role: SIGN_ROLE, members: [MEMBER] }])
  assert.deepEqual(empty.policy.bindings, [{ role: SIGN_ROLE, members: [MEMBER] }])
})

test('Conditions retain their complete representation and force schema version 3 on update', () => {
  const result = addBindings({ etag: 'etag', version: 1, bindings: [{ role: 'roles/viewer', members: ['user:someone@example.com'], condition: { expression: 'true' } }] }, required)
  assert.equal(result.policy.version, 3)
  const plain = addBindings({ etag: 'etag', version: 1, bindings: [] }, required)
  assert.equal(plain.policy.version, 1)
})

test('Malformed and condition-truncated policy input cannot cause destructive replacements', () => {
  for (const bad of [null, [], { bindings: null }, { version: 2 }, { bindings: [{}] }, { bindings: [{ role: AUTH_ROLE, members: null }] }, { bindings: [{ role: 'roles/viewer_withcond_abcdef', members: [] }] }, { bindings: [{ role: AUTH_ROLE, members: [123] }] }, { bindings: [{ role: AUTH_ROLE, members: [MEMBER], condition: {} }] }, { bindings: [{ role: AUTH_ROLE, members: [MEMBER], condition: null }] }]) assert.throws(() => addBindings(bad, required))
  for (const bad of [null, [{}], [{ role: AUTH_ROLE, members: [] }], [{ role: AUTH_ROLE, members: [MEMBER], condition: { expression: 'true' } }], [{ role: 'roles/owner\n', members: [MEMBER] }]]) assert.throws(() => addBindings(policy([]), bad))
})

test('Unexpected runtime roles include conditional grants without reporting other principals', () => {
  const value = policy([
    ...structuredClone(required),
    { role: 'roles/owner', members: [MEMBER], condition: { expression: 'true' } },
    { role: 'roles/owner', members: [MEMBER] },
    { role: 'roles/secretmanager.secretAccessor', members: [MEMBER] },
    { role: 'roles/iam.serviceAccountTokenCreator', members: ['user:other@example.com'] },
  ])
  assert.deepEqual(unexpectedRuntimeBindings(value, required.map(binding => binding.role)), ['roles/owner', 'roles/secretmanager.secretAccessor'])
  assert.deepEqual(unexpectedRuntimeBindings(policy(structuredClone(required)), required.map(binding => binding.role)), [])
  assert.throws(() => unexpectedRuntimeBindings(value, null))
})

test('Keyless inventory accepts omitted/empty lists and system-managed keys', () => {
  for (const value of [{}, { keys: [] }, { keys: [{ keyType: 'SYSTEM_MANAGED', name: 'projects/p/serviceAccounts/a/keys/system' }] }]) assert.equal(assertNoUserKeys(value), value)
})

test('User-managed keys and unreadable/malformed inventories cannot be accepted as keyless', () => {
  for (const value of [null, [], { keys: null }, { error: { code: 403 } }, { keyss: [] }, { keys: [null] }, { keys: [{}] }, { keys: [{ keyType: 'KEY_TYPE_UNSPECIFIED' }] }, { keys: [{ keyType: 'USER_MANAGED', disabled: true }] }, { keys: [{ keyType: 'SYSTEM_MANAGED' }, { keyType: 'USER_MANAGED' }] }]) assert.throws(() => assertNoUserKeys(value))
})

test('AWS policies exactly instantiate the reviewed templates with correct Google claim mapping', () => {
  const generated = awsPolicies(subject)
  const templateTrust = JSON.stringify(readJson('../../ops/otp-aws-trust.template.json')).replaceAll('REPLACE_GOOGLE_SERVICE_ACCOUNT_NUMERIC_ID', subject)
  const templateSend = JSON.stringify(readJson('../../ops/otp-aws-send.template.json')).replaceAll('REPLACE_AWS_ACCOUNT_ID', '722769295504')
  assert.deepEqual(generated.trust, JSON.parse(templateTrust))
  assert.deepEqual(generated.send, JSON.parse(templateSend))
  const claims = generated.trust.Statement[0].Condition.StringEquals
  assert.equal(claims['accounts.google.com:aud'], subject)
  assert.equal(claims['accounts.google.com:sub'], subject)
  assert.equal(claims['accounts.google.com:oaud'], 'majstorsada-otp-ses')
  assert.equal(generated.send.Statement[0].Action, 'ses:SendEmail')
  assert.equal(generated.send.Statement[0].Resource, 'arn:aws:ses:eu-central-1:722769295504:identity/majstorsada.rs')
  assert.ok(!JSON.stringify(generated).includes('*'))
  generated.trust.Statement[0].Condition.StringEquals['accounts.google.com:sub'] = 'changed'
  assert.equal(awsPolicies(subject).trust.Statement[0].Condition.StringEquals['accounts.google.com:sub'], subject)
})

test('AWS template generation rejects numeric coercion, wildcards and malformed account IDs', () => {
  for (const bad of [Number(subject), '', '*', '123', subject + '\n', '000000000000000000000']) assert.throws(() => awsPolicies(bad))
  for (const bad of [722769295504, '', '*', '12345678901', '1234567890123', '123456789012\n']) assert.throws(() => awsPolicies(subject, bad))
  assert.equal(awsPolicies(subject, '123456789012').send.Statement[0].Resource, 'arn:aws:ses:eu-central-1:123456789012:identity/majstorsada.rs')
})
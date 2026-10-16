import { readFileSync } from 'node:fs'

export const PROJECT_ID = 'majstorsada-b2ad4'
export const SA_EMAIL = `otp-runtime@${PROJECT_ID}.iam.gserviceaccount.com`
export const SA_RESOURCE = `projects/${PROJECT_ID}/serviceAccounts/${SA_EMAIL}`
export const MEMBER = `serviceAccount:${SA_EMAIL}`
export const AUTH_ROLE_ID = 'majstorsadaOtpAuth'
export const SIGN_ROLE_ID = 'majstorsadaOtpSigner'
export const AUTH_ROLE = `projects/${PROJECT_ID}/roles/${AUTH_ROLE_ID}`
export const SIGN_ROLE = `projects/${PROJECT_ID}/roles/${SIGN_ROLE_ID}`

const authTemplate = JSON.parse(readFileSync(new URL('../ops/otp-google-auth-role.template.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
const AUTH_PERMISSIONS = ['firebaseauth.users.create', 'firebaseauth.users.get']
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function fail(message) { throw new Error(message) }
function strings(value, label) {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item.length > 0 && item.trim() === item)) fail(`Invalid ${label}`)
  return value
}
function exactPermissions(actual, expected) {
  strings(actual, 'role permissions')
  strings(expected, 'expected role permissions')
  return new Set(actual).size === actual.length && new Set(expected).size === expected.length && actual.length === expected.length && actual.every(permission => expected.includes(permission))
}
if (!record(authTemplate) || authTemplate.stage !== 'GA' || !exactPermissions(authTemplate.includedPermissions, AUTH_PERMISSIONS)) fail('OTP Auth role template is outside the approved permission boundary')
export const AUTH_DEFINITION = Object.freeze({ ...authTemplate, includedPermissions: Object.freeze([...authTemplate.includedPermissions]) })
export const SIGN_DEFINITION = Object.freeze({
  title: 'MajstorSada OTP token signing',
  description: 'Blob signing used by Firebase custom-token issuance; no access-token or ID-token generation API permissions.',
  stage: 'GA',
  includedPermissions: Object.freeze(['iam.serviceAccounts.signBlob']),
})

function numericSubject(value) {
  // Keep the provider's decimal identity as a string; Number would lose precision.
  if (typeof value !== 'string' || !/^[1-9][0-9]{9,29}$/.test(value)) fail('Invalid Google service-account numeric identity')
  return value
}
export function assertServiceAccount(account) {
  if (!record(account) || account.projectId !== PROJECT_ID || account.email !== SA_EMAIL) fail('OTP service account does not match the approved project and email')
  if (account.disabled !== undefined && account.disabled !== false) fail('OTP service account is disabled or has an invalid disabled state')
  if (account.name !== undefined && account.name !== SA_RESOURCE && account.name !== `projects/${PROJECT_ID}/serviceAccounts/${account.uniqueId}`) fail('OTP service-account resource name is unexpected')
  numericSubject(account.uniqueId)
  return account
}
export function assertRole(role, expectedDefinition, expectedName) {
  if (!record(expectedDefinition) || expectedDefinition.stage !== 'GA' || typeof expectedName !== 'string' || !expectedName.startsWith(`projects/${PROJECT_ID}/roles/`)) fail('Invalid expected OTP role definition')
  if (!record(role) || role.name !== expectedName || role.stage !== 'GA' || (role.deleted !== undefined && role.deleted !== false)) fail('OTP role is missing, deleted, disabled, or belongs to another resource')
  if (!exactPermissions(role.includedPermissions, expectedDefinition.includedPermissions)) fail('OTP role permissions differ from the approved definition')
  return role
}

function roleName(value) {
  if (typeof value !== 'string' || !/^(?:roles\/[A-Za-z0-9_.]+|projects\/[a-z][a-z0-9-]*\/roles\/[A-Za-z0-9_.]+|organizations\/[0-9]+\/roles\/[A-Za-z0-9_.]+)$/.test(value) || value.includes('_withcond_')) fail('Invalid or condition-truncated IAM role name')
}
function assertPolicy(policy) {
  if (!record(policy)) fail('Invalid IAM policy')
  if (policy.version !== undefined && policy.version !== 1 && policy.version !== 3) fail('Unsupported IAM policy version')
  if (policy.bindings !== undefined && !Array.isArray(policy.bindings)) fail('Invalid IAM policy bindings')
  for (const binding of policy.bindings || []) {
    if (!record(binding)) fail('Invalid IAM binding')
    roleName(binding.role)
    strings(binding.members, 'IAM binding members')
    if (binding.condition !== undefined && (!record(binding.condition) || typeof binding.condition.expression !== 'string' || !binding.condition.expression.trim())) fail('Invalid IAM condition')
  }
}
export function addBindings(policy, requirements) {
  assertPolicy(policy)
  if (!Array.isArray(requirements)) fail('Invalid required IAM bindings')
  const result = structuredClone(policy)
  let changed = false
  for (const required of requirements) {
    if (!record(required) || required.condition !== undefined) fail('Only unconditional required IAM bindings are supported')
    roleName(required.role)
    strings(required.members, 'required IAM members')
    if (!required.members.length) fail('A required IAM binding must have members')
    const members = [...new Set(required.members)]
    let binding = (result.bindings || []).find(item => item.role === required.role && item.condition === undefined)
    if (!binding) {
      result.bindings ||= []
      binding = { role: required.role, members: [] }
      result.bindings.push(binding)
    }
    for (const member of members) {
      if (!binding.members.includes(member)) {
        binding.members.push(member)
        changed = true
      }
    }
  }
  // Conditions must remain fully represented when the complete policy is written.
  if (changed && result.bindings.some(binding => binding.condition !== undefined)) result.version = 3
  if (changed && (typeof result.etag !== 'string' || !result.etag.trim())) fail('IAM update requires the current non-empty etag')
  return { changed, policy: result }
}
export function unexpectedRuntimeBindings(policy, allowedRoles) {
  assertPolicy(policy)
  strings(allowedRoles, 'allowed runtime roles')
  allowedRoles.forEach(roleName)
  return [...new Set((policy.bindings || []).filter(binding => binding.members.includes(MEMBER) && !allowedRoles.includes(binding.role)).map(binding => binding.role))].sort()
}
export function assertNoUserKeys(keysResponse) {
  // Google's empty repeated field may be omitted, so {} is a valid empty list.
  if (!record(keysResponse) || Object.keys(keysResponse).some(key => key !== 'keys') || (keysResponse.keys !== undefined && !Array.isArray(keysResponse.keys))) fail('Invalid service-account key inventory')
  for (const key of keysResponse.keys || []) {
    if (!record(key) || !['SYSTEM_MANAGED', 'USER_MANAGED'].includes(key.keyType)) fail('Invalid service-account key metadata')
    if (key.keyType === 'USER_MANAGED') fail('OTP service account has a user-managed key; keyless preparation cannot continue')
  }
  return keysResponse
}
export function awsPolicies(uniqueId, awsAccountId = '722769295504') {
  const subject = numericSubject(uniqueId)
  if (typeof awsAccountId !== 'string' || !/^[0-9]{12}$/.test(awsAccountId)) fail('Invalid AWS account ID')
  return {
    trust: {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { Federated: 'accounts.google.com' }, Action: 'sts:AssumeRoleWithWebIdentity', Condition: { StringEquals: {
        'accounts.google.com:aud': subject,
        'accounts.google.com:oaud': 'majstorsada-otp-ses',
        'accounts.google.com:sub': subject,
      } } }],
    },
    send: {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Action: 'ses:SendEmail', Resource: `arn:aws:ses:eu-central-1:${awsAccountId}:identity/majstorsada.rs`, Condition: { StringEquals: {
        'aws:RequestedRegion': 'eu-central-1',
        'ses:FromAddress': 'noreply@majstorsada.rs',
        'ses:FeedbackAddress': 'aleksa@majstorsada.rs',
      } } }],
    },
  }
}
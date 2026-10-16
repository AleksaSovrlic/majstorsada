import { isDeepStrictEqual } from 'node:util'
import { createRequire } from 'node:module'
import { PROJECT_ID, SA_EMAIL, awsPolicies } from './otp-cloud-policy.mjs'

export const AWS_ACCOUNT_ID = '722769295504'
export const AWS_ROLE_NAME = 'MajstorSadaOtpSender'
export const AWS_ROLE_ARN = `arn:aws:iam::${AWS_ACCOUNT_ID}:role/${AWS_ROLE_NAME}`
export const AWS_POLICY_NAME = 'MajstorSadaOtpSesSend'

const firebaseEnv = createRequire(import.meta.url)('firebase-tools/lib/functions/env')

function fail(message) { throw new Error(message) }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }

// This checks a reviewed snapshot, not live AWS state or actual STS authorization.
export function assertAwsRoleEvidence(evidence, googleSubject) {
  const expected = awsPolicies(googleSubject, AWS_ACCOUNT_ID)
  if (!record(evidence) || evidence.roleArn !== AWS_ROLE_ARN) fail('AWS role ARN differs from the reviewed account and role')
  if (!isDeepStrictEqual(evidence.trustPolicy, expected.trust)) fail('AWS trust policy differs from the approved Google identity and audience')
  if (!Array.isArray(evidence.attachedManagedPolicies) || evidence.attachedManagedPolicies.length !== 0) fail('AWS role has additional or unreadable managed policies')
  if (!Array.isArray(evidence.inlinePolicies) || evidence.inlinePolicies.length !== 1) fail('AWS role must have exactly one reviewed inline policy')
  const policy = evidence.inlinePolicies[0]
  if (!record(policy) || policy.name !== AWS_POLICY_NAME || !isDeepStrictEqual(policy.document, expected.send)) fail('AWS inline policy differs from the approved SES permission boundary')
  if (evidence.permissionsBoundary !== null) fail('AWS permissions boundary is missing from evidence or unexpected')
  if (evidence.maxSessionDuration !== 3600) fail('AWS maximum session duration differs from the reviewed one-hour setting')
  return {
    OTP_AWS_ROLE_ARN: AWS_ROLE_ARN,
    OTP_GOOGLE_SUBJECT: googleSubject,
    OTP_AWS_AUDIENCE: 'majstorsada-otp-ses',
    OTP_RUNTIME_SERVICE_ACCOUNT: SA_EMAIL,
    OTP_ENABLED: 'false',
    OTP_PUBLIC_ENABLED: 'false',
    OTP_TRUSTED_PROXY_HOPS: '0',
    OTP_DAILY_LIMIT: '500',
  }
}

const forbidden = new Set(['OTP_HMAC_SECRET', 'OTP_TURNSTILE_SECRET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'])
function assignments(text) {
  if (typeof text !== 'string' || text.includes('\0') || /\r(?!\n)/.test(text)) fail('Invalid local dotenv text')
  // Use the same pinned parser/key rules as deployment. Its errors contain raw
  // dotenv lines, so neither parseStrict() nor its error contents are exposed.
  let parsed
  try { parsed = firebaseEnv.parse(text) } catch { fail('Firebase dotenv parsing failed') }
  if (parsed.errors.length) fail('Local dotenv has syntax unsupported by Firebase')
  for (const [key, resolved] of Object.entries(parsed.envs)) {
    try { firebaseEnv.validateKey(key) } catch { fail('Local dotenv has a key unsupported by Firebase') }
    if (forbidden.has(key)) fail(`Secret or persistent AWS credential must not be in local parameters: ${key}`)
    // This append-only preparation intentionally does not interpret multiline
    // values: an embedded apparent OTP assignment must never satisfy a gate.
    if (resolved.includes('\n') || resolved.includes('\r')) fail('Multiline dotenv values require a separate review before OTP preparation')
  }
  const entries = new Map()
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trimStart()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s*)?([A-Z_][A-Z0-9_]*)\s*=/.exec(line)
    if (!match) fail('Local dotenv assignment cannot be safely scanned')
    const key = match[1]
    if (entries.has(key)) fail(`Duplicate dotenv parameter: ${key}`)
    if (!Object.hasOwn(parsed.envs, key)) fail('Local dotenv scanner and Firebase parser disagree')
    entries.set(key, parsed.envs[key])
  }
  if (entries.size !== Object.keys(parsed.envs).length) fail('Local dotenv scanner and Firebase parser disagree')
  return entries
}
export function assertClosedAwsConfiguration(text, evidence, googleSubject) {
  const expected = assertAwsRoleEvidence(evidence, googleSubject)
  const entries = assignments(text)
  for (const [key, required] of Object.entries(expected)) {
    if (!entries.has(key) || entries.get(key) !== required) fail(`Local OTP parameter is missing or differs from the approved closed configuration: ${key}`)
  }
  return expected
}
export function planLocalAwsConfiguration(text, evidence, googleSubject) {
  const expected = assertAwsRoleEvidence(evidence, googleSubject)
  const entries = assignments(text)
  const addedKeys = []
  for (const [key, required] of Object.entries(expected)) {
    if (!entries.has(key)) addedKeys.push(key)
    else if (entries.get(key) !== required) fail(`Existing OTP parameter conflicts with the approved configuration: ${key}`)
  }
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const prefix = text && !text.endsWith('\n') ? newline : ''
  const result = addedKeys.length ? text + prefix + addedKeys.map(key => `${key}=${expected[key]}${newline}`).join('') : text
  assertClosedAwsConfiguration(result, evidence, googleSubject)
  return { projectId: PROJECT_ID, text: result, addedKeys }
}
// Shared strict deployment parser; never returns raw parse errors.
export function readOtpParameters(text) { return assignments(text) }

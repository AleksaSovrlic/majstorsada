import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  AWS_ACCOUNT_ID, AWS_ROLE_NAME, AWS_ROLE_ARN, AWS_POLICY_NAME,
  assertAwsRoleEvidence, assertClosedAwsConfiguration, planLocalAwsConfiguration,
} from '../../tools/otp-aws-config.mjs'

const subject = '114954723264955273114'
const readJson = relative => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
const expected = {
  OTP_AWS_ROLE_ARN: 'arn:aws:iam::722769295504:role/MajstorSadaOtpSender',
  OTP_GOOGLE_SUBJECT: subject,
  OTP_AWS_AUDIENCE: 'majstorsada-otp-ses',
  OTP_RUNTIME_SERVICE_ACCOUNT: 'otp-runtime@majstorsada-b2ad4.iam.gserviceaccount.com',
  OTP_ENABLED: 'false',
  OTP_PUBLIC_ENABLED: 'false',
  OTP_TRUSTED_PROXY_HOPS: '0',
  OTP_DAILY_LIMIT: '500',
}
const evidence = () => ({
  roleArn: AWS_ROLE_ARN,
  trustPolicy: readJson('../../ops/otp-aws-trust.json'),
  attachedManagedPolicies: [],
  inlinePolicies: [{ name: AWS_POLICY_NAME, document: readJson('../../ops/otp-aws-send.json') }],
  permissionsBoundary: null,
  maxSessionDuration: 3600,
})
const config = (patch = {}, newline = '\n') => Object.entries({ ...expected, ...patch }).map(([key, value]) => `${key}=${value}${newline}`).join('')
const changeEvidence = mutate => { const current = evidence(); mutate(current); return current }
const plan = text => planLocalAwsConfiguration(text, evidence(), subject)

// Reviewed console snapshots are evidence of the exact configured policies; these
// tests do not claim to perform live AWS authorization or Google token exchanges.
test('Reviewed AWS role inventory yields exactly eight closed non-secret parameters', () => {
  assert.equal(AWS_ACCOUNT_ID, '722769295504')
  assert.equal(AWS_ROLE_NAME, 'MajstorSadaOtpSender')
  assert.equal(AWS_POLICY_NAME, 'MajstorSadaOtpSesSend')
  assert.deepEqual(assertAwsRoleEvidence(evidence(), subject), expected)
})

test('Trust policy property order shown in the console does not affect exact policy comparison', () => {
  const current = evidence()
  current.trustPolicy.Statement[0].Condition.StringEquals = {
    'accounts.google.com:sub': subject,
    'accounts.google.com:oaud': 'majstorsada-otp-ses',
    'accounts.google.com:aud': subject,
  }
  assert.deepEqual(assertAwsRoleEvidence(current, subject), expected)
})

test('Foreign accounts, roles, ARN partitions and incomplete role evidence fail closed', () => {
  for (const roleArn of [undefined, '', 'arn:aws:iam::123456789012:role/MajstorSadaOtpSender', 'arn:aws:iam::722769295504:role/OtherSender', 'arn:aws:iam::722769295504:role/path/MajstorSadaOtpSender', 'arn:aws-us-gov:iam::722769295504:role/MajstorSadaOtpSender']) {
    assert.throws(() => assertAwsRoleEvidence({ ...evidence(), roleArn }, subject), /role ARN/)
  }
  for (const current of [null, [], {}, { roleArn: AWS_ROLE_ARN }]) assert.throws(() => assertAwsRoleEvidence(current, subject))
})

test('Google subject and audience must remain bound to the dedicated runtime identity', () => {
  for (const key of ['accounts.google.com:sub', 'accounts.google.com:aud', 'accounts.google.com:oaud']) {
    for (const value of [undefined, '*', 'other-audience', '123456789012345678901']) {
      const current = changeEvidence(item => {
        if (value === undefined) delete item.trustPolicy.Statement[0].Condition.StringEquals[key]
        else item.trustPolicy.Statement[0].Condition.StringEquals[key] = value
      })
      assert.throws(() => assertAwsRoleEvidence(current, subject), /trust policy/)
    }
  }
  assert.throws(() => assertAwsRoleEvidence(evidence(), '123456789012345678901'), /trust policy/)
  for (const value of [Number(subject), '', '*', '0', '123', `${subject}\n`]) assert.throws(() => assertAwsRoleEvidence(evidence(), value))
})

test('Unreviewed principals, trust actions and condition operators are rejected', () => {
  for (const mutate of [
    item => { item.trustPolicy.Statement[0].Principal = { AWS: '*' } },
    item => { item.trustPolicy.Statement[0].Principal.Federated = '*' },
    item => { item.trustPolicy.Statement[0].Action = 'sts:AssumeRole' },
    item => { item.trustPolicy.Statement[0].Action = ['sts:AssumeRoleWithWebIdentity', 'sts:AssumeRole'] },
    item => { item.trustPolicy.Statement[0].Condition = { StringLike: item.trustPolicy.Statement[0].Condition.StringEquals } },
    item => { item.trustPolicy.Statement.push(structuredClone(item.trustPolicy.Statement[0])) },
    item => { item.trustPolicy.Statement[0].Effect = 'Deny' },
  ]) assert.throws(() => assertAwsRoleEvidence(changeEvidence(mutate), subject), /trust policy/)
})

test('Additional or unreadable managed-policy inventory cannot be accepted', () => {
  for (const attachedManagedPolicies of [undefined, null, {}, ['arn:aws:iam::aws:policy/AmazonSESFullAccess'], [{ PolicyName: 'AdministratorAccess' }]]) {
    assert.throws(() => assertAwsRoleEvidence({ ...evidence(), attachedManagedPolicies }, subject), /managed policies/)
  }
})

test('Exactly one complete inline policy with the reviewed name is required', () => {
  for (const inlinePolicies of [undefined, null, {}, [], [null], [{}], [evidence().inlinePolicies[0], evidence().inlinePolicies[0]], [{ ...evidence().inlinePolicies[0], name: 'OtherSesPolicy' }], [{ name: AWS_POLICY_NAME }]]) {
    assert.throws(() => assertAwsRoleEvidence({ ...evidence(), inlinePolicies }, subject), /inline policy/)
  }
})

test('SES sending cannot gain wildcard, raw, bulk or additional permissions', () => {
  for (const mutate of [
    item => { item.inlinePolicies[0].document.Statement[0].Action = 'ses:*' },
    item => { item.inlinePolicies[0].document.Statement[0].Action = 'ses:SendRawEmail' },
    item => { item.inlinePolicies[0].document.Statement[0].Action = 'ses:SendBulkEmail' },
    item => { item.inlinePolicies[0].document.Statement[0].Action = ['ses:SendEmail', 'ses:SendRawEmail'] },
    item => { item.inlinePolicies[0].document.Statement.push({ Effect: 'Allow', Action: '*', Resource: '*' }) },
  ]) assert.throws(() => assertAwsRoleEvidence(changeEvidence(mutate), subject), /inline policy/)
})

test('SES identity resource must be the exact reviewed domain, account and region', () => {
  for (const Resource of ['*', 'arn:aws:ses:eu-central-1:722769295504:identity/*', 'arn:aws:ses:eu-central-1:123456789012:identity/majstorsada.rs', 'arn:aws:ses:us-east-1:722769295504:identity/majstorsada.rs', 'arn:aws:ses:eu-central-1:722769295504:identity/other.rs']) {
    const current = changeEvidence(item => { item.inlinePolicies[0].document.Statement[0].Resource = Resource })
    assert.throws(() => assertAwsRoleEvidence(current, subject), /inline policy/)
  }
})

test('SES sender, feedback mailbox and requested region conditions cannot be dropped or widened', () => {
  for (const key of ['aws:RequestedRegion', 'ses:FromAddress', 'ses:FeedbackAddress']) {
    for (const value of [undefined, '*', 'other@example.com']) {
      const current = changeEvidence(item => {
        const conditions = item.inlinePolicies[0].document.Statement[0].Condition.StringEquals
        if (value === undefined) delete conditions[key]
        else conditions[key] = value
      })
      assert.throws(() => assertAwsRoleEvidence(current, subject), /inline policy/)
    }
  }
})

test('Permissions-boundary evidence must explicitly show no unexpected boundary', () => {
  for (const permissionsBoundary of [undefined, '', false, {}, { PermissionsBoundaryArn: 'arn:aws:iam::722769295504:policy/OtherBoundary' }]) {
    assert.throws(() => assertAwsRoleEvidence({ ...evidence(), permissionsBoundary }, subject), /permissions boundary/)
  }
})

test('Session duration must match the reviewed one-hour role setting', () => {
  for (const maxSessionDuration of [undefined, null, '3600', 900, 7200, 43200]) {
    assert.throws(() => assertAwsRoleEvidence({ ...evidence(), maxSessionDuration }, subject), /session duration/)
  }
})

test('Appending the missing configuration preserves all existing application bytes as a prefix', () => {
  const original = '# Existing application configuration\nPUBLIC_WRITES_ENABLED=true\nJOB_IMAGES_BUCKET=existing-bucket\nJOB_MAINTENANCE_ENABLED=true\nURL="https://example.test/a#b?c=d"\nUNRELATED=\'a=b # quoted\'\n'
  const result = plan(original)
  assert.equal(result.projectId, 'majstorsada-b2ad4')
  assert.equal(result.text.slice(0, original.length), original)
  assert.deepEqual(result.addedKeys, Object.keys(expected))
  assert.deepEqual(assertClosedAwsConfiguration(result.text, evidence(), subject), expected)
})

test('BOM, CRLF, comments, quoted unrelated values and absent final newline are retained', () => {
  const original = '\uFEFF# Windows dotenv\r\n  PUBLIC_WRITES_ENABLED = true # keep spacing\r\nUNRELATED="quoted # content and = values"\r\nFINAL=\'last line\''
  const result = plan(original)
  assert.equal(result.text.slice(0, original.length), original)
  assert.ok(result.text.startsWith(original + '\r\nOTP_AWS_ROLE_ARN='))
  assert.ok(!/(?<!\r)\n/.test(result.text))
  assert.ok(result.text.endsWith('\r\n'))
})

test('Empty files and files without a final newline append complete assignments', () => {
  assert.equal(plan('').text, config())
  const original = 'PUBLIC_WRITES_ENABLED=true'
  const result = plan(original)
  assert.equal(result.text, original + '\n' + config())
})

test('Complete matching configuration is byte-for-byte idempotent', () => {
  for (const original of [config(), config({}, '\r\n'), '\uFEFF# Preserve BOM\r\n' + config({}, '\r\n'), config().trimEnd()]) {
    const result = plan(original)
    assert.equal(result.text, original)
    assert.deepEqual(result.addedKeys, [])
    const again = plan(result.text)
    assert.deepEqual(again, result)
  }
})

test('Partial matching configuration adds only absent keys while preserving existing formatting', () => {
  const original = '# Existing OTP preparation\n export OTP_ENABLED = "false" # Closed\nOTP_DAILY_LIMIT = 500 # Budget\nOTP_AWS_AUDIENCE=\'majstorsada-otp-ses\'\n'
  const result = plan(original)
  assert.ok(result.text.startsWith(original))
  assert.deepEqual(result.addedKeys, Object.keys(expected).filter(key => !['OTP_ENABLED', 'OTP_DAILY_LIMIT', 'OTP_AWS_AUDIENCE'].includes(key)))
  assert.deepEqual(assertClosedAwsConfiguration(result.text, evidence(), subject), expected)
  assert.equal(plan(result.text).text, result.text)
})

test('Compatible quoted values and comments are accepted without normalization', () => {
  const original = Object.entries(expected).map(([key, value], index) => `${key} = ${index % 2 ? `"${value}"` : `'${value}'`} # owner configuration`).join('\n')
  assert.deepEqual(assertClosedAwsConfiguration(original, evidence(), subject), expected)
  assert.equal(plan(original).text, original)
})

test('Enabled OTP gates, changed identity, proxy setting or daily cap fail instead of being overwritten', () => {
  const conflicts = {
    OTP_AWS_ROLE_ARN: 'arn:aws:iam::722769295504:role/OtherRole',
    OTP_GOOGLE_SUBJECT: '123456789012345678901',
    OTP_AWS_AUDIENCE: 'another-audience',
    OTP_RUNTIME_SERVICE_ACCOUNT: 'other@majstorsada-b2ad4.iam.gserviceaccount.com',
    OTP_ENABLED: 'true',
    OTP_PUBLIC_ENABLED: 'true',
    OTP_TRUSTED_PROXY_HOPS: '1',
    OTP_DAILY_LIMIT: '501',
  }
  for (const [key, value] of Object.entries(conflicts)) {
    assert.throws(() => plan(config({ [key]: value })), error => error.message.includes(key) && /conflicts/.test(error.message))
    assert.throws(() => assertClosedAwsConfiguration(config({ [key]: value }), evidence(), subject), /differs/)
  }
})

test('Closed configuration verification cannot accept a partial set of parameters', () => {
  for (const omitted of Object.keys(expected)) {
    const original = Object.entries(expected).filter(([key]) => key !== omitted).map(([key, value]) => `${key}=${value}\n`).join('')
    assert.throws(() => assertClosedAwsConfiguration(original, evidence(), subject), error => error.message.includes(omitted))
  }
})

test('Duplicate assignments are rejected across standard and Firebase export syntax', () => {
  for (const duplicate of ['OTP_ENABLED=false\nOTP_ENABLED=false\n', 'OTP_ENABLED=false\n export OTP_ENABLED = "false"\n', 'export OTP_ENABLED=false\nOTP_ENABLED=false\n', 'exportOTP_ENABLED=false\nOTP_ENABLED=false\n', 'PUBLIC_WRITES_ENABLED=true\nPUBLIC_WRITES_ENABLED=true\n']) {
    assert.throws(() => plan(duplicate), /Duplicate dotenv parameter/)
  }
})

test('Plaintext OTP secrets and persistent AWS credentials are rejected without exposing their values', () => {
  const secret = 'sensitive-fixture-value-never-include-in-errors'
  for (const key of ['OTP_HMAC_SECRET', 'OTP_TURNSTILE_SECRET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) {
    for (const assignment of [`${key}=${secret}`, `export ${key}="${secret}"`, `${key}: ${secret}`]) {
      assert.throws(() => plan(assignment), error => (/Secret or persistent AWS credential/.test(error.message) && error.message.includes(key) || /unsupported by Firebase/.test(error.message)) && !error.message.includes(secret))
      assert.throws(() => assertClosedAwsConfiguration(config() + assignment, evidence(), subject), error => !error.message.includes(secret))
    }
  }
})

test('Commented secret names remain harmless preserved comments', () => {
  const original = '# OTP_HMAC_SECRET is stored in Secret Manager\n  # AWS_SECRET_ACCESS_KEY is not used\n'
  assert.ok(plan(original).text.startsWith(original))
})

test('Malformed OTP or AWS assignments and unsupported value formats cannot be silently repaired', () => {
  for (const original of ['OTP_ENABLED false', 'export OTP_ENABLED false', 'OTP_ENABLED:false', 'OTP_ENABLED', 'AWS_SECRET_ACCESS_KEY secret-value', 'OTP_ENABLED="false', 'OTP_ENABLED=false extra-value', 'OTP_ENABLED=${ANOTHER_VALUE}', 'OTP_ENABLED=`false`']) {
    assert.throws(() => plan(original), /Malformed|unsupported|conflicts/i)
  }
})

test('Invalid dotenv input such as NUL, lone CR or non-text is rejected before appending', () => {
  for (const original of [null, undefined, {}, [], Buffer.from('x'), 'PUBLIC_WRITES_ENABLED=true\0', 'PUBLIC_WRITES_ENABLED=true\rNEXT=value']) {
    assert.throws(() => plan(original), /Invalid local dotenv text/)
  }
})

test('Unreviewed evidence blocks planning and verification even when local values already match', () => {
  const wrong = changeEvidence(item => { item.inlinePolicies[0].document.Statement[0].Resource = '*' })
  assert.throws(() => planLocalAwsConfiguration('', wrong, subject), /inline policy/)
  assert.throws(() => assertClosedAwsConfiguration(config(), wrong, subject), /inline policy/)
})

test('Colon syntax, invalid keys, reserved keys and malformed unrelated lines cannot reach deployment', () => {
  for (const original of ['OTP_ENABLED: false', 'lowercase=value', 'INVALID.KEY=value', 'INVALID/KEY=value', 'PORT=8080', 'FIREBASE_CONFIG={}', 'X_GOOGLE_ENV=anything', 'UNRELATED_NO_EQUALS', 'PUBLIC_WRITES_ENABLED=true\nnot-an-assignment']) {
    assert.throws(() => plan(original), /unsupported|cannot be safely scanned/i)
  }
})

test('Apparent OTP gates embedded in multiline or escaped-newline quoted values cannot satisfy configuration', () => {
  for (const original of [
    'UNRELATED="start\nOTP_ENABLED=false\nOTP_PUBLIC_ENABLED=false\nend"\n',
    'UNRELATED="start\\nOTP_ENABLED=false"\n',
    config() + 'UNRELATED="first\nOTP_ENABLED=true\nlast"\n',
    'UNRELATED="first\\rnext"\n',
  ]) assert.throws(() => plan(original), /Multiline/)
})

test('Quoted escape decoding follows the deployment parser rather than raw value comparison', () => {
  const original = config() + 'UNRELATED="quote: \\"text\\" and # content"\n'
  const result = plan(original)
  assert.equal(result.text, original)
  assert.deepEqual(result.addedKeys, [])
  assert.throws(() => plan(config({ OTP_ENABLED: '"false\\t"' })), /conflicts/)
})

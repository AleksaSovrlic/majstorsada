import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { createGoogleAwsCredentials, createSesOtpSender, otpEmailContent, OtpDeliveryError } = require('./lib/otpTransport.js')
const subject = '123456789012345678901'
const audience = 'majstorsada-otp-ses'
const roleArn = 'arn:aws:iam::123456789012:role/majstorsada-otp'
const jwt = claims => 'header.' + Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: audience, sub: subject, azp: subject, exp: 3600, ...claims })).toString('base64url') + '.signature'
const reply = token => new Response(token, { headers: { 'Metadata-Flavor': 'Google' } })
const credentialValues = expiration => ({ Credentials: { AccessKeyId: 'temporary-key', SecretAccessKey: 'temporary-secret', SessionToken: 'temporary-session', Expiration: new Date(expiration) } })
const credentials = async () => ({ accessKeyId: 'temporary-key', secretAccessKey: 'temporary-secret', sessionToken: 'temporary-session', expiration: new Date(Date.now() + 900000) })

test('Federation is bound to subject/audience and concurrent callers share one expiring refresh', async () => {
  let metadataCalls = 0, stsCalls = 0, time = 0
  const provider = createGoogleAwsCredentials({ roleArn, audience, googleSubject: subject, now: () => time,
    metadataFetch: async (url, options) => { metadataCalls++; assert.ok(url.includes('audience=majstorsada-otp-ses')); assert.equal(options.headers['Metadata-Flavor'], 'Google'); return reply(jwt()) },
    assumeRole: async input => { stsCalls++; assert.equal(input.RoleArn, roleArn); assert.equal(input.DurationSeconds, 900); assert.ok(input.WebIdentityToken); return credentialValues(time + 900000) } })
  const values = await Promise.all(Array.from({ length: 20 }, () => provider()))
  assert.equal(metadataCalls, 1); assert.equal(stsCalls, 1); assert.ok(values.every(value => value === values[0]))
  await provider(); assert.equal(stsCalls, 1)
  time = 800000
  await Promise.all([provider(), provider()]); assert.equal(stsCalls, 2)
})
test('Metadata fail/mismatched JWT never calls STS; failed refresh is retryable without caching failure', async () => {
  for (const claims of [{ sub: 'wrong' }, { aud: 'other-app' }, { azp: 'other-client' }, { exp: 1 }, { iss: 'https://attacker.test' }]) {
    let calls = 0
    const provider = createGoogleAwsCredentials({ roleArn, audience, googleSubject: subject, now: () => 100000,
      metadataFetch: async () => reply(jwt(claims)), assumeRole: async () => { calls++; return credentialValues(1000000) } })
    await assert.rejects(provider, error => error.definitive === true); assert.equal(calls, 0)
  }
  let requests = 0
  const provider = createGoogleAwsCredentials({ roleArn, audience, googleSubject: subject, now: () => 0,
    metadataFetch: async () => { if (++requests === 1) throw new Error('network secret not propagated'); return reply(jwt()) }, assumeRole: async () => credentialValues(900000) })
  await assert.rejects(provider, error => error.definitive === true && !error.message.includes('secret'))
  assert.equal((await provider()).accessKeyId, 'temporary-key')
})
test('SES sends one recipient with fixed sender/feedback and both readable email formats', async () => {
  let calls = 0
  const send = createSesOtpSender({ roleArn, audience, googleSubject: subject, credentials,
    send: async (input, options) => {
      calls++; assert.deepEqual(input.Destination, { ToAddresses: ['user@example.com'] })
      assert.equal(input.FromEmailAddress, 'MajstorSada <noreply@majstorsada.rs>'); assert.equal(input.FeedbackForwardingEmailAddress, 'aleksa@majstorsada.rs')
      assert.equal(input.ReplyToAddresses, undefined); assert.ok(options.abortSignal instanceof AbortSignal)
      const simple = input.Content.Simple
      assert.ok(!simple.Subject.Data.includes('012345')); assert.ok(simple.Body.Text.Data.includes('012345')); assert.ok(simple.Body.Html.Data.includes('012345'))
      assert.ok(!simple.Body.Html.Data.includes('<img')); return { MessageId: 'accepted-message' }
    } })
  assert.deepEqual(await send('user@example.com', '012345'), { messageId: 'accepted-message' }); assert.equal(calls, 1)
})
test('SES transport never retries ambiguous failure and only known explicit rejections are definitive', async () => {
  for (const failure of [{ name: 'TimeoutError' }, { name: 'InternalServerError', $metadata: { httpStatusCode: 500 } }, { name: 'MessageRejected', $metadata: { httpStatusCode: 400 } }, { name: 'TooManyRequestsException', $metadata: { httpStatusCode: 429 } }]) {
    let calls = 0
    const send = createSesOtpSender({ roleArn, audience, googleSubject: subject, credentials, send: async () => { calls++; throw failure } })
    await assert.rejects(() => send('user@example.com', '012345'), error => error.definitive === [400, 429].includes(failure.$metadata?.httpStatusCode))
    assert.equal(calls, 1)
  }
})
test('Preflight validation and federation failures cause zero SES calls', async () => {
  let calls = 0
  const send = createSesOtpSender({ roleArn, audience, googleSubject: subject, credentials: async () => { throw new Error('private token') }, send: async () => { calls++; return {} } })
  await assert.rejects(() => send('user@example.com', '012345'), error => error.definitive === true && !error.message.includes('private'))
  await assert.rejects(() => send('user@example.com', 'ABCDEF'), error => error.definitive === true)
  await assert.rejects(() => send('bad\nemail@example.com', '012345'), error => error.definitive === true)
  assert.equal(calls, 0); assert.throws(() => otpEmailContent('<script>'), error => error.definitive === true)
  assert.throws(() => createSesOtpSender({ roleArn, audience, googleSubject: subject, region: 'us-east-1', credentials }))
})

test('SES dispatch deadline is checked again after slow credential refresh and aborts before sending', async () => {
  let time = 0, calls = 0
  const send = createSesOtpSender({ roleArn, audience, googleSubject: subject, now: () => time,
    credentials: async () => { time = 61000; return credentials() }, send: async () => { calls++; return { MessageId: 'unexpected' } } })
  await assert.rejects(() => send('user@example.com', '012345', 60000), error => error.definitive === true)
  assert.equal(calls, 0)
})

test('The production SES SDK client is configured for exactly one SDK attempt and Frankfurt', async () => {
  const { SESv2Client } = require('@aws-sdk/client-sesv2')
  const original = SESv2Client.prototype.send
  let calls = 0
  SESv2Client.prototype.send = async function(command, options) {
    calls++; assert.equal(await this.config.maxAttempts(), 1); assert.equal(await this.config.region(), 'eu-central-1')
    assert.equal(command.input.Destination.ToAddresses.length, 1); assert.ok(options.abortSignal instanceof AbortSignal)
    return { MessageId: 'sdk-mock-message' }
  }
  try {
    const send = createSesOtpSender({ roleArn, audience, googleSubject: subject, credentials })
    assert.deepEqual(await send('user@example.com', '012345'), { messageId: 'sdk-mock-message' }); assert.equal(calls, 1)
  } finally { SESv2Client.prototype.send = original }
})

test('The production STS client also uses one SDK attempt and a 15-minute scoped session', async () => {
  const { STSClient } = require('@aws-sdk/client-sts')
  const original = STSClient.prototype.send
  let calls = 0
  STSClient.prototype.send = async function(command) {
    calls++; assert.equal(await this.config.maxAttempts(), 1); assert.equal(await this.config.region(), 'eu-central-1')
    assert.equal(command.input.RoleArn, roleArn); assert.equal(command.input.DurationSeconds, 900)
    return credentialValues(900000)
  }
  try {
    const provider = createGoogleAwsCredentials({ roleArn, audience, googleSubject: subject, now: () => 0, metadataFetch: async () => reply(jwt()) })
    assert.equal((await provider()).sessionToken, 'temporary-session'); assert.equal(calls, 1)
  } finally { STSClient.prototype.send = original }
})


test('Metadata and federation failures keep distinct fixed stages through SES preflight without provider detail', async () => {
  const privateDetail = 'user@example.com 012345 private-jwt private-credentials'
  for (const stage of ['metadata', 'federation']) {
    let sesCalls = 0, stsCalls = 0
    const provider = createGoogleAwsCredentials({ roleArn, audience, googleSubject: subject, now: () => 0,
      metadataFetch: async () => {
        if (stage === 'metadata') throw Object.assign(new Error(privateDetail), { stage: 'ses', category: privateDetail })
        return reply(jwt())
      }, assumeRole: async () => {
        stsCalls++
        throw Object.assign(new Error(privateDetail), { name: 'AccessDenied', stage: 'metadata', category: privateDetail })
      } })
    const send = createSesOtpSender({ roleArn, audience, googleSubject: subject, credentials: provider,
      send: async () => { sesCalls++; return { MessageId: 'must-not-send' } } })
    await assert.rejects(() => send('user@example.com', '012345'), error => {
      assert.ok(error instanceof OtpDeliveryError)
      assert.equal(error.message, 'OTP email transport failed')
      assert.equal(error.definitive, true)
      assert.equal(error.stage, stage)
      assert.equal(error.category, 'explicit-rejection')
      assert.equal(error.cause, undefined)
      assert.ok(!JSON.stringify(error).includes('private-'))
      assert.ok(!JSON.stringify(error).includes('012345'))
      return true
    })
    assert.equal(stsCalls, stage === 'federation' ? 1 : 0)
    assert.equal(sesCalls, 0)
  }
})

test('SES rejection, ambiguity and missing acceptance retain safe categories without copying external stage fields', async () => {
  for (const outcome of ['rejected', 'ambiguous', 'missing-message']) {
    let sends = 0
    const send = createSesOtpSender({ roleArn, audience, googleSubject: subject, credentials,
      send: async () => {
        sends++
        if (outcome === 'missing-message') return {}
        throw Object.assign(new Error('012345 private-jwt user@example.com'), {
          name: outcome === 'rejected' ? 'AccessDeniedException' : 'TimeoutError',
          $metadata: { httpStatusCode: outcome === 'rejected' ? 403 : 500 },
          stage: 'metadata', category: 'private-provider-category',
        })
      } })
    await assert.rejects(() => send('user@example.com', '012345'), error => {
      assert.ok(error instanceof OtpDeliveryError)
      assert.equal(error.stage, 'ses')
      assert.equal(error.definitive, outcome === 'rejected')
      assert.equal(error.category, outcome === 'rejected' ? 'explicit-rejection' : 'ambiguous')
      assert.equal(error.message, 'OTP email transport failed')
      assert.ok(!JSON.stringify(error).includes('private-'))
      return true
    })
    assert.equal(sends, 1)
  }
})

test('Invalid transport input and expired dispatch are configuration failures before AWS sending', async () => {
  let sends = 0
  const send = createSesOtpSender({ roleArn, audience, googleSubject: subject, credentials, now: () => 100,
    send: async () => { sends++; return { MessageId: 'must-not-send' } } })
  for (const input of [['bad\nemail@example.com', '012345', undefined], ['user@example.com', 'ABCDEF', undefined], ['user@example.com', '012345', 99]]) {
    await assert.rejects(() => send(...input), error => error instanceof OtpDeliveryError
      && error.definitive === true && error.stage === 'configuration' && error.category === 'explicit-rejection')
  }
  assert.equal(sends, 0)
})

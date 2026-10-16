import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGoogleApi, GoogleApiError } from '../../tools/otp-google-api.mjs';

const token = 'test-oauth-secret-never-log';
const objectResponse = (data = {}, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
function assertSanitized(error, status, code) {
  assert.ok(error instanceof GoogleApiError);
  assert.equal(error.status, status);
  assert.equal(error.code, code);
  assert.equal(error.cause, undefined);
  const exposed = error.stack + JSON.stringify(error);
  for (const privateValue of [token, 'private-google-details', 'private-fetch-details']) {
    assert.ok(!exposed.includes(privateValue), 'An API error must not expose private data');
  }
  return true;
}

test('Google API requests use the fixed service origin and authenticated bounded JSON transport', async () => {
  const origins = {
    iam: 'https://iam.googleapis.com', projects: 'https://cloudresourcemanager.googleapis.com',
    services: 'https://serviceusage.googleapis.com', firebase: 'https://firebase.googleapis.com',
    functions: 'https://cloudfunctions.googleapis.com',
    secretmanager: 'https://secretmanager.googleapis.com',
  };
  let tokenCalls = 0, requestCalls = 0;
  const request = createGoogleApi({ getToken: async () => { tokenCalls++; return token; },
    fetchImpl: async (url, options) => {
      requestCalls++;
      assert.equal(new URL(url).protocol, 'https:');
      assert.ok(Object.values(origins).includes(new URL(url).origin));
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      assert.deepEqual(options.headers, { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
      return objectResponse({ accepted: true });
    } });
  for (const [service, origin] of Object.entries(origins)) {
    const getPath = service === 'secretmanager' ? '/v1/projects/majstorsada-b2ad4/secrets/OTP_HMAC_SECRET' : '/v1/projects/example';
    const postPath = service === 'secretmanager' ? getPath + ':setIamPolicy' : '/v1/projects/example';
    assert.deepEqual(await request(service, 'GET', getPath), { accepted: true });
    // Inspect the actual full URL rather than trusting service labels alone.
    const check = createGoogleApi({ getToken: async () => token, fetchImpl: async (url, options) => {
      assert.equal(url, origin + postPath);
      assert.equal(options.method, 'POST');
      assert.equal(options.body, JSON.stringify({ policy: { etag: 'checked', bindings: [] } }));
      return objectResponse();
    } });
    await check(service, 'POST', postPath, { policy: { etag: 'checked', bindings: [] } });
  }
  assert.equal(tokenCalls, 6); assert.equal(requestCalls, 6);
});

test('GET requests omit a body and each operation obtains its own token', async () => {
  let tokenCalls = 0, requestCalls = 0;
  const request = createGoogleApi({ getToken: async () => 'token-' + (++tokenCalls),
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, 'GET');
      assert.equal(Object.hasOwn(options, 'body'), false);
      assert.equal(options.headers.Authorization, 'Bearer token-' + (++requestCalls));
      return objectResponse();
    } });
  await request('iam', 'GET', '/v1/projects/example/serviceAccounts/test@example.iam.gserviceaccount.com');
  await request('iam', 'GET', '/v1/projects/example/roles/OtpAuth');
  assert.equal(tokenCalls, 2); assert.equal(requestCalls, 2);
});

test('Unapproved services, methods, URLs and literal path traversal are rejected before requesting credentials', async () => {
  let tokenCalls = 0, requestCalls = 0;
  const request = createGoogleApi({ getToken: async () => { tokenCalls++; return token; },
    fetchImpl: async () => { requestCalls++; return objectResponse(); } });
  const invalid = [
    ['secrets', 'GET', '/v1/projects/example'], ['__proto__', 'GET', '/v1/projects/example'],
    ['toString', 'GET', '/v1/projects/example'], ['iam', 'DELETE', '/v1/projects/example'],
    ['iam', 'PUT', '/v1/projects/example'], ['iam', 'get', '/v1/projects/example'],
    ['iam', 'GET', '/v3/projects/example'], ['iam', 'GET', 'https://attacker.example/v1/projects/example'],
    ['iam', 'GET', '//attacker.example/v1/projects/example'], ['iam', 'GET', '/v1/projects/../outside'],
    ['iam', 'GET', '/v1/projects/example#fragment'], ['iam', 'GET', '/v1/projects/https://attacker.example'],
    ['iam', 'GET', '/v1/projects\\outside'],
  ];
  for (const args of invalid) await assert.rejects(() => request(...args), /Unapproved Google API request/);
  assert.equal(tokenCalls, 0); assert.equal(requestCalls, 0);
});

test('Encoded dot-segment traversal is rejected before credentials or network activity', async () => {
  let tokenCalls = 0, requestCalls = 0;
  const request = createGoogleApi({ getToken: async () => { tokenCalls++; return token; },
    fetchImpl: async () => { requestCalls++; return objectResponse(); } });
  for (const path of ['/v1/projects/%2e%2e/outside', '/v1/projects/.%2E/outside', '/v1/projects/%2E./outside']) {
    await assert.rejects(() => request('iam', 'GET', path), /Unapproved Google API request/);
  }
  assert.equal(tokenCalls, 0); assert.equal(requestCalls, 0);
});

test('403 errors preserve a safe API status while discarding Google raw details and OAuth credentials', async () => {
  const request = createGoogleApi({ getToken: async () => token, fetchImpl: async () => objectResponse({
    error: { status: 'PERMISSION_DENIED', message: 'private-google-details ' + token,
      details: [{ debugInfo: 'private-google-details' }] },
  }, 403) });
  await assert.rejects(() => request('projects', 'POST', '/v1/projects/example:setIamPolicy?private-google-details',
    { policy: { etag: 'private-google-details' } }), error => {
    assertSanitized(error, 403, 'PERMISSION_DENIED');
    assert.equal(error.message, 'Google projects request failed (403; PERMISSION_DENIED) at /v1/projects/example:setIamPolicy');
    return true;
  });
});

test('404 remains distinguishable from 403 and unsafe API status strings are not exposed', async () => {
  for (const [status, responseStatus, expectedCode] of [[404, 'NOT_FOUND', 'NOT_FOUND'],
    [403, token + ' private-google-details', 'HTTP_ERROR'], [500, { detail: token }, 'HTTP_ERROR']]) {
    const request = createGoogleApi({ getToken: async () => token,
      fetchImpl: async () => objectResponse({ error: { status: responseStatus, message: token } }, status) });
    await assert.rejects(() => request('iam', 'GET', '/v1/projects/example/roles/OtpAuth'),
      error => assertSanitized(error, status, expectedCode));
  }
});

test('Ambiguous POST network failure is attempted once and loses the original error', async () => {
  let requestCalls = 0;
  const request = createGoogleApi({ getToken: async () => token, fetchImpl: async () => {
    requestCalls++; throw new Error('private-fetch-details ' + token);
  } });
  await assert.rejects(() => request('projects', 'POST', '/v1/projects/example:setIamPolicy', { policy: {} }),
    error => assertSanitized(error, 0, 'OUTCOME_UNKNOWN_REPLAN'));
  assert.equal(requestCalls, 1);
});

test('A POST timeout is bounded to 20 seconds, attempted once and instructs the caller to replan', async t => {
  let requestCalls = 0, timeoutCalls = 0;
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    timeoutCalls++; assert.equal(milliseconds, 20_000);
    return originalTimeout(1);
  });
  const request = createGoogleApi({ getToken: async () => token, fetchImpl: async (_url, options) => {
    requestCalls++; assert.ok(options.signal instanceof AbortSignal);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        assert.equal(options.signal.reason.name, 'TimeoutError');
        reject(new DOMException('private-fetch-details ' + token, 'TimeoutError'));
      }, { once: true });
    });
  } });
  // Native timeout signals are unref'd; keep the event loop alive for this mock.
  const keepAlive = setTimeout(() => {}, 1_000);
  try {
    await assert.rejects(() => request('services', 'POST', '/v1/projects/123/services/iamcredentials.googleapis.com:enable', {}),
      error => assertSanitized(error, 0, 'OUTCOME_UNKNOWN_REPLAN'));
    assert.equal(requestCalls, 1); assert.equal(timeoutCalls, 1);
  } finally { clearTimeout(keepAlive); }
});

test('Invalid JSON is rejected on both successful and failed responses without exposing response text', async () => {
  for (const status of [200, 403]) {
    const request = createGoogleApi({ getToken: async () => token,
      fetchImpl: async () => new Response('private-google-details ' + token, { status }) });
    await assert.rejects(() => request('iam', 'GET', '/v1/projects/example/roles/OtpAuth'),
      error => assertSanitized(error, status, 'INVALID_JSON_REPLAN'));
  }
});

test('Only JSON objects are accepted as successful Google API responses', async () => {
  for (const data of [null, [], 'private-google-details', 42, false]) {
    const request = createGoogleApi({ getToken: async () => token, fetchImpl: async () => objectResponse(data) });
    await assert.rejects(() => request('iam', 'GET', '/v1/projects/example/roles/OtpAuth'),
      error => assertSanitized(error, 200, 'INVALID_RESPONSE'));
  }
  const request = createGoogleApi({ getToken: async () => token, fetchImpl: async () => objectResponse({}) });
  assert.deepEqual(await request('iam', 'GET', '/v1/projects/example/roles/OtpAuth'), {});
});

test('Invalid OAuth token values fail closed before fetch without exposing credentials', async () => {
  for (const invalid of [undefined, null, {}, [], '', ' ', 'token with-space', 'token\u0000private-google-details', 'token\u007fprivate-google-details', 'token\r\nprivate-google-details', 'a'.repeat(16_385)]) {
    let requests = 0;
    const request = createGoogleApi({ getToken: async () => invalid, fetchImpl: async () => {
      requests++; return objectResponse();
    } });
    await assert.rejects(() => request('iam', 'GET', '/v1/projects/example/roles/OtpAuth'),
      error => assertSanitized(error, 0, 'INVALID_AUTH_TOKEN'));
    assert.equal(requests, 0);
  }
});

test('Credential refresh errors are sanitized before any authenticated network request', async () => {
  let requests = 0;
  const request = createGoogleApi({ getToken: async () => {
    throw new Error('private-google-details ' + token);
  }, fetchImpl: async () => { requests++; return objectResponse(); } });
  await assert.rejects(() => request('iam', 'GET', '/v1/projects/example/roles/OtpAuth'),
    error => assertSanitized(error, 0, 'AUTH_UNAVAILABLE'));
  assert.equal(requests, 0);
});

test('Secret Manager allows only OTP metadata, bounded version enumeration and approved scoped mutations', async () => {
  const requests = [];
  let tokenCalls = 0;
  const request = createGoogleApi({ getToken: async () => { tokenCalls++; return token; },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return objectResponse({ checked: true });
    } });
  const permitted = [];
  for (const project of ['majstorsada-b2ad4', '526260795061']) {
    for (const secret of ['OTP_HMAC_SECRET', 'OTP_TURNSTILE_SECRET']) {
      const path = '/v1/projects/' + project + '/secrets/' + secret;
      permitted.push(['GET', path], ['GET', path + '/versions?pageSize=100'],
        ['GET', path + '/versions?pageSize=1'],
        ['GET', path + '/versions?pageSize=100&pageToken=' + encodeURIComponent('opaque+/=token')],
        ['GET', path + '/versions/1'], ['GET', path + '/versions/9223372036854775807'],
        ['GET', path + '/versions/latest'],
        ['GET', path + ':getIamPolicy?options.requestedPolicyVersion=3'],
        ['POST', path + ':setIamPolicy', { policy: { etag: 'checked', bindings: [] } }],
        ['POST', path + ':testIamPermissions', { permissions: ['secretmanager.secrets.getIamPolicy'] }]);
    }
    permitted.push(['POST', '/v1/projects/' + project + '/secrets?secretId=OTP_HMAC_SECRET',
      { replication: { automatic: {} } }],
    ['POST', '/v1/projects/' + project + '/secrets/OTP_HMAC_SECRET:addVersion',
      { payload: { data: Buffer.from('fake-test-HMAC-only').toString('base64') } }]);
  }
  for (const args of permitted) {
    assert.deepEqual(await request('secretmanager', ...args), { checked: true });
  }
  assert.equal(requests.length, permitted.length);
  assert.equal(tokenCalls, permitted.length);
  for (let i = 0; i < permitted.length; i++) {
    const [method, path, body] = permitted[i];
    assert.equal(requests[i].url, 'https://secretmanager.googleapis.com' + path);
    assert.equal(requests[i].options.method, method);
    assert.equal(requests[i].options.body, body === undefined ? undefined : JSON.stringify(body));
    assert.equal(requests[i].options.redirect, 'error');
  }
});

test('Secret Manager rejects reads of secret values, other projects/secrets and unsupported mutations before credentials', async () => {
  let tokenCalls = 0, requestCalls = 0;
  const request = createGoogleApi({ getToken: async () => { tokenCalls++; return token; },
    fetchImpl: async () => { requestCalls++; return objectResponse(); } });
  const base = '/v1/projects/majstorsada-b2ad4/secrets';
  const name = base + '/OTP_HMAC_SECRET';
  const invalid = [
    ['GET', base], ['POST', base], ['GET', base + '?pageSize=100'],
    ['GET', '/v1/projects/foreign/secrets/OTP_HMAC_SECRET'],
    ['GET', '/v1/projects/526260795062/secrets/OTP_HMAC_SECRET'],
    ['GET', base + '/OTHER_SECRET'], ['GET', base + '/otp_hmac_secret'],
    ['GET', name + '_extra'], ['GET', '/v1/projects/majstorsada-b2ad4/locations/europe-west3/secrets/OTP_HMAC_SECRET'],
    ['GET', name + '/versions/1:access'], ['GET', name + '/versions/latest:access'],
    ['POST', name + '/versions/latest:access', {}],
    ['POST', base + '?secretId=OTP_TURNSTILE_SECRET', {}],
    ['POST', base + '?secretId=OTHER_SECRET', {}],
    ['POST', base + '/OTP_TURNSTILE_SECRET:addVersion', { payload: { data: 'fake' } }],
    ['POST', name + ':delete', {}], ['POST', name + '/versions/1:destroy', {}],
    ['POST', name + '/versions/1:disable', {}], ['POST', name + '/versions/1:enable', {}],
    ['POST', name + ':getIamPolicy?options.requestedPolicyVersion=3', {}],
    ['GET', name + ':setIamPolicy'], ['GET', name + ':testIamPermissions'],
    ['GET', name + ':addVersion'], ['GET', '/v1beta1/projects/majstorsada-b2ad4/secrets/OTP_HMAC_SECRET'],
    ['GET', '/v2/projects/majstorsada-b2ad4/secrets/OTP_HMAC_SECRET'],
    ['GET', name, { unexpected: 'body' }], ['GET', name, null],
    ['DELETE', name], ['PATCH', name], ['PUT', name],
  ];
  for (const args of invalid) {
    await assert.rejects(() => request('secretmanager', ...args), /Unapproved Google API request/);
  }
  assert.equal(tokenCalls, 0);
  assert.equal(requestCalls, 0);
});

test('Secret Manager rejects unbounded, duplicated, malformed and unsupported query parameters before credentials', async () => {
  let tokenCalls = 0, requestCalls = 0;
  const request = createGoogleApi({ getToken: async () => { tokenCalls++; return token; },
    fetchImpl: async () => { requestCalls++; return objectResponse(); } });
  const base = '/v1/projects/majstorsada-b2ad4/secrets';
  const name = base + '/OTP_HMAC_SECRET';
  const invalid = [
    name + '?', name + '?pageSize=100', name + '?alt=json',
    name + ':getIamPolicy', name + ':getIamPolicy?options.requestedPolicyVersion=1',
    name + ':getIamPolicy?options.requestedPolicyVersion=3&options.requestedPolicyVersion=3',
    name + ':getIamPolicy?options.requestedPolicyVersion=3&alt=json',
    name + '/versions', name + '/versions?', name + '/versions?pageSize=0',
    name + '/versions?pageSize=101', name + '/versions?pageSize=25000',
    name + '/versions?pageSize=-1', name + '/versions?pageSize=01',
    name + '/versions?pageSize=1.5', name + '/versions?pageSize=',
    name + '/versions?pageSize=100&pageSize=100',
    name + '/versions?pageSize=100&filter=state%3DENABLED',
    name + '/versions?pageToken=opaque', name + '/versions?pageSize=100&pageToken=',
    name + '/versions?pageSize=100&pageToken=x&pageToken=y',
    name + '/versions?pageSize=100&pageToken=%',
    name + '/versions?pageSize=100&pageToken=%0',
    name + '/versions?pageSize=100&pageToken=%ZZ',
    name + '/versions?pageSize=100&pageToken=%C3',
    name + '/versions?pageSize=100&pageToken=%00',
    name + '/versions?pageSize=100&pageToken=%7f',
    name + '/versions?pageSize=100&pageToken=%20',
    name + '/versions?pageSize=100&pageToken=%C2%A0',
    name + '/versions?pageSize=100&pageToken=' + 'a'.repeat(2049),
    name + '/versions?page%53ize=100',
    name + '/versions?pageSize=100&',
    name + '/versions?pageSize=100?unapproved=1',
    name + '/versions/0', name + '/versions/01',
    name + '/versions/9223372036854775808',
    name + '/versions/99999999999999999999',
    name + '/versions/latest?pageSize=100',
    name + '/versions/1?alt=json',
    name + '\u0000', name + '\u0007', name + '\u007f',
  ];
  for (const path of invalid) {
    await assert.rejects(() => request('secretmanager', 'GET', path), /Unapproved Google API request/);
  }
  for (const path of [
    base + '?secretId=OTP_HMAC_SECRET&secretId=OTP_HMAC_SECRET',
    base + '?secretId=OTP_HMAC_SECRET&alt=json',
    base + '?secretId=OTP_HMAC_SECRET?',
    name + ':addVersion?alt=json',
    name + ':setIamPolicy?options.requestedPolicyVersion=3',
  ]) {
    await assert.rejects(() => request('secretmanager', 'POST', path, {}), /Unapproved Google API request/);
  }
  assert.equal(tokenCalls, 0);
  assert.equal(requestCalls, 0);
});

test('Secret Manager payloads and base64 secret data never appear in sanitized network or API errors', async () => {
  const secret = 'fake-test-private-secret-payload';
  const encoded = Buffer.from(secret).toString('base64');
  const path = '/v1/projects/majstorsada-b2ad4/secrets/OTP_HMAC_SECRET:addVersion';
  const body = { payload: { data: encoded } };
  for (const outcome of ['network', 'http', 'invalid-json']) {
    let calls = 0;
    const request = createGoogleApi({ getToken: async () => token, fetchImpl: async (_url, options) => {
      calls++;
      assert.equal(options.body, JSON.stringify(body));
      if (outcome === 'network') throw new Error(secret + ' ' + encoded + ' ' + token);
      if (outcome === 'http') return objectResponse({ error: {
        status: 'PERMISSION_DENIED', message: secret + ' ' + encoded + ' ' + token,
        details: [{ payload: body.payload }],
      } }, 403);
      return new Response(secret + ' ' + encoded + ' ' + token, { status: 502 });
    } });
    await assert.rejects(() => request('secretmanager', 'POST', path, body), error => {
      assertSanitized(error, outcome === 'network' ? 0 : outcome === 'http' ? 403 : 502,
        outcome === 'network' ? 'OUTCOME_UNKNOWN_REPLAN' : outcome === 'http' ? 'PERMISSION_DENIED' : 'INVALID_JSON_REPLAN');
      const exposed = error.stack + JSON.stringify(error);
      assert.ok(!exposed.includes(secret));
      assert.ok(!exposed.includes(encoded));
      assert.ok(!exposed.includes(JSON.stringify(body)));
      return true;
    });
    assert.equal(calls, 1, 'A secret version mutation must never retry an ambiguous outcome');
  }
});

test('Malformed request path types are rejected before credentials and fetch', async () => {
  let tokenCalls = 0, requestCalls = 0;
  const request = createGoogleApi({ getToken: async () => { tokenCalls++; return token; },
    fetchImpl: async () => { requestCalls++; return objectResponse(); } });
  for (const path of [null, undefined, 42, {}, []]) {
    await assert.rejects(() => request('secretmanager', 'GET', path), /Unapproved Google API request/);
  }
  assert.equal(tokenCalls, 0);
  assert.equal(requestCalls, 0);
});


const ownerLookupPath = '/v1/projects/majstorsada-b2ad4/accounts:lookup?fields=users(localId,email,emailVerified,disabled,mfaInfo(mfaEnrollmentId),customAttributes)';
const firestoreReadBase = '/v1/projects/majstorsada-b2ad4/databases/(default)/';

function rejectedReadAdapter() {
  let tokenCalls = 0, requestCalls = 0;
  return { request: createGoogleApi({ getToken: async () => { tokenCalls++; return token; },
    fetchImpl: async () => { requestCalls++; return objectResponse(); } }),
    assertUnused: () => { assert.equal(tokenCalls, 0); assert.equal(requestCalls, 0); } };
}

test('Identity lookup reads only one canonical address using the fixed project and safe response projection', async () => {
  const emails = ['owner@example.com', 'owner+preview@example.co.uk', 'first.last@example-domain.com',
    'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61)];
  const calls = [];
  const request = createGoogleApi({ getToken: async () => token, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return objectResponse({ users: [{ localId: 'client_uid', emailVerified: true }] });
  } });
  for (const email of emails) {
    assert.ok(email.length <= 254);
    assert.deepEqual(await request('identitytoolkit', 'POST', ownerLookupPath, { email: [email] }),
      { users: [{ localId: 'client_uid', emailVerified: true }] });
    const call = calls.at(-1);
    assert.equal(call.url, 'https://identitytoolkit.googleapis.com' + ownerLookupPath);
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.body, JSON.stringify({ email: [email] }));
    assert.equal(call.options.redirect, 'error');
    assert.equal(new URL(call.url).searchParams.get('fields'),
      'users(localId,email,emailVerified,disabled,mfaInfo(mfaEnrollmentId),customAttributes)');
  }
});

test('Identity lookup rejects foreign projects, mutations, full responses and sensitive field projections before credentials', async () => {
  const { request, assertUnused } = rejectedReadAdapter();
  const naked = '/v1/projects/majstorsada-b2ad4/accounts:lookup';
  const invalid = [
    ['GET', ownerLookupPath], ['PUT', ownerLookupPath], ['PATCH', ownerLookupPath], ['DELETE', ownerLookupPath],
    ['POST', naked], ['POST', ownerLookupPath.replace('majstorsada-b2ad4', 'foreign-project')],
    ['POST', ownerLookupPath.replace('majstorsada-b2ad4', '526260795061')],
    ['POST', ownerLookupPath.replace('accounts:lookup', 'accounts:update')],
    ['POST', ownerLookupPath.replace('accounts:lookup', 'accounts')],
    ['POST', '/v1/accounts:lookup'], ['POST', '/v1/projects/majstorsada-b2ad4/accounts:batchGet'],
    ['POST', naked + '?fields=users'], ['POST', naked + '?fields=users(*)'],
    ['POST', naked + '?fields=users(localId,passwordHash,salt,refreshToken)'],
    ['POST', ownerLookupPath + '&fields=users(passwordHash)'],
    ['POST', ownerLookupPath + '&alt=json'], ['POST', ownerLookupPath + '&key=not-allowed'],
    ['POST', ownerLookupPath + '#fragment'], ['POST', ownerLookupPath.replace('/v1/', '/v2/')],
    ['POST', ownerLookupPath.replace('?fields=', '?%66ields=')],
  ];
  for (const [method, path] of invalid) {
    await assert.rejects(() => request('identitytoolkit', method, path, { email: ['owner@example.com'] }), /Unapproved Google API request/);
  }
  assertUnused();
});

test('Identity lookup rejects multiple addresses, extra lookup criteria and custom serialization before credentials', async () => {
  const { request, assertUnused } = rejectedReadAdapter();
  const email = ['owner@example.com'];
  const badArray = ['owner@example.com']; badArray.toJSON = () => ['different@example.com'];
  const getterArray = ['owner@example.com']; Object.defineProperty(getterArray, '0', { get: () => { throw new Error('getter must not run'); } });
  const getterBody = {}; Object.defineProperty(getterBody, 'email', { get: () => { throw new Error('getter must not run'); }, enumerable: true });
  const symbolBody = { email }; symbolBody[Symbol('unexpected')] = true;
  const inherited = Object.create({ email });
  const invalid = [undefined, null, false, 42, 'email', [], {}, { email: 'owner@example.com' },
    { email: [] }, { email: ['owner@example.com', 'other@example.com'] },
    { email, localId: ['other-user'] }, { email, tenantId: 'other-tenant' }, { email, idToken: token },
    { email, toJSON: () => ({ email: ['different@example.com'] }) }, { email: badArray },
    { email: getterArray }, getterBody, symbolBody, inherited];
  for (const body of invalid) {
    await assert.rejects(() => request('identitytoolkit', 'POST', ownerLookupPath, body), /Unapproved Google API request/);
  }
  assertUnused();
});

test('Identity lookup requires conservative trimmed lowercase email syntax and bounded mailbox/domain lengths', async () => {
  const { request, assertUnused } = rejectedReadAdapter();
  const invalid = [undefined, null, 42, {}, '', 'Owner@example.com', 'owner@EXAMPLE.com',
    ' owner@example.com', 'owner@example.com ', 'owner@example.com\n', 'two addresses@example.com',
    'owner', 'owner@example', 'owner@example.c', 'owner@-example.com', 'owner@example-.com',
    'owner@exa_mple.com', 'owner@example..com', '.owner@example.com', 'owner.@example.com',
    'owner..name@example.com', 'owner@@example.com', 'owner@éxample.com', 'öwner@example.com',
    'a'.repeat(65) + '@example.com', 'owner@' + 'a'.repeat(64) + '.com',
    'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(62)];
  for (const email of invalid) {
    await assert.rejects(() => request('identitytoolkit', 'POST', ownerLookupPath, { email: [email] }), /Unapproved Google API request/);
  }
  assertUnused();
});

test('Identity lookup snapshots approved criteria before asynchronous credential refresh', async () => {
  const body = { email: ['owner@example.com'] };
  const request = createGoogleApi({ getToken: async () => {
    body.email[0] = 'different@example.com'; body.email.push('extra@example.com'); body.localId = ['other-user'];
    return token;
  }, fetchImpl: async (_url, options) => {
    assert.equal(options.body, JSON.stringify({ email: ['owner@example.com'] }));
    return objectResponse();
  } });
  assert.deepEqual(await request('identitytoolkit', 'POST', ownerLookupPath, body), {});
});

test('Firestore permits only masked profile existence and six OTP field metadata reads', async () => {
  const paths = [];
  for (const collection of ['admins', 'tradespeople', 'clients']) {
    for (const uid of ['client_uid-01', 'a'.repeat(128)]) paths.push(firestoreReadBase + 'documents/' + collection + '/' + uid + '?mask.fieldPaths=uid');
  }
  for (const collection of ['_otpBudget', '_otpChallenges', '_otpRateStates']) {
    for (const field of ['*', 'deleteAfter']) paths.push(firestoreReadBase + 'collectionGroups/' + collection + '/fields/' + field);
  }
  const calls = [];
  const request = createGoogleApi({ getToken: async () => token, fetchImpl: async (url, options) => {
    calls.push(url); assert.equal(options.method, 'GET'); assert.equal(Object.hasOwn(options, 'body'), false);
    assert.equal(options.redirect, 'error'); return objectResponse({ inspected: true });
  } });
  for (const path of paths) {
    assert.deepEqual(await request('firestore', 'GET', path), { inspected: true });
    assert.equal(calls.at(-1), 'https://firestore.googleapis.com' + path);
  }
  assert.equal(calls.length, 12);
});

test('Firestore rejects writes, profile lists, private document data, unsafe UIDs, queries and foreign resources before credentials', async () => {
  const { request, assertUnused } = rejectedReadAdapter();
  const profile = firestoreReadBase + 'documents/clients/client_uid?mask.fieldPaths=uid';
  const field = firestoreReadBase + 'collectionGroups/_otpChallenges/fields/deleteAfter';
  const invalid = [
    ['POST', profile], ['PATCH', profile], ['PUT', field], ['DELETE', field], ['POST', field],
    ['GET', profile, {}], ['GET', profile, null], ['GET', field, {}], ['GET', field, null],
    ['GET', profile.replace('majstorsada-b2ad4', 'foreign-project')],
    ['GET', profile.replace('majstorsada-b2ad4', '526260795061')],
    ['GET', profile.replace('(default)', 'other-database')], ['GET', profile.replace('clients/', 'jobs/')],
    ['GET', firestoreReadBase + 'documents/clients'],
    ['GET', firestoreReadBase + 'documents/clients/client_uid'],
    ['GET', profile.replace('client_uid', '')], ['GET', profile.replace('client_uid', 'a'.repeat(129))],
    ['GET', profile.replace('client_uid', 'client.uid')], ['GET', profile.replace('client_uid', 'client%2Fuid')],
    ['GET', profile.replace('client_uid', 'client/uid')], ['GET', profile.replace('client_uid', '..')],
    ['GET', profile.replace('client_uid', '*')], ['GET', profile.replace('client_uid', 'user@domain.com')],
    ['GET', profile.replace('=uid', '=email')], ['GET', profile.replace('=uid', '=*')],
    ['GET', profile + '&mask.fieldPaths=email'], ['GET', profile + '&mask.fieldPaths=uid'],
    ['GET', profile + '&readTime=2026-10-06T00:00:00Z'], ['GET', profile + '&alt=json'],
    ['GET', profile.replace('?mask.fieldPaths=', '?mask%2EfieldPaths=')],
    ['GET', firestoreReadBase + 'documents/_otpChallenges/private_state?mask.fieldPaths=uid'],
    ['POST', firestoreReadBase + 'documents:runQuery', {}],
    ['POST', firestoreReadBase + 'documents:commit', {}],
    ['GET', field.replace('_otpChallenges', 'clients')], ['GET', field.replace('deleteAfter', 'email')],
    ['GET', field + '?alt=json'], ['GET', field + '/extra'], ['GET', field.replace('/v1/', '/v1beta2/')],
  ];
  for (const args of invalid) await assert.rejects(() => request('firestore', ...args), /Unapproved Google API request/);
  assertUnused();
});

test('Read-only Auth and Firestore API errors keep safe status without account, document or token details', async () => {
  for (const [service, method, path, body] of [
    ['identitytoolkit', 'POST', ownerLookupPath, { email: ['owner@example.com'] }],
    ['firestore', 'GET', firestoreReadBase + 'documents/clients/client_uid?mask.fieldPaths=uid'],
  ]) {
    const request = createGoogleApi({ getToken: async () => token,
      fetchImpl: async () => objectResponse({ error: { status: 'PERMISSION_DENIED',
        message: 'private-google-details ' + token, details: [{ email: 'private-owner@example.com', passwordHash: 'private-account-hash' }] } }, 403) });
    await assert.rejects(() => request(service, method, path, body), error => {
      assertSanitized(error, 403, 'PERMISSION_DENIED');
      assert.ok(!error.stack.includes('private-owner@example.com'));
      assert.ok(!error.stack.includes('private-account-hash'));
      return true;
    });
  }
});


test('Firestore allows exact default page size metadata pagination with only the approved field override filters', async () => {
  const indexPath = firestoreReadBase + 'collectionGroups/-/indexes?pageSize=0';
  const fieldPaths = [firestoreReadBase + 'collectionGroups/-/fields?pageSize=0&filter=indexConfig.usesAncestorConfig%3Dfalse',
    firestoreReadBase + 'collectionGroups/-/fields?pageSize=0&filter=indexConfig.usesAncestorConfig%3Dfalse%20OR%20ttlConfig%3A%2A'];
  const paths = [indexPath, ...fieldPaths].flatMap(path => [path,
    path + '&pageToken=' + encodeURIComponent('opaque+/=token'),
    path + '&pageToken=' + encodeURIComponent('a'.repeat(2048))]);
  const request = createGoogleApi({ getToken: async () => token, fetchImpl: async (url, options) => {
    assert.equal(new URL(url).origin, 'https://firestore.googleapis.com');
    assert.equal(options.method, 'GET'); assert.equal(Object.hasOwn(options, 'body'), false);
    assert.equal(options.redirect, 'error'); return objectResponse({ indexes: [], fields: [], nextPageToken: 'metadata-next-page' });
  } });
  for (const path of paths) {
    assert.deepEqual(await request('firestore', 'GET', path), { indexes: [], fields: [], nextPageToken: 'metadata-next-page' });
  }
});

test('Firestore metadata enumeration rejects unexpected page sizes, arbitrary filters, malformed tokens and unsupported operations before credentials', async () => {
  const { request, assertUnused } = rejectedReadAdapter();
  const indexPath = firestoreReadBase + 'collectionGroups/-/indexes?pageSize=0';
  const fieldPath = firestoreReadBase + 'collectionGroups/-/fields?pageSize=0&filter=indexConfig.usesAncestorConfig%3Dfalse';
  const invalid = [indexPath.replace('?pageSize=0', ''), fieldPath.replace('?pageSize=0&', '?'),
    indexPath + '&pageSize=0', indexPath + '&filter=any', indexPath + '&alt=json',
    fieldPath.replace('usesAncestorConfig%3Dfalse', 'usesAncestorConfig%3Dtrue'),
    fieldPath.replace('indexConfig.usesAncestorConfig%3Dfalse', 'name%3Dprivate_document'),
    fieldPath + '&filter=indexConfig.usesAncestorConfig%3Dfalse',
    fieldPath + '&alt=json', fieldPath.replace('collectionGroups/-/', 'collectionGroups/jobs/'),
    indexPath.replace('majstorsada-b2ad4', 'foreign-project'), indexPath.replace('(default)', 'other-db')];
  for (const path of [indexPath, fieldPath]) {
    for (const pageSize of ['1', '20', '50', '100', '101', '1000', '10000', '00', '0100', '-1', '%30', '0.0']) {
      invalid.push(path.replace('pageSize=0', 'pageSize=' + pageSize));
    }
    for (const tokenValue of ['', '%', '%0', '%ZZ', '%C3', '%00', '%7f', '%20', '%C2%A0',
      'raw+plus', 'raw=equal', 'raw?question', '%41', 'a'.repeat(2049)]) {
      invalid.push(path + '&pageToken=' + tokenValue);
    }
    invalid.push(path + '&pageToken=one&pageToken=two', path + '&pageToken=one&other=two');
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      await assert.rejects(() => request('firestore', method, path), /Unapproved Google API request/);
    }
    await assert.rejects(() => request('firestore', 'GET', path, {}), /Unapproved Google API request/);
  }
  for (const path of invalid) await assert.rejects(() => request('firestore', 'GET', path), /Unapproved Google API request/);
  assertUnused();
});

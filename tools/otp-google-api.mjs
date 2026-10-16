import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ORIGINS = Object.freeze({
  iam: 'https://iam.googleapis.com',
  projects: 'https://cloudresourcemanager.googleapis.com',
  services: 'https://serviceusage.googleapis.com',
  firebase: 'https://firebase.googleapis.com',
  functions: 'https://cloudfunctions.googleapis.com',
  secretmanager: 'https://secretmanager.googleapis.com',
  identitytoolkit: 'https://identitytoolkit.googleapis.com',
  firestore: 'https://firestore.googleapis.com',
});

function approvedIdentityLookup(method, path, body) {
  // An operator may inspect exactly one nominated account, never enumerate or
  // change accounts. The exact response projection omits password/refresh data.
  // Match the application's conservative canonical syntax.
  if (method !== 'POST' || path !== '/v1/projects/majstorsada-b2ad4/accounts:lookup?fields=users(localId,email,emailVerified,disabled,mfaInfo(mfaEnrollmentId),customAttributes)'
    || !body || Object.getPrototypeOf(body) !== Object.prototype
    || Reflect.ownKeys(body).length !== 1) return false;
  const emails = Object.getOwnPropertyDescriptor(body, 'email')?.value;
  if (!Array.isArray(emails) || Object.getPrototypeOf(emails) !== Array.prototype
    || emails.length !== 1 || Reflect.ownKeys(emails).length !== 2) return false;
  const email = Object.getOwnPropertyDescriptor(emails, '0')?.value;
  if (typeof email !== 'string' || email.length > 254 || email !== email.trim().toLowerCase()) return false;
  const parts = email.split('@');
  return parts.length === 2 && parts[0].length >= 1 && parts[0].length <= 64
    && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0])
    && !parts[0].startsWith('.') && !parts[0].endsWith('.') && !parts[0].includes('..')
    && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(parts[1]);
}

function approvedFirestoreMetadataList(kind, query) {
  // The complete remote index baseline is metadata only. Firestore Admin requires
  // its default page size (0); the caller bounds response sizes and pagination.
  if (query.length > 8_192) return false;
  const parts = query.split('&');
  if (parts.shift() !== 'pageSize=0') return false;
  if (kind === 'fields') {
    const filter = parts.shift();
    if (filter !== 'filter=indexConfig.usesAncestorConfig%3Dfalse'
      && filter !== 'filter=indexConfig.usesAncestorConfig%3Dfalse%20OR%20ttlConfig%3A%2A') return false;
  }
  if (parts.length === 0) return true;
  if (parts.length !== 1 || !parts[0].startsWith('pageToken=')) return false;
  const encoded = parts[0].slice('pageToken='.length);
  if (!encoded || /%(?![0-9A-Fa-f]{2})/.test(encoded)) return false;
  let value;
  try { value = decodeURIComponent(encoded); } catch { return false; }
  return value.length >= 1 && value.length <= 2_048 && /^[\x21-\x7e]+$/.test(value)
    && encodeURIComponent(value) === encoded;
}

function approvedFirestoreRead(method, path, body) {
  // Profile existence checks return only uid; the other reads inspect OTP
  // index/TTL configuration, never document lists, OTP state or private data.
  if (method !== 'GET' || body !== undefined) return false;
  const base = '/v1/projects/majstorsada-b2ad4/databases/(default)/';
  if (!path.startsWith(base)) return false;
  const suffix = path.slice(base.length);
  const list = /^collectionGroups\/-\/(indexes|fields)\?(.+)$/.exec(suffix);
  if (list) return approvedFirestoreMetadataList(list[1], list[2]);
  return /^documents\/(?:admins|tradespeople|clients)\/[A-Za-z0-9_-]{1,128}\?mask\.fieldPaths=uid$/.test(suffix)
    || /^collectionGroups\/(?:_otpBudget|_otpChallenges|_otpRateStates)\/fields\/(?:\*|deleteAfter)$/.test(suffix);
}

function approvedSecretRequest(method, path, body) {
  // This preparation adapter can inspect only the two OTP secrets. Secret values
  // are never read; creation and version writes are limited to our generated HMAC.
  if (path.length > 8_192 || (method === 'GET' && body !== undefined)) return false;
  const [route, query, ...extra] = path.split('?');
  if (extra.length || query === '') return false;
  const parameters = new Map();
  if (query !== undefined) {
    for (const part of query.split('&')) {
      const match = /^(pageSize|pageToken|secretId|options\.requestedPolicyVersion)=([^=]*)$/.exec(part);
      if (!match || parameters.has(match[1]) || /%(?![0-9A-Fa-f]{2})/.test(match[2])) return false;
      let value;
      try { value = decodeURIComponent(match[2]); } catch { return false; }
      if (!value || value.length > 2_048 || /[^\x21-\x7e]/.test(value)) return false;
      parameters.set(match[1], value);
    }
  }
  const project = '/v1/projects/(?:majstorsada-b2ad4|526260795061)/secrets';
  if (new RegExp('^' + project + '$').test(route)) {
    return method === 'POST' && parameters.size === 1
      && parameters.get('secretId') === 'OTP_HMAC_SECRET';
  }
  const match = new RegExp('^' + project + '/(OTP_HMAC_SECRET|OTP_TURNSTILE_SECRET)(.*)$').exec(route);
  if (!match) return false;
  const [, secret, suffix] = match;
  if (method === 'GET') {
    if (suffix === '') return parameters.size === 0;
    if (suffix === ':getIamPolicy') return parameters.size === 1
      && parameters.get('options.requestedPolicyVersion') === '3';
    if (suffix === '/versions') {
      return (parameters.size === 1 || (parameters.size === 2 && parameters.has('pageToken')))
        && /^(?:[1-9]|[1-9][0-9]|100)$/.test(parameters.get('pageSize') ?? '');
    }
    const version = /^\/versions\/(latest|[1-9][0-9]{0,18})$/.exec(suffix)?.[1];
    return parameters.size === 0 && version !== undefined
      && (version === 'latest' || BigInt(version) <= 9_223_372_036_854_775_807n);
  }
  return method === 'POST' && parameters.size === 0
    && (suffix === ':setIamPolicy' || suffix === ':testIamPermissions'
      || (secret === 'OTP_HMAC_SECRET' && suffix === ':addVersion'));
}

export class GoogleApiError extends Error {
  constructor(status, code, service, path) {
    // Deliberately omit Google's raw body, the original error and request headers.
    super(`Google ${service} request failed (${status || 'network'}; ${code}) at ${path.split('?')[0]}`);
    this.status = status;
    this.code = code;
  }
}

export function createGoogleApi({ getToken, fetchImpl = fetch }) {
  return async function request(service, method, path, body) {
    if (!Object.hasOwn(ORIGINS, service) || !['GET', 'POST'].includes(method)
      || typeof path !== 'string' || !/^\/v(?:1|1beta1|2)\//.test(path) || path.includes('..') || path.includes('#')
      || path.split('?')[0].includes('%') || /[\s\u0000-\u001f\u007f]/.test(path) || path.includes('://')
      || path.includes('\\') || path.startsWith('//')
      || (service === 'secretmanager' && !approvedSecretRequest(method, path, body))
      || (service === 'identitytoolkit' && !approvedIdentityLookup(method, path, body))
      || (service === 'firestore' && !approvedFirestoreRead(method, path, body))) {
      throw new Error('Unapproved Google API request');
    }
    // Snapshot the single approved address before awaiting credentials. An async
    // caller cannot substitute other lookup criteria after validation.
    const requestBody = service === 'identitytoolkit' ? { email: [body.email[0]] } : body;
    let token;
    try { token = await getToken(); }
    catch { throw new GoogleApiError(0, 'AUTH_UNAVAILABLE', service, path); }
    if (typeof token !== 'string' || !token.length || token.length > 16_384 || /[\s\u0000-\u001f\u007f]/.test(token)) {
      throw new GoogleApiError(0, 'INVALID_AUTH_TOKEN', service, path);
    }
    let response;
    try {
      response = await fetchImpl(`${ORIGINS[service]}${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
      });
    } catch {
      // Mutations are never retried after an ambiguous network result.
      throw new GoogleApiError(0, 'OUTCOME_UNKNOWN_REPLAN', service, path);
    }
    let data;
    try { data = await response.json(); }
    catch { throw new GoogleApiError(response.status, 'INVALID_JSON_REPLAN', service, path); }
    if (!response.ok) {
      const code = typeof data?.error?.status === 'string'
        && /^[A-Z_]{1,60}$/.test(data.error.status) ? data.error.status : 'HTTP_ERROR';
      throw new GoogleApiError(response.status, code, service, path);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new GoogleApiError(response.status, 'INVALID_RESPONSE', service, path);
    }
    return data;
  };
}

export async function firebaseGoogleApi(projectId) {
  const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
  const require = createRequire(resolve(root, 'package.json'));
  const cliRoot = resolve(require.resolve('firebase-tools/package.json'), '..');
  const { logger } = require(resolve(cliRoot, 'lib/logger.js'));
  logger.silent = true;
  const api = require(resolve(cliRoot, 'lib/api.js'));
  if (api.googleOrigin() !== 'https://www.googleapis.com'
    || api.authOrigin() !== 'https://accounts.google.com'
    || process.env.FIREBASE_TOKEN || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Use the existing Firebase CLI user login without credential or OAuth URL overrides');
  }
  const auth = require(resolve(cliRoot, 'lib/auth.js'));
  const account = auth.getProjectDefaultAccount(root);
  if (!account?.user?.email || !account.tokens?.refresh_token) {
    throw new Error('No Firebase CLI login available; run firebase login in this workspace');
  }
  try {
    const { requireAuth } = require(resolve(cliRoot, 'lib/requireAuth.js'));
    const apiv2 = require(resolve(cliRoot, 'lib/apiv2.js'));
    await requireAuth({ project: projectId, projectRoot: root,
      user: account.user, tokens: account.tokens, nonInteractive: true }, true);
    // Firebase manages its own stored login refresh; we never export credentials.
    return { actor: account.user.email, request: createGoogleApi({
      getToken: async () => {
        try { return await apiv2.getAccessToken(); }
        catch { throw new Error('Firebase login refresh failed; run firebase login --reauth'); }
      },
    }) };
  } catch {
    throw new Error('Firebase authentication failed; run firebase login --reauth');
  }
}
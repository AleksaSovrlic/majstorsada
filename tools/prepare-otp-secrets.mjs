import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROJECT_ID, SA_EMAIL, AUTH_ROLE, unexpectedRuntimeBindings } from './otp-cloud-policy.mjs';
import { firebaseGoogleApi, GoogleApiError } from './otp-google-api.mjs';
import { readPreparation, functionsInventory } from './prepare-otp-google.mjs';
import {
  SECRET_NAMES, APPROVED_PROJECT_NUMBER, APPROVED_GOOGLE_SUBJECT, SecretPreparationError,
  stop, secretResource, assertSecretMetadata, assertVersionMetadata, assertInitialVersion,
  secretIamGrant, assertNoPublicPrincipals, crc32c,
} from './otp-secret-policy.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SERVICE_PATH = `/v1/projects/${PROJECT_ID}/services/secretmanager.googleapis.com`;
function knownMissing(error) { return error instanceof GoogleApiError && error.status === 404; }
function assertGoogleReady(google) {
  if (google.projectNumber !== APPROVED_PROJECT_NUMBER || google.account?.uniqueId !== APPROVED_GOOGLE_SUBJECT
    || google.account?.email !== SA_EMAIL || google.actions?.length !== 0 || google.apiState !== 'ENABLED' || google.canActAs !== true) {
    stop('Approved Google identity and existing OTP IAM preparation must be complete before secret preparation');
  }
  assertNoPublicPrincipals(google.projectPolicy);
  if (unexpectedRuntimeBindings(google.projectPolicy, ['roles/datastore.user', AUTH_ROLE]).length) {
    stop('Dedicated OTP runtime has unexpected direct project permissions; project-wide secret access is forbidden');
  }
}
async function readVersions(request, name, projectNumber) {
  const resource = secretResource(name, projectNumber);
  const versions = [], seenTokens = new Set(), seenIds = new Set();
  let pageToken;
  for (let page = 0; page < 20; page++) {
    const result = await request('secretmanager', 'GET', `/v1/${resource}/versions?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || (result.versions !== undefined && !Array.isArray(result.versions))) stop('Invalid secret-version inventory');
    for (const version of result.versions || []) {
      const { id } = assertVersionMetadata(version, name, projectNumber);
      if (seenIds.has(id)) stop('Repeated secret-version metadata; inventory is incomplete');
      seenIds.add(id); versions.push(version);
      if (versions.length > 2000) stop('Secret-version inventory exceeds the safe bound');
    }
    if (result.nextPageToken === undefined || result.nextPageToken === '') return versions;
    if (typeof result.nextPageToken !== 'string' || result.nextPageToken.length > 2048 || /[\u0000-\u001f\u007f]/.test(result.nextPageToken)
      || seenTokens.has(result.nextPageToken)) stop('Invalid or repeated secret-version page token');
    seenTokens.add(result.nextPageToken); pageToken = result.nextPageToken;
  }
  stop('Secret-version inventory exceeds the safe page bound');
}
export async function readSecretState(request, name, projectNumber) {
  const resource = secretResource(name, projectNumber);
  let metadata;
  try { metadata = await request('secretmanager', 'GET', `/v1/${resource}`); }
  catch (error) { if (knownMissing(error)) return { name, exists: false, resource }; throw error; }
  assertSecretMetadata(metadata, name, projectNumber);
  const policy = await request('secretmanager', 'GET', `/v1/${resource}:getIamPolicy?options.requestedPolicyVersion=3`);
  const grant = secretIamGrant(policy);
  const versions = await readVersions(request, name, projectNumber);
  if (!versions.length) return { name, exists: true, resource, policy, grantMissing: grant.changed, versionCount: 0 };
  const latest = await request('secretmanager', 'GET', `/v1/${resource}/versions/latest`);
  const versionId = assertInitialVersion(versions, latest, name, projectNumber);
  return { name, exists: true, resource, policy, grantMissing: grant.changed, versionCount: versions.length, versionId };
}
export async function readSecretPreparation(request, { readGoogle = readPreparation } = {}) {
  const google = await readGoogle(request);
  assertGoogleReady(google);
  const service = await request('services', 'GET', SERVICE_PATH);
  if (!['ENABLED', 'DISABLED'].includes(service.state)) stop('Unknown Secret Manager API state');
  if (service.state !== 'ENABLED') return { google, apiState: service.state, status: 'awaiting_owner',
    blockers: ['Enable the Secret Manager API in the approved Google project'], secrets: [], actions: [] };
  const secrets = [];
  for (const name of SECRET_NAMES) secrets.push(await readSecretState(request, name, google.projectNumber));
  const hmac = secrets.find(secret => secret.name === 'OTP_HMAC_SECRET');
  const turnstile = secrets.find(secret => secret.name === 'OTP_TURNSTILE_SECRET');
  const blockers = [];
  if (!turnstile.exists || !turnstile.versionCount) blockers.push('Owner must store the real Managed widget secret as the single enabled OTP_TURNSTILE_SECRET version');
  if (hmac.exists && !hmac.versionCount) blockers.push('Existing OTP_HMAC_SECRET has no version; review an interrupted or manual creation before proceeding');
  const actions = [];
  if (!blockers.length) {
    if (!hmac.exists) actions.push('create OTP_HMAC_SECRET with one cryptographically random version');
    for (const secret of secrets) if (!secret.exists || secret.grantMissing) actions.push(`grant dedicated OTP runtime access only to ${secret.name}`);
  }
  return { google, apiState: service.state, status: blockers.length ? 'awaiting_owner' : actions.length ? 'ready_to_apply' : 'verified', blockers, secrets, actions };
}
export async function updateSecretPolicy(request, name, projectNumber) {
  const resource = secretResource(name, projectNumber);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readSecretState(request, name, projectNumber);
    if (!current.exists || current.versionCount !== 1) stop('Secret changed before the scoped IAM update; re-run plan');
    const next = secretIamGrant(current.policy);
    if (!next.changed) return false;
    try {
      await request('secretmanager', 'POST', `/v1/${resource}:setIamPolicy`, { policy: next.policy });
      return true;
    } catch (error) {
      // Only an explicit etag conflict is retryable, with a fresh policy and versions.
      if (!(error instanceof GoogleApiError) || ![409, 412].includes(error.status) || attempt === 2) throw error;
    }
  }
}
export async function applySecretPreparation(request, { readGoogle = readPreparation, inventory = functionsInventory,
  bytes = randomBytes, onProgress = () => {} } = {}) {
  // Re-read at apply time: a prior plan is evidence, never permission to skip preconditions.
  const before = await readSecretPreparation(request, { readGoogle });
  if (before.blockers.length) stop('Owner prerequisites are incomplete; no cloud changes applied');
  const deployed = await inventory(request);
  if (deployed.some(item => /\/functions\/(?:requestClientOtp|verifyClientOtp)$/.test(item.name))) stop('OTP functions already deployed; initial secret preparation must stop for review');
  if (!before.actions.length) return { state: before, generatedHmac: false, deployedFunctionsUnchanged: deployed.length };
  const hmac = before.secrets.find(secret => secret.name === 'OTP_HMAC_SECRET');
  const permissions = ['secretmanager.secrets.setIamPolicy'];
  if (!hmac.exists) permissions.push('secretmanager.secrets.create', 'secretmanager.versions.add');
  const granted = await request('projects', 'POST', `/v1/projects/${PROJECT_ID}:testIamPermissions`, { permissions });
  if (permissions.some(permission => !granted.permissions?.includes(permission))) stop('Operator lacks required secret preparation permissions; no cloud changes applied');
  let generatedHmac = false;
  if (!hmac.exists) {
    // Both owner prerequisites and operator permissions are checked before generating anything.
    const entropy = bytes(32);
    if (!Buffer.isBuffer(entropy) || entropy.length !== 32) stop('Cryptographic HMAC generation failed');
    const payloadBytes = Buffer.from(entropy.toString('base64url'), 'utf8');
    entropy.fill(0);
    try {
      onProgress('Creating the HMAC secret and one initial version without reading or logging secret values');
      const metadata = await request('secretmanager', 'POST', `/v1/projects/${PROJECT_ID}/secrets?secretId=OTP_HMAC_SECRET`, { replication: { automatic: {} } });
      assertSecretMetadata(metadata, 'OTP_HMAC_SECRET', before.google.projectNumber);
      // Create/addVersion are each attempted once. Ambiguous outcomes must be reviewed, never retried.
      const version = await request('secretmanager', 'POST', `/v1/${hmac.resource}:addVersion`, {
        payload: { data: payloadBytes.toString('base64'), dataCrc32c: crc32c(payloadBytes) },
      });
      const summary = assertVersionMetadata(version, 'OTP_HMAC_SECRET', before.google.projectNumber);
      if (summary.id !== '1' || summary.state !== 'ENABLED' || version.clientSpecifiedPayloadChecksum !== true) {
        stop('HMAC version or checksum acknowledgement is unexpected; re-run plan and review without regenerating');
      }
      generatedHmac = true;
    } finally { payloadBytes.fill(0); }
  }
  // Revalidate Google identity and both resources before granting value access.
  const ready = await readSecretPreparation(request, { readGoogle });
  if (ready.blockers.length) stop('Secret prerequisites changed during preparation; re-run plan');
  for (const name of SECRET_NAMES) await updateSecretPolicy(request, name, ready.google.projectNumber);
  const after = await readSecretPreparation(request, { readGoogle });
  if (after.actions.length || after.blockers.length) stop('Secret preparation is incomplete; re-run plan');
  const finalInventory = await inventory(request);
  if (JSON.stringify(deployed) !== JSON.stringify(finalInventory)) stop('Deployed functions changed during secret preparation; review separately');
  return { state: after, generatedHmac, deployedFunctionsUnchanged: finalInventory.length };
}
export function publicSecretReport(state, extra = {}) {
  const publicExtra = {};
  for (const key of ['mode', 'actor', 'verifiedAt', 'generatedHmacThisRun', 'deployedFunctionsUnchanged']) {
    if (Object.hasOwn(extra, key)) publicExtra[key] = extra[key];
  }
  return { projectId: PROJECT_ID, projectNumber: state.google.projectNumber, serviceAccountEmail: SA_EMAIL,
    status: state.status, secretManagerApi: state.apiState, blockers: state.blockers, remainingActions: state.actions,
    secrets: state.secrets.map(secret => ({ name: secret.name, exists: secret.exists,
      versionCount: secret.versionCount ?? 0, enabledLatestVersion: secret.versionId ?? null,
      runtimeAccessorPresent: secret.exists && secret.grantMissing === false })),
    secretValuesRead: false, deploymentPerformed: false, otpEnabledForUsers: false,
    valueAuditScope: 'Metadata only; an existing secret value or its provider ownership is not verified',
    iamAuditScope: 'Direct project, service-account and two named-secret policies; inherited/group access is outside this check', ...publicExtra };
}
async function main() {
  const [mode, ...extra] = process.argv.slice(2);
  if (!['--plan', '--apply', '--verify'].includes(mode) || extra.length) stop('Use exactly --plan, --apply or --verify');
  const rc = JSON.parse(await readFile(resolve(ROOT, '.firebaserc'), 'utf8'));
  if (rc.projects?.default !== PROJECT_ID) stop('Workspace Firebase project changed; stop and review');
  const { actor, request } = await firebaseGoogleApi(PROJECT_ID);
  if (mode === '--plan') {
    console.log(JSON.stringify(publicSecretReport(await readSecretPreparation(request), { mode, actor }), null, 2));
    return;
  }
  let result;
  if (mode === '--apply') result = await applySecretPreparation(request, { onProgress: message => console.log(message) });
  else {
    const state = await readSecretPreparation(request);
    if (state.actions.length || state.blockers.length) stop('Secret preparation is incomplete; use --plan to review remaining prerequisites');
    const deployed = await functionsInventory(request);
    if (deployed.some(item => /\/functions\/(?:requestClientOtp|verifyClientOtp)$/.test(item.name))) stop('OTP functions already deployed; initial preparation verification must stop for review');
    result = { state, generatedHmac: false, deployedFunctionsUnchanged: deployed.length };
  }
  const report = publicSecretReport(result.state, { mode, actor, verifiedAt: new Date().toISOString(),
    generatedHmacThisRun: result.generatedHmac, deployedFunctionsUnchanged: result.deployedFunctionsUnchanged });
  const dir = resolve(ROOT, '.firebase/otp-secrets');
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, 'verification.json');
  await writeFile(`${path}.tmp`, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(`${path}.tmp`, path);
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Unknown errors may contain HTTP bodies or values. Never print their message or stack.
    console.error(error instanceof GoogleApiError || error instanceof SecretPreparationError
      ? error.message : 'OTP secret preparation failed; re-run plan and review prerequisites');
    process.exitCode = 1;
  });
}
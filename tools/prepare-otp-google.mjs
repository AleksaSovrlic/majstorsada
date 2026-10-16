import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { firebaseGoogleApi, GoogleApiError } from './otp-google-api.mjs';
import {
  PROJECT_ID, SA_EMAIL, SA_RESOURCE, MEMBER, AUTH_ROLE_ID, SIGN_ROLE_ID,
  AUTH_ROLE, SIGN_ROLE, AUTH_DEFINITION, SIGN_DEFINITION,
  assertServiceAccount, assertRole, addBindings, unexpectedRuntimeBindings,
  assertNoUserKeys, awsPolicies,
} from './otp-cloud-policy.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROJECT_GRANTS = [
  { role: 'roles/datastore.user', members: [MEMBER] },
  { role: AUTH_ROLE, members: [MEMBER] },
];
const SELF_GRANTS = [{ role: SIGN_ROLE, members: [MEMBER] }];
const CREDENTIALS_API = `/v1/projects/${PROJECT_ID}/services/iamcredentials.googleapis.com`;

async function maybeMissing(request, service, path) {
  try { return await request(service, 'GET', path); }
  catch (error) { if (error instanceof GoogleApiError && error.status === 404) return null; throw error; }
}
export async function readPolicy(request, scope) {
  return scope === 'project'
    ? request('projects', 'POST', `/v1/projects/${PROJECT_ID}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } })
    : request('iam', 'POST', `/v1/${SA_RESOURCE}:getIamPolicy?options.requestedPolicyVersion=3`);
}
function checkGrants(policy, scope) {
  const allowed = scope === 'project' ? PROJECT_GRANTS.map(b => b.role) : [SIGN_ROLE];
  const unexpected = unexpectedRuntimeBindings(policy, allowed);
  if (scope === 'self' && (policy.bindings || []).some(binding =>
    binding.role !== SIGN_ROLE || binding.condition !== undefined
    || binding.members.some(member => member !== MEMBER))) {
    throw new Error('Unexpected direct access to the dedicated OTP service account; review before changing IAM');
  }
  if (unexpected.length) throw new Error(`Unexpected direct OTP ${scope} roles: ${unexpected.join(', ')}; review before changing IAM`);
}
export async function readPreparation(request) {
  const project = await request('projects', 'GET', `/v1/projects/${PROJECT_ID}`);
  const firebase = await request('firebase', 'GET', `/v1beta1/projects/${PROJECT_ID}`);
  if (project.projectId !== PROJECT_ID || project.lifecycleState !== 'ACTIVE'
    || firebase.projectId !== PROJECT_ID || firebase.state !== 'ACTIVE'
    || !/^\d+$/.test(project.projectNumber) || project.projectNumber !== firebase.projectNumber) {
    throw new Error('Google and Firebase project identity mismatch');
  }
  const projectPolicy = await readPolicy(request, 'project');
  checkGrants(projectPolicy, 'project');
  const account = await maybeMissing(request, 'iam', `/v1/${SA_RESOURCE}`);
  const authRole = await maybeMissing(request, 'iam', `/v1/${AUTH_ROLE}`);
  const signRole = await maybeMissing(request, 'iam', `/v1/${SIGN_ROLE}`);
  if (authRole) assertRole(authRole, AUTH_DEFINITION, AUTH_ROLE);
  if (signRole) assertRole(signRole, SIGN_DEFINITION, SIGN_ROLE);
  const api = await request('services', 'GET', CREDENTIALS_API);
  if (!['ENABLED', 'DISABLED'].includes(api.state)) throw new Error('Unknown IAM Credentials API state');
  let selfPolicy = null;
  let canActAs = false;
  if (account) {
    assertServiceAccount(account);
    assertNoUserKeys(await request('iam', 'GET', `/v1/${SA_RESOURCE}/keys?keyTypes=USER_MANAGED`));
    selfPolicy = await readPolicy(request, 'self');
    checkGrants(selfPolicy, 'self');
    const result = await request('iam', 'POST', `/v1/${SA_RESOURCE}:testIamPermissions`, { permissions: ['iam.serviceAccounts.actAs'] });
    canActAs = result.permissions?.includes('iam.serviceAccounts.actAs') === true;
  }
  const actions = [];
  if (!account) actions.push('create dedicated OTP service account (no keys)');
  if (!authRole) actions.push('create read/create-only Firebase Auth role');
  if (!signRole) actions.push('create self-scoped signBlob role');
  if (api.state !== 'ENABLED') actions.push('enable IAM Service Account Credentials API');
  if (addBindings(projectPolicy, PROJECT_GRANTS).changed) actions.push('add two dedicated project role bindings');
  if (!selfPolicy || addBindings(selfPolicy, SELF_GRANTS).changed) actions.push('add self-scoped signer binding');
  if (account && !canActAs) throw new Error('Current Firebase operator cannot actAs the OTP service account; use an already authorized owner or review deployment access separately');
  return { projectNumber: project.projectNumber, account, authRole, signRole, apiState: api.state,
    projectPolicy, selfPolicy, canActAs, actions };
}
export async function updatePolicy(request, scope, requirements) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const policy = await readPolicy(request, scope);
    checkGrants(policy, scope);
    const next = addBindings(policy, requirements);
    if (!next.changed) return false;
    try {
      await request(scope === 'project' ? 'projects' : 'iam', 'POST',
        scope === 'project' ? `/v1/projects/${PROJECT_ID}:setIamPolicy` : `/v1/${SA_RESOURCE}:setIamPolicy`,
        { policy: next.policy });
      return true;
    } catch (error) {
      // Conflict means re-read, never reuse or omit the etag. No network retry.
      if (!(error instanceof GoogleApiError) || ![409, 412].includes(error.status) || attempt === 2) throw error;
    }
  }
}
async function createOrRead(request, path, body, resourcePath, validate) {
  try { validate(await request('iam', 'POST', path, body)); }
  catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 409) throw error;
    validate(await request('iam', 'GET', resourcePath));
  }
}
export async function applyPreparation(request, before, { onProgress = () => {} } = {}) {
  const requiredPermissions = ['resourcemanager.projects.setIamPolicy', 'iam.serviceAccounts.setIamPolicy'];
  if (!before.account) requiredPermissions.push('iam.serviceAccounts.create');
  if (!before.authRole || !before.signRole) requiredPermissions.push('iam.roles.create');
  if (before.apiState !== 'ENABLED') requiredPermissions.push('serviceusage.services.enable');
  const granted = await request('projects', 'POST', `/v1/projects/${PROJECT_ID}:testIamPermissions`, { permissions: requiredPermissions });
  if (requiredPermissions.some(p => !granted.permissions?.includes(p))) throw new Error('Operator lacks required preparation permissions; nothing applied');
  if (!before.account) {
    onProgress('Creating dedicated OTP runtime identity');
    await createOrRead(request, `/v1/projects/${PROJECT_ID}/serviceAccounts`, {
      accountId: 'otp-runtime', serviceAccount: { displayName: 'MajstorSada OTP runtime',
        description: 'Dedicated client OTP runtime; keyless AWS federation and restricted Firebase access.' },
    }, `/v1/${SA_RESOURCE}`, assertServiceAccount);
  }
  for (const [existing, id, definition, name] of [
    [before.authRole, AUTH_ROLE_ID, AUTH_DEFINITION, AUTH_ROLE],
    [before.signRole, SIGN_ROLE_ID, SIGN_DEFINITION, SIGN_ROLE],
  ]) {
    if (!existing) {
      onProgress(`Creating dedicated role ${id}`);
      await createOrRead(request, `/v1/projects/${PROJECT_ID}/roles`, { roleId: id, role: definition },
        `/v1/${name}`, role => assertRole(role, definition, name));
    }
  }
  if (before.apiState !== 'ENABLED') {
    onProgress('Enabling IAM Credentials API');
    const operation = await request('services', 'POST', `${CREDENTIALS_API}:enable`, {});
    if (typeof operation.name !== 'string' || !/^operations\/[A-Za-z0-9_.-]+$/.test(operation.name)) throw new Error('Unexpected API enable operation; re-run plan');
    let done = operation.done === true;
    for (let i = 0; !done && i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const result = await request('services', 'GET', `/v1/${operation.name}`);
      if (result.error) throw new Error('IAM Credentials API enable failed; re-run plan');
      done = result.done === true;
    }
    if (!done || operation.error) throw new Error('API enable incomplete; re-run plan');
  }
  // Revalidate the actual identities/role definitions immediately before grants.
  assertServiceAccount(await request('iam', 'GET', `/v1/${SA_RESOURCE}`));
  assertNoUserKeys(await request('iam', 'GET', `/v1/${SA_RESOURCE}/keys?keyTypes=USER_MANAGED`));
  assertRole(await request('iam', 'GET', `/v1/${AUTH_ROLE}`), AUTH_DEFINITION, AUTH_ROLE);
  assertRole(await request('iam', 'GET', `/v1/${SIGN_ROLE}`), SIGN_DEFINITION, SIGN_ROLE);
  onProgress('Adding scoped grants while preserving existing IAM policies');
  await updatePolicy(request, 'project', PROJECT_GRANTS);
  await updatePolicy(request, 'self', SELF_GRANTS);
}
export async function functionsInventory(request) {
  const functions = [];
  const seen = new Set();
  let pages = 0;
  let page;
  do {
    if (++pages > 100) throw new Error('Functions inventory exceeds the safe page limit');
    const result = await request('functions', 'GET', `/v2/projects/${PROJECT_ID}/locations/europe-west3/functions?pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
    if (result.unreachable?.length) throw new Error('Incomplete deployed functions inventory');
    if (result.functions !== undefined && !Array.isArray(result.functions)) throw new Error('Invalid functions inventory');
    for (const f of result.functions || []) functions.push({ name: f.name, state: f.state,
      updateTime: f.updateTime, serviceAccountEmail: f.serviceConfig?.serviceAccountEmail });
    if (result.nextPageToken !== undefined && (typeof result.nextPageToken !== 'string' || !result.nextPageToken.length)) throw new Error('Invalid functions page token');
    page = result.nextPageToken;
    if (page && seen.has(page)) throw new Error('Repeated functions page token');
    if (page) seen.add(page);
  } while (page);
  return functions.sort((a, b) => a.name.localeCompare(b.name));
}
async function saveJson(relativePath, data) {
  const path = resolve(ROOT, relativePath);
  await writeFile(`${path}.tmp`, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
async function main() {
  const [mode = '--plan', ...extra] = process.argv.slice(2);
  if (!['--plan', '--apply', '--verify'].includes(mode) || extra.length) throw new Error('Use --plan, --apply or --verify');
  const rc = JSON.parse(await readFile(resolve(ROOT, '.firebaserc'), 'utf8'));
  if (rc.projects?.default !== PROJECT_ID) throw new Error('Workspace Firebase project changed; stop and review');
  const { actor, request } = await firebaseGoogleApi(PROJECT_ID);
  const before = await readPreparation(request);
  console.log(JSON.stringify({ mode, project: PROJECT_ID, actor, actions: before.actions }, null, 2));
  if (mode === '--plan') return;
  const inventory = await functionsInventory(request);
  if (inventory.some(f => /\/functions\/(?:requestClientOtp|verifyClientOtp)$/.test(f.name))) throw new Error('OTP functions already deployed; preparation expects a pre-deployment state');
  if (mode === '--apply') await applyPreparation(request, before, { onProgress: message => console.log(message) });
  const after = await readPreparation(request);
  if (after.actions.length) throw new Error('Preparation incomplete; re-run plan to review remaining actions');
  const finalInventory = await functionsInventory(request);
  if (JSON.stringify(inventory) !== JSON.stringify(finalInventory)) throw new Error('Deployed functions changed during preparation; review separately');
  const artifacts = awsPolicies(after.account.uniqueId);
  await saveJson('ops/otp-aws-trust.json', artifacts.trust);
  await saveJson('ops/otp-aws-send.json', artifacts.send);
  const report = { verifiedAt: new Date().toISOString(), projectId: PROJECT_ID,
    projectNumber: after.projectNumber, serviceAccountEmail: SA_EMAIL,
    googleSubject: after.account.uniqueId, awsAccountId: '722769295504',
    audience: 'majstorsada-otp-ses', authRole: AUTH_ROLE, signerRole: SIGN_ROLE,
    iamCredentialsApi: after.apiState, deployerActAs: after.canActAs,
    userManagedKeys: 0, remainingActions: after.actions, deployedFunctionsUnchanged: finalInventory.length,
    auditScope: 'Direct project and own-service-account IAM bindings; not inherited organization/group policies',
    deploymentPerformed: false, otpEnabledForUsers: false,
  };
  await mkdir(resolve(ROOT, '.firebase/otp-google'), { recursive: true });
  await saveJson('.firebase/otp-google/verification.json', report);
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // All request errors are sanitized by the adapter; never print original errors or stacks.
    console.error(error instanceof GoogleApiError ? error.message : error.message || 'OTP cloud preparation failed');
    process.exitCode = 1;
  });
}
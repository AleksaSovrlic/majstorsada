import { PROJECT_ID, MEMBER, addBindings, unexpectedRuntimeBindings } from './otp-cloud-policy.mjs';

export const SECRET_NAMES = Object.freeze(['OTP_HMAC_SECRET', 'OTP_TURNSTILE_SECRET']);
export const SECRET_ACCESS_ROLE = 'roles/secretmanager.secretAccessor';
export const APPROVED_PROJECT_NUMBER = '526260795061';
export const APPROVED_GOOGLE_SUBJECT = '114954723264955273114';
export class SecretPreparationError extends Error {}
export function stop(message) { throw new SecretPreparationError(message); }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export function secretResource(name, projectNumber) {
  if (projectNumber !== APPROVED_PROJECT_NUMBER || !SECRET_NAMES.includes(name)) stop('Secret name or Google project identity is outside the approved boundary');
  return `projects/${PROJECT_ID}/secrets/${name}`;
}
function resourceAliases(name, projectNumber) {
  return [secretResource(name, projectNumber), `projects/${projectNumber}/secrets/${name}`];
}
export function assertSecretMetadata(secret, name, projectNumber) {
  if (!record(secret) || !resourceAliases(name, projectNumber).includes(secret.name)) stop('Secret metadata belongs to an unexpected resource');
  if (!record(secret.replication) || Object.keys(secret.replication).length !== 1
    || !record(secret.replication.automatic) || Object.keys(secret.replication.automatic).length !== 0) {
    stop('OTP secrets require global automatic replication with Google-managed encryption');
  }
  if (secret.rotation !== undefined || secret.expireTime !== undefined || secret.ttl !== undefined
    || (secret.topics !== undefined && (!Array.isArray(secret.topics) || secret.topics.length))
    || (secret.versionAliases !== undefined && (!record(secret.versionAliases) || Object.keys(secret.versionAliases).length))) {
    stop('OTP secret has unexpected rotation, expiry, notification, or version-alias configuration; review separately');
  }
  if (Object.hasOwn(secret, 'payload')) stop('Unexpected secret payload in metadata response');
  return secret;
}
export function assertVersionMetadata(version, name, projectNumber) {
  if (!record(version) || typeof version.name !== 'string' || !['ENABLED', 'DISABLED', 'DESTROYED'].includes(version.state)
    || Object.hasOwn(version, 'payload')) stop('Invalid secret-version metadata');
  const prefix = resourceAliases(name, projectNumber).find(resource => version.name.startsWith(`${resource}/versions/`));
  const id = prefix ? version.name.slice(`${prefix}/versions/`.length) : '';
  if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) stop('Secret version belongs to an unexpected resource or has an invalid version ID');
  if (version.replicationStatus !== undefined && (!record(version.replicationStatus)
    || Object.keys(version.replicationStatus).length !== 1 || !record(version.replicationStatus.automatic)
    || Object.keys(version.replicationStatus.automatic).length)) stop('Unexpected secret-version replication status');
  return { id, state: version.state };
}
export function assertInitialVersion(versions, latest, name, projectNumber) {
  if (!Array.isArray(versions) || versions.length !== 1) stop('OTP secret must have exactly one initial version; do not rotate or repair automatically');
  const item = assertVersionMetadata(versions[0], name, projectNumber);
  const selected = assertVersionMetadata(latest, name, projectNumber);
  if (item.id !== '1' || item.state !== 'ENABLED' || selected.state !== 'ENABLED' || item.id !== selected.id) {
    stop('OTP secret must have one enabled version that is also latest');
  }
  return item.id;
}
export function assertNoPublicPrincipals(policy) {
  if (!record(policy) || (policy.bindings !== undefined && !Array.isArray(policy.bindings))) stop('Invalid IAM policy');
  for (const binding of policy.bindings || []) {
    if (!record(binding) || !Array.isArray(binding.members)) stop('Invalid IAM binding');
    if (binding.members.some(member => member === 'allUsers' || member === 'allAuthenticatedUsers')) {
      stop('Public principals in OTP secret or project IAM require separate review; no changes applied');
    }
  }
}
export function secretIamGrant(policy) {
  assertNoPublicPrincipals(policy);
  const unexpected = unexpectedRuntimeBindings(policy, [SECRET_ACCESS_ROLE]);
  if (unexpected.length) stop('Dedicated OTP runtime has unexpected direct secret permissions; review before changing IAM');
  try { return addBindings(policy, [{ role: SECRET_ACCESS_ROLE, members: [MEMBER] }]); }
  catch { stop('Secret IAM policy is invalid or lacks the current etag; no IAM replacement is safe'); }
}
// Castagnoli CRC32C, returned as an unsigned integer encoded in decimal for REST int64.
export function crc32c(data) {
  if (!Buffer.isBuffer(data)) stop('Checksum input must be a private byte buffer');
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0x82f63b78 : 0);
  }
  return String((crc ^ 0xffffffff) >>> 0);
}
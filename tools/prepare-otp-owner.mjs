import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PROJECT_ID, SA_EMAIL } from './otp-cloud-policy.mjs'
import { firebaseGoogleApi, GoogleApiError } from './otp-google-api.mjs'
import { localState, OtpRolloutError, formatOtpRolloutError } from './prepare-otp-ingress.mjs'
import { readOtpParameters } from './otp-aws-config.mjs'
import { readSecretPreparation } from './prepare-otp-secrets.mjs'
import { assertSsrDeps } from './assert-ssr-deps.mjs'
import { deriveIngressRoutes } from './otp-ingress-probe.mjs'
import { readOwnerIndexBaseline, inspectOwnerIndexes } from './otp-owner-indexes.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const OWNER_EMAIL = 'aleksa@majstorsada.rs'
const LOOKUP = `/v1/projects/${PROJECT_ID}/accounts:lookup?fields=users(localId,email,emailVerified,disabled,mfaInfo(mfaEnrollmentId),customAttributes)`
const changedKeys = Object.freeze(['OTP_ENABLED', 'OTP_SEND_ENABLED', 'OTP_TEST_EMAILS', 'OTP_TRUSTED_PROXY_HOPS'])
export const OWNER_STAGES = Object.freeze([
  'firestore:indexes',
  'functions:api:maintainJobs',
  'functions:nuxt-ssr:server,hosting',
  'functions:api:requestClientOtp,functions:api:verifyClientOtp',
])
const stop = message => { throw new OtpRolloutError(message) }
const digest = value => createHash('sha256').update(value).digest('hex')
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value

export async function readOwnerAccount(request, email) {
  if (typeof email !== 'string' || email !== email.trim().toLowerCase()
    || !/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email) || email.length > 254) stop('Invalid nominated owner address')
  const result = await request('identitytoolkit', 'POST', LOOKUP, { email: [email] })
  if (result.users !== undefined && (!Array.isArray(result.users) || result.users.length > 1)) stop('Ambiguous owner account lookup')
  const user = result.users?.[0]
  if (!user) return { kind: 'new-client', uid: null, claimsDigest: null }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(user.localId ?? '') || user.email?.trim().toLowerCase() !== email
    || user.emailVerified !== true || (user.disabled !== undefined && user.disabled !== false)
    || (user.mfaInfo !== undefined && (!Array.isArray(user.mfaInfo) || user.mfaInfo.length))) stop('Owner address is not eligible for this client OTP test')
  let claims = {}
  try { claims = user.customAttributes ? JSON.parse(user.customAttributes) : {} } catch { stop('Owner custom claims are invalid') }
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) stop('Owner custom claims are invalid')
  const roles = []
  for (const collection of ['admins', 'tradespeople', 'clients']) {
    try {
      const profile = await request('firestore', 'GET', `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${user.localId}?mask.fieldPaths=uid`)
      if (profile.name !== `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${user.localId}`) stop('Unexpected owner profile response')
      if (collection === 'clients' && profile.fields?.uid?.stringValue !== user.localId) stop('Owner client profile UID differs')
      roles.push(collection)
    } catch (error) { if (!(error instanceof GoogleApiError && error.status === 404)) throw error }
  }
  if (roles.some(role => role !== 'clients')) stop('Owner address belongs to a privileged or conflicting account; nominate a client address')
  return { kind: roles.length ? 'existing-client' : 'existing-unregistered', uid: user.localId, claimsDigest: digest(JSON.stringify(canonical(claims))) }
}

export async function readOwnerFunctions(request) {
  const rows = [], seen = new Set()
  let page
  for (let count = 0; count < 100; count++) {
    const data = await request('functions', 'GET', `/v2/projects/${PROJECT_ID}/locations/-/functions?pageSize=100${page ? '&pageToken=' + encodeURIComponent(page) : ''}`)
    if (data.unreachable?.length || (data.functions !== undefined && !Array.isArray(data.functions))) stop('Incomplete production function inventory')
    for (const fn of data.functions ?? []) {
      if (!new RegExp(`^projects/${PROJECT_ID}/locations/[a-z0-9-]+/functions/[A-Za-z][A-Za-z0-9_-]*$`).test(fn.name ?? '')
        || rows.some(row => row.name === fn.name) || fn.state !== 'ACTIVE') stop('Production function inventory is invalid or inactive')
      rows.push(fn)
    }
    page = data.nextPageToken
    if (page === undefined || page === '') return rows
    if (typeof page !== 'string' || page.length > 2048 || /[^\x21-\x7e]/.test(page) || seen.has(page)) stop('Invalid or repeated production inventory page token')
    seen.add(page)
  }
  stop('Production inventory exceeds safe page bound')
}

export function assertOwnerBaseline(functions, entries) {
  const find = name => functions.find(fn => fn.name === `projects/${PROJECT_ID}/locations/europe-west3/functions/${name}`)
  const otp = ['requestClientOtp', 'verifyClientOtp'].map(find)
  deriveIngressRoutes(otp)
  for (const fn of otp) {
    const config = fn.serviceConfig, env = config.environmentVariables ?? {}
    if (fn.buildConfig?.runtime !== 'nodejs24' || config.availableMemory !== '256Mi' || config.availableCpu !== '1'
      || (config.minInstanceCount ?? 0) !== 0 || config.maxInstanceCount !== 2 || config.maxInstanceRequestConcurrency !== 10
      || config.timeoutSeconds !== 60 || config.ingressSettings !== 'ALLOW_ALL') stop('Closed production OTP runtime bounds changed')
    if ([...entries].some(([key, value]) => env[key] !== value)) stop('Remote OTP parameters differ from the closed local baseline')
    const expected = fn.name.endsWith('/requestClientOtp') ? ['OTP_HMAC_SECRET', 'OTP_TURNSTILE_SECRET'] : ['OTP_HMAC_SECRET']
    const secrets = config.secretEnvironmentVariables ?? []
    if (secrets.length !== expected.length || expected.some(key => !secrets.some(secret => secret.key === key && secret.version === '1' && secret.projectId === PROJECT_ID))) stop('Production OTP secret bindings changed')
  }
  const maintenance = find('maintainJobs'), server = find('server')
  if (!maintenance || maintenance.environment !== 'GEN_2' || maintenance.labels?.['firebase-functions-codebase'] !== 'api'
    || maintenance.labels?.['deployment-scheduled'] !== 'true' || maintenance.serviceConfig?.timeoutSeconds !== 300
    || maintenance.serviceConfig.maxInstanceCount !== 1 || maintenance.serviceConfig.maxInstanceRequestConcurrency !== 1
    || (maintenance.serviceConfig.minInstanceCount ?? 0) !== 0) stop('Existing maintenance runtime differs from the reviewed schedule')
  for (const [key, value] of entries) if (!key.startsWith('OTP_') && maintenance.serviceConfig.environmentVariables?.[key] !== value) stop('Maintenance business parameters differ from local deployment parameters')
  if (!server || server.labels?.['firebase-functions-codebase'] !== 'nuxt-ssr' || server.environment !== 'GEN_2') stop('Existing SSR codebase is not ready')
}

export function ownerCandidate(text, email) {
  const before = readOtpParameters(text)
  const closed = { OTP_ENABLED: 'false', OTP_SEND_ENABLED: 'false', OTP_PUBLIC_ENABLED: 'false', OTP_TEST_EMAILS: '',
    OTP_TRUSTED_PROXY_HOPS: '0', OTP_DAILY_LIMIT: '500', OTP_DIAGNOSTICS_WINDOW_START: '' }
  if (Object.entries(closed).some(([key, value]) => before.get(key) !== value)) stop('Owner candidate requires the exact closed baseline')
  if (typeof email !== 'string' || !/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email) || email.length > 254) stop('Invalid nominated owner address')
  const replacements = { OTP_ENABLED: 'true', OTP_SEND_ENABLED: 'true', OTP_TEST_EMAILS: email, OTP_TRUSTED_PROXY_HOPS: '1' }
  let candidate = text
  for (const [key, value] of Object.entries(replacements)) candidate = candidate.replace(new RegExp('^([ \\t]*(?:export[ \\t]+)?' + key + '[ \\t]*=)[^\\r\\n]*', 'm'), '$1' + value)
  const after = readOtpParameters(candidate)
  if (before.size !== after.size || [...before].some(([key, value]) => after.get(key) !== (replacements[key] ?? value))) stop('Owner candidate changes unexpected parameters')
  return candidate
}

export function assertOwnerSelectors(config, ids) {
  const helper = require('firebase-tools/lib/deploy/functions/functionsDeployHelper')
  for (const [selector, codebase, source, expected] of [
    [OWNER_STAGES[1], 'api', 'functions', ['maintainJobs']],
    [OWNER_STAGES[2], 'nuxt-ssr', '.output/server', ['server']],
    [OWNER_STAGES[3], 'api', 'functions', ['requestClientOtp', 'verifyClientOtp']],
  ]) {
    if (config.functions?.filter(item => item.codebase === codebase && item.source === source).length !== 1) stop('Owner deployment source changed')
    const filters = helper.getEndpointFilters({ only: selector }, config.functions)
    if (helper.targetCodebases(config.functions, filters).join(',') !== codebase) stop('Owner selector includes another codebase')
    const matches = ids[codebase].filter(id => helper.endpointMatchesAnyFilter({ id, codebase }, filters)).sort()
    if (JSON.stringify(matches) !== JSON.stringify(expected)) stop('Owner selector includes unexpected functions')
  }
}

export function assertOwnerIngressEvidence(probe, functions) {
  const routes = deriveIngressRoutes(functions.filter(fn => /\/functions\/(?:requestClientOtp|verifyClientOtp)$/.test(fn.name)))
  if (probe.projectId !== PROJECT_ID || probe.region !== 'europe-west3' || probe.candidateTrustedProxyHops !== 1
    || probe.status !== 'candidate_requires_operator_review' || probe.routes?.length !== 6
    || routes.some(route => probe.routes.filter(row => row.function === route.function && row.surface === route.surface
      && row.requests === 5 && row.spoofedPrefixesRejected === true && JSON.stringify(row.forwardedCounts) === '[1,2,2,4,2]').length !== 1)) stop('Ingress proof is incomplete or differs from reviewed routes')
}

async function ownerInputsDigest() {
  const rows = []
  async function walk(relative) {
    for (const entry of (await readdir(resolve(ROOT, relative), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || (relative === 'functions/src' && entry.name === 'version.ts')) continue
      const name = relative + '/' + entry.name
      if (entry.isSymbolicLink()) stop('Rollout input tree contains an unexpected symbolic link')
      if (entry.isDirectory()) await walk(name)
      else if (entry.isFile()) { rows.push([name, digest(await readFile(resolve(ROOT, name)))]); if (rows.length > 5000) stop('Rollout input tree exceeds safe bound') }
    }
  }
  for (const folder of ['app', 'functions/src', 'tools', '.output']) await walk(folder)
  for (const file of ['firebase.json', 'firestore.indexes.json', 'firestore.rules', 'storage.rules', 'nuxt.config.ts', 'package.json', 'package-lock.json', 'functions/package.json', 'functions/package-lock.json', 'deploy/ssr/package.json', 'deploy/ssr/package-lock.json']) rows.push([file, digest(await readFile(resolve(ROOT, file)))])
  return digest(JSON.stringify(rows))
}

async function main() {
  if (process.argv.slice(2).join(' ') !== '--plan') stop('Use exactly --plan; this tool never publishes or activates OTP')
  const local = await localState()
  assertSsrDeps()
  const config = JSON.parse(await readFile(resolve(ROOT, 'firebase.json'), 'utf8'))
  const api = require('../functions/lib/index.js')
  assertOwnerSelectors(config, { api: Object.keys(api).filter(key => api[key]?.__endpoint), 'nuxt-ssr': ['server'] })
  const { request } = await firebaseGoogleApi(PROJECT_ID)
  const functions = await readOwnerFunctions(request)
  assertOwnerBaseline(functions, local.entries)
  const secrets = await readSecretPreparation(request)
  if (secrets.status !== 'verified' || secrets.actions.length || secrets.blockers.length) stop('Google IAM or secret prerequisites are incomplete')
  const account = await readOwnerAccount(request, OWNER_EMAIL)
  const indexBaseline = await readOwnerIndexBaseline(request)
  const indexes = inspectOwnerIndexes(JSON.parse(await readFile(resolve(ROOT, 'firestore.indexes.json'), 'utf8')), indexBaseline)
  if (!indexes.businessPreserved || indexes.blockers.length) stop('Production index baseline has blockers; review before staging owner rollout')
  assertOwnerIngressEvidence(JSON.parse(await readFile(resolve(ROOT, '.firebase/otp-ingress/probe.json'), 'utf8')), functions)
  const rollback = JSON.parse(await readFile(resolve(ROOT, '.firebase/otp-owner/rollback/receipt.json'), 'utf8'))
  const serverSource = functions.find(fn => fn.name.endsWith('/functions/server')).buildConfig.source.storageSource
  if (JSON.stringify(canonical(rollback.source)) !== JSON.stringify(canonical(serverSource))
    || digest(await readFile(resolve(ROOT, '.firebase/otp-owner/rollback/server-source.zip'))) !== rollback.sha256
    || !rollback.hostingRelease?.version?.name || rollback.hostingRelease.version.status !== 'FINALIZED') stop('Matched SSR/Hosting rollback evidence is missing')
  const candidate = ownerCandidate(local.text, OWNER_EMAIL)
  if (await readFile(local.path, 'utf8') !== local.text) stop('Local parameters changed during preparation')
  const dir = resolve(ROOT, '.firebase/otp-owner'); await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, 'candidate.env'), candidate, { mode: 0o600 })
  await writeFile(resolve(dir, 'closed-baseline.env'), local.text, { mode: 0o600 })
  await writeFile(resolve(dir, 'index-baseline.json'), JSON.stringify(indexBaseline, null, 2) + '\n', { mode: 0o600 })
  await writeFile(resolve(dir, 'functions-before.json'), JSON.stringify(functions, null, 2) + '\n', { mode: 0o600 })
  const report = { verifiedAt: new Date().toISOString(), projectId: PROJECT_ID, status: 'ready_for_owner_rollout_approval',
    existingFunctions: functions.length, accountKind: account.kind, accountUidDigest: account.uid ? digest(account.uid) : null,
    claimsDigest: account.claimsDigest, changedParameterNames: changedKeys, indexes,
    rollback: { matchedSsrSource: true, hostingReleaseRecorded: true },
    planned: { enabled: true, sending: true, publicEnabled: false, approvedAddresses: 1, proxyHops: 1, dailyLimit: 500, addressLimitPer24h: 3,
      authMode: 'magic-link', diagnosticsEnabled: false, stages: OWNER_STAGES },
    inputsDigest: await ownerInputsDigest(), candidateDigest: digest(candidate), closedBaselineDigest: digest(local.text),
    secretValuesRead: false, emailsSent: 0, accountsCreated: 0, productionConfigurationChanged: false, deploymentPerformed: false }
  await writeFile(resolve(dir, 'plan.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify(report, null, 2))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  console.error(formatOtpRolloutError(error)); process.exitCode = 1
})

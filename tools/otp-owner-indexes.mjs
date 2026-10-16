import { PROJECT_ID } from './otp-cloud-policy.mjs'
const BASE = `/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/`
const RESOURCE = `projects/${PROJECT_ID}/databases/(default)/collectionGroups/`
const OTP = ['_otpBudget', '_otpChallenges', '_otpRateStates']
const FILTER = 'indexConfig.usesAncestorConfig%3Dfalse%20OR%20ttlConfig%3A%2A'
const MAX_PAGES = 10, MAX_ITEMS = 1_000
function fail(message) { throw new Error(`OTP owner index preflight: ${message}`) }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function keys(value, allowed) { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('unsupported metadata schema') }
function flag(value) { if (value !== undefined && typeof value !== 'boolean') fail('invalid metadata flag'); return value === true }
function list(value) { if (value === undefined) return []; if (!Array.isArray(value) || value.length > MAX_ITEMS) fail('invalid metadata list'); return value }
function group(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail('invalid collection group'); return value }
function field(value) {
  keys(value, ['fieldPath', 'order', 'arrayConfig'])
  if (typeof value.fieldPath !== 'string' || !value.fieldPath || value.fieldPath.length > 1_500) fail('invalid index field')
  if ((value.order === undefined) === (value.arrayConfig === undefined)
    || (value.order !== undefined && !['ASCENDING', 'DESCENDING'].includes(value.order))
    || (value.arrayConfig !== undefined && value.arrayConfig !== 'CONTAINS')) fail('unsupported index mode')
  return value.order === undefined ? {fieldPath: value.fieldPath, arrayConfig: value.arrayConfig} : {fieldPath: value.fieldPath, order: value.order}
}
function scope(value) { if (!['COLLECTION', 'COLLECTION_GROUP'].includes(value)) fail('invalid query scope'); return value }
function indexSettings(value) {
  if (value.apiScope !== undefined && value.apiScope !== 'ANY_API') fail('unsupported index API scope')
  if (value.density !== undefined && value.density !== 'SPARSE_ALL') fail('unsupported index density')
  if (flag(value.multikey) || flag(value.unique)) fail('unsupported index constraints')
}
export function normalizeOwnerIndex(value, remote = true) {
  keys(value, ['collectionGroup', 'name', 'queryScope', 'fields', 'state', 'apiScope', 'density', 'multikey', 'unique'])
  indexSettings(value)
  let collectionGroup = value.collectionGroup
  if (remote) {
    const match = typeof value.name === 'string' && value.name.startsWith(RESOURCE)
      ? /^([A-Za-z0-9_-]{1,128})\/indexes\/([A-Za-z0-9_-]{1,256})$/.exec(value.name.slice(RESOURCE.length)) : null
    if (!match) fail('foreign or malformed index resource')
    collectionGroup = match[1]
    if (!['READY', 'CREATING', 'NEEDS_REPAIR', 'STATE_UNSPECIFIED'].includes(value.state)) fail('invalid index state')
  }
  const fields = list(value.fields).map(field)
  if (fields.length < 2 || fields.length > 100 || new Set(fields.map(item => item.fieldPath)).size !== fields.length) fail('invalid composite index fields')
  const last = fields.at(-1), previous = fields.at(-2)
  // Remove only the auto-added name suffix; explicit reverse name ordering has
  // different query semantics and must remain distinguishable.
  if (last.fieldPath === '__name__' && last.order === (previous.order || 'ASCENDING')) fields.pop()
  return {collectionGroup: group(collectionGroup), queryScope: scope(value.queryScope), fields}
}
function parseField(value) {
  keys(value, ['name', 'indexConfig', 'ttlConfig'])
  const match = typeof value.name === 'string' && value.name.startsWith(RESOURCE)
    ? /^([A-Za-z0-9_-]{1,128})\/fields\/([^/]{1,1500})$/.exec(value.name.slice(RESOURCE.length)) : null
  if (!match) fail('foreign or malformed field resource')
  keys(value.indexConfig, ['indexes', 'usesAncestorConfig', 'ancestorField', 'reverting'])
  const indexes = list(value.indexConfig.indexes).map(index => {
    keys(index, ['name', 'queryScope', 'fields', 'state', 'apiScope', 'density', 'multikey', 'unique'])
    indexSettings(index)
    if (index.name !== undefined && index.name !== '') fail('unexpected single-field index name')
    if (!['READY', 'CREATING', 'NEEDS_REPAIR', 'STATE_UNSPECIFIED'].includes(index.state)) fail('invalid single-field index state')
    const fields = list(index.fields)
    if (fields.length !== 1 || (fields[0].fieldPath !== undefined && fields[0].fieldPath !== match[2])) fail('invalid single-field index fields')
    const normalized = field({...fields[0], fieldPath: match[2]})
    return {queryScope: scope(index.queryScope), ...normalized, state: index.state}
  })
  if (value.ttlConfig !== undefined) {
    keys(value.ttlConfig, ['state', 'expirationOffset'])
    if (!['STATE_UNSPECIFIED', 'CREATING', 'ACTIVE', 'NEEDS_REPAIR'].includes(value.ttlConfig.state)) fail('invalid TTL metadata')
  }
  return {collectionGroup: match[1], fieldPath: match[2], indexes,
    usesAncestorConfig: flag(value.indexConfig.usesAncestorConfig), reverting: flag(value.indexConfig.reverting), hasTtl: value.ttlConfig !== undefined}
}
function normalizedModes(indexes) {
  return indexes.map(({state, fieldPath, ...mode}) => mode).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
function desiredField(value) {
  keys(value, ['collectionGroup', 'fieldPath', 'indexes'])
  group(value.collectionGroup)
  if (typeof value.fieldPath !== 'string' || !value.fieldPath || value.fieldPath.length > 1_500) fail('invalid local field override')
  const indexes = list(value.indexes).map(index => {
    keys(index, ['queryScope', 'order', 'arrayConfig'])
    const {fieldPath, ...mode} = field({fieldPath: value.fieldPath, ...(index.order === undefined ? {} : {order:index.order}), ...(index.arrayConfig === undefined ? {} : {arrayConfig:index.arrayConfig})})
    return {queryScope: scope(index.queryScope), ...mode}
  })
  return {collectionGroup:value.collectionGroup, fieldPath:value.fieldPath, indexes}
}
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b)
function matchesField(desired, actual) {
  return actual && !actual.usesAncestorConfig && !actual.reverting && actual.indexes.every(index => index.state === 'READY')
    && same(normalizedModes(desired.indexes), normalizedModes(actual.indexes))
}
const expectedOtp = [
  ...OTP.map(collectionGroup => ({collectionGroup, fieldPath:'*', indexes:[]})),
  ...['_otpChallenges','_otpRateStates'].map(collectionGroup => ({collectionGroup, fieldPath:'deleteAfter', indexes:[{queryScope:'COLLECTION',order:'ASCENDING'}]})),
]
export async function readOwnerIndexBaseline(request) {
  async function pages(kind) {
    const result = [], seen = new Set(); let pageToken
    for (let page = 0; page < MAX_PAGES; page++) {
      const path = BASE + '-/' + kind + '?pageSize=0' + (kind === 'fields' ? '&filter=' + FILTER : '')
        + (pageToken === undefined ? '' : '&pageToken=' + encodeURIComponent(pageToken))
      const response = await request('firestore', 'GET', path)
      keys(response, [kind, 'nextPageToken'])
      const items = list(response[kind]); if (result.length + items.length > MAX_ITEMS) fail('metadata pagination limit exceeded')
      result.push(...items)
      const next = response.nextPageToken
      if (next === undefined || next === '') return result
      if (typeof next !== 'string' || next.length > 2_048 || !/^[\x21-\x7e]+$/.test(next) || seen.has(next)) fail('invalid or repeated metadata page token')
      seen.add(next); pageToken = next
    }
    fail('metadata pagination limit exceeded')
  }
  const [indexes, fields] = await Promise.all([pages('indexes'),pages('fields')])
  const unique = (items, parser) => { const seen = new Set(); for (const item of items) { parser(item); if (seen.has(item.name)) fail('duplicate metadata resource'); seen.add(item.name) } }
  unique(indexes, normalizeOwnerIndex); unique(fields, parseField)
  return {indexes, fields}
}
export function inspectOwnerIndexes(localManifest, baseline) {
  keys(localManifest, ['indexes','fieldOverrides']); keys(baseline, ['indexes','fields'])
  if (!Array.isArray(localManifest.indexes) || !Array.isArray(localManifest.fieldOverrides)
    || !Array.isArray(baseline.indexes) || !Array.isArray(baseline.fields)) fail('incomplete index baseline')
  const wantedIndexes = localManifest.indexes.map(index => normalizeOwnerIndex(index,false))
  const wantedFields = localManifest.fieldOverrides.map(desiredField)
  const actualIndexes = baseline.indexes.map(index => ({normalized: normalizeOwnerIndex(index), state: index.state}))
  const actualFields = baseline.fields.map(parseField)
  if (new Set(baseline.indexes.map(index => index.name)).size !== baseline.indexes.length
    || new Set(baseline.fields.map(item => item.name)).size !== baseline.fields.length) fail('duplicate metadata resource')
  const businessIndexes = wantedIndexes.filter(index => !OTP.includes(index.collectionGroup))
  const businessFields = wantedFields.filter(item => !OTP.includes(item.collectionGroup))
  const otpFields = wantedFields.filter(item => OTP.includes(item.collectionGroup))
  if (businessIndexes.length !== 15 || businessFields.length !== 2 || otpFields.length !== 5
    || wantedIndexes.length !== businessIndexes.length
    || expectedOtp.some(expected => !otpFields.some(item => same(item,expected)))) fail('local manifest is outside approved scope')
  if (new Set(wantedIndexes.map(index => JSON.stringify(index))).size !== wantedIndexes.length
    || new Set(wantedFields.map(item => item.collectionGroup + '/' + item.fieldPath)).size !== wantedFields.length) fail('duplicate local index definition')
  const blockers = []
  for (const index of businessIndexes) if (!actualIndexes.some(actual => same(index,actual.normalized) && actual.state === 'READY')) blockers.push('business composite index missing or not ready')
  for (const item of businessFields) {
    const actual = actualFields.find(value => value.collectionGroup === item.collectionGroup && value.fieldPath === item.fieldPath)
    if (!matchesField(item,actual)) blockers.push('business field override differs or is not ready')
  }
  const businessPreserved = blockers.length === 0
  for (const actual of actualIndexes) if (OTP.includes(actual.normalized.collectionGroup)) blockers.push('unexpected OTP composite index')
  for (const actual of actualFields.filter(value => OTP.includes(value.collectionGroup))) {
    if (actual.hasTtl) blockers.push('OTP TTL configuration requires separate approval')
    if (!expectedOtp.some(item => item.collectionGroup === actual.collectionGroup && item.fieldPath === actual.fieldPath)) blockers.push('unexpected OTP field override')
  }
  const otpActions = expectedOtp.filter(expected => !matchesField(expected,actualFields.find(item => item.collectionGroup === expected.collectionGroup && item.fieldPath === expected.fieldPath))).map(expected => ({...structuredClone(expected),action:'update-index-config-only'}))
  const extraRemoteCompositeIndexes = actualIndexes.filter(actual => !OTP.includes(actual.normalized.collectionGroup) && !wantedIndexes.some(index => same(index,actual.normalized))).length
  const extraRemoteFieldOverrides = actualFields.filter(actual => actual.collectionGroup !== '__default__' && !OTP.includes(actual.collectionGroup) && !wantedFields.some(item => item.collectionGroup === actual.collectionGroup && item.fieldPath === actual.fieldPath)).length
  return {businessPreserved, otpActions, ready:blockers.length === 0 && otpActions.length === 0,
    blockers:[...new Set(blockers)], extraRemoteCompositeIndexes, extraRemoteFieldOverrides, deleteRemoteExtras:false, requiresForce:false}
}

import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const GLOBAL_SELECTORS = ['source-map-js', 'proxy-addr']
const REQUIRED_SELECTORS = ['@firebase/firestore', 'gaxios@^6.0.0', ...GLOBAL_SELECTORS]
function requireTargetSelectors(policy) {
  for (const selector of REQUIRED_SELECTORS) {
    if (!Object.hasOwn(policy, selector)) throw new Error('SSR root override policy is missing required selector ' + selector + '.')
  }
}

export function validateOverridePolicy(policy) {
  if (!isRecord(policy)) throw new Error('SSR override policy must be an object.')
  function validateValue(value, location) {
    if (typeof value === 'string') {
      if (!EXACT_VERSION.test(value)) throw new Error('SSR override ' + location + ' must pin an exact version.')
      return
    }
    if (!isRecord(value) || !Object.keys(value).length) throw new Error('SSR override ' + location + ' must be a nonempty nested policy or exact version.')
    for (const [name, nested] of Object.entries(value)) validateValue(nested, location + ' > ' + name)
  }
  for (const [name, value] of Object.entries(policy)) validateValue(value, name)
  return policy
}

export function readApprovedOverrides(rootManifestPath) {
  const root = JSON.parse(readFileSync(rootManifestPath, 'utf8').replace(/^\uFEFF/, ''))
  const policy = validateOverridePolicy(root.overrides ?? {})
  requireTargetSelectors(policy)
  return policy
}

export function applySsrOverridePolicy(manifest, policy) {
  validateOverridePolicy(policy)
  if (Object.hasOwn(manifest, 'overrides') && !isDeepStrictEqual(manifest.overrides, policy)) {
    throw new Error('Nitro generated an SSR override policy different from the root-approved policy.')
  }
  return Object.keys(policy).length ? { ...manifest, overrides: structuredClone(policy) } : manifest
}

function resolvedDependency(lock, consumerPath, dependency) {
  let location = consumerPath
  while (location) {
    const nested = location + '/node_modules/' + dependency
    if (lock.packages[nested]) return { path: nested, version: lock.packages[nested].version }
    const parent = location.lastIndexOf('/node_modules/')
    if (parent < 0) break
    location = location.slice(0, parent)
  }
  const root = 'node_modules/' + dependency
  return lock.packages[root] ? { path: root, version: lock.packages[root].version } : null
}

function assertResolved(lock, consumerPath, dependency, expected) {
  const actual = resolvedDependency(lock, consumerPath, dependency)
  if (actual?.version !== expected) {
    throw new Error('SSR lockfile: ' + consumerPath + ' must resolve ' + dependency + '@' + expected +
      ' (found ' + (actual ? actual.version + ' at ' + actual.path : 'no locked package') + ').')
  }
}

export function assertSsrOverridePolicy(manifest, lock, policy) {
  validateOverridePolicy(policy)
  if (Object.keys(policy).length) requireTargetSelectors(policy)
  if (!isDeepStrictEqual(manifest.overrides ?? {}, policy)) {
    throw new Error('SSR manifest override policy differs from the root-approved policy.')
  }

  // Global patch pins must protect every installed copy, including shadows
  // nested below an otherwise correctly pinned hoisted package.
  for (const dependency of GLOBAL_SELECTORS) {
    const expected = policy[dependency]
    if (expected === undefined) continue
    if (typeof expected !== 'string') throw new Error('SSR global override ' + dependency + ' must pin an exact version string.')
    const suffix = '/node_modules/' + dependency
    const copies = Object.entries(lock.packages).filter(([path]) => path === 'node_modules/' + dependency || path.endsWith(suffix))
    if (!copies.length) throw new Error('SSR global override ' + dependency + ' has no locked package.')
    for (const [path, entry] of copies) {
      if (entry.version !== expected) throw new Error('SSR lockfile: ' + path + ' must resolve ' + dependency + '@' + expected + ' (found ' + entry.version + ').')
    }
  }

  const firestoreOverride = policy['@firebase/firestore']
  if (firestoreOverride !== undefined) {
    if (!isRecord(firestoreOverride) || typeof firestoreOverride['@grpc/grpc-js'] !== 'string') {
      throw new Error('SSR Firestore override must pin @grpc/grpc-js.')
    }
    const consumers = Object.keys(lock.packages).filter(path => /(?:^|\/)node_modules\/@firebase\/firestore$/.test(path))
    if (!consumers.length) throw new Error('SSR Firestore override has no locked consumer.')
    for (const consumer of consumers) assertResolved(lock, consumer, '@grpc/grpc-js', firestoreOverride['@grpc/grpc-js'])
  }

  const gaxiosOverride = policy['gaxios@^6.0.0']
  if (gaxiosOverride !== undefined) {
    if (!isRecord(gaxiosOverride) || typeof gaxiosOverride.uuid !== 'string') {
      throw new Error('SSR gaxios 6 override must pin uuid.')
    }
    const consumers = Object.entries(lock.packages)
      .filter(([path, entry]) => /(?:^|\/)node_modules\/gaxios$/.test(path) && /^6\./.test(entry.version))
      .map(([path]) => path)
    if (!consumers.length) throw new Error('SSR gaxios 6 override has no locked consumer.')
    for (const consumer of consumers) assertResolved(lock, consumer, 'uuid', gaxiosOverride.uuid)
  }
}
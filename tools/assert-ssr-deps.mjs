import { existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

export const projectRoot = fileURLToPath(new URL('../', import.meta.url))
export const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
export function validateManifest(pkg) {
  if (pkg.main !== 'index.mjs' || pkg.engines?.node !== '24') throw new Error('SSR must use index.mjs and Node 24.')
  if (!Object.keys(pkg.dependencies || {}).length) throw new Error('SSR dependencies are missing.')
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`SSR dependency ${name} must have an exact version (got ${version}).`)
  }
}
export function validateLock(pkg, lock) {
  validateManifest(pkg)
  if (lock.lockfileVersion !== 3 || !lock.packages?.['']) throw new Error('SSR requires an npm v3 lockfile.')
  if (!isDeepStrictEqual(pkg.dependencies, lock.packages[''].dependencies)) throw new Error('SSR manifest and lockfile dependencies differ.')
  if (!isDeepStrictEqual(pkg.engines, lock.packages[''].engines)) throw new Error('SSR manifest and lockfile runtime differ.')
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    if (lock.packages[`node_modules/${name}`]?.version !== version) throw new Error(`SSR lockfile does not resolve ${name}@${version}.`)
  }
}
export function assertSsrDeps(serverDir = join(projectRoot, '.output/server'), canonicalDir = join(projectRoot, 'deploy/ssr')) {
  for (const dir of [serverDir, canonicalDir]) {
    for (const name of ['package.json', 'package-lock.json']) {
      if (!existsSync(join(dir, name))) throw new Error(`${join(dir, name)} is missing. Run npm run ssr:refresh only when intentionally updating dependencies; otherwise npm run build.`)
    }
  }
  if (!existsSync(join(serverDir, 'index.mjs'))) throw new Error('SSR entry point is missing.')
  const pkg = readJson(join(serverDir, 'package.json')), lock = readJson(join(serverDir, 'package-lock.json'))
  const approved = readJson(join(canonicalDir, 'package.json')), approvedLock = readJson(join(canonicalDir, 'package-lock.json'))
  validateLock(pkg, lock)
  validateLock(approved, approvedLock)
  if (!isDeepStrictEqual(pkg, approved)) throw new Error('Generated SSR manifest differs from deploy/ssr. Review and refresh the SSR lockfile.')
  if (!isDeepStrictEqual(lock, approvedLock)) throw new Error('Generated SSR lockfile differs from the reviewed deploy/ssr lockfile.')
  return Object.keys(pkg.dependencies).length
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`[assert-ssr-deps] OK: ${assertSsrDeps()} exact dependencies, reviewed lockfile, Node 24.`) }
  catch (error) { console.error(`[assert-ssr-deps] ${error.message}`); process.exitCode = 1 }
}

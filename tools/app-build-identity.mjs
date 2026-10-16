import { execFileSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const buildIdPattern = /^[0-9a-f]{7,40}(?:-dirty)?-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const buildIdEnv = 'MAJSTORSADA_APP_BUILD_ID'

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString().trim()
  } catch { throw new Error('Cannot identify the Git revision for the app build.') }
}

export function createAppBuildId(root = projectRoot) {
  const sha = git(root, ['rev-parse', '--short', 'HEAD'])
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error('Invalid Git revision for the app build.')
  const dirty = Boolean(git(root, ['status', '--porcelain']))
  return sha + (dirty ? '-dirty' : '') + '-' + randomUUID()
}

export function assertNoRuntimeBuildIdOverride(env = process.env) {
  if (Object.keys(env).some(key => /^(NUXT|NITRO)_APP_BUILD_ID$/i.test(key))) {
    throw new Error('Runtime app build identity overrides are not allowed.')
  }
}

export function resolveAppBuildId(root = projectRoot, env = process.env) {
  assertNoRuntimeBuildIdOverride(env)
  if (env.NODE_ENV === 'development') return 'dev'
  const inherited = env[buildIdEnv]
  if (inherited !== undefined && !buildIdPattern.test(inherited)) throw new Error('Invalid app build identity.')
  // The npm wrapper shares one ID with all config loads in this build. A direct
  // Nuxt build also gets a fresh ID, but cannot be deployed without its receipt.
  return inherited ?? createAppBuildId(root)
}

function filesUnder(root, entry, skip = () => false) {
  const path = join(root, entry)
  if (!existsSync(path)) return []
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) throw new Error('Build inputs and artifacts must not contain symbolic links.')
  if (stat.isFile()) return skip(entry) ? [] : [entry]
  if (!stat.isDirectory()) throw new Error('Unsupported build input or artifact.')
  return readdirSync(path).sort().flatMap(name => {
    const child = join(entry, name)
    return skip(child) ? [] : filesUnder(root, child, skip)
  })
}

function digestFiles(root, files) {
  const hash = createHash('sha256')
  // Reject a changed HEAD even if the checked-out frontend happens to be equal.
  hash.update(git(root, ['rev-parse', 'HEAD']))
  for (const file of files.sort()) {
    const path = relative(root, join(root, file)).replaceAll('\\', '/')
    const bytes = readFileSync(join(root, file))
    // Length prefixes make paths/content unambiguous, including empty files.
    hash.update(Buffer.byteLength(path) + ':' + path + ':' + bytes.length + ':').update(bytes)
  }
  return hash.digest('hex')
}

export function inputFingerprint(root = projectRoot, { omitReviewedDeps = false } = {}) {
  const entries = ['app', 'assets', 'modules', 'layers', 'public', 'server', '.nuxtrc', '.nuxtignore', 'nuxt.config.ts', 'tailwind.config.js', 'tsconfig.json',
    'package.json', 'package-lock.json', 'firebase.json',
    'tools/build-app.mjs', 'tools/app-build-identity.mjs', 'tools/assert-app-build.mjs',
    'tools/prepare-ssr.mjs', 'tools/assert-ssr-deps.mjs', 'tools/dependency-policy.mjs']
  if (!omitReviewedDeps) entries.push('deploy/ssr/package.json', 'deploy/ssr/package-lock.json')
  // Dotenv inputs are hashed privately; values never appear in the receipt or
  // console. Missing/added files also change the fingerprint.
  const dotenv = readdirSync(root).filter(name => name === '.env' || name.startsWith('.env.'))
  return digestFiles(root, [...new Set([...entries, ...dotenv].flatMap(entry => filesUnder(root, entry)))])
}

export function environmentFingerprint(env = process.env) {
  assertNoRuntimeBuildIdOverride(env)
  const entries = Object.entries(env).filter(([key]) => /^(NUXT_|NITRO_)/i.test(key) || key.toUpperCase() === 'SERVER_PRESET').sort(([a], [b]) => a.localeCompare(b))
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex')
}

export function artifactFingerprint(root = projectRoot) {
  return digestFiles(root, ['.output/public', '.output/server'].flatMap(entry =>
    filesUnder(root, entry, path => path.split(/[\\/]/).includes('node_modules'))))
}

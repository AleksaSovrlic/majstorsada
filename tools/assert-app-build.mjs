import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { projectRoot, buildIdPattern, inputFingerprint, environmentFingerprint, artifactFingerprint } from './app-build-identity.mjs'

function json(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch { throw new Error('App build metadata is missing or invalid; run npm run build.') }
}

export function readArtifactBuildId(root = projectRoot) {
  const latest = json(join(root, '.output/public/_nuxt/builds/latest.json'))
  if (!buildIdPattern.test(latest.id) || !Number.isFinite(latest.timestamp)) throw new Error('Invalid app manifest identity.')
  const meta = json(join(root, '.output/public/_nuxt/builds/meta/' + latest.id + '.json'))
  if (meta.id !== latest.id || meta.timestamp !== latest.timestamp) throw new Error('App manifests come from different builds.')
  let runtime
  try {
    // Parse the generated JSON literal without evaluating generated server code.
    const source = readFileSync(join(root, '.output/server/chunks/_/nitro.mjs'), 'utf8')
    const literal = source.match(/const _inlineRuntimeConfig = (\{[\s\S]*?\n\});/)
    runtime = literal && JSON.parse(literal[1])
  } catch { throw new Error('Cannot inspect the compiled SSR build identity.') }
  if (runtime?.app?.buildId !== latest.id) throw new Error('SSR and Hosting artifacts come from different builds.')
  return latest.id
}

export function assertAppBuild(root = projectRoot, env = process.env) {
  const receipt = json(join(root, '.output/build-receipt.json'))
  const id = readArtifactBuildId(root)
  if (receipt.schema !== 1 || receipt.id !== id) throw new Error('App build receipt does not match the artifacts.')
  if (receipt.inputs !== inputFingerprint(root) || receipt.environment !== environmentFingerprint(env)) {
    throw new Error('App build inputs changed; run npm run build before deploying.')
  }
  if (receipt.artifacts !== artifactFingerprint(root)) throw new Error('App build artifacts changed; run npm run build before deploying.')
  return id
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log('[app-build] Verified SSR and Hosting: ' + assertAppBuild()) }
  catch (error) { console.error('[app-build] ' + error.message); process.exitCode = 1 }
}

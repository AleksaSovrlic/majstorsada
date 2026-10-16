import { spawnSync } from 'node:child_process'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAppBuildId, buildIdEnv, projectRoot, inputFingerprint, environmentFingerprint, artifactFingerprint } from './app-build-identity.mjs'
import { assertAppBuild, readArtifactBuildId } from './assert-app-build.mjs'

const receiptPath = join(projectRoot, '.output/build-receipt.json')
function run(args, env) {
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, env, stdio: 'inherit', windowsHide: true })
  if (result.error || result.status !== 0) throw new Error('App build command failed.', { cause: result.error })
}

try {
  if (!process.env.npm_execpath) throw new Error('Run this tool through npm run build or npm run ssr:refresh.')
  if (process.argv.slice(2).some(arg => arg !== '--refresh')) throw new Error('Unexpected app build argument.')
  if (existsSync(receiptPath)) unlinkSync(receiptPath)
  const id = createAppBuildId()
  const env = { ...process.env, NODE_ENV: 'production', [buildIdEnv]: id }
  const refresh = process.argv.includes('--refresh')
  const inputs = inputFingerprint(projectRoot, { omitReviewedDeps: refresh }), environment = environmentFingerprint(env)
  console.log('[app-build] Building ' + id)
  run([join(projectRoot, 'node_modules/nuxt/bin/nuxt.mjs'), 'build'], env)
  run([join(projectRoot, 'tools/prepare-ssr.mjs'), ...(refresh ? ['--refresh'] : [])], env)
  if (readArtifactBuildId() !== id) throw new Error('The compiled app lost its build identity.')
  // ssr:refresh may update only the reviewed SSR dependency files during build.
  if (inputs !== inputFingerprint(projectRoot, { omitReviewedDeps: refresh })) throw new Error('App inputs changed during the build; build again.')
  writeFileSync(receiptPath, JSON.stringify({
    schema: 1, id, inputs: inputFingerprint(), environment, artifacts: artifactFingerprint(),
  }, null, 2) + '\n')
  assertAppBuild(projectRoot, env)
  console.log('[app-build] SSR and Hosting artifacts verified: ' + id)
} catch (error) {
  if (existsSync(receiptPath)) unlinkSync(receiptPath)
  console.error('[app-build] ' + error.message)
  process.exitCode = 1
}

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { emulatorEnv } from '../../tools/emulator-env.mjs'
import { assertSsrDeps } from '../../tools/assert-ssr-deps.mjs'

assertSsrDeps()
const require = createRequire(import.meta.url)
const projectId = 'demo-majstorsada-dependencies'
const env = emulatorEnv()
env.GCLOUD_PROJECT = projectId
env.GOOGLE_CLOUD_PROJECT = projectId
const tests = 'node --test --test-concurrency=1 tests/dependencies/firebase/ssr.test.mjs'
const child = spawn(process.execPath, [require.resolve('firebase-tools/lib/bin/firebase.js'),
  'emulators:exec', '--config', 'firebase.test.json', '--project', projectId,
  '--only', 'firestore', tests], {
  cwd: fileURLToPath(new URL('../../', import.meta.url)),
  env, stdio: 'inherit', windowsHide: true,
})
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })

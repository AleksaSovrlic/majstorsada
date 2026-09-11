import { spawn, spawnSync } from 'node:child_process'
import { openSync, closeSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import assert from 'node:assert/strict'
assert.equal(process.env.GCLOUD_PROJECT, 'demo-majstorsada-e2e')
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8180')
const python = process.env.E2E_PYTHON || 'python'
// Do not silently test against an unrelated server or production configuration.
await new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.once('error', reject)
  probe.listen(3333, () => probe.close(resolve))
})
mkdirSync('.firebase/e2e', { recursive: true })
const output = openSync('.firebase/e2e/nuxt.log', 'w')
const server = spawn(process.execPath, ['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--port', '3333', '--dotenv', 'tests/e2e/demo.env'], { env: process.env, stdio: ['ignore', output, output], windowsHide: true })
function stopServer() {
  if (server.pid && process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  else server.kill('SIGTERM')
}
try {
  let ready = false
  for (let attempt = 0; attempt < 180; attempt++) {
    if (server.exitCode !== null) throw new Error('Nuxt exited during startup; inspect .firebase/e2e/nuxt.log')
    try { ready = (await fetch('http://localhost:3333/majstor/register', { signal: AbortSignal.timeout(1000) })).ok } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error('Nuxt startup timed out; inspect .firebase/e2e/nuxt.log')
  const browser = spawn(python, ['tests/e2e/browser.py'], { env: process.env, stdio: 'inherit', windowsHide: true })
  process.exitCode = await new Promise((resolve, reject) => { browser.once('exit', code => resolve(code ?? 1)); browser.once('error', reject) })
} finally { stopServer(); closeSync(output) }

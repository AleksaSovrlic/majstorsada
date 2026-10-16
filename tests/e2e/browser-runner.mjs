import { spawn, spawnSync } from 'node:child_process'
import { openSync, closeSync, mkdirSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import net from 'node:net'
import assert from 'node:assert/strict'
assert.equal(process.env.GCLOUD_PROJECT, 'demo-majstorsada-e2e')
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8180')
const python = process.env.E2E_PYTHON || 'python'
const browserScript = process.env.OTP_TEST_BROWSER_SCRIPT || 'tests/e2e/browser.py'
assert.ok(['tests/e2e/browser.py', 'tests/otp/browser.py'].includes(browserScript))
// Do not silently test against an unrelated server or production configuration.
await new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.once('error', reject)
  probe.listen(3333, () => probe.close(resolve))
})
// A terminated Windows Nuxt child can leave its developer lock behind.
// The port probe above must pass; remove only our stale lock when its PID is gone.
const devLock = '.nuxt/nuxt.lock'
if (existsSync(devLock)) {
  const lock = JSON.parse(readFileSync(devLock, 'utf8'))
  const ownWorkspace = String(lock.cwd).replaceAll('\\', '/').toLowerCase() === process.cwd().replaceAll('\\', '/').toLowerCase()
  if (!ownWorkspace || lock.port !== 3333 || !Number.isInteger(lock.pid)) throw new Error('Unexpected Nuxt dev lock; inspect it before running tests')
  let alive = false
  try { process.kill(lock.pid, 0); alive = true } catch (error) { if (error.code !== 'ESRCH') throw error }
  if (alive) throw new Error('Nuxt dev lock belongs to a running process')
  unlinkSync(devLock)
}
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
  const browser = spawn(python, [browserScript], {
    // Serbian UI diagnostics must remain printable when Windows stdout is piped.
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    stdio: 'inherit', windowsHide: true,
  })
  process.exitCode = await new Promise((resolve, reject) => { browser.once('exit', code => resolve(code ?? 1)); browser.once('error', reject) })
} finally { stopServer(); closeSync(output) }

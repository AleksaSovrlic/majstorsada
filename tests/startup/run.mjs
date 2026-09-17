// Runs against the current compiled build; never deploys or starts production APIs.
import { spawn, spawnSync } from 'node:child_process'
import { openSync, closeSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import { assertSsrDeps } from '../../tools/assert-ssr-deps.mjs'
assertSsrDeps()
await new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.once('error', reject)
  probe.listen(3344, '127.0.0.1', () => probe.close(resolve))
})
mkdirSync('.firebase/startup', { recursive: true })
const log = openSync('.firebase/startup/ssr.log', 'w')
const server = spawn(process.execPath, ['tests/build/ssr-server.mjs'], {
  env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', log, log], windowsHide: true
})
try {
  let ready = false
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.exitCode !== null) throw new Error('Compiled SSR exited; inspect .firebase/startup/ssr.log')
    try { ready = (await fetch('http://127.0.0.1:3344/', { signal: AbortSignal.timeout(1000) })).ok } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error('Compiled SSR did not become ready')
  const browser = spawn(process.env.E2E_PYTHON || 'python', ['tests/startup/browser.py'], { env: process.env, stdio: 'inherit', windowsHide: true })
  process.exitCode = await new Promise((resolve, reject) => { browser.once('error', reject); browser.once('exit', code => resolve(code ?? 1)) })
} finally {
  if (server.pid && process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else server.kill('SIGTERM')
  closeSync(log)
}

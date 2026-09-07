import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const env = { ...process.env }
// Oracle's Windows javapath launcher spawns a second Java process. The CLI can
// stop the launcher while leaving the emulator listening on its port. Resolve
// the actual runtime so the CLI owns the Java process it needs to stop.
if (process.platform === 'win32') {
  const info = spawnSync('java', ['-XshowSettings:properties', '-version'], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
  if (info.error || info.status !== 0) throw new Error('Java is required to run security emulators', { cause: info.error })
  const javaHome = `${info.stdout}\n${info.stderr}`.match(/^\s*java\.home\s*=\s*(.+)$/m)?.[1].trim()
  if (!javaHome || !existsSync(path.join(javaHome, 'bin', 'java.exe'))) throw new Error('Cannot locate the actual Java runtime')
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
  env[pathKey] = `${path.join(javaHome, 'bin')}${path.delimiter}${env[pathKey] ?? ''}`
}
const cli = require.resolve('firebase-tools/lib/bin/firebase.js')
const tests = 'node --test --test-concurrency=1 tests/security/firestore.rules.test.mjs tests/security/storage.test.mjs tests/security/api.transactions.test.mjs'
const child = spawn(process.execPath, [cli, 'emulators:exec', '--config', 'firebase.test.json', '--project', 'demo-majstorsada-security', '--only', 'firestore,storage', tests], { env, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })

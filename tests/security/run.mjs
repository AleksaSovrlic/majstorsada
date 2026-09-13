import { emulatorEnv } from '../../tools/emulator-env.mjs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const env = emulatorEnv()
const cli = require.resolve('firebase-tools/lib/bin/firebase.js')
const tests = 'node --test --test-concurrency=1 tests/security/firestore.rules.test.mjs tests/security/storage.test.mjs tests/security/api.transactions.test.mjs tests/security/privacy.test.mjs tests/security/routes.test.mjs tests/security/sdk.test.mjs'
const child = spawn(process.execPath, [cli, 'emulators:exec', '--config', 'firebase.test.json', '--project', 'demo-majstorsada-security', '--only', 'firestore,storage', tests], { env, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })

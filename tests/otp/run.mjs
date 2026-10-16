import { emulatorEnv } from '../../tools/emulator-env.mjs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const env = emulatorEnv()
const tests = 'node --test --test-concurrency=1 tests/otp/service.test.mjs tests/otp/identity.test.mjs tests/otp/maintenance.test.mjs'
const child = spawn(process.execPath, [require.resolve('firebase-tools/lib/bin/firebase.js'), 'emulators:exec', '--config', 'firebase.test.json', '--project', 'demo-majstorsada-otp', '--only', 'firestore', tests], { env, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })

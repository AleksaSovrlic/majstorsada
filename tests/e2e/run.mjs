import { emulatorEnv } from '../../tools/emulator-env.mjs'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const env = emulatorEnv()
env.FUNCTIONS_DISCOVERY_TIMEOUT = '60'
// Avoid HTTP-discovery shutdown hangs on the pinned Windows CLI/SDK combination.
env.FIREBASE_FUNCTIONS_DISCOVERY_OUTPUT_PATH = 'true'
// The pinned CLI prompts for parameters even when they have defaults.
// Supply demo-only values without touching production configuration.
const parameterPath = 'functions/.env.demo-majstorsada-e2e'
const ownedParameters = !existsSync(parameterPath)
const demoParameters = readFileSync('tests/e2e/functions.env', 'utf8')
if (ownedParameters) writeFileSync(parameterPath, demoParameters)
else if (readFileSync(parameterPath, 'utf8') !== demoParameters) throw new Error('Unexpected demo parameter file; inspect it before testing')
process.on('exit', () => { if (ownedParameters && existsSync(parameterPath)) unlinkSync(parameterPath) })
const cli = require.resolve('firebase-tools/lib/bin/firebase.js')
const tests = 'node tests/e2e/http.mjs && node tests/e2e/browser-runner.mjs'
const child = spawn(process.execPath, [cli, 'emulators:exec', '--config', 'firebase.e2e.json', '--project', 'demo-majstorsada-e2e', '--only', 'auth,firestore,functions,storage', tests], { env, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })

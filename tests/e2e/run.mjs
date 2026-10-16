import { emulatorEnv } from '../../tools/emulator-env.mjs'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const env = emulatorEnv()
const demoEmulators = JSON.parse(readFileSync('firebase.e2e.json', 'utf8')).emulators
for (const name of ['auth', 'firestore', 'functions', 'storage', 'hub', 'logging']) {
  if (demoEmulators[name]?.host !== '127.0.0.1') throw new Error('Demo emulator must bind to 127.0.0.1: ' + name)
}
env.FUNCTIONS_DISCOVERY_TIMEOUT = '60'
// Avoid HTTP-discovery shutdown hangs on the pinned Windows CLI/SDK combination.
env.FIREBASE_FUNCTIONS_DISCOVERY_OUTPUT_PATH = 'true'
// The pinned CLI prompts for parameters even when they have defaults.
// Supply demo-only values without touching production configuration.
const parameterPath = 'functions/.env.demo-majstorsada-e2e'
const ownedParameters = !existsSync(parameterPath)
// Both browser suites exercise the single client OTP flow. The mode selects
// which fixture suite runs, never whether client sign-in is enabled.
const otpMode = process.env.OTP_E2E_MODE === 'true'
const demoParameters = readFileSync('tests/e2e/functions.env', 'utf8') + `OTP_ENABLED=true
OTP_PUBLIC_ENABLED=true
OTP_SEND_ENABLED=true
OTP_TEST_EMAILS=
OTP_DEMO_MODE=true
OTP_RUNTIME_SERVICE_ACCOUNT=otp-runtime@demo-majstorsada-e2e.iam.gserviceaccount.com
OTP_AWS_ROLE_ARN=
OTP_AWS_AUDIENCE=majstorsada-otp-ses
OTP_GOOGLE_SUBJECT=
OTP_TRUSTED_PROXY_HOPS=0
OTP_DAILY_LIMIT=500
OTP_DIAGNOSTICS_WINDOW_START=
OTP_DIAGNOSTIC_GOOGLE_SUBJECT=
OTP_DIAGNOSTIC_GOOGLE_EMAIL=
`
if (ownedParameters) writeFileSync(parameterPath, demoParameters)
else if (readFileSync(parameterPath, 'utf8') !== demoParameters) throw new Error('Unexpected demo parameter file; inspect it before testing')
process.on('exit', () => { if (ownedParameters && existsSync(parameterPath)) unlinkSync(parameterPath) })
const secretPath = 'functions/.secret.local'
const ownedSecrets = !existsSync(secretPath)
const demoSecrets = 'OTP_HMAC_SECRET=demo-only-not-a-production-key-32bytes-minimum\nOTP_TURNSTILE_SECRET=demo-only-not-a-real-turnstile-key\n'
if (ownedSecrets) writeFileSync(secretPath, demoSecrets)
else if (readFileSync(secretPath, 'utf8') !== demoSecrets) throw new Error('Existing emulator secret file must be reviewed; refusing to overwrite it')
process.on('exit', () => { if (ownedSecrets && existsSync(secretPath)) unlinkSync(secretPath) })
const cli = require.resolve('firebase-tools/lib/bin/firebase.js')
const tests = otpMode ? 'node tests/otp/e2e-http.mjs && node tests/e2e/browser-runner.mjs' : 'node tests/e2e/http.mjs && node tests/e2e/browser-runner.mjs'
const child = spawn(process.execPath, [cli, 'emulators:exec', '--config', 'firebase.e2e.json', '--project', 'demo-majstorsada-e2e', '--only', 'auth,firestore,functions,storage', tests], { env, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })

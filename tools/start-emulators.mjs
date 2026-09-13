import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { emulatorEnv } from './emulator-env.mjs'
if (!process.env.npm_execpath) throw new Error('Run this tool through its npm run command.')
const require = createRequire(import.meta.url)
const env = emulatorEnv()
env.FUNCTIONS_DISCOVERY_TIMEOUT = '60'
for (const args of [['--prefix', 'functions', 'run', 'build'], ['run', 'build']]) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { env, stdio: 'inherit', windowsHide: true })
  if (result.error || result.status !== 0) process.exit(result.status || 1)
}
const child = spawn(process.execPath, [require.resolve('firebase-tools/lib/bin/firebase.js'), 'emulators:start', '--project', 'majstorsada-b2ad4', '--only', 'auth,firestore,functions,storage'], { env, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })

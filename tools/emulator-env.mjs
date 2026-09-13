import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Only child processes inherit this PATH; the user's machine is not reconfigured.
export function emulatorEnv() {
  const env = { ...process.env }
  const localDir = fileURLToPath(new URL('../.firebase/toolchains/java21/', import.meta.url))
  const localHomes = existsSync(localDir) ? readdirSync(localDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(localDir, e.name)) : []
  const javaHome = env.JAVA_HOME || (localHomes.length === 1 ? localHomes[0] : undefined)
  const binary = javaHome ? path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java'
  const info = spawnSync(binary, ['-XshowSettings:properties', '-version'], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
  const output = `${info.stdout}\n${info.stderr}`
  const actualHome = output.match(/^\s*java\.home\s*=\s*(.+)$/m)?.[1].trim()
  const major = Number(output.match(/^\s*java\.version\s*=\s*(\d+)/m)?.[1])
  if (info.error || info.status !== 0 || !actualHome || major < 21 || !Number.isFinite(major)) {
    throw new Error('Firebase emulators require Java 21+. Set JAVA_HOME to a supported JDK.')
  }
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
  env[pathKey] = `${path.join(actualHome, 'bin')}${path.delimiter}${env[pathKey] ?? ''}`
  env.JAVA_HOME = actualHome
  return env
}

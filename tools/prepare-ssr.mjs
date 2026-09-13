import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import { projectRoot, readJson, validateManifest, validateLock, assertSsrDeps } from './assert-ssr-deps.mjs'

if (!process.env.npm_execpath) throw new Error('Run this tool through its npm run command.')
const generated = join(projectRoot, '.output/server')
const canonical = join(projectRoot, 'deploy/ssr')
const refresh = process.argv.includes('--refresh')
function npm(args, cwd) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { cwd, stdio: 'inherit', windowsHide: true })
  if (result.error || result.status !== 0) throw new Error(`npm ${args.join(' ')} failed`, { cause: result.error })
}
try {
  const pkg = readJson(join(generated, 'package.json'))
  validateManifest(pkg)
  if (refresh) {
    mkdirSync(canonical, { recursive: true })
    writeFileSync(join(canonical, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
    // Explicit maintenance operation. Normal builds never resolve new versions.
    npm(['install', '--package-lock-only', '--ignore-scripts', '--omit=dev'], canonical)
    validateLock(pkg, readJson(join(canonical, 'package-lock.json')))
  } else {
    if (!isDeepStrictEqual(pkg, readJson(join(canonical, 'package.json')))) throw new Error('SSR manifest changed. Review dependency changes, then run npm run ssr:refresh.')
    validateLock(pkg, readJson(join(canonical, 'package-lock.json')))
  }
  copyFileSync(join(canonical, 'package-lock.json'), join(generated, 'package-lock.json'))
  npm(['ci', '--omit=dev'], generated)
  console.log(`[prepare-ssr] ${assertSsrDeps()} dependencies installed from the reviewed lockfile.`)
} catch (error) {
  console.error(`[prepare-ssr] ${error.message}`)
  process.exitCode = 1
}

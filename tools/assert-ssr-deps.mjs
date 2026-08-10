// Guards the SSR function's dependency set at deploy time.
//
// `.output/server/node_modules` is never uploaded (firebase.json ignores it), so what actually
// determines the production runtime is the pair that IS uploaded: package.json and package-lock.json.
// Cloud Build installs from those. If package.json still carries a floating range, or the lockfile
// is missing entirely, the deployed runtime is decided fresh in the cloud and two deploys of the
// same commit can differ.
//
// The Nitro `compiled` hook in nuxt.config already pins this during `nuxt build`. This script is
// the net for the path that skips the build: `firebase deploy` invoked directly.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.output', 'server')
const pkgPath = join(serverDir, 'package.json')
const lockPath = join(serverDir, 'package-lock.json')

const fail = (message) => {
  console.error(`[assert-ssr-deps] ${message}`)
  process.exit(1)
}

if (!existsSync(pkgPath)) {
  fail('.output/server/package.json is missing. Run `npm run build` before deploying.')
}
if (!existsSync(lockPath)) {
  fail('.output/server/package-lock.json is missing, so Cloud Build would resolve dependencies itself. Run `npm install --omit=dev` in .output/server before deploying.')
}

const deps = JSON.parse(readFileSync(pkgPath, 'utf8')).dependencies || {}
const floating = Object.entries(deps).filter(([, v]) => v === 'latest').map(([n]) => n)
if (floating.length > 0) {
  fail(`Unpinned dependencies in the SSR package.json: ${floating.join(', ')}. These re-resolve on every deploy.`)
}

console.log(`[assert-ssr-deps] OK - ${Object.keys(deps).length} pinned dependencies, lockfile present`)

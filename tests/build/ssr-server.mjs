import assert from 'node:assert/strict'
// Test-only HTTP host for the exact Firebase SSR export. No application routes are added.
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
process.env.NODE_ENV = 'production'
const { server } = await import('../../.output/server/index.mjs')
// Verify what the Firebase SDK will deploy, not only the source configuration.
for (const [key, value] of Object.entries({ minInstances: 0, maxInstances: 3, availableMemoryMb: 256, timeoutSeconds: 60, concurrency: 80 })) assert.equal(server.__endpoint[key], value, 'SSR runtime budget: ' + key)
assert.deepEqual(server.__endpoint.region, ['europe-west3'])
const publicDir = resolve('.output/public')
const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' }
const host = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3344')
  const file = resolve(publicDir, '.' + decodeURIComponent(url.pathname))
  // Serve assets as Hosting does; HTML always exercises the compiled SSR handler.
  if (file.startsWith(publicDir + sep) && types[extname(file)] && existsSync(file) && statSync(file).isFile()) {
    res.setHeader('Content-Type', types[extname(file)]); createReadStream(file).pipe(res); return
  }
  return server(req, res)
})
host.listen(3344, '127.0.0.1', () => console.log('Compiled SSR listening locally on 3344'))

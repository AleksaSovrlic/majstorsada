import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const scope = process.argv[2] || 'all'
const choices = scope === 'all' ? ['root', 'functions', 'ssr'] : [scope]
if (choices.some(name => !['root', 'functions', 'ssr'].includes(name))) {
  throw new Error('Use root, functions, ssr, or all.')
}

function anchor(name) {
  if (name === 'root') return join(root, 'package.json')
  if (name === 'functions') return join(root, 'functions', 'package.json')
  return join(root, '.output', 'server', 'package.json')
}

function storageGaxios(name) {
  const manifestPath = anchor(name)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (name !== 'ssr') {
    assert.equal(manifest.overrides?.['gaxios@^6.0.0']?.uuid, '11.1.1',
      name + ' must keep the narrowly scoped gaxios 6 override')
  }
  const baseRequire = createRequire(manifestPath)
  const storageEntry = baseRequire.resolve('@google-cloud/storage')
  const gaxiosEntry = createRequire(storageEntry).resolve('gaxios')
  const gaxiosRequire = createRequire(gaxiosEntry)
  const gaxiosVersion = gaxiosRequire('gaxios/package.json').version
  const uuidVersion = gaxiosRequire('uuid/package.json').version
  assert.match(gaxiosVersion, /^6\./, 'test must exercise Storage gaxios 6, not another hoisted version')
  assert.equal(uuidVersion, '11.1.1', 'Storage gaxios 6 must resolve patched CommonJS uuid')
  return gaxiosRequire(gaxiosEntry).Gaxios
}

async function exerciseMultipart(Gaxios) {
  let received
  const server = createServer(async (req, res) => {
    try {
      const chunks = []
      let bytes = 0
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > 16_384) {
          res.writeHead(413)
          res.end()
          return
        }
        chunks.push(chunk)
      }
      received = {
        method: req.method,
        path: req.url,
        contentType: req.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    } catch {
      res.writeHead(500)
      res.end()
    }
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 10_000
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const port = server.address().port
    const response = await new Gaxios().request({
      url: 'http://127.0.0.1:' + port + '/multipart',
      method: 'POST',
      noProxy: ['127.0.0.1'],
      timeout: 5_000,
      responseType: 'json',
      multipart: [
        { headers: { 'Content-Type': 'text/plain' }, content: 'first-part' },
        { headers: { 'Content-Type': 'application/json' }, content: '{"n":2}' },
      ],
    })
    assert.equal(response.status, 200)
    assert.deepEqual(response.data, { ok: true })
    assert.equal(received?.method, 'POST')
    assert.equal(received?.path, '/multipart')
    const match = /^multipart\/related; boundary=(.+)$/.exec(received?.contentType || '')
    assert.ok(match, 'gaxios must send a multipart/related boundary')
    const boundary = match[1]
    assert.match(boundary, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    assert.equal(received.body,
      '--' + boundary + '\r\nContent-Type: text/plain\r\n\r\nfirst-part\r\n'
      + '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n{"n":2}\r\n'
      + '--' + boundary + '--')
  } finally {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

for (const name of choices) {
  test('Storage gaxios 6 multipart HTTP works with patched uuid in ' + name, { timeout: 15_000 }, async () => {
    await exerciseMultipart(storageGaxios(name))
  })
}

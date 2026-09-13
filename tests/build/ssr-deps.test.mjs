import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertSsrDeps } from '../../tools/assert-ssr-deps.mjs'

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'majstorsada-ssr-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const output = join(dir, 'output'), approved = join(dir, 'approved')
  const pkg = { name: 'test', main: 'index.mjs', engines: { node: '24' }, dependencies: { example: '1.2.3' } }
  const lock = { lockfileVersion: 3, packages: { '': { dependencies: { ...pkg.dependencies }, engines: { ...pkg.engines } }, 'node_modules/example': { version: '1.2.3', integrity: 'sha512-fixture' } } }
  const save = (folder, name, data) => writeFileSync(join(folder, name), JSON.stringify(data))
  for (const folder of [output, approved]) { mkdirSync(folder); save(folder, 'package.json', pkg); save(folder, 'package-lock.json', lock) }
  writeFileSync(join(output, 'index.mjs'), '')
  return { output, approved, pkg, lock, save, check: () => assertSsrDeps(output, approved) }
}
test('Reviewed SSR manifest and exact lockfile pass', t => assert.equal(fixture(t).check(), 1))
test('Missing generated lockfile blocks deploy', t => { const f = fixture(t); rmSync(join(f.output, 'package-lock.json')); assert.throws(f.check, /missing/) })
for (const version of ['latest', '^1.2.3', '~1.2.3', '*', 'https://example.test/pkg.tgz']) {
  test(`Floating SSR version ${version} blocks deploy`, t => { const f = fixture(t); f.pkg.dependencies.example = version; f.save(f.output, 'package.json', f.pkg); assert.throws(f.check, /exact version/) })
}
test('Wrong runtime blocks deploy', t => { const f = fixture(t); f.pkg.engines.node = '22'; f.save(f.output, 'package.json', f.pkg); assert.throws(f.check, /Node 24/) })
test('Wrong entry point blocks deploy', t => { const f = fixture(t); f.pkg.main = 'missing.js'; f.save(f.output, 'package.json', f.pkg); assert.throws(f.check, /index.mjs/) })
test('Unreviewed manifest change blocks deploy', t => { const f = fixture(t); f.pkg.type = 'module'; f.save(f.output, 'package.json', f.pkg); assert.throws(f.check, /manifest differs/) })
test('Manifest-lock mismatch blocks deploy', t => { const f = fixture(t); f.lock.packages[''].dependencies.example = '1.2.4'; f.save(f.output, 'package-lock.json', f.lock); assert.throws(f.check, /dependencies differ/) })
test('Wrong resolved direct version blocks deploy', t => { const f = fixture(t); f.lock.packages['node_modules/example'].version = '1.2.4'; f.save(f.output, 'package-lock.json', f.lock); assert.throws(f.check, /does not resolve/) })
test('Unreviewed transitive dependency change blocks deploy', t => { const f = fixture(t); f.lock.packages['node_modules/transitive'] = { version: '9.0.0' }; f.save(f.output, 'package-lock.json', f.lock); assert.throws(f.check, /lockfile differs/) })

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertSsrDeps } from '../../tools/assert-ssr-deps.mjs'
import { applySsrOverridePolicy, readApprovedOverrides } from '../../tools/dependency-policy.mjs'

function fixture(t, policy = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'majstorsada-ssr-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const output = join(dir, 'output'), approved = join(dir, 'approved')
  const pkg = { name: 'test', main: 'index.mjs', engines: { node: '24' }, dependencies: { example: '1.2.3' }, ...(Object.keys(policy).length ? { overrides: structuredClone(policy) } : {}) }
  const lock = { lockfileVersion: 3, packages: { '': { dependencies: { ...pkg.dependencies }, engines: { ...pkg.engines } }, 'node_modules/example': { version: '1.2.3', integrity: 'sha512-fixture' } } }
  const save = (folder, name, data) => writeFileSync(join(folder, name), JSON.stringify(data))
  for (const folder of [output, approved]) { mkdirSync(folder); save(folder, 'package.json', pkg); save(folder, 'package-lock.json', lock) }
  writeFileSync(join(output, 'index.mjs'), '')
  return { output, approved, pkg, lock, save, check: () => assertSsrDeps(output, approved, policy) }
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

const scopedPolicy = {
  '@firebase/firestore': { '@grpc/grpc-js': '1.14.5' },
  'gaxios@^6.0.0': { uuid: '11.1.1' },
  'source-map-js': '1.2.2',
  'proxy-addr': '2.0.8'
}
function scopedFixture(t) {
  const f = fixture(t, scopedPolicy)
  f.pkg.dependencies['@firebase/firestore'] = '4.17.2'
  f.lock.packages[''].dependencies['@firebase/firestore'] = '4.17.2'
  f.lock.packages['node_modules/@firebase/firestore'] = { version: '4.17.2', dependencies: { '@grpc/grpc-js': '~1.9.0' } }
  f.lock.packages['node_modules/@grpc/grpc-js'] = { version: '1.14.5' }
  // Both targeted packages are transitives; uuid is hoisted in the initial fixture.
  f.lock.packages['node_modules/@google-cloud/storage/node_modules/gaxios'] = { version: '6.7.1', dependencies: { uuid: '^9.0.1' } }
  f.lock.packages['node_modules/uuid'] = { version: '11.1.1' }
  f.lock.packages['node_modules/source-map-js'] = { version: '1.2.2' }
  f.lock.packages['node_modules/proxy-addr'] = { version: '2.0.8' }
  for (const folder of [f.output, f.approved]) {
    f.save(folder, 'package.json', f.pkg)
    f.save(folder, 'package-lock.json', f.lock)
  }
  return f
}

test('generated SSR manifest receives the approved scoped policy, including matching Nitro output', () => {
  const withPolicy = applySsrOverridePolicy({ dependencies: { example: '1.2.3' } }, scopedPolicy)
  assert.deepEqual(withPolicy.overrides, scopedPolicy)
  assert.deepEqual(applySsrOverridePolicy(withPolicy, scopedPolicy), withPolicy)
  assert.throws(() => applySsrOverridePolicy({ overrides: { unexpected: '1.0.0' } }, scopedPolicy), /different/)
  assert.throws(() => applySsrOverridePolicy({}, { gaxios: { uuid: '^11.1.1' } }), /exact version/)
})

test('approved scoped policy and its effective locked consumer versions pass', t => {
  const f = scopedFixture(t)
  assert.equal(f.check(), 2)
})

test('missing or mutated scoped override in either SSR manifest blocks deploy', t => {
  const f = scopedFixture(t)
  delete f.pkg.overrides
  f.save(f.output, 'package.json', f.pkg)
  assert.throws(f.check, /override policy differs/)
  f.pkg.overrides = { ...scopedPolicy, 'gaxios@^6.0.0': { uuid: '9.0.1' } }
  f.save(f.output, 'package.json', f.pkg)
  assert.throws(f.check, /override policy differs/)
  f.pkg.overrides = structuredClone(scopedPolicy)
  f.save(f.output, 'package.json', f.pkg)
  f.pkg.overrides['@firebase/firestore']['@grpc/grpc-js'] = '1.9.16'
  f.save(f.approved, 'package.json', f.pkg)
  assert.throws(f.check, /override policy differs/)
})

test('wrong nearest locked uuid or grpc version blocks deploy despite a correct manifest', t => {
  const f = scopedFixture(t)
  const nested = 'node_modules/@google-cloud/storage/node_modules/gaxios/node_modules/uuid'
  f.lock.packages[nested] = { version: '9.0.1' }
  f.save(f.output, 'package-lock.json', f.lock)
  assert.throws(f.check, /must resolve uuid@11\.1\.1/)
  delete f.lock.packages[nested]
  f.lock.packages['node_modules/@grpc/grpc-js'].version = '1.9.16'
  f.save(f.output, 'package-lock.json', f.lock)
  assert.throws(f.check, /must resolve @grpc\/grpc-js@1\.14\.5/)
})

test('every gaxios 6 consumer must resolve the pinned uuid, not just the first', t => {
  const f = scopedFixture(t)
  const other = 'node_modules/other/node_modules/gaxios'
  f.lock.packages[other] = { version: '6.7.1', dependencies: { uuid: '^9.0.1' } }
  f.lock.packages[other + '/node_modules/uuid'] = { version: '9.0.1' }
  f.save(f.output, 'package-lock.json', f.lock)
  assert.throws(f.check, /must resolve uuid@11\.1\.1/)
})
test('root override selector typo or missing policy cannot silently disable the scoped protection', t => {
  const dir = mkdtempSync(join(tmpdir(), 'majstorsada-ssr-policy-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'package.json')
  writeFileSync(path, JSON.stringify({ overrides: { '@firebase/firestore': { '@grpc/grpc-js': '1.14.5' }, 'gaxios@6.0.0': { uuid: '11.1.1' } } }))
  assert.throws(() => readApprovedOverrides(path), /missing required selector gaxios@\^6\.0\.0/)
  writeFileSync(path, JSON.stringify({ overrides: scopedPolicy }))
  assert.deepEqual(readApprovedOverrides(path), scopedPolicy)
})

for (const [dependency, oldVersion] of [['source-map-js', '1.2.1'], ['proxy-addr', '2.0.7']]) {
  test('global patch pin rejects hoisted and shadowed vulnerable ' + dependency + ' copies', t => {
    const f = scopedFixture(t), hoisted = 'node_modules/' + dependency
    f.lock.packages[hoisted].version = oldVersion
    f.save(f.output, 'package-lock.json', f.lock)
    assert.throws(f.check, /must resolve/)
    f.lock.packages[hoisted].version = scopedPolicy[dependency]
    f.lock.packages['node_modules/shadow/node_modules/' + dependency] = { version: oldVersion }
    f.save(f.output, 'package-lock.json', f.lock)
    assert.throws(f.check, /must resolve/)
  })
  test('global patch pin requires a locked ' + dependency + ' package', t => {
    const f = scopedFixture(t)
    delete f.lock.packages['node_modules/' + dependency]
    f.save(f.output, 'package-lock.json', f.lock)
    assert.throws(f.check, /has no locked package/)
  })
}

test('root policy cannot lose either global patch selector', t => {
  const dir = mkdtempSync(join(tmpdir(), 'majstorsada-ssr-global-policy-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'package.json')
  for (const dependency of ['source-map-js', 'proxy-addr']) {
    const policy = structuredClone(scopedPolicy)
    delete policy[dependency]
    writeFileSync(path, JSON.stringify({ overrides: policy }))
    assert.throws(() => readApprovedOverrides(path), /missing required selector/)
  }
})

test('global patch selectors cannot become a nested policy instead of a package version', t => {
  const f = scopedFixture(t)
  f.pkg.overrides['source-map-js'] = { '.': '1.2.2' }
  for (const folder of [f.output, f.approved]) f.save(folder, 'package.json', f.pkg)
  assert.throws(() => assertSsrDeps(f.output, f.approved, f.pkg.overrides), /must pin an exact version string/)
})

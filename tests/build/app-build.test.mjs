import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAppBuildId, resolveAppBuildId, buildIdEnv, buildIdPattern, inputFingerprint, environmentFingerprint, artifactFingerprint, projectRoot } from '../../tools/app-build-identity.mjs'
import { assertAppBuild, readArtifactBuildId } from '../../tools/assert-app-build.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'majstorsada-build-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true })
  commit(root)
  const write = (path, contents) => {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), typeof contents === 'string' ? contents : JSON.stringify(contents))
  }
  return { root, write }
}
function commit(root) {
  execFileSync('git', ['-c', 'user.name=Build Test', '-c', 'user.email=build@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'build fixture'], { cwd: root, windowsHide: true })
}
function artifacts(write, id) {
  write('.output/public/_nuxt/builds/latest.json', { id, timestamp: 123 })
  write('.output/public/_nuxt/builds/meta/' + id + '.json', { id, timestamp: 123 })
  write('.output/server/chunks/_/nitro.mjs', 'const _inlineRuntimeConfig = ' + JSON.stringify({ app: { buildId: id } }, null, 2) + ';\n')
  write('.output/public/_nuxt/fixture.js', 'export const value = 1')
  write('.output/public/index.html', '<html>fixture</html>')
}
function receipt(root, write, id, env = {}) {
  write('.output/build-receipt.json', { schema: 1, id, inputs: inputFingerprint(root), environment: environmentFingerprint(env), artifacts: artifactFingerprint(root) })
}

test('Successive builds of the same dirty revision have distinct valid IDs; config loads share the wrapper ID', t => {
  const { root, write } = fixture(t); write('app/page.vue', 'fixture')
  const first = createAppBuildId(root), second = createAppBuildId(root)
  assert.match(first, buildIdPattern); assert.match(second, buildIdPattern)
  assert.match(first, /-dirty-/); assert.notEqual(first, second)
  for (let load = 0; load < 3; load++) assert.equal(resolveAppBuildId(root, { [buildIdEnv]: first }), first)
  assert.equal(resolveAppBuildId(root, { NODE_ENV: 'development', [buildIdEnv]: 'bad' }), 'dev')
})

test('Missing Git and invalid inherited identities fail closed', t => {
  const root = mkdtempSync(join(tmpdir(), 'majstorsada-no-git-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.throws(() => createAppBuildId(root), /Git revision/)
  assert.throws(() => resolveAppBuildId(root, { [buildIdEnv]: '35a47f7-dirty' }), /Invalid app build identity/)
  assert.throws(() => resolveAppBuildId(root, { [buildIdEnv]: '../escape' }), /Invalid app build identity/)
})

test('The gate accepts one matching private receipt, Hosting manifests and compiled SSR', t => {
  const { root, write } = fixture(t), id = createAppBuildId(root)
  artifacts(write, id); receipt(root, write, id)
  assert.equal(readArtifactBuildId(root), id); assert.equal(assertAppBuild(root, {}), id)
  assert.equal(assertAppBuild(root, { PATH: 'unrelated', npm_lifecycle_event: 'deploy', MAJSTORSADA_APP_BUILD_ID: 'ignored' }), id)
  assert.equal(existsSync(join(root, '.output/public/build-receipt.json')), false)
})

test('Source changes, new files, deleted files and changed HEAD invalidate an old build', async t => {
  for (const change of ['modified', 'new', 'deleted', 'HEAD']) await t.test(change, t => {
    const { root, write } = fixture(t), id = createAppBuildId(root)
    write('app/page.vue', 'before'); artifacts(write, id); receipt(root, write, id)
    if (change === 'modified') write('app/page.vue', 'after')
    if (change === 'new') write('public/new.txt', 'untracked input')
    if (change === 'deleted') rmSync(join(root, 'app/page.vue'))
    if (change === 'HEAD') commit(root)
    assert.throws(() => assertAppBuild(root, {}), /inputs changed/)
  })
})

test('Dotenv and effective Nuxt environment changes invalidate a build without exposing values', t => {
  const { root, write } = fixture(t), id = createAppBuildId(root)
  const secret = 'private-fixture-value-not-for-console'
  write('.env.production', 'PRIVATE=' + secret); artifacts(write, id)
  receipt(root, write, id, { NUXT_PUBLIC_SITE_URL: 'https://example.invalid' })
  assert.equal(assertAppBuild(root, { NUXT_PUBLIC_SITE_URL: 'https://example.invalid' }), id)
  assert.throws(() => assertAppBuild(root, {}), /inputs changed/)
  const saved = readFileSync(join(root, '.output/build-receipt.json'), 'utf8')
  assert.equal(saved.includes(secret), false)
  write('.env.production', 'PRIVATE=changed')
  assert.throws(() => assertAppBuild(root, { NUXT_PUBLIC_SITE_URL: 'https://example.invalid' }), /inputs changed/)
})

test('Tampered assets and deleted server files invalidate the receipt', async t => {
  for (const path of ['.output/public/_nuxt/fixture.js', '.output/public/index.html', '.output/server/index.mjs']) await t.test(path, t => {
    const { root, write } = fixture(t), id = createAppBuildId(root)
    artifacts(write, id); write('.output/server/index.mjs', 'fixture'); receipt(root, write, id)
    rmSync(join(root, path))
    assert.throws(() => assertAppBuild(root, {}), /artifacts changed/)
  })
})

test('Mixed SSR/Hosting, mixed metadata and forged receipt identities fail before deployment', async t => {
  for (const change of ['SSR', 'metadata', 'receipt']) await t.test(change, t => {
    const { root, write } = fixture(t), id = createAppBuildId(root), other = createAppBuildId(root)
    artifacts(write, id); receipt(root, write, id)
    if (change === 'SSR') write('.output/server/chunks/_/nitro.mjs', 'const _inlineRuntimeConfig = ' + JSON.stringify({ app: { buildId: other } }, null, 2) + ';\n')
    if (change === 'metadata') write('.output/public/_nuxt/builds/meta/' + id + '.json', { id: other, timestamp: 123 })
    if (change === 'receipt') write('.output/build-receipt.json', { schema: 1, id: other })
    assert.throws(() => assertAppBuild(root, {}), /different builds|does not match/)
  })
})

test('Manifest paths cannot traverse directories; generated runtime is parsed without evaluation', t => {
  const { root, write } = fixture(t), id = createAppBuildId(root)
  artifacts(write, id)
  write('.output/server/chunks/_/nitro.mjs', 'globalThis.untrustedBuildExecuted = true;\nconst _inlineRuntimeConfig = ' + JSON.stringify({ app: { buildId: id } }, null, 2) + ';\n')
  assert.equal(readArtifactBuildId(root), id)
  assert.equal(globalThis.untrustedBuildExecuted, undefined)
  write('.output/public/_nuxt/builds/latest.json', { id: '../escape', timestamp: 123 })
  assert.throws(() => readArtifactBuildId(root), /Invalid app manifest identity/)
})

test('SSR refresh allows only reviewed dependency file changes during its input check', t => {
  const { root, write } = fixture(t)
  write('deploy/ssr/package-lock.json', '{}')
  const normal = inputFingerprint(root), refresh = inputFingerprint(root, { omitReviewedDeps: true })
  write('deploy/ssr/package-lock.json', '{"reviewed":true}')
  assert.notEqual(inputFingerprint(root), normal)
  assert.equal(inputFingerprint(root, { omitReviewedDeps: true }), refresh)
  write('app/page.vue', 'changed during refresh')
  assert.notEqual(inputFingerprint(root, { omitReviewedDeps: true }), refresh)
})

function wrapperFixture(t) {
  const f = fixture(t)
  for (const name of ['build-app.mjs', 'app-build-identity.mjs', 'assert-app-build.mjs']) {
    f.write('tools/' + name, '')
    copyFileSync(join(projectRoot, 'tools', name), join(f.root, 'tools', name))
  }
  f.write('tools/prepare-ssr.mjs', '// local fake preparation for wrapper integration\n')
  f.write('node_modules/nuxt/bin/nuxt.mjs', "import { mkdirSync, writeFileSync } from 'node:fs';\n" +
    "const write=(p,v)=>{mkdirSync(p+'/..',{recursive:true});writeFileSync(p,v)};\n" +
    "const id=process.env.MAJSTORSADA_APP_BUILD_ID;\n" +
    "write('.output/public/_nuxt/builds/latest.json',JSON.stringify({id,timestamp:123}));\n" +
    "write('.output/public/_nuxt/builds/meta/'+id+'.json',JSON.stringify({id,timestamp:123}));\n" +
    "write('.output/server/chunks/_/nitro.mjs','const _inlineRuntimeConfig = '+JSON.stringify({app:{buildId:id}},null,2)+';\\n');\n" +
    "if(process.env.FIXTURE_DRIFT==='true')write('app/drift.vue','changed during build');\n")
  const run = env => spawnSync(process.execPath, ['tools/build-app.mjs'], {
    cwd: f.root, env: { ...process.env, npm_execpath: 'fixture-only', ...env }, encoding: 'utf8', windowsHide: true,
  })
  return { ...f, run }
}

test('Two actual wrapper invocations mint different IDs and verify their own generated artifacts', t => {
  const { root, run } = wrapperFixture(t)
  const first = run({}); assert.equal(first.status, 0, first.stderr)
  const id = JSON.parse(readFileSync(join(root, '.output/build-receipt.json'), 'utf8')).id
  const second = run({}); assert.equal(second.status, 0, second.stderr)
  const other = JSON.parse(readFileSync(join(root, '.output/build-receipt.json'), 'utf8')).id
  assert.notEqual(id, other)
})

test('A failed or source-drifting build removes its old receipt and cannot be deployed', t => {
  const { root, write, run } = wrapperFixture(t)
  assert.equal(run({}).status, 0)
  const drift = run({ FIXTURE_DRIFT: 'true' }); assert.equal(drift.status, 1)
  assert.match(drift.stderr, /changed during the build/)
  assert.equal(existsSync(join(root, '.output/build-receipt.json')), false)
  write('node_modules/nuxt/bin/nuxt.mjs', 'process.exit(1)')
  write('.output/build-receipt.json', '{}')
  const failed = run({}); assert.equal(failed.status, 1)
  assert.equal(existsSync(join(root, '.output/build-receipt.json')), false)
})

test('Adding automatic Nuxt configuration or a layer invalidates the build receipt', async t => {
  for (const path of ['.nuxtrc', '.nuxtignore', 'layers/example/nuxt.config.ts']) await t.test(path, t => {
    const { root, write } = fixture(t), id = createAppBuildId(root)
    artifacts(write, id); receipt(root, write, id)
    write(path, 'new build input')
    assert.throws(() => assertAppBuild(root, {}), /inputs changed/)
  })
})

test('Runtime identity overrides are rejected in config and gate; server preset is fingerprinted', t => {
  const { root, write } = fixture(t), id = createAppBuildId(root)
  artifacts(write, id); receipt(root, write, id)
  for (const key of ['NUXT_APP_BUILD_ID', 'NITRO_APP_BUILD_ID', 'nuxt_app_build_id']) {
    const env = { [key]: 'stale-runtime-id', [buildIdEnv]: id }
    assert.throws(() => resolveAppBuildId(root, env), /overrides are not allowed/)
    assert.throws(() => assertAppBuild(root, env), /overrides are not allowed/)
  }
  assert.throws(() => assertAppBuild(root, { SERVER_PRESET: 'node-server' }), /inputs changed/)
})

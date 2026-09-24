import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import * as vue from 'vue'
const require = createRequire(import.meta.url)
const ts = createRequire(new URL('../../functions/package.json', import.meta.url))('typescript')
const source = ts.transpileModule(readFileSync('app/composables/usePagedQuery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
async function fixture() {
  const auth = vue.shallowReactive({ currentUser: { uid: 'one' } }), requests = []
  const context = vm.createContext({ Set })
  const dependency = exports => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value) }, { context })
  const firestore = {
    query: (base, ...constraints) => ({ base, constraints }), limit: size => ({ size }), startAfter: doc => ({ after: doc.id }),
    getDocs: q => new Promise((resolve, reject) => { requests.push({ q, resolve, reject }) })
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link(name => dependency(name === 'vue' ? vue : name === 'firebase/firestore' ? firestore : { useAuthStore: () => auth }))
  await module.evaluate()
  const scope = vue.effectScope(), pages = scope.run(() => module.namespace.usePagedQuery(3))
  const result = ids => ({ size: ids.length, docs: ids.map(id => ({ id, data: () => ({ text: id }) })) })
  return { auth, requests, pages, result, stop: () => scope.stop() }
}

test('History requests only the next three documents and retains the cursor on failure', async () => {
  const f = await fixture(); f.pages.reset('history')
  let pending = f.pages.more(); assert.equal(f.requests[0].q.constraints[0].size, 3)
  f.requests[0].resolve(f.result(['a','b','c'])); await pending
  pending = f.pages.more(); assert.equal(f.requests[1].q.constraints[0].after, 'c')
  f.requests[1].reject(new Error('offline')); await pending
  assert.equal(f.pages.rows.value.length, 3); assert.ok(f.pages.error.value)
  pending = f.pages.more(); assert.equal(f.requests[2].q.constraints[0].after, 'c')
  f.requests[2].resolve(f.result(['d','e','f'])); await pending
  assert.equal(f.pages.rows.value.map(row => row.jobId).join(','), 'a,b,c,d,e,f')
  f.stop()
})
test('Double clicks share one request, and logout discards an in-flight private page', async () => {
  const f = await fixture(); f.pages.reset('history')
  const pending = f.pages.more(); await f.pages.more(); assert.equal(f.requests.length, 1)
  f.auth.currentUser = null
  f.requests[0].resolve(f.result(['private'])); await pending
  assert.equal(f.pages.rows.value.length, 0); assert.equal(f.pages.hasMore.value, false)
  f.stop()
})
test('Refresh and disposal prevent a late old page from replacing the current result', async () => {
  const f = await fixture(); f.pages.reset('history')
  const old = f.pages.more(), fresh = f.pages.refresh()
  f.requests[1].resolve(f.result(['new'])); await fresh
  f.requests[0].resolve(f.result(['old'])); await old
  assert.equal(f.pages.rows.value[0].jobId, 'new'); assert.equal(f.pages.hasMore.value, false)
  const pending = f.pages.refresh(); f.stop(); f.requests[2].resolve(f.result(['after-dispose'])); await pending
  assert.equal(f.pages.rows.value.length, 0)
})

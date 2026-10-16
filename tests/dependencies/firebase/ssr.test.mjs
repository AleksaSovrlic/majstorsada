import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PROJECT_ID = 'demo-majstorsada-dependencies'
// Fail closed before loading any SDK. These tests have no cloud fallback.
assert.equal(process.env.GCLOUD_PROJECT, PROJECT_ID, 'Use the dependency Firestore emulator runner')
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8289', 'Local Firestore emulator required')

const manifestPath = fileURLToPath(new URL('../../../.output/server/package.json', import.meta.url))
const ssrRequire = createRequire(manifestPath)
const runtimeDir = dirname(manifestPath)
function fromSsr(loader, name) {
  const entry = loader.resolve(name)
  const path = relative(runtimeDir, entry)
  assert.ok(!isAbsolute(path) && path.startsWith('node_modules') && !path.startsWith('..'),
    name + ' must resolve from the compiled SSR runtime, never the root or Functions SDK tree')
  return entry
}
const appEntry = fromSsr(ssrRequire, 'firebase-admin/app')
const firestoreEntry = fromSsr(ssrRequire, 'firebase-admin/firestore')
const cloudEntry = fromSsr(createRequire(firestoreEntry), '@google-cloud/firestore')
const gaxEntry = fromSsr(createRequire(cloudEntry), 'google-gax')
fromSsr(createRequire(gaxEntry), '@grpc/grpc-js')
const { initializeApp, deleteApp } = ssrRequire(appEntry)
const { getFirestore, FieldValue, Timestamp } = ssrRequire(firestoreEntry)

async function withDatabase(run) {
  const app = initializeApp({ projectId: PROJECT_ID }, 'ssr-dependencies-' + randomUUID())
  let db
  try {
    db = getFirestore(app)
    // Exercise the gRPC implementation used by the SSR server.
    db.settings({ host: '127.0.0.1:8289', ssl: false, preferRest: false })
    const collection = db.collection('dependencyMaintenance').doc(randomUUID()).collection('records')
    await run(db, collection)
  } finally {
    try { if (db) await db.terminate() }
    finally { await deleteApp(app) }
  }
}

test('Compiled SSR Admin SDK writes, reads and queries Firestore through its real gRPC dependencies',
  { timeout: 30_000 }, async () => {
    await withDatabase(async (db, collection) => {
      const first = collection.doc('first'), second = collection.doc('second')
      const batch = db.batch()
      batch.set(first, { state: 'pending', position: 1, createdAt: FieldValue.serverTimestamp() })
      batch.set(second, { state: 'completed', position: 2, createdAt: FieldValue.serverTimestamp() })
      await batch.commit()
      const snapshot = await first.get()
      assert.equal(snapshot.exists, true)
      assert.equal(snapshot.get('state'), 'pending')
      assert.ok(snapshot.get('createdAt') instanceof Timestamp, 'Admin timestamp serialization must round-trip')
      const matches = await collection.where('state', '==', 'pending').get()
      assert.deepEqual(matches.docs.map(doc => doc.id), ['first'])
      const all = await collection.orderBy('position').get()
      assert.deepEqual(all.docs.map(doc => doc.id), ['first', 'second'])
      await Promise.all([first.delete(), second.delete()])
      assert.equal((await collection.get()).empty, true)
    })
  })

test('Compiled SSR Admin SDK preserves both concurrent transactional increments',
  { timeout: 60_000 }, async () => {
    await withDatabase(async (db, collection) => {
      const counter = collection.doc('counter')
      await counter.set({ count: 0 })
      const increment = () => db.runTransaction(async transaction => {
        const snapshot = await transaction.get(counter)
        assert.equal(snapshot.exists, true)
        transaction.update(counter, { count: snapshot.get('count') + 1 })
      })
      await Promise.all([increment(), increment()])
      assert.equal((await counter.get()).get('count'), 2, 'Concurrent commits must not lose an increment')
      await counter.delete()
    })
  })

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db, requireFunctions, Timestamp } from './helpers.mjs'
const { runOtpMaintenance } = requireFunctions('./lib/otpMaintenance.js')
test('maintenance deletes only overdue OTP records; retains live flows and business data', async () => {
  const now = Date.now(), refs = ['_otpChallenges/maintenance_old', '_otpRateStates/maintenance_old', '_otpChallenges/maintenance_live', '_otpRateStates/maintenance_live', 'clients/maintenance_client', 'jobs/maintenance_job']
  await Promise.all(refs.map((path, index) => db.doc(path).set({ marker: true, deleteAfter: Timestamp.fromMillis(now + (index < 2 ? -1 : 60_000)) })))
  const dry = await runOtpMaintenance(db, now, true)
  assert.equal(dry.deleted, 0)
  assert.equal((await db.doc(refs[0]).get()).exists, true)
  const done = await runOtpMaintenance(db, now)
  assert.ok(done.deleted >= 2)
  for (let index = 0; index < refs.length; index++) assert.equal((await db.doc(refs[index]).get()).exists, index >= 2)
  await Promise.all(refs.map(path => db.doc(path).delete()))
})
test('maintenance preserves concurrently refreshed rate state', async () => {
  const now = Date.now(), ref = db.doc('_otpRateStates/maintenance_race')
  await ref.set({ deleteAfter: Timestamp.fromMillis(now - 1) })
  let raced = false
  const proxy = { collection(name) {
    return { where(...args) {
      const query = db.collection(name).where(...args)
      return { orderBy(...order) { const ordered = query.orderBy(...order); return { limit(size) { return { async get() {
        const page = await ordered.limit(size).get()
        if (name === '_otpRateStates' && page.docs.some(doc => doc.id === ref.id)) { await ref.update({ deleteAfter: Timestamp.fromMillis(now + 60_000) }); raced = true }
        return page
      } } } } } }
    } }
  } }
  const result = await runOtpMaintenance(proxy, now)
  assert.equal(raced, true); assert.ok(result.refreshed >= 1)
  assert.equal((await ref.get()).exists, true)
  await ref.delete()
})

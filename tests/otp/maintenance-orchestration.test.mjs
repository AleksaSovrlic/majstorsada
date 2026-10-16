import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { runScheduledMaintenance, OTP_MAINTENANCE_BUDGET_MS } = require('./lib/maintenanceOrchestration.js')
const { runOtpMaintenance } = require('./lib/otpMaintenance.js')

function orchestration(overrides = {}) {
  return {
    runJobs: async () => ({ failures: [] }),
    runOtp: async () => ({ deferred: false }),
    logJobs: () => {}, logOtp: () => {}, logOtpFailure: () => {},
    now: () => 100, ...overrides,
  }
}

test('scheduled maintenance awaits and logs business work before starting OTP cleanup', async () => {
  const events = [], jobReport = { failures: ['business-retry'] }, otpReport = { deferred: false }
  await runScheduledMaintenance(orchestration({
    runJobs: async () => { events.push('jobs:start'); await Promise.resolve(); events.push('jobs:end'); return jobReport },
    logJobs: report => { assert.equal(report, jobReport); events.push('jobs:log') },
    runOtp: async () => { events.push('otp:start'); await Promise.resolve(); events.push('otp:end'); return otpReport },
    logOtp: report => { assert.equal(report, otpReport); events.push('otp:log') },
  }))
  assert.deepEqual(events, ['jobs:start', 'jobs:end', 'jobs:log', 'otp:start', 'otp:end', 'otp:log'])
})

test('an OTP cleanup failure is isolated after successful business work', async () => {
  const events = []
  await runScheduledMaintenance(orchestration({
    runJobs: async () => { events.push('jobs'); return { failures: [] } },
    logJobs: () => events.push('jobs:log'),
    runOtp: async () => { events.push('otp'); throw new Error('cleanup unavailable') },
    logOtp: () => assert.fail('Failed cleanup must not report success'),
    logOtpFailure: () => events.push('otp:failure'),
  }))
  assert.deepEqual(events, ['jobs', 'jobs:log', 'otp', 'otp:failure'])
})

test('an auxiliary OTP reporting failure cannot fail completed business maintenance', async () => {
  let businessLogged = false
  await runScheduledMaintenance(orchestration({
    logJobs: () => { businessLogged = true },
    logOtp: () => { throw new Error('reporting failed') },
    logOtpFailure: () => { throw new Error('error reporting failed') },
  }))
  assert.equal(businessLogged, true)
})

test('business failure retains its original rejection and does not start OTP cleanup', async () => {
  const error = new Error('business unavailable')
  await assert.rejects(runScheduledMaintenance(orchestration({
    runJobs: async () => { throw error },
    runOtp: async () => assert.fail('OTP cannot start after failed business maintenance'),
    logJobs: () => assert.fail('Failed business maintenance must not report success'),
    logOtpFailure: () => assert.fail('Business error is not an OTP failure'),
  })), actual => actual === error)
})

test('business reporting failure retains the original scheduler rejection', async () => {
  const error = new Error('business reporting unavailable')
  await assert.rejects(runScheduledMaintenance(orchestration({
    logJobs: () => { throw error },
    runOtp: async () => assert.fail('OTP cannot start after failed business reporting'),
  })), actual => actual === error)
})

test('OTP deadline is anchored to scheduler start instead of extending after business work', async () => {
  let time = 100
  await runScheduledMaintenance(orchestration({
    now: () => time,
    runJobs: async () => { time += 200_000; return { failures: [] } },
    runOtp: async deadline => {
      assert.equal(deadline, 100 + OTP_MAINTENANCE_BUDGET_MS)
      assert.equal(deadline - time, 40_000)
      return { deferred: false }
    },
  }))
  assert.equal(OTP_MAINTENANCE_BUDGET_MS, 240_000)
})

function cleanupFixture({ onQuery = () => {}, onDelete = () => {}, records = 2 } = {}) {
  const documents = Array.from({ length: records }, (_, index) => ({
    id: 'candidate-' + index, updateTime: { fixture: index },
    retained: true,
    ref: { async delete(options) {
      assert.deepEqual(options, { lastUpdateTime: documents[index].updateTime })
      onDelete(index)
      documents[index].retained = false
    } },
  }))
  const queried = []
  const db = { collection(name) {
    return { where(field, operator, value) {
      assert.equal(field, 'deleteAfter'); assert.equal(operator, '<='); assert.equal(value.toMillis(), 1234)
      return { orderBy(order) {
        assert.equal(order, 'deleteAfter')
        return { limit(limit) {
          assert.equal(limit, 100)
          return { async get() {
            queried.push(name); onQuery(name)
            const docs = name === '_otpChallenges' ? documents : []
            return { docs, size: docs.length }
          } }
        } }
      } }
    } }
  } }
  return { db, documents, queried }
}

test('an exhausted cleanup budget defers before issuing any query', async () => {
  const fixture = cleanupFixture()
  const report = await runOtpMaintenance(fixture.db, 1234, false, { deadline: 100, clock: () => 100 })
  assert.deepEqual(report, { dryRun: false, candidates: 0, deleted: 0, refreshed: 0, deferred: true })
  assert.deepEqual(fixture.queried, [])
  assert.ok(fixture.documents.every(doc => doc.retained))
})

test('a query that uses the remaining budget retains its candidates for the next pass', async () => {
  let time = 0
  const fixture = cleanupFixture({ onQuery: () => { time = 100 } })
  const report = await runOtpMaintenance(fixture.db, 1234, false, { deadline: 100, clock: () => time })
  assert.deepEqual(report, { dryRun: false, candidates: 2, deleted: 0, refreshed: 0, deferred: true })
  assert.deepEqual(fixture.queried, ['_otpChallenges'])
  assert.ok(fixture.documents.every(doc => doc.retained))
})

test('cleanup checks its budget between awaited deletes and retains the remaining candidates', async () => {
  let time = 0
  const fixture = cleanupFixture({ onDelete: () => { time = 100 } })
  const report = await runOtpMaintenance(fixture.db, 1234, false, { deadline: 100, clock: () => time })
  assert.deepEqual(report, { dryRun: false, candidates: 2, deleted: 1, refreshed: 0, deferred: true })
  assert.deepEqual(fixture.documents.map(doc => doc.retained), [false, true])
  assert.deepEqual(fixture.queried, ['_otpChallenges'])
})

test('cleanup reports a complete pass and queries only the two OTP collections when budget remains', async () => {
  const fixture = cleanupFixture()
  const report = await runOtpMaintenance(fixture.db, 1234, false, { deadline: 100, clock: () => 0 })
  assert.deepEqual(report, { dryRun: false, candidates: 2, deleted: 2, refreshed: 0, deferred: false })
  assert.deepEqual(fixture.queried, ['_otpChallenges', '_otpRateStates'])
})

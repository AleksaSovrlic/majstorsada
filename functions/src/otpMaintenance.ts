import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'

// Reuse the existing maintenance schedule. Small passes and update-time guards
// preserve documents refreshed while the cleanup query was in flight.
export async function runOtpMaintenance(db: Firestore = getFirestore(), now = Date.now(), dryRun = false,
  { deadline = Infinity, clock = Date.now }: { deadline?: number; clock?: () => number } = {}) {
  const report = { dryRun, candidates: 0, deleted: 0, refreshed: 0, deferred: false }
  const outOfTime = () => {
    if (clock() < deadline) return false
    report.deferred = true
    return true
  }
  for (const collection of ['_otpChallenges', '_otpRateStates']) {
    if (outOfTime()) return report
    const page = await db.collection(collection).where('deleteAfter', '<=', Timestamp.fromMillis(now)).orderBy('deleteAfter').limit(100).get()
    report.candidates += page.size
    if (dryRun) continue
    for (const doc of page.docs) {
      if (outOfTime()) return report
      try { await doc.ref.delete({ lastUpdateTime: doc.updateTime }); report.deleted++ }
      catch (error: any) {
        if (error?.code === 9 || error?.code === 5) report.refreshed++
        else throw error
      }
    }
  }
  return report
}

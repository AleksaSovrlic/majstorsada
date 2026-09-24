import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { jobImagesBucket, requireWritesEnabled } from './jobLifecycle'
import { isExpired, photoDeletionAt, millis, DAY } from './jobPolicy'

// Small bounded passes; repeat safely after timeouts or overlapping scheduler deliveries.
// No user document or contact is deleted. Never infer object paths from client input.
export async function runJobMaintenance(dryRun = true, now = Date.now()) {
  if (!dryRun) requireWritesEnabled()
  const db = getFirestore(), report = { dryRun, expired: [] as string[], photos: [] as string[], dismissals: 0, staging: [] as string[], staleTokens: 0, failures: [] as string[] }
  const expired = await db.collection('jobs').where('status', '==', 'pending').where('expiresAt', '<=', Timestamp.fromMillis(now)).orderBy('expiresAt').limit(100).get()
  for (const doc of expired.docs) {
    const changed = await db.runTransaction(async tx => {
      const job = (await tx.get(doc.ref)).data()
      if (!job || !isExpired(job, now) || job.acceptedByTradespersonId) return false
      if (!dryRun) tx.update(doc.ref, {
        status: 'expired', expiredAt: Timestamp.fromMillis(now),
        // Allow in-flight functions (60 s maximum) to settle before abandoned upload cleanup.
        photosDeleteAt: job.imagesReady ? photoDeletionAt(now) : Timestamp.fromMillis(now + 10 * 60_000),
      })
      return true
    })
    if (changed) report.expired.push(doc.id)
  }
  const due = await db.collection('jobs').where('photosDeleteAt', '<=', Timestamp.fromMillis(now)).orderBy('photosDeleteAt').limit(100).get()
  for (const doc of due.docs) {
    try {
      const owner = await db.runTransaction(async tx => {
        const job = (await tx.get(doc.ref)).data()
        if (!job || !['completed', 'canceled', 'expired'].includes(job.status) || !millis(job.photosDeleteAt) || millis(job.photosDeleteAt) > now) return null
        if (!dryRun) tx.update(doc.ref, { photoCleanupState: 'deleting' })
        return job.clientId as string
      })
      if (!owner) continue
      report.photos.push(doc.id)
      if (dryRun) continue
      const bucket = jobImagesBucket()
      // Delete only the six known slots; never list the bucket or delete a prefix.
      await Promise.all(Array.from({ length: 3 }, (_, slot) => [
        bucket.file(`jobs/${doc.id}/${slot}.jpg`).delete({ ignoreNotFound: true }),
        bucket.file(`job-uploads/${owner}/${doc.id}/${slot}.jpg`).delete({ ignoreNotFound: true }),
      ]).flat())
      await doc.ref.update({ imagePaths: [], photosDeletedAt: FieldValue.serverTimestamp(), photoCleanupState: 'done', photosDeleteAt: FieldValue.delete(), stagingCleanupAt: FieldValue.delete() })
    } catch { report.failures.push(doc.id) }
  }
  const staging = await db.collection('jobs').where('stagingCleanupAt', '<=', Timestamp.fromMillis(now)).orderBy('stagingCleanupAt').limit(100).get()
  for (const doc of staging.docs) {
    const job = doc.data()
    if (job.imagesReady !== true) continue
    report.staging.push(doc.id)
    if (dryRun) continue
    try {
      await Promise.all(Array.from({ length: 3 }, (_, slot) => jobImagesBucket().file(`job-uploads/${job.clientId}/${doc.id}/${slot}.jpg`).delete({ ignoreNotFound: true })))
      await doc.ref.update({ stagingCleanupAt: FieldValue.delete() })
    } catch { report.failures.push(doc.id) }
  }
  const stale = await db.collectionGroup('fcmTokens').where('lastSeenAt', '<=', Timestamp.fromMillis(now - 90 * DAY)).limit(100).get()
  report.staleTokens = stale.size
  if (!dryRun) for (const doc of stale.docs) {
    try { await doc.ref.delete({ lastUpdateTime: doc.updateTime }) }
    catch { report.failures.push('stale-token') } // A concurrently refreshed token must survive.
  }
  const dismissals = await db.collectionGroup('dismissedJobs').where('expiresAt', '<=', Timestamp.fromMillis(now)).limit(100).get()
  report.dismissals = dismissals.size
  if (!dryRun && !dismissals.empty) {
    const batch = db.batch(); dismissals.docs.forEach(doc => batch.delete(doc.ref, { lastUpdateTime: doc.updateTime })); await batch.commit()
  }
  return report
}

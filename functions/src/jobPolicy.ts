import { Timestamp } from 'firebase-admin/firestore'

export const DAY = 24 * 60 * 60 * 1000
export const JOB_POLICY = { dailyLimit: 2, pendingLimit: 2, cooldownMs: 60_000, lifetimeMs: DAY, photoRetentionMs: 7 * DAY } as const
export function millis(value: any): number { return value?.toMillis?.() || (value instanceof Date ? value.getTime() : 0) }
export function deadline(job: any): number {
  return millis(job.expiresAt) || (millis(job.imagesReady ? job.imagesUpdatedAt || job.createdAt : job.createdAt) + DAY)
}
export function isExpired(job: any, now = Date.now()): boolean { return job.status === 'pending' && deadline(job) <= now }
export function photoDeletionAt(now = Date.now()) { return Timestamp.fromMillis(now + JOB_POLICY.photoRetentionMs) }

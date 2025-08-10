import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

initializeApp()

export const health = onRequest({ region: 'europe-west3' }, (req, res) => {
  res.status(200).send({ ok: true, service: 'functions', env: process.env.NODE_ENV || 'development' })
})

export const acceptJob = onCall({ region: 'europe-west3' }, async (request) => {
  const auth = request.auth
  const data = request.data as { jobId?: string }

  if (!auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.')
  }
  if (!data?.jobId || typeof data.jobId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid jobId.')
  }

  const db = getFirestore()
  const jobRef = db.collection('jobs').doc(data.jobId)
  const tradespersonRef = db.collection('tradespeople').doc(auth.uid)

  try {
    const result = await db.runTransaction(async (tx) => {
      const [jobSnap, tradespersonSnap] = await Promise.all([
        tx.get(jobRef),
        tx.get(tradespersonRef)
      ])

      if (!jobSnap.exists) {
        throw new HttpsError('not-found', 'Job does not exist.')
      }
      const job = jobSnap.data() as any

      if (job.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Job is not available for acceptance.')
      }

      if (!tradespersonSnap.exists) {
        throw new HttpsError('permission-denied', 'Tradesperson profile not found.')
      }
      const tp = tradespersonSnap.data() as any

      const tokens = Number(tp.balanceTokens ?? 0)
      if (!Number.isFinite(tokens) || tokens <= 0) {
        throw new HttpsError('failed-precondition', 'Insufficient tokens.')
      }

      // Apply updates atomically
      tx.update(jobRef, {
        status: 'accepted',
        acceptedByTradespersonId: auth.uid
      })
      tx.update(tradespersonRef, {
        balanceTokens: FieldValue.increment(-1)
      })

      return { jobId: data.jobId, acceptedBy: auth.uid }
    })

    logger.info('acceptJob success', result)
    return { ok: true, ...result }
  } catch (error: any) {
    if (error instanceof HttpsError) {
      logger.warn('acceptJob failed (HttpsError)', { code: error.code, message: error.message })
      throw error
    }
    logger.error('acceptJob failed (unexpected)', { message: error?.message, stack: error?.stack })
    throw new HttpsError('internal', 'Unexpected error during acceptJob.')
  }
})

export const buyTokens = onCall({ region: 'europe-west3' }, async (request) => {
  const auth = request.auth
  const data = request.data as { paketId?: string }
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.')
  }
  const paketId = data?.paketId
  if (!paketId || typeof paketId !== 'string') {
    throw new HttpsError('invalid-argument', 'paketId is required.')
  }

  logger.info('buyTokens requested', { paketId, uid: auth.uid })
  // Payment integration will be implemented later
  return { ok: true, paketId }
})



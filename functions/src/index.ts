import { HttpsError, onRequest } from 'firebase-functions/v2/https'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { region } from 'firebase-functions'
import * as logger from 'firebase-functions/logger'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import cors from 'cors'

initializeApp()

export const health = onRequest({ region: 'europe-west3' }, (req, res) => {
  res.status(200).send({ ok: true, service: 'functions', env: process.env.NODE_ENV || 'development' })
})

const corsHandler = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    const allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    callback(null, allowed)
  },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  optionsSuccessStatus: 204
})

async function verifyBearer(req: any): Promise<{ uid: string; email?: string } | null> {
  try {
    const header: string = req.get('Authorization') || ''
    const match = header.match(/^Bearer\s+(.+)$/i)
    if (!match) return null
    const decoded = await getAuth().verifyIdToken(match[1])
    return { uid: decoded.uid, email: decoded.email }
  } catch {
    return null
  }
}

export const acceptJob = onRequest({ region: 'europe-west3' }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') return res.status(204).send('')
    if (req.method !== 'POST') return res.status(405).send({ error: 'Method Not Allowed' })

    const auth = await verifyBearer(req)
    if (!auth) return res.status(401).send({ error: 'Authentication required.' })

    const data = (req.body?.data || {}) as { jobId?: string }
    if (!data?.jobId || typeof data.jobId !== 'string') {
      return res.status(400).send({ error: 'Missing or invalid jobId.' })
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
          return Promise.reject({ code: 404, message: 'Job does not exist.' })
        }
        const job = jobSnap.data() as any

        if (job.status !== 'pending') {
          return Promise.reject({ code: 412, message: 'Job is not available for acceptance.' })
        }

        if (!tradespersonSnap.exists) {
          return Promise.reject({ code: 403, message: 'Tradesperson profile not found.' })
        }
        const tp = tradespersonSnap.data() as any

        const tokens = Number(tp.balanceTokens ?? 0)
        if (!Number.isFinite(tokens) || tokens <= 0) {
          return Promise.reject({ code: 412, message: 'Nemate dovoljno žetona da prihvatite ovaj posao.' })
        }

        tx.update(jobRef, {
          status: 'accepted',
          acceptedByTradespersonId: auth.uid,
          acceptedAt: FieldValue.serverTimestamp()
        })
        tx.update(tradespersonRef, {
          balanceTokens: FieldValue.increment(-1)
        })

        return { jobId: data.jobId, acceptedBy: auth.uid }
      })

      logger.info('acceptJob success', result)
      return res.status(200).send({ ok: true, ...result })
    } catch (error: any) {
      const status = error?.code && Number.isFinite(error.code) ? error.code : 500
      const message = error?.message || 'Unexpected error during acceptJob.'
      if (status !== 500) {
        logger.warn('acceptJob failed (expected)', { status, message })
      } else {
        logger.error('acceptJob failed (unexpected)', { message, stack: error?.stack })
      }
      return res.status(status).send({ error: message })
    }
  })
})

export const markJobAsComplete = onRequest({ region: 'europe-west3' }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') return res.status(204).send('')
    if (req.method !== 'POST') return res.status(405).send({ error: 'Method Not Allowed' })

    const auth = await verifyBearer(req)
    if (!auth) return res.status(401).send({ error: 'Authentication required.' })

    const data = (req.body?.data || {}) as { jobId?: string }
    const jobId = data?.jobId
    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).send({ error: 'Missing or invalid jobId.' })
    }

    try {
      logger.info('markJobAsComplete request', { jobId, uid: auth.uid })
      const db = getFirestore()
      const jobRef = db.collection('jobs').doc(jobId)
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef)
        if (!snap.exists) {
          return Promise.reject({ code: 404, message: 'Job does not exist.' })
        }
        const job = snap.data() as any
        if (job.acceptedByTradespersonId !== auth.uid) {
          return Promise.reject({ code: 403, message: 'Only assigned tradesperson can complete the job.' })
        }
        if (job.status !== 'accepted') {
          return Promise.reject({ code: 412, message: 'Job is not in an active state.' })
        }
        tx.update(jobRef, { status: 'completed', completedAt: FieldValue.serverTimestamp() })
      })
      logger.info('markJobAsComplete success', { jobId, uid: auth.uid })
      return res.status(200).send({ ok: true, jobId })
    } catch (error: any) {
      const status = error?.code && Number.isFinite(error.code) ? error.code : 500
      const message = error?.message || 'Unexpected error during markJobAsComplete.'
      return res.status(status).send({ error: message })
    }
  })
})

export const buyTokens = onRequest({ region: 'europe-west3' }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') return res.status(204).send('')
    if (req.method !== 'POST') return res.status(405).send({ error: 'Method Not Allowed' })

    const auth = await verifyBearer(req)
    if (!auth) return res.status(401).send({ error: 'Authentication required.' })

    const data = (req.body?.data || {}) as { paketId?: string }
    const paketId = data?.paketId
    if (!paketId || typeof paketId !== 'string') {
      return res.status(400).send({ error: 'paketId is required.' })
    }

    logger.info('buyTokens requested', { paketId, uid: auth.uid })
    return res.status(200).send({ ok: true, paketId })
  })
})

export const updateTokensByAdmin = onRequest({ region: 'europe-west3' }, (req, res) => {
  corsHandler(req, res, async () => {
    try {
      if (req.method === 'OPTIONS') return res.status(204).send('')
      if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Method Not Allowed' })
      }

      const header: string = req.get('Authorization') || ''
      const idToken = header.startsWith('Bearer ') ? header.slice(7) : ''
      if (!idToken) {
        return res.status(401).send({ error: 'Authentication required.' })
      }

      const decoded = await getAuth().verifyIdToken(idToken)
      // Check admins collection for role
      const db = getFirestore()
      const adminDoc = await db.collection('admins').doc(decoded.uid).get()
      if (!adminDoc.exists) {
        return res.status(403).send({ error: 'Admin privileges required.' })
      }

      const { uid, delta: rawDelta } = (req.body?.data || {}) as { uid?: string; delta?: number | string }
      const delta = Math.trunc(Number(rawDelta))
      if (!uid || typeof uid !== 'string' || !Number.isFinite(delta) || delta === 0) {
        return res.status(400).send({ error: 'Invalid uid or delta provided.' })
      }

      const ref = db.collection('tradespeople').doc(uid)

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists) {
          throw new HttpsError('not-found', 'Tradesperson not found.')
        }
        const currentTokens = Number(snap.data()?.balanceTokens ?? 0)
        const finalTokens = currentTokens + delta
        if (finalTokens < 0) {
          throw new HttpsError('failed-precondition', 'Stanje žetona ne može biti negativno.')
        }
        tx.update(ref, { balanceTokens: finalTokens })
      })

      logger.info('updateTokensByAdmin: success', { uid, delta })
      return res.status(200).send({ data: { ok: true } })
    } catch (error: any) {
      logger.error('updateTokensByAdmin failed', { message: error?.message })
      if (error instanceof HttpsError) {
        const statusMap: Record<string, number> = { 'not-found': 404, 'failed-precondition': 412 }
        const status = statusMap[error.code] || 500
        return res.status(status).send({ error: { message: error.message } })
      }
      return res.status(500).send({ error: { message: 'Unexpected internal error.' } })
    }
  })
})

export const notifyTradespeople = region('europe-west3')
  .firestore
  .document('jobs/{jobId}')
  .onCreate(async (snap, context) => {
    const db = getFirestore()
    const jobData = snap.data()
    if (!jobData) {
      logger.warn('notifyTradespeople: No job data found')
      return
    }

    const specializationRequired = jobData.specializationRequired
    if (!specializationRequired) {
      logger.info('notifyTradespeople: Job without specializationRequired, skipping')
      return
    }

    try {
      const snapshot = await db
        .collection('tradespeople')
        .where('specialization', '==', specializationRequired)
        .where('status', '==', 'available')
        .get()

      logger.info('notifyTradespeople: matching tradespeople', {
        count: snapshot.size,
        specializationRequired
      })
      snapshot.forEach((doc) => {
        const data = doc.data() as any
        if (data?.status !== 'available') {
          return
        }
        logger.info(`Notifikacija bi bila poslata majstoru: ${doc.id}`)
      })
    } catch (err: any) {
      logger.error('notifyTradespeople: query failed', { message: err?.message })
    }
  })



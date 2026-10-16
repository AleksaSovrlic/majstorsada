import { randomUUID } from 'node:crypto'
import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { OTP_POLICY as P, equalOtpHash, normalizeOtpEmail, otpCode, otpHash, validateOtpIp, validateOtpRequest, validateOtpSecret } from './otpPolicy'
import { createOtpIdentity, type OtpAuth, type OtpTarget } from './otpIdentity'
import type { OtpDeliveryStage, OtpDeliveryCategory } from './otpTransport'

export interface OtpRequest { requestId: string; email: string; sessionSecret: string }
export interface OtpVerification { requestId: string; sessionSecret: string; code: string }
export type OtpDelivery = 'accepted' | 'unknown' | 'failed' | 'pending'
export interface OtpRequestResult { requestId: string; expiresAt: number; resendAt: number; delivery: OtpDelivery; replayed: boolean }
interface Reservation { id: string; releaseAt: number }
interface OtpOperationalEvent { name: 'otp_budget_threshold' | 'otp_delivery'; count?: number; delivery?: OtpDelivery; stage?: OtpDeliveryStage; category?: OtpDeliveryCategory }
interface Options { db: Firestore; secret: string; auth: OtpAuth; now?: () => number; sendMail: (email: string, code: string, dispatchUntil?: number) => Promise<{ messageId: string }>; allowedEmails?: string[]; dailyLimit?: number; onEvent?: (event: OtpOperationalEvent) => void }
function failure(code: 'resource-exhausted' | 'failed-precondition' | 'already-exists' | 'unavailable', message: string): never { throw new HttpsError(code, message) }
function liveReservations(values: Reservation[] | undefined, now: number): Reservation[] { return (values || []).filter(entry => entry.releaseAt > now) }
const expiredReceipt = () => failure('failed-precondition', 'Kod je istekao ili više nije aktivan. Zatražite novi kod.')

export function createOtpService({ db, secret, auth, now = Date.now, sendMail, allowedEmails, dailyLimit = P.globalLimit, onEvent }: Options) {
  validateOtpSecret(secret)
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > P.globalLimit) throw new Error('OTP daily limit must be an integer between 1 and 500.')
  const allowed = allowedEmails === undefined ? undefined : new Set(allowedEmails.map(normalizeOtpEmail))
  function allow(email: string) { if (allowed && !allowed.has(email)) throw new HttpsError('permission-denied', 'OTP prijava trenutno nije dostupna za ovu adresu.') }
  function event(value: OtpOperationalEvent) { try { onEvent?.(value) } catch {} }
  const identity = createOtpIdentity({ db, auth })
  const globalRef = db.doc('_otpBudget/global')
  const addressRef = (email: string) => db.doc('_otpRateStates/email_' + otpHash(secret, 'email', email))
  const challengeRef = (id: string) => db.doc('_otpChallenges/' + id)
  const ipRef = (ip: string, kind: string) => db.doc('_otpRateStates/ip_' + otpHash(secret, 'ip-' + kind, ip))
  const sessionHash = (id: string, session: string) => otpHash(secret, 'session', id + '\0' + session)
  const codeHash = (id: string, code: string) => otpHash(secret, 'code', id + '\0' + code)
  function result(id: string, challenge: any, replayed: boolean): OtpRequestResult {
    return { requestId: id, expiresAt: challenge.expiresAt, resendAt: challenge.resendAt, delivery: challenge.delivery, replayed }
  }
  function consumeIp(tx: Transaction, ref: FirebaseFirestore.DocumentReference, state: any, time: number, maximum: number) {
    const calls: number[] = (state?.calls || []).filter((called: number) => called > time - P.rateWindowMs)
    if (calls.length >= maximum) failure('resource-exhausted', 'Previše pokušaja sa ove mreže. Pokušajte kasnije.')
    tx.set(ref, { kind: 'ip', calls: [...calls, time], deleteAfter: Timestamp.fromMillis(time + P.rateWindowMs + P.dispatchGuardMs) })
  }
  async function admitIp(ip: string, kind: string, maximum: number) {
    const rate = ipRef(ip, kind)
    await db.runTransaction(async tx => {
      const snap = await tx.get(rate)
      consumeIp(tx, rate, snap.data(), now(), maximum)
    })
  }
  function assertSession(id: string, challenge: any, session: string) {
    if (!challenge || !equalOtpHash(challenge.sessionHash, sessionHash(id, session))) failure('failed-precondition', 'Prijava nije aktivna u ovoj sesiji. Pokrenite je ponovo.')
  }
  async function request(data: OtpRequest, ip: string): Promise<OtpRequestResult> {
    validateOtpRequest(data); validateOtpIp(ip)
    const email = normalizeOtpEmail(data.email), ref = challengeRef(data.requestId), address = addressRef(email)
    allow(email)
    await admitIp(ip, 'send', P.sendIpLimit)
    const digest = sessionHash(data.requestId, data.sessionSecret), generated = otpCode(), dispatchOwner = randomUUID()
    const reserved = await db.runTransaction(async tx => {
      const time = now()
      const [oldSnap, addressSnap, budgetSnap] = await tx.getAll(ref, address, globalRef)
      const old = oldSnap.data(), addressState = addressSnap.data() || {}, budget = budgetSnap.data() || {}
      // All reads precede writes; a callback retry cannot send email.
      if (old) {
        assertSession(data.requestId, old, data.sessionSecret)
        if (old.email !== email) failure('already-exists', 'Ovaj zahtev je već vezan za drugu adresu.')
        if (old.delivery === 'pending' && old.dispatchUntil <= time) {
          const delivery: OtpDelivery = old.dispatchStarted ? 'unknown' : 'failed'
          tx.update(ref, { delivery })
          if (delivery === 'failed' && addressState.activeRequestId === data.requestId && addressState.generation === old.previousGeneration && (addressState.completionUntil || 0) <= time) tx.update(address, { activeRequestId: old.previousActiveId })
          return { fresh: false, challenge: { ...old, delivery } }
        }
        return { fresh: false, challenge: old }
      }
      if ((addressState.completionUntil || 0) > time) failure('unavailable', 'Dovršavamo prethodnu prijavu. Pokušajte ponovo za trenutak.')
      if ((addressState.resendAt || 0) > time) failure('resource-exhausted', 'Sačekajte minut pre ponovnog slanja koda.')
      const emailReservations = liveReservations(addressState.reservations, time)
      const globalReservations = liveReservations(budget.reservations, time)
      const admissions: number[] = (budget.admissions || []).filter((admitted: number) => admitted > time - P.burstMs)
      if (emailReservations.length >= P.emailLimit) failure('resource-exhausted', 'Na ovu adresu možete zatražiti najviše tri koda u poslednja 24 sata.')
      if (globalReservations.length >= dailyLimit) failure('resource-exhausted', 'Slanje kodova trenutno nije dostupno. Pokušajte kasnije.')
      if (admissions.length >= P.burstLimit) failure('resource-exhausted', 'Trenutno je više prijava. Pokušajte ponovo za nekoliko sekundi.')
      const releaseAt = time + P.dailyMs + P.dispatchGuardMs
      const reservation = { id: data.requestId, releaseAt }
      const challenge = {
        email, emailKey: address.id, sessionHash: digest, codeHash: codeHash(data.requestId, generated), generation: addressState.generation || 0,
        previousActiveId: addressState.activeRequestId || '', previousGeneration: addressState.generation || 0,
        createdAt: time, expiresAt: time + P.lifetimeMs, resendAt: time + P.cooldownMs,
        wrongAttempts: 0, delivery: 'pending', dispatchUntil: time + P.dispatchMs, dispatchOwner, dispatchStarted: false,
        state: 'active', deleteAfter: Timestamp.fromMillis(releaseAt),
      }
      tx.set(globalRef, { reservations: [...globalReservations, reservation], admissions: [...admissions, time] })
      tx.set(address, { ...addressState, kind: 'email', reservations: [...emailReservations, reservation], activeRequestId: data.requestId, generation: challenge.generation, resendAt: challenge.resendAt, deleteAfter: Timestamp.fromMillis(releaseAt) })
      tx.create(ref, challenge)
      return { fresh: true, challenge, count: globalReservations.length + 1 }
    })
    if (!reserved.fresh) return result(data.requestId, reserved.challenge, true)
    if ([400, 450, 500].includes(reserved.count!)) event({ name: 'otp_budget_threshold', count: reserved.count })
    const dispatch = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref), challenge = snapshot.data()!
      if (challenge.dispatchOwner !== dispatchOwner || challenge.dispatchStarted || challenge.delivery !== 'pending') return false
      if (now() >= challenge.dispatchUntil) return false
      tx.update(ref, { dispatchStarted: true })
      return true
    })
    let delivery: OtpDelivery = 'failed'
    let deliveryFailure: Pick<OtpOperationalEvent, 'stage' | 'category'> | undefined
    if (dispatch && now() < reserved.challenge.dispatchUntil) {
      try { await sendMail(email, generated, reserved.challenge.dispatchUntil); delivery = 'accepted' }
      catch (error: any) {
        delivery = error?.definitive === true ? 'failed' : 'unknown'
        // Operational logs accept only fixed enum values, never provider detail.
        const stage = error?.stage
        if (stage === 'metadata' || stage === 'federation' || stage === 'ses' || stage === 'configuration') {
          deliveryFailure = { stage, category: delivery === 'failed' ? 'explicit-rejection' : 'ambiguous' }
        }
      }
    }
    // Preserve the admission even for a definitive failure. For an unknown send
    // outcome, never retry automatically: SES may already have accepted it.
    const saved = await db.runTransaction(async tx => {
      const [snapshot, addressSnap, budgetSnap] = await tx.getAll(ref, address, globalRef)
      const challenge = snapshot.data()!, state = addressSnap.data()!, budget = budgetSnap.data() || {}, time = now()
      if (challenge.dispatchOwner !== dispatchOwner || challenge.delivery !== 'pending') return challenge
      const releaseAt = Math.max(challenge.deleteAfter.toMillis(), time + P.dailyMs + P.dispatchGuardMs)
      const extend = (entries: Reservation[]) => liveReservations(entries, time).map(entry => entry.id === data.requestId ? { ...entry, releaseAt } : entry)
      const addressUpdate: any = { reservations: extend(state.reservations), deleteAfter: Timestamp.fromMillis(Math.max(state.deleteAfter.toMillis(), releaseAt)) }
      if (delivery === 'failed' && state.activeRequestId === data.requestId && state.generation === challenge.previousGeneration && (state.completionUntil || 0) <= time) addressUpdate.activeRequestId = challenge.previousActiveId
      const update = { delivery, deleteAfter: Timestamp.fromMillis(releaseAt) }
      tx.update(ref, update)
      tx.update(address, addressUpdate)
      tx.set(globalRef, { ...budget, reservations: extend(budget.reservations || []) })
      return { ...challenge, ...update }
    })
    event({ name: 'otp_delivery', delivery, ...deliveryFailure })
    return result(data.requestId, saved, false)
  }
  async function verify(data: OtpVerification, ip: string): Promise<{ customToken: string }> {
    validateOtpRequest(data, true); validateOtpIp(ip)
    const ref = challengeRef(data.requestId), rate = ipRef(ip, 'verify'), leaseOwner = randomUUID()
    const completion = await db.runTransaction(async tx => {
      const time = now()
      const snapshot = await tx.get(ref), challenge = snapshot.data()
      // Unknown requests and sessions never create durable IP state. Admit a
      // genuine challenge in this transaction so its code attempt and IP limit
      // either both commit or both retry under contention.
      assertSession(data.requestId, challenge, data.sessionSecret)
      allow(challenge!.email)
      const address = db.doc('_otpRateStates/' + challenge!.emailKey)
      const [addressSnap, rateSnap] = await tx.getAll(address, rate), state = addressSnap.data()
      if (!state || state.activeRequestId !== data.requestId || state.generation !== challenge!.generation) expiredReceipt()
      consumeIp(tx, rate, rateSnap.data(), time, P.verifyIpLimit)
      const matches = equalOtpHash(challenge!.codeHash, codeHash(data.requestId, data.code))
      if (challenge!.state === 'active') {
        if (challenge!.expiresAt <= time || challenge!.wrongAttempts >= P.wrongCodeLimit || challenge!.delivery === 'failed') expiredReceipt()
        if (!matches) {
          tx.update(ref, { wrongAttempts: challenge!.wrongAttempts + 1 })
          return { wrong: true, challenge: challenge! }
        }
        const generation = state!.generation + 1, completionUntil = time + P.completionMs
        tx.update(address, { generation, completionUntil })
        const update = { state: 'completing', generation, completionUntil, leaseOwner, leaseUntil: time + P.leaseMs }
        tx.update(ref, update)
        return { wrong: false, challenge: { ...challenge, ...update } }
      }
      if (!matches || challenge!.completionUntil <= time) expiredReceipt()
      if (challenge!.leaseUntil > time) failure('unavailable', 'Prijava se dovršava. Pokušajte ponovo za trenutak.')
      const update = { leaseOwner, leaseUntil: Math.min(time + P.leaseMs, challenge!.completionUntil) }
      tx.update(ref, update)
      return { wrong: false, challenge: { ...challenge, ...update } }
    })
    if (completion.wrong) failure('failed-precondition', 'Kod nije ispravan. Proverite mejl i pokušajte ponovo.')
    const challenge = completion.challenge, email = challenge.email, address = db.doc('_otpRateStates/' + challenge.emailKey)
    async function saveStep(update: object) {
      await db.runTransaction(async tx => {
        const [snap, addr] = await tx.getAll(ref, address), fresh = snap.data(), state = addr.data(), time = now()
        if (!fresh || fresh.leaseOwner !== leaseOwner || fresh.leaseUntil <= time || fresh.completionUntil <= time || state?.generation !== fresh.generation || state?.activeRequestId !== data.requestId) expiredReceipt()
        tx.update(ref, update)
      })
    }
    try {
      let target: OtpTarget = challenge.targetUid ? { uid: challenge.targetUid, kind: challenge.targetKind } : await identity.findTarget(email)
      if (!challenge.targetUid) await saveStep({ targetUid: target.uid, targetKind: target.kind })
      target = await identity.ensureUser(email, target)
      await saveStep({ targetUid: target.uid, targetKind: target.kind, identityReady: true })
      await identity.ensureProfile(email, target)
      await saveStep({ profileReady: true })
      const customToken = await identity.token(email, target)
      await saveStep({ state: 'completed', leaseUntil: 0 })
      return { customToken }
    } catch (error) {
      // A failure leaves only this session's bounded receipt resumable. It never
      // extends the receipt or deletes the target UID/profile after side effects.
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref)
        if (snap.data()?.leaseOwner === leaseOwner) tx.update(ref, { leaseUntil: 0 })
      }).catch(() => {})
      throw error
    }
  }
  return { request, verify }
}

import { randomUUID } from 'node:crypto'
import type { Auth, UserRecord } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { completeRegistration, readAccountRoles } from './jobLifecycle'

export interface OtpTarget { uid: string; kind: 'existing' | 'new' }
export type OtpAuth = Pick<Auth, 'getUser' | 'getUserByEmail' | 'createUser' | 'createCustomToken'>
function notFound(error: any) { return error?.code === 'auth/user-not-found' }
function assertIdentity(user: UserRecord, email: string) {
  if (user.disabled || user.email?.trim().toLowerCase() !== email) throw new HttpsError('failed-precondition', 'Nalog je promenjen ili nije dostupan. Pokrenite prijavu ponovo.')
  // An email-link client may have providerId=password without an actual password.
  // Unverified credentials are never upgraded while an earlier credential survives.
  if (!user.emailVerified) throw new HttpsError('failed-precondition', 'Ovaj nalog zahteva bezbedno dovršavanje prijave preko podrške.')
  if (user.multiFactor?.enrolledFactors?.length) throw new HttpsError('failed-precondition', 'Za ovaj nalog koristite postojeći način prijave.')
}
export function createOtpIdentity({ db, auth }: { db: Firestore; auth: OtpAuth }) {
  async function assertClientEligible(uid: string) {
    const { role } = await db.runTransaction(tx => readAccountRoles(tx, uid, db))
    if (role !== 'client' && role !== 'unregistered') throw new HttpsError('permission-denied', role === 'admin' ? 'Koristite prijavu za administratora.' : 'Ova adresa ima nalog majstora. Koristite prijavu za majstore.')
    return role
  }
  async function findTarget(email: string): Promise<OtpTarget> {
    try {
      const user = await auth.getUserByEmail(email)
      assertIdentity(user, email)
      await assertClientEligible(user.uid)
      return { uid: user.uid, kind: 'existing' }
    } catch (error) {
      if (!notFound(error)) throw error
      // The service persists this UID BEFORE createUser, making a crash recoverable.
      return { uid: randomUUID(), kind: 'new' }
    }
  }
  async function ensureUser(email: string, target: OtpTarget): Promise<OtpTarget> {
    let user: UserRecord
    try { user = await auth.getUser(target.uid) }
    catch (error) {
      if (!notFound(error)) throw error
      if (target.kind === 'existing') throw new HttpsError('failed-precondition', 'Nalog je obrisan. Pokrenite novu prijavu.')
      try { user = await auth.createUser({ uid: target.uid, email, emailVerified: true, disabled: false }) }
      catch (createError: any) {
        if (createError?.code === 'auth/email-already-exists') {
          user = await auth.getUserByEmail(email)
          target = { uid: user.uid, kind: 'existing' }
        } else if (createError?.code === 'auth/uid-already-exists') {
          user = await auth.getUser(target.uid)
        } else throw createError
      }
    }
    assertIdentity(user, email)
    await assertClientEligible(user.uid)
    return { uid: user.uid, kind: 'existing' as const }
  }
  async function boundUser(email: string, target: OtpTarget) {
    let user: UserRecord
    try { user = await auth.getUser(target.uid) }
    catch (error) {
      if (notFound(error)) throw new HttpsError('failed-precondition', 'Nalog je obrisan. Pokrenite novu prijavu.')
      throw error
    }
    assertIdentity(user, email)
    return user
  }
  async function ensureProfile(email: string, target: OtpTarget) {
    const user = await boundUser(email, target)
    assertIdentity(user, email)
    const role = await assertClientEligible(target.uid)
    if (role === 'unregistered') await completeRegistration({ uid: target.uid, email: user.email, email_verified: true }, { role: 'client' }, db)
    const final = await db.runTransaction(tx => readAccountRoles(tx, target.uid, db))
    if (final.role !== 'client') throw new HttpsError('failed-precondition', 'Nalog trenutno nije spreman za klijentsku prijavu.')
  }
  async function token(email: string, target: OtpTarget) {
    // IAM signing can wait on a remote call. Check again after it finishes:
    // an Auth email/disabled change or role promotion during that wait must not
    // yield a usable client token to the earlier mailbox owner.
    await boundUser(email, target)
    const customToken = await auth.createCustomToken(target.uid)
    await boundUser(email, target)
    const { role } = await db.runTransaction(tx => readAccountRoles(tx, target.uid, db))
    if (role !== 'client') throw new HttpsError('failed-precondition', 'Nalog trenutno nije spreman za klijentsku prijavu.')
    return customToken
  }
  return { findTarget, ensureUser, ensureProfile, token }
}

import assert from 'node:assert/strict'
import { after } from 'node:test'
import { createRequire } from 'node:module'

assert.equal(process.env.GCLOUD_PROJECT, 'demo-majstorsada-otp', 'OTP tests require the dedicated demo project')
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8289', 'OTP tests require the local Firestore emulator')
export const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app')
const { getFirestore, Timestamp } = requireFunctions('firebase-admin/firestore')
export { Timestamp }
const fixtureApp = initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'otp-test-fixtures')
export const db = getFirestore(fixtureApp)
after(async () => { await db.terminate(); await deleteApp(fixtureApp) })
export function makeAuth() {
  const users = new Map(), tokens = []
  let count = 0
  const absent = () => Object.assign(new Error('Test user missing'), { code: 'auth/user-not-found' })
  return {
    users, tokens,
    async getUser(uid) { if (!users.has(uid)) throw absent(); return { ...users.get(uid) } },
    async getUserByEmail(email) { const user = [...users.values()].find(item => item.email.toLowerCase() === email.toLowerCase()); if (!user) throw absent(); return { ...user } },
    async createUser(value) {
      if (users.has(value.uid)) throw Object.assign(new Error('Test UID exists'), { code: 'auth/uid-already-exists' })
      if ([...users.values()].some(user => user.email.toLowerCase() === value.email.toLowerCase())) throw Object.assign(new Error('Test email exists'), { code: 'auth/email-already-exists' })
      const user = { ...value, providerData: [], multiFactor: { enrolledFactors: [] } }; users.set(user.uid, user); return { ...user }
    },
    async createCustomToken(uid) {
      assert.equal((await db.doc('clients/' + uid).get()).exists, true, 'Client profile must precede token issuance')
      tokens.push(uid); return `fixture-token-${uid}-${++count}`
    },
  }
}
export const requestId = () => crypto.randomUUID()
export const sessionSecret = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')

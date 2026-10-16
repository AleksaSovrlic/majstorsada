import { test } from 'node:test'
import { doc, getDoc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore'
import { seedDb, client, denied } from './helpers.mjs'
test('OTP budgets, challenges, rate state and test outbox are private to the server', async () => {
  await seedDb.doc('clients/otp-rule-client').set({ uid: 'otp-rule-client', email: 'client@example.test' })
  await seedDb.doc('admins/otp-rule-admin').set({ uid: 'otp-rule-admin' })
  for (const path of ['_otpBudget/global', '_otpRateStates/opaque', '_otpChallenges/opaque', '_otpTestOutbox/opaque']) {
    await seedDb.doc(path).set({ sensitive: 'test fixture' })
    for (const uid of [null, 'otp-rule-client', 'otp-rule-admin']) {
      const db = client(uid).db
      await denied(getDoc(doc(db, path)))
      await denied(getDocs(collection(db, path.split('/')[0])))
      await denied(setDoc(doc(db, path), { bypass: true }))
      await denied(deleteDoc(doc(db, path)))
    }
  }
})

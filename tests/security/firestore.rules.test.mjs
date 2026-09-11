import assert from 'node:assert/strict'
import { test } from 'node:test'
import { doc, setDoc, updateDoc, deleteField, serverTimestamp, arrayUnion, GeoPoint } from 'firebase/firestore'
import { client, seedDb, profile, job, denied, adminDelete } from './helpers.mjs'

let sequence = 0
async function tradesperson(extra = {}) {
  const uid = `rules-tp-${++sequence}`
  const adminRef = seedDb.doc(`tradespeople/${uid}`)
  await adminRef.set(profile(uid, extra))
  return { uid, adminRef, ref: doc(client(uid).db, adminRef.path) }
}
async function pendingJob(extra = {}) {
  const uid = `rules-client-${++sequence}`
  const id = `rules-job-${sequence}`
  const adminRef = seedDb.doc(`jobs/${id}`)
  await adminRef.set(job(uid, extra))
  return { uid, id, adminRef, ref: doc(client(uid).db, adminRef.path) }
}
const imagePatch = id => ({ imagePaths: [`jobs/${id}/photo.jpg`], imagesReady: false, imagesUpdatedAt: serverTimestamp() })
const cancelPatch = () => ({ status: 'canceled', canceledAt: serverTimestamp() })

test('Browser cannot create even a valid zero-token profile', async () => {
  const uid = 'registration-valid'
  const data = profile(uid, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  await denied(setDoc(doc(client(uid).db, 'tradespeople', uid), data, { merge: true }))
  assert.equal((await seedDb.doc(`tradespeople/${uid}`).get()).exists, false)
})
for (const [name, extra] of Object.entries({ tokens: { balanceTokens: 99 }, rating: { ratingSum: 5 }, average: { averageRating: 5 }, wrongUid: { uid: 'other' }, emptyName: { displayName: '' }, longName: { displayName: 'x'.repeat(81) }, phone: { phoneNumber: 'invalid' } })) {
  test(`Registration rejects ${name}`, async () => {
    const uid = `registration-${name}`
    await denied(setDoc(doc(client(uid).db, 'tradespeople', uid), profile(uid, extra)))
  })
}
for (const field of ['balanceTokens', 'ratingSum', 'ratingCount', 'averageRating']) {
  for (const operation of ['add', 'change', 'remove']) {
    test(`Owner cannot ${operation} protected ${field}`, async () => {
      const { ref, adminRef } = await tradesperson({ [field]: 0 })
      if (operation === 'add') await adminRef.update({ [field]: adminDelete() })
      const before = (await adminRef.get()).data()
      await denied(updateDoc(ref, { [field]: operation === 'remove' ? deleteField() : 999 }))
      assert.deepEqual((await adminRef.get()).data(), before)
    })
  }
}
test('Deleting then recreating token balance cannot mint tokens', async () => {
  const { ref, adminRef } = await tradesperson()
  await denied(updateDoc(ref, { balanceTokens: deleteField() }))
  await denied(updateDoc(ref, { balanceTokens: 999 }))
  assert.equal((await adminRef.get()).data().balanceTokens, 0)
})
test('Full document replacement cannot omit token balance', async () => {
  const { uid, ref } = await tradesperson()
  const replacement = profile(uid)
  delete replacement.balanceTokens
  await denied(setDoc(ref, replacement))
})
for (const operation of ['add', 'change', 'remove']) {
  test(`Profile rejects ${operation} of unlisted field`, async () => {
    const { ref } = await tradesperson(operation === 'add' ? {} : { serverOnly: 'original' })
    await denied(updateDoc(ref, { serverOnly: operation === 'remove' ? deleteField() : 'forged' }))
  })
}
test('Current availability, preference, dismissal and profile edits remain allowed', async () => {
  const { ref, adminRef } = await tradesperson()
  await updateDoc(ref, { status: 'available', city: 'Beograd', notificationPreference: 'push', dismissedJobs: arrayUnion('job-a') })
  await updateDoc(ref, { status: 'unavailable', dismissedJobs: arrayUnion('job-b'), displayName: 'Drugi Majstor', phoneNumber: '+381641234568', specialization: 'električar' })
  assert.equal((await adminRef.get()).data().balanceTokens, 0)
  assert.deepEqual((await adminRef.get()).data().dismissedJobs, ['job-a', 'job-b'])
})
test('First bio/avatar save, repeat avatar save and clearing bio remain allowed', async () => {
  const { uid, ref } = await tradesperson()
  await updateDoc(ref, { bio: 'x'.repeat(500) })
  await updateDoc(ref, { avatarPath: `avatars/${uid}/profile.jpg`, avatarUpdatedAt: serverTimestamp() })
  await updateDoc(ref, { avatarPath: `avatars/${uid}/profile.jpg`, avatarUpdatedAt: serverTimestamp(), bio: null })
})
for (const [name, patch] of Object.entries({ longBio: () => ({ bio: 'x'.repeat(501) }), foreignAvatar: () => ({ avatarPath: 'avatars/other/profile.jpg', avatarUpdatedAt: serverTimestamp() }), missingAvatarTime: uid => ({ avatarPath: `avatars/${uid}/profile.jpg` }), forgedAvatarTime: uid => ({ avatarPath: `avatars/${uid}/profile.jpg`, avatarUpdatedAt: new Date(0) }), tooManyDismissals: () => ({ dismissedJobs: Array.from({ length: 201 }, (_, i) => `job-${i}`) }) })) {
  test(`Profile validation rejects first write of ${name}`, async () => {
    const { uid, ref } = await tradesperson()
    await denied(updateDoc(ref, patch(uid)))
  })
}
test('Client cannot declare or finalize image metadata directly', async () => {
  const { ref, id } = await pendingJob()
  await denied(updateDoc(ref, imagePatch(id)))
  await denied(updateDoc(ref, { imagePaths: [], imagesReady: true, imagesUpdatedAt: serverTimestamp() }))
})

test('Owner can cancel a pending job and add the server cancellation timestamp', async () => {
  const { ref, adminRef } = await pendingJob()
  await updateDoc(ref, cancelPatch())
  const data = (await adminRef.get()).data()
  assert.equal(data.status, 'canceled')
  assert.ok(data.canceledAt.toMillis() > 1000)
})
for (const route of ['images', 'cancel']) {
  for (const operation of ['add', 'change', 'remove']) {
    test(`${route} cannot ${operation} an unlisted field`, async () => {
      const { id, ref, adminRef } = await pendingJob(operation === 'add' ? {} : { serverOnly: 'original' })
      const before = (await adminRef.get()).data()
      const patch = route === 'images' ? imagePatch(id) : cancelPatch()
      await denied(updateDoc(ref, { ...patch, serverOnly: operation === 'remove' ? deleteField() : 'forged' }))
      assert.deepEqual((await adminRef.get()).data(), before)
    })
  }
  for (const [name, value] of [['assignment', { acceptedByTradespersonId: 'attacker' }], ['rating', { rating: 5 }], ['removeOwner', { clientId: deleteField() }], ['transferOwner', { clientId: 'other' }]]) {
    test(`${route} cannot forge ${name}`, async () => {
      const { id, ref } = await pendingJob()
      await denied(updateDoc(ref, { ...(route === 'images' ? imagePatch(id) : cancelPatch()), ...value }))
    })
  }
}
test('Image paths, count, timestamp and ready monotonicity remain enforced', async () => {
  const { ref, id } = await pendingJob()
  await denied(updateDoc(ref, { ...imagePatch(id), imagePaths: ['jobs/other/a.jpg'] }))
  await denied(updateDoc(ref, { ...imagePatch(id), imagePaths: [1, 2, 3, 4].map(n => `jobs/${id}/${n}.jpg`) }))
  await denied(updateDoc(ref, { ...imagePatch(id), imagesUpdatedAt: new Date(0) }))
  await denied(updateDoc(ref, { ...imagePatch(id), imagesReady: true }))
  await denied(updateDoc(ref, imagePatch(id)))
})
test('Other clients and anonymous callers cannot mutate profiles or jobs', async () => {
  const { uid } = await tradesperson()
  const { id } = await pendingJob()
  for (const attacker of ['stranger', null]) {
    const db = client(attacker).db
    await denied(updateDoc(doc(db, 'tradespeople', uid), { status: 'available' }))
    await denied(setDoc(doc(db, 'tradespeople', 'another-person'), profile('another-person')))
    await denied(updateDoc(doc(db, 'jobs', id), cancelPatch()))
    await denied(updateDoc(doc(db, 'jobs', id), imagePatch(id)))
  }
})
for (const status of ['accepted', 'completed', 'canceled']) {
  test(`Client cannot cancel or attach photos to ${status} job`, async () => {
    const { id, ref } = await pendingJob({ status })
    await denied(updateDoc(ref, cancelPatch()))
    await denied(updateDoc(ref, imagePatch(id)))
  })
}

test('Browser cannot create a job directly, including a previously valid payload', async () => {
  const uid = 'rules-create-client', id = 'rules-created-job'
  await denied(setDoc(doc(client(uid).db, 'jobs', id), job(uid, { coordinates: new GeoPoint(44.8, 20.46), createdAt: serverTimestamp() })))
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getBytes } from 'firebase/storage'
import { client, seedDb, job, profile } from './helpers.mjs'

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
const metadata = { contentType: 'image/jpeg' }
const rejected = promise => assert.rejects(promise, error => error.code === 'storage/unauthorized')

test('Photos: declare paths, upload with owner identity, read and finalize', async () => {
  const uid = 'storage-client'
  const id = 'storage-job'
  const path = `jobs/${id}/photo.jpg`
  const owner = client(uid)
  await seedDb.doc(`jobs/${id}`).set(job(uid))
  await updateDoc(doc(owner.db, 'jobs', id), { imagePaths: [path], imagesReady: false, imagesUpdatedAt: serverTimestamp() })
  await uploadBytes(ref(owner.storage, path), bytes, metadata)
  assert.deepEqual(new Uint8Array(await getBytes(ref(owner.storage, path))), bytes)
  await updateDoc(doc(owner.db, 'jobs', id), { imagePaths: [path], imagesReady: true, imagesUpdatedAt: serverTimestamp() })
  assert.equal((await seedDb.doc(`jobs/${id}`).get()).data().imagesReady, true)
  await rejected(uploadBytes(ref(client('storage-stranger').storage, path), bytes, metadata))
  await rejected(uploadBytes(ref(client().storage, path), bytes, metadata))
  await rejected(uploadBytes(ref(owner.storage, `jobs/${id}/undeclared.jpg`), bytes, metadata))
  await rejected(uploadBytes(ref(owner.storage, path), bytes, { contentType: 'text/plain' }))
  await rejected(uploadBytes(ref(owner.storage, path), new Uint8Array(3 * 1024 * 1024), metadata))
  await seedDb.doc(`jobs/${id}`).update({ status: 'accepted', acceptedByTradespersonId: 'storage-tp' })
  await rejected(uploadBytes(ref(owner.storage, path), bytes, metadata))
})
test('Avatar: own upload and first profile metadata save still work', async () => {
  const uid = 'storage-avatar'
  const path = `avatars/${uid}/profile.jpg`
  const owner = client(uid)
  await seedDb.doc(`tradespeople/${uid}`).set(profile(uid))
  await uploadBytes(ref(owner.storage, path), bytes, metadata)
  await updateDoc(doc(owner.db, 'tradespeople', uid), { avatarPath: path, avatarUpdatedAt: serverTimestamp() })
  assert.equal((await seedDb.doc(`tradespeople/${uid}`).get()).data().avatarPath, path)
  await rejected(uploadBytes(ref(client('storage-stranger').storage, path), bytes, metadata))
})

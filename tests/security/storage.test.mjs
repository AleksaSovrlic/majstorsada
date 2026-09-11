import assert from 'node:assert/strict'
import { test } from 'node:test'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getBytes, getMetadata, getDownloadURL, updateMetadata, deleteObject, listAll } from 'firebase/storage'
import { client, seedDb, job, profile, functionsRequire, PROJECT_ID } from './helpers.mjs'
functionsRequire('./lib/index.js')
const { finalizeJobImages, readJobImage } = functionsRequire('./lib/jobLifecycle.js')
const adminBucket = functionsRequire('firebase-admin/storage').getStorage().bucket(PROJECT_ID + '.appspot.com')
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
const metadata = { contentType: 'image/jpeg' }
const rejected = promise => assert.rejects(promise, error => error.code === 'storage/unauthorized')
async function setup(id, uid, count = 1) {
  await seedDb.doc('clients/' + uid).set({ uid })
  await seedDb.doc('jobs/' + id).set(job(uid, { photoCount: count, imagesReady: false }))
  return ref(client(uid).storage, 'job-uploads/' + uid + '/' + id + '/0.jpg')
}
test('Staging is owner-only, bounded, immutable; direct published uploads and token edits are denied', async () => {
  const uid = 'storage-client', id = 'storage-stage-job-0001'
  const target = await setup(id, uid)
  await uploadBytes(target, bytes, metadata)
  assert.deepEqual(new Uint8Array(await getBytes(target)), bytes)
  await rejected(uploadBytes(target, bytes, metadata))
  await rejected(updateMetadata(target, { customMetadata: { firebaseStorageDownloadTokens: 'forged' } }))
  for (const attacker of ['storage-stranger', null]) {
    await rejected(getBytes(ref(client(attacker).storage, target.fullPath)))
    await rejected(uploadBytes(ref(client(attacker).storage, target.fullPath), bytes, metadata))
  }
  for (const name of ['1.jpg', '3.jpg', 'other.jpg']) await rejected(uploadBytes(ref(client(uid).storage, target.fullPath.replace('0.jpg', name)), bytes, metadata))
  await rejected(uploadBytes(ref(client(uid).storage, 'jobs/' + id + '/0.jpg'), bytes, metadata))
  await rejected(listAll(ref(client(uid).storage, 'job-uploads/' + uid + '/' + id)))
  await deleteObject(target)
  await rejected(uploadBytes(target, bytes, { contentType: 'text/plain' }))
  await rejected(uploadBytes(target, new Uint8Array(3 * 1024 * 1024), metadata))
})
test('Published photos have no public token and match Firestore visibility before and after acceptance', async () => {
  const uid = 'photo-owner', id = 'photo-publish-job-0001', tp = 'photo-matching', other = 'photo-other'
  const target = await setup(id, uid)
  for (const who of [tp, other]) await seedDb.doc('tradespeople/' + who).set(profile(who))
  await seedDb.doc('tradespeople/photo-wrong-trade').set(profile('photo-wrong-trade', { specialization: 'bravar' }))
  await uploadBytes(target, bytes, metadata)
  const staged = await getMetadata(target)
  const stagingUrl = await getDownloadURL(target)
  const stagingTokens = new URL(stagingUrl).searchParams.get('token')
  const result = await finalizeJobImages({ uid }, { jobId: id, slots: [0] })
  assert.deepEqual(result.imagePaths, ['jobs/' + id + '/0.jpg'])
  const published = ref(client(uid).storage, result.imagePaths[0])
  const [serverMetadata] = await adminBucket.file(published.fullPath).getMetadata()
  assert.ok(!serverMetadata.metadata?.firebaseStorageDownloadTokens, 'No persistent download token on published object')
  assert.equal(serverMetadata.cacheControl, 'private, no-store')
  await rejected(getDownloadURL(published))
  const media = 'http://127.0.0.1:9398/v0/b/' + PROJECT_ID + '.appspot.com/o/' + encodeURIComponent(published.fullPath) + '?alt=media'
  assert.ok([401, 403].includes((await fetch(media)).status))
  if (stagingTokens) assert.ok([401, 403].includes((await fetch(media + '&token=' + stagingTokens)).status))
  for (const who of [uid, tp, other]) {
    await rejected(getBytes(ref(client(who).storage, published.fullPath)))
    assert.deepEqual(new Uint8Array(await readJobImage({ uid: who }, { jobId: id, slot: 0 })), bytes)
  }
  for (const who of ['photo-stranger', 'photo-wrong-trade']) await assert.rejects(readJobImage({ uid: who }, { jobId: id, slot: 0 }), error => error.code === 'permission-denied')
  for (const who of [null, 'photo-stranger', 'photo-wrong-trade']) await rejected(getBytes(ref(client(who).storage, published.fullPath)))
  await rejected(updateMetadata(published, { customMetadata: { firebaseStorageDownloadTokens: 'attack' } }))
  await rejected(uploadBytes(published, bytes, metadata))
  await rejected(deleteObject(published))
  await assert.rejects(getMetadata(target), error => error.code === 'storage/object-not-found')
  await seedDb.doc('jobs/' + id).update({ status: 'accepted', acceptedByTradespersonId: tp })
  assert.deepEqual(new Uint8Array(await readJobImage({ uid: tp }, { jobId: id, slot: 0 })), bytes)
  await rejected(getBytes(ref(client(other).storage, published.fullPath)))
  await assert.rejects(readJobImage({ uid: other }, { jobId: id, slot: 0 }), error => error.code === 'permission-denied')
  await seedDb.doc('jobs/' + id).update({ status: 'completed' })
  assert.deepEqual(new Uint8Array(await readJobImage({ uid: tp }, { jobId: id, slot: 0 })), bytes)
  const retry = await finalizeJobImages({ uid }, { jobId: id, slots: [] })
  assert.deepEqual(retry.imagePaths, result.imagePaths)
})
test('Failed/partial uploads can be finished with existing slots or no photos, never fabricated paths', async () => {
  const uid = 'partial-owner', id = 'partial-images-job-0001'
  const target = await setup(id, uid, 3)
  await uploadBytes(target, bytes, metadata)
  await assert.rejects(finalizeJobImages({ uid: 'stranger' }, { jobId: id, slots: [0] }))
  await assert.rejects(finalizeJobImages({ uid }, { jobId: id, slots: [0, 0] }))
  await assert.rejects(finalizeJobImages({ uid }, { jobId: id, slots: [3] }))
  assert.equal((await seedDb.doc('jobs/' + id).get()).data().imagesReady, false)
  assert.equal((await finalizeJobImages({ uid }, { jobId: id, slots: [0] })).imagePaths.length, 1)
  const emptyId = 'empty-images-job-0001'
  await setup(emptyId, uid, 2)
  assert.deepEqual((await finalizeJobImages({ uid }, { jobId: emptyId, slots: [] })).imagePaths, [])
  assert.equal((await seedDb.doc('jobs/' + emptyId).get()).data().imagesReady, true)
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

test('Interrupted finalization resumes its fixed selection without duplicate or unreferenced photos', async () => {
  const uid = 'photo-resume', id = 'photo-resume-job-0001'
  const target = await setup(id, uid, 2)
  await uploadBytes(target, bytes, metadata)
  await seedDb.doc('jobs/' + id).update({ imageFinalizationSlots: [0] })
  // A later caller asking for no photos resumes the first operation instead.
  const result = await finalizeJobImages({ uid }, { jobId: id, slots: [] })
  assert.deepEqual(result.imagePaths, ['jobs/' + id + '/0.jpg'])
  assert.deepEqual((await finalizeJobImages({ uid }, { jobId: id, slots: [] })).imagePaths, result.imagePaths)
  assert.equal((await adminBucket.getFiles({ prefix: 'jobs/' + id + '/' }))[0].length, 1)
})

test('Image proxy respects admin and other-city boundaries without issuing tokens', async () => {
  const uid = 'proxy-owner', id = 'proxy-image-job-0001'
  const target = await setup(id, uid)
  await uploadBytes(target, bytes, metadata)
  await finalizeJobImages({ uid }, { jobId: id, slots: [0] })
  await seedDb.doc('admins/proxy-admin').set({ uid: 'proxy-admin' })
  await seedDb.doc('tradespeople/proxy-other-city').set(profile('proxy-other-city', { city: 'Novi Sad' }))
  assert.deepEqual(new Uint8Array(await readJobImage({ uid: 'proxy-admin' }, { jobId: id, slot: 0 })), bytes)
  await assert.rejects(readJobImage({ uid: 'proxy-other-city' }, { jobId: id, slot: 0 }), error => error.code === 'permission-denied')
  await assert.rejects(readJobImage({ uid }, { jobId: id, slot: 1 }), error => error.code === 'not-found')
  const [stored] = await adminBucket.file('jobs/' + id + '/0.jpg').getMetadata()
  assert.ok(!stored.metadata?.firebaseStorageDownloadTokens)
})

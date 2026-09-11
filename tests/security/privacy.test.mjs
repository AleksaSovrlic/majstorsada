import assert from 'node:assert/strict'
import { test } from 'node:test'
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc } from 'firebase/firestore'
import { client, seedDb, profile, job, denied } from './helpers.mjs'

test('Matching zero-token tradesperson sees original feed fields, no phone or email; only winner sees contact', async () => {
  const id = 'privacy-job', owner = 'privacy-owner', matching = 'privacy-matching', other = 'privacy-other'
  await seedDb.doc('jobs/' + id).set(job(owner))
  await seedDb.doc('jobs/' + id + '/private/contact').set({ contactPhone: '+381641234567' })
  await seedDb.doc('tradespeople/' + matching).set(profile(matching))
  await seedDb.doc('tradespeople/' + other).set(profile(other))
  await seedDb.doc('tradespeople/privacy-wrong-trade').set(profile('privacy-wrong-trade', { specialization: 'bravar' }))
  await seedDb.doc('tradespeople/privacy-wrong-city').set(profile('privacy-wrong-city', { city: 'Novi Sad' }))
  await seedDb.doc('admins/privacy-admin').set({ uid: 'privacy-admin' })
  const contact = uid => doc(client(uid).db, 'jobs', id, 'private', 'contact')
  const snapshot = await getDoc(doc(client(matching).db, 'jobs', id))
  const data = snapshot.data()
  assert.equal(data.address, 'Test adresa 1'); assert.equal(data.problemDescription, 'Test popravka')
  assert.equal('contactPhone' in data, false); assert.equal('clientEmail' in data, false)
  for (const uid of [matching, other, 'privacy-wrong-trade', 'privacy-wrong-city', 'privacy-stranger', null]) await denied(getDoc(contact(uid)))
  for (const uid of ['privacy-wrong-trade', 'privacy-wrong-city', 'privacy-stranger', null]) await denied(getDoc(doc(client(uid).db, 'jobs', id)))
  for (const uid of [owner, 'privacy-admin']) assert.equal((await getDoc(contact(uid))).data().contactPhone, '+381641234567')
  const feed = query(collection(client(matching).db, 'jobs'), where('status', '==', 'pending'), where('specializationRequired', '==', 'vodoinstalater'), where('city', '==', 'Beograd'), where('imagesReady', '==', true))
  assert.ok((await getDocs(feed)).docs.some(d => d.id === id))
  await denied(getDocs(collection(client(matching).db, 'jobs')))
  await denied(getDocs(collection(client(owner).db, 'jobs', id, 'private')))
  await denied(updateDoc(contact(owner), { contactPhone: '+381641111111' }))
  await seedDb.doc('jobs/' + id).update({ status: 'accepted', acceptedByTradespersonId: matching })
  assert.equal((await getDoc(contact(matching))).data().contactPhone, '+381641234567')
  await denied(getDoc(contact(other)))
  await denied(getDoc(doc(client(other).db, 'jobs', id)))
  const assigned = query(collection(client(matching).db, 'jobs'), where('acceptedByTradespersonId', '==', matching), where('status', 'in', ['accepted', 'completed']))
  assert.equal((await getDocs(assigned)).size, 1)
  await seedDb.doc('jobs/' + id).update({ status: 'completed' })
  assert.equal((await getDoc(contact(matching))).exists(), true)
})
test('No browser can create a client/admin role or a second role', async () => {
  for (const col of ['clients', 'admins', 'tradespeople']) await denied(setDoc(doc(client('role-attacker').db, col, 'role-attacker'), { uid: 'role-attacker' }))
})

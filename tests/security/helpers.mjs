import assert from 'node:assert/strict'
import { after } from 'node:test'
import { createRequire } from 'node:module'
import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator, terminate, setLogLevel } from 'firebase/firestore'
import { getStorage, connectStorageEmulator } from 'firebase/storage'

export const PROJECT_ID = 'demo-majstorsada-security'
// Fail closed BEFORE initializing any SDK, including the Admin SDK used for fixtures.
assert.equal(process.env.GCLOUD_PROJECT, PROJECT_ID, 'Use npm run test:security (demo project only)')
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8289', 'Local Firestore emulator required')
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9398', 'Local Storage emulator required')
export const functionsRequire = createRequire(new URL('../../functions/package.json', import.meta.url))
const adminApp = functionsRequire('firebase-admin/app')
const adminFirestore = functionsRequire('firebase-admin/firestore')
export const seedDb = adminFirestore.getFirestore(adminApp.initializeApp({ projectId: PROJECT_ID }, 'security-fixtures'))
export const adminDelete = () => adminFirestore.FieldValue.delete()
setLogLevel('silent')
const clients = new Map()
export function client(uid = null) {
  const key = uid ?? 'anonymous'
  if (!clients.has(key)) {
    const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo-key', storageBucket: `${PROJECT_ID}.appspot.com` }, key)
    const options = uid ? { mockUserToken: { sub: uid, email: `${uid}@example.test` } } : {}
    const db = getFirestore(app)
    connectFirestoreEmulator(db, '127.0.0.1', 8289, options)
    const storage = getStorage(app)
    connectStorageEmulator(storage, '127.0.0.1', 9398, options)
    clients.set(key, { app, db, storage })
  }
  return clients.get(key)
}
export async function denied(promise) {
  await assert.rejects(promise, error => error.code === 'permission-denied')
}
export function profile(uid, extra = {}) {
  return {
    uid, displayName: 'Test Majstor', phoneNumber: '+381641234567', email: `${uid}@example.test`,
    specialization: 'vodoinstalater', city: 'Beograd', status: 'unavailable', balanceTokens: 0,
    createdAt: new Date(1000), updatedAt: new Date(1000), ...extra,
  }
}
export function job(clientId, extra = {}) {
  return {
    clientId, clientEmail: `${clientId}@example.test`, contactPhone: '+381641234567',
    status: 'pending', specializationRequired: 'vodoinstalater', city: 'Beograd',
    problemDescription: 'Test popravka', location: 'Test adresa 1', address: 'Test adresa 1',
    coordinates: new adminFirestore.GeoPoint(44.8, 20.46), geohash: 'sry',
    imageUrl: null, imagesReady: false, createdAt: new Date(1000), ...extra,
  }
}
after(async () => {
  await Promise.all([...clients.values()].map(async ({ app, db }) => { await terminate(db); await deleteApp(app) }))
  await Promise.all(adminApp.getApps().map(async app => {
    await adminFirestore.getFirestore(app).terminate()
    await adminApp.deleteApp(app)
  }))
})

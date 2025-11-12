// Seed one test tradesperson into local Firebase emulators (Auth + Firestore)
// Requirements:
// Hardcode emulator hosts for local testing
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9199";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";

import admin from 'firebase-admin'

const projectId = process.env.FIREBASE_PROJECT_ID
  || process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID
  || 'majstorsada-b2ad4'

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId })
}

const AUTH_EMAIL = 'test@majstor.com'
const AUTH_PASSWORD = 'sifra123'
const DISPLAY_NAME = 'Petar Petrovic'
const SPECIALIZATION = 'vodoinstalater'

async function main() {
  const auth = admin.auth()
  const db = admin.firestore()

  // Create or fetch user in Auth emulator
  let user
  try {
    user = await auth.getUserByEmail(AUTH_EMAIL)
    console.log(`Auth user already exists: ${user.uid}`)
  } catch (e) {
    user = await auth.createUser({
      email: AUTH_EMAIL,
      password: AUTH_PASSWORD,
      displayName: DISPLAY_NAME,
      emailVerified: true
    })
    console.log(`Created auth user: ${user.uid}`)
  }

  // Upsert tradesperson profile in Firestore emulator (required fields)
  const profileRef = db.collection('tradespeople').doc(user.uid)
  await profileRef.set({
    displayName: DISPLAY_NAME,
    email: AUTH_EMAIL,
    specialization: SPECIALIZATION,
    status: 'unavailable',
    balanceTokens: 5
  }, { merge: true })
  console.log(`Upserted tradesperson profile for ${user.uid} (status: nedostupan)`) 
}

main()
  .then(() => {
    console.log('Seeding completed successfully.')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Seeding failed:', err)
    process.exit(1)
  })



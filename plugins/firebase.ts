import { initializeApp, getApps } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

export default defineNuxtPlugin(() => {
  if (import.meta.server) {
    return { provide: {} }
  }

  const config = useRuntimeConfig()
  const firebaseConfig = config.public.firebase

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)
  const functions = getFunctions(app, firebaseConfig.functionsRegion)

  if (import.meta.dev) {
    try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }) } catch {}
    try { connectFirestoreEmulator(db, '127.0.0.1', 8080) } catch {}
    try { connectFunctionsEmulator(functions, '127.0.0.1', 5001) } catch {}
  }

  return {
    provide: {
      firebaseApp: app,
      firebaseAuth: auth,
      firestore: db,
      functions
    }
  }
})



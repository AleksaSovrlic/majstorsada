import { initializeApp, getApps, getApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const firebaseConfig = {
    apiKey: config.public.firebase.apiKey,
    authDomain: config.public.firebase.authDomain,
    projectId: config.public.firebase.projectId || 'majstorsada-18a99',
    storageBucket: config.public.firebase.storageBucket,
    messagingSenderId: config.public.firebase.messagingSenderId,
    appId: config.public.firebase.appId,
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

  const auth = getAuth(app)
  const firestore = getFirestore(app)
  const functions = getFunctions(app, config.public.firebase.functionsRegion)

  if (process.env.NODE_ENV === 'development') {
    console.log('!!! REŽIM LOKALNOG RAZVOJA - POVEZUJEM EMULATORE !!!')

    if (typeof window !== 'undefined') {
      console.log('Povezujem Auth emulator na port 9199')
      connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true })
      console.log('Povezujem Firestore emulator na port 8180')
      connectFirestoreEmulator(firestore, '127.0.0.1', 8180)
      console.log('Povezujem Functions emulator na port 5501')
      connectFunctionsEmulator(functions, '127.0.0.1', 5501)
      console.log('Svi emulatori povezani.')
    }
  }

  return {
    provide: {
      firebaseApp: app,
      firebaseAuth: auth,
      firestore,
      functions,
    },
  }
})




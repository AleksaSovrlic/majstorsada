import { getStorage, connectStorageEmulator } from 'firebase/storage'

export default defineNuxtPlugin({
  name: 'storage',
  dependsOn: ['firebase'],
  setup(nuxtApp) {
    const app = (nuxtApp as any).$firebaseApp
    const storage = getStorage(app)

    if (process.env.NODE_ENV === 'development') {
      // Firebase Storage Emulator (must match firebase.json emulators.storage.port)
      connectStorageEmulator(storage, 'localhost', 9399)
    }

    return {
      provide: {
        storage
      }
    }
  }
})



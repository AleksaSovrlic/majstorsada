// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineNuxtConfig({
  srcDir: 'app',
  alias: {
    '@': join(__dirname, 'app')
  },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/tailwind.css'],
  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt'
  ],
  runtimeConfig: {
    public: {
      firebase: {
        apiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
        authDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'localhost',
        projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || 'majstorsada-18a99',
        appId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID || 'demo-app-id',
        messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'demo-sender-id',
        storageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'demo-bucket',
        measurementId: process.env.NUXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-DEMO123',
        functionsRegion: process.env.NUXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west3'
      }
    }
  }
})

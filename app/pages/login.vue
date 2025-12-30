<template>
  <div class="min-h-screen flex items-start justify-center px-4 py-8">
    <div class="w-full max-w-md bg-white rounded-xl shadow p-6">
      <h1 class="text-2xl font-semibold text-gray-900 text-center">Prijava</h1>
      <p class="text-gray-600 text-center mt-1">Unesite e-mail i poslaćemo vam Magic Link.</p>

      <form class="mt-6 space-y-4" @submit.prevent="sendLink">
        <div>
          <label class="block text-sm text-gray-700 mb-1">E-mail</label>
          <input v-model="email" type="email" required autocomplete="email" class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="vaš.email@primer.com" />
        </div>
        <button type="submit" :disabled="sending || resendCooldown > 0" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg shadow active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed">
          {{ sending ? 'Slanje...' : resendCooldown > 0 ? `Ponovo pošalji za ${resendCooldown}s` : '[ Pošalji Magic Link ]' }}
        </button>
      </form>

      <p v-if="infoMsg" class="text-green-700 text-sm mt-4">{{ infoMsg }}</p>
      <p v-if="errorMsg" class="text-red-600 text-sm mt-2">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sendSignInLinkToEmail } from 'firebase/auth'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const sending = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const resendCooldown = ref(0)
let cooldownTimer: number | null = null

function startCooldown(seconds: number) {
  resendCooldown.value = seconds
  if (cooldownTimer) {
    window.clearInterval(cooldownTimer)
  }
  cooldownTimer = window.setInterval(() => {
    if (resendCooldown.value <= 1) {
      window.clearInterval(cooldownTimer as number)
      cooldownTimer = null
      resendCooldown.value = 0
    } else {
      resendCooldown.value -= 1
    }
  }, 1000)
}

onMounted(async () => {
  await authStore.ensureAuthReady()
  if (authStore.currentUser) {
    const from = (route.query.from as string) || sessionStorage.getItem('postAuthRedirect') || '/zahtev'
    router.replace(from)
  }
})

async function sendLink() {
  errorMsg.value = ''
  infoMsg.value = ''
  sending.value = true
  try {
    const { $firebaseAuth } = useNuxtApp()
    const from = (route.query.from as string) || '/zahtev'
    sessionStorage.setItem('postAuthRedirect', from)

    // Canonical continueUrl:
    // - dev: current origin (localhost)
    // - prod: always branded domain (prevents *.web.app links that won't match the installed PWA origin)
    const runtime = useRuntimeConfig()
    const brandedOriginRaw = ((runtime.public as any).siteUrl as string) || 'https://majstorsada.rs'
    const brandedOrigin = brandedOriginRaw.replace(/\/+$/, '')
    const origin = import.meta.dev ? window.location.origin : brandedOrigin

    const actionCodeSettings = {
      url: `${origin}/finishLogin?from=${encodeURIComponent(from)}`,
      handleCodeInApp: true
    }

    await sendSignInLinkToEmail($firebaseAuth, email.value, actionCodeSettings)
    localStorage.setItem('emailForSignIn', email.value)
    infoMsg.value = 'Poslali smo vam Magic Link na e-mail. Otvorite link da dovršite prijavu.'
    startCooldown(10)
  } catch (e: any) {
    if (e?.code === 'auth/invalid-email') {
      errorMsg.value = 'Neispravan e-mail.'
    } else if (e?.code === 'auth/too-many-requests') {
      errorMsg.value = 'Previše pokušaja. Pokušajte kasnije.'
    } else {
      errorMsg.value = e?.message || 'Greška pri slanju Magic Link-a.'
    }
  } finally {
    sending.value = false
  }
}
</script>



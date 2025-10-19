<template>
  <div class="min-h-screen flex items-start justify-center px-4 py-8">
    <div class="w-full max-w-md bg-white rounded-xl shadow p-6">
      <h1 class="text-2xl font-semibold text-gray-900 text-center">Dovršetak prijave</h1>
      <p class="text-gray-600 text-center mt-1">Proveravamo Magic Link...</p>

      <div class="mt-6 space-y-4" v-if="needsEmail">
        <p class="text-gray-700 text-sm">Unesite e-mail na koji ste primili link da dovršite prijavu.</p>
        <input v-model="email" type="email" autocomplete="email" class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="vaš.email@primer.com" />
        <button @click="completeSignIn" :disabled="submitting || !email" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg shadow active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed">
          {{ submitting ? 'Prijavljivanje...' : '[ Dovrši prijavu ]' }}
        </button>
      </div>

      <p v-if="errorMsg" class="text-red-600 text-sm mt-4">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth'
import { useAuthStore } from '@/stores/auth'
import { ensureClientProfile } from '@/utils/clients'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const needsEmail = ref(false)
const submitting = ref(false)
const errorMsg = ref('')

onMounted(async () => {
  const { $firebaseAuth } = useNuxtApp()
  await authStore.ensureAuthReady()

  // If already logged in, redirect immediately
  if (authStore.currentUser) {
    redirectAfter()
    return
  }

  const href = window.location.href
  if (isSignInWithEmailLink($firebaseAuth, href)) {
    const storedEmail = localStorage.getItem('emailForSignIn') || ''
    if (storedEmail) {
      email.value = storedEmail
      await completeSignIn()
    } else {
      needsEmail.value = true
    }
  } else {
    // Not an email link; show error and let user go back to login
    errorMsg.value = 'Link nije validan ili je istekao. Vratite se na prijavu i zatražite novi link.'
    needsEmail.value = false
  }
})

async function completeSignIn() {
  submitting.value = true
  errorMsg.value = ''
  try {
    const { $firebaseAuth } = useNuxtApp()
    const href = window.location.href
    const cred = await signInWithEmailLink($firebaseAuth, email.value, href)
    localStorage.removeItem('emailForSignIn')
    await ensureClientProfile(cred.user.uid, cred.user.email || email.value)
    // Ensure auth.currentUser is available before redirect
    await authStore.ensureAuthReady()
    redirectAfter()
  } catch (e: any) {
    if (e?.code === 'auth/invalid-action-code') {
      errorMsg.value = 'Link je istekao ili je već iskorišćen.'
    } else {
      errorMsg.value = e?.message || 'Neuspešna prijava preko linka.'
    }
  } finally {
    submitting.value = false
  }
}

function redirectAfter() {
  const from = (route.query.from as string) || sessionStorage.getItem('postAuthRedirect') || '/zahtev'
  router.replace(from)
}

const loginHref = computed(() => {
  const from = (route.query.from as string) || sessionStorage.getItem('postAuthRedirect') || '/zahtev'
  return `/login?from=${encodeURIComponent(from)}`
})
</script>



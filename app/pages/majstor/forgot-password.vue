<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-sm bg-white rounded-xl shadow p-6">
      <div class="mb-6 text-center">
        <div class="text-2xl font-bold text-gray-900">MajstorSada</div>
        <div class="text-sm text-gray-500 mt-1">Oporavak lozinke</div>
      </div>
      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-sm text-gray-700 mb-1">Email</label>
          <input v-model="email" type="email" required class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="vas@email.com" />
        </div>
        <button type="submit" :disabled="loading" class="w-full rounded-md bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]">
          {{ loading ? 'Slanje...' : 'Pošalji link za reset' }}
        </button>
        <p v-if="infoMsg" class="text-green-600 text-sm">{{ infoMsg }}</p>
        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
      </form>
      <div class="mt-4 text-sm text-center">
        <NuxtLink to="/majstor/login" class="underline">Nazad na prijavu</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { sendPasswordResetEmail } from 'firebase/auth'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: false })

const router = useRouter()
const authStore = useAuthStore()
const email = ref('')
const loading = ref(false)
const infoMsg = ref('')
const errorMsg = ref('')

onMounted(async () => {
  await authStore.ensureAuthReady()
  if (authStore.currentUser) {
    router.replace('/majstor/dashboard')
  }
})

async function submit() {
  errorMsg.value = ''
  infoMsg.value = ''
  loading.value = true
  try {
    const { $firebaseAuth } = useNuxtApp()
    const origin = window.location.origin
    await sendPasswordResetEmail($firebaseAuth, email.value, {
      url: `${origin}/majstor/login?reset=1`,
      handleCodeInApp: false
    } as any)
    infoMsg.value = 'Ako nalog postoji, link za reset je poslat.'
  } catch (e: any) {
    if (e?.code === 'auth/invalid-email') {
      errorMsg.value = 'Neispravan e-mail.'
    } else if (e?.code === 'auth/user-not-found') {
      infoMsg.value = 'Ako nalog postoji, link za reset je poslat.'
    } else {
      errorMsg.value = e?.message || 'Greška pri slanju linka.'
    }
  } finally {
    loading.value = false
  }
}
</script>



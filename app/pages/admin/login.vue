<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="w-full max-w-sm bg-white border rounded-lg p-6 shadow-sm">
      <h2 class="text-center text-xl font-semibold mb-4">Admin Prijava</h2>
      <form @submit.prevent="onSubmit" class="space-y-3">
        <div>
          <label class="block text-sm text-gray-700 mb-1">Email</label>
          <input v-model="email" type="email" required class="w-full rounded border px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Lozinka</label>
          <input v-model="password" type="password" required class="w-full rounded border px-3 py-2 text-sm" />
        </div>
        <button type="submit" class="w-full bg-black text-white rounded py-2 text-sm hover:bg-gray-800" :disabled="loading">
          {{ loading ? 'Prijava...' : 'Prijavi se' }}
        </button>
        <p v-if="errorMessage" class="text-sm text-red-600 mt-2">{{ errorMessage }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: false })

const ADMIN_EMAIL = 'aleksa.admin@majstorsada.com'

const auth = useAuthStore()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  await auth.ensureAuthReady()
  if (auth.currentUser?.email === ADMIN_EMAIL) {
    await navigateTo('/admin/dashboard')
  }
})

async function onSubmit() {
  errorMessage.value = ''
  loading.value = true
  try {
    await auth.signIn(email.value, password.value)
    if (auth.currentUser?.email !== ADMIN_EMAIL) {
      errorMessage.value = 'Niste admin.'
      await auth.signOut()
      return
    }
    await navigateTo('/admin/dashboard')
  } catch (e: any) {
    errorMessage.value = 'Prijava neuspešna.'
  } finally {
    loading.value = false
  }
}
</script>



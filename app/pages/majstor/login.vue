<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="w-full max-w-sm bg-white rounded-xl shadow p-6">
      <div class="mb-6 text-center">
        <div class="text-2xl font-bold text-gray-900">MajstorSada</div>
        <div class="text-sm text-gray-500 mt-1">Prijava za majstore</div>
      </div>
      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-sm text-gray-700 mb-1">Email</label>
          <input v-model="email" type="email" required
                 class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                 placeholder="vas@email.com" />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Lozinka</label>
          <input v-model="password" type="password" required
                 class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                 placeholder="********" />
        </div>
        <button type="submit" :disabled="loading"
                class="w-full rounded-md bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]">
          {{ loading ? 'Prijavljivanje...' : 'Prijavi se' }}
        </button>
        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
        <p v-if="successMsg" class="text-green-600 text-sm">{{ successMsg }}</p>
      </form>
      <div class="mt-4 flex items-center justify-between text-sm">
        <NuxtLink to="/majstor/register" class="underline">Registracija</NuxtLink>
        <NuxtLink to="/majstor/forgot-password" class="underline">Zaboravljena lozinka</NuxtLink>
      </div>
      <div class="mt-3 text-center text-sm">
        <NuxtLink to="/" class="underline">Nazad na početnu stranicu</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: false })

const auth = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

async function submit() {
  errorMsg.value = ''
  loading.value = true
  try {
    await auth.signIn(email.value, password.value)
    successMsg.value = 'Uspešna prijava.'
    router.push('/majstor/dashboard')
  } catch (e: any) {
    errorMsg.value = e?.message || 'Greška pri prijavi.'
  } finally {
    loading.value = false
  }
}
</script>



<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div class="w-full max-w-xl text-center">
      <h1 class="text-3xl font-bold text-gray-900">Treba vam majstor? Rešenje je na jedan klik.</h1>
      <p class="mt-3 text-gray-600">1. Opišite problem. 2. Pošaljite zahtev. 3. Sačekajte poziv majstora.</p>
      <div class="mt-8">
        <NuxtLink
          :to="ctaHref"
          class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg shadow active:scale-[0.99]"
        >
          [ Zatraži Majstora ]
        </NuxtLink>
      </div>

      <div class="mt-10 text-sm text-gray-500">
        <NuxtLink to="/majstor/login" class="underline">Prijava za majstore</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
await auth.ensureAuthReady()

const ctaHref = computed(() => {
  return auth.currentUser ? '/zahtev' : '/login?from=zahtev'
})
</script>


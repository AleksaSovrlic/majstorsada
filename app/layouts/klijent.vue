<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <NuxtLink to="/" class="text-lg font-semibold text-gray-900">MajstorSada</NuxtLink>
        <div class="flex items-center gap-2">
          <NuxtLink
            to="/zahtev"
            class="text-sm px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99]"
          >[ + Novi Zahtev ]</NuxtLink>
          <button
            class="text-sm px-3 py-2 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300 active:scale-[0.99]"
            @click="onSignOut"
          >Odjava</button>
        </div>
      </div>
    </header>
    <main class="max-w-5xl mx-auto px-4 py-4">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()

async function onSignOut() {
  await auth.signOut()
  router.push('/')
}
</script>



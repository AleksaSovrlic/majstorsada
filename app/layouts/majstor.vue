<template>
  <div class="min-h-screen bg-gray-50">
    <header class="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div class="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
        <h1 class="text-xl font-semibold text-gray-900">MajstorSada</h1>
        <button
          class="text-sm px-3 py-2 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300 active:scale-[0.99]"
          @click="onSignOut"
        >Odjava</button>
      </div>
    </header>
    <main class="max-w-xl mx-auto px-4 py-4">
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
  router.push('/majstor/login')
}
</script>




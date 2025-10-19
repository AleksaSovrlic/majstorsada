<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <NuxtLink to="/" class="inline-flex items-center" aria-label="MajstorSada">
          <img
            src="/logo/logo-32.png"
            srcset="/logo/logo-32.png 1x, /logo/logo-64.png 2x, /logo/logo-96.png 3x"
            alt="MajstorSada"
            class="h-8 w-auto"
            width="32" height="32"
            decoding="async"
            fetchpriority="high"
            @error="onLogoError"
          />
        </NuxtLink>
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

function onLogoError(e: Event) {
  const img = e.target as HTMLImageElement
  if (!img) return
  img.onerror = null
  img.src = '/icons/icon-192.png'
  img.srcset = '/icons/icon-192.png 1x, /icons/icon-192.png 2x, /icons/icon-512.png 3x'
}
</script>



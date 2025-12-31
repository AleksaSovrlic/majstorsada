<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div class="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
        <NuxtLink to="/majstor/dashboard" class="inline-flex items-center" aria-label="MajstorSada">
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
            to="/majstor/recenzije"
            class="h-10 w-10 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            :class="route.path.startsWith('/majstor/recenzije') ? 'bg-gray-100' : ''"
            aria-label="Recenzije"
            title="Recenzije"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
              <path fill="currentColor" d="m12 17.27l5.18 3.73l-1.64-6.03L20 9.24l-6.19-.52L12 3L10.19 8.72L4 9.24l4.46 5.73L6.82 21z" />
            </svg>
          </NuxtLink>
          <NuxtLink
            to="/majstor/podesavanja"
            class="h-10 w-10 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            :class="route.path.startsWith('/majstor/podesavanja') ? 'bg-gray-100' : ''"
            aria-label="Podešavanja"
            title="Podešavanja"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
              <path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.11-.2-.36-.28-.57-.2l-2.39.96c-.5-.38-1.04-.69-1.64-.92l-.36-2.54A.488.488 0 0 0 14.84 2h-3.68c-.24 0-.44.17-.48.41l-.36 2.54c-.6.23-1.14.54-1.64.92l-2.39-.96c-.21-.08-.46 0-.57.2L2.8 8.43c-.11.2-.06.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.92 14.52a.5.5 0 0 0-.12.61l1.92 3.32c.11.2.36.28.57.2l2.39-.96c.5.38 1.04.69 1.64.92l.36 2.54c.04.24.24.41.48.41h3.68c.24 0 .44-.17.48-.41l.36-2.54c.6-.23 1.14-.54 1.64-.92l2.39.96c.21.08.46 0 .57-.2l1.92-3.32c.11-.2.06-.47-.12-.61zM12 15.5A3.5 3.5 0 1 1 15.5 12A3.5 3.5 0 0 1 12 15.5" />
            </svg>
          </NuxtLink>
          <button
            class="text-sm px-3 py-2 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300 active:scale-[0.99]"
            @click="onSignOut"
          >Odjava</button>
        </div>
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
import { useRoute } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

async function onSignOut() {
  await auth.signOut()
  router.push('/majstor/login')
}

function onLogoError(e: Event) {
  const img = e.target as HTMLImageElement
  if (!img) return
  img.onerror = null
  img.src = '/icons/icon-192.png'
  img.srcset = '/icons/icon-192.png 1x, /icons/icon-192.png 2x, /icons/icon-512.png 3x'
}
</script>




<template>
  <div class="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-blue-100">
    <header class="sticky top-0 z-20 bg-white/90 backdrop-blur-md shadow-sm shadow-black/5 ring-1 ring-black/5">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
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
            class="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue text-white px-4 py-2 text-sm font-semibold shadow-sm shadow-blue-500/20 hover:bg-brand-blue-dark transition-transform active:scale-[0.99]"
            aria-label="Novi zahtev"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
              <path fill="currentColor" d="M11 5a1 1 0 0 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6z" />
            </svg>
            Novi zahtev
          </NuxtLink>
          <button
            class="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50/60 transition-transform active:scale-[0.99]"
            @click="onSignOut"
            aria-label="Odjava"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16 13v-2H7V8l-5 4l5 4v-3zM20 3H10a2 2 0 0 0-2 2v4h2V5h10v14H10v-4H8v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2"
              />
            </svg>
            Odjava
          </button>
        </div>
      </div>
    </header>
    <main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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



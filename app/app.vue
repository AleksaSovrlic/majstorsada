<template>
  <div class="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-blue-100">
    <header v-if="showNav" class="sticky top-0 z-10 bg-white border-b border-gray-200">
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
        <ClientOnly>
          <template #default>
            <div>
              <template v-if="isLoggedIn">
                <NuxtLink v-if="role === 'tradesperson'" to="/majstor/dashboard" class="text-sm px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99]">Moj Panel</NuxtLink>
                <NuxtLink v-else-if="role === 'client'" to="/klijent/dashboard" class="text-sm px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99]">Moj Panel</NuxtLink>
                <NuxtLink v-else-if="role === 'admin'" to="/admin/dashboard" class="text-sm px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99]">Admin</NuxtLink>
                <div v-else class="w-28 h-8 rounded-md bg-gray-200" />
              </template>
              <NuxtLink v-else to="/login?from=klijent/dashboard" class="text-sm px-3 py-2 rounded-md bg-gray-900 text-white hover:bg-black active:scale-[0.99]">Prijava</NuxtLink>
            </div>
          </template>
          <template #fallback>
            <div class="w-28 h-8 rounded-md bg-gray-200" />
          </template>
        </ClientOnly>
      </div>
    </header>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

const showNav = computed(() => !route.path.startsWith('/admin') && !route.path.startsWith('/majstor'))
const authReady = computed(() => auth.isInitialized)
const isLoggedIn = computed(() => !!auth.currentUser)
const role = computed(() => auth.role)

// Ensure role is resolved after Magic Link or new tab load, to keep header reactive
onMounted(async () => {
  if (typeof window === 'undefined') return
  if (auth.currentUser && auth.role === 'unknown') {
    try { await auth.resolveUserRole() } catch {}
  }
})

watch(() => auth.currentUser?.uid, async () => {
  if (typeof window === 'undefined') return
  if (auth.currentUser && auth.role === 'unknown') {
    try { await auth.resolveUserRole() } catch {}
  }
})

function onLogoError(e: Event) {
  const img = e.target as HTMLImageElement
  if (!img) return
  img.onerror = null
  img.src = '/icons/icon-192.png'
  img.srcset = '/icons/icon-192.png 1x, /icons/icon-192.png 2x, /icons/icon-512.png 3x'
}
</script>

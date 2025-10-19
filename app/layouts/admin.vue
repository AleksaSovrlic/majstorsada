<template>
  <div class="min-h-screen">
    <header class="border-b bg-white">
      <div class="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
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
          <span class="text-sm text-gray-600">Admin</span>
        </div>
        <button class="text-sm text-red-600 hover:text-red-700" @click="handleSignOut">Odjava</button>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-6">
      <slot />
    </main>
  </div>
 </template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

async function handleSignOut() {
  await auth.signOut()
  await navigateTo('/admin/login')
}

function onLogoError(e: Event) {
  const img = e.target as HTMLImageElement
  if (!img) return
  img.onerror = null
  img.src = '/icons/icon-192.png'
  img.srcset = '/icons/icon-192.png 1x, /icons/icon-192.png 2x, /icons/icon-512.png 3x'
}
</script>



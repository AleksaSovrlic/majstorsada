<template>
  <div class="min-h-screen">
    <header class="border-b bg-white">
      <div class="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <h1 class="text-lg font-semibold">MajstorSada Admin</h1>
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
</script>



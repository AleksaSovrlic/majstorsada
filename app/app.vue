<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

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
</script>

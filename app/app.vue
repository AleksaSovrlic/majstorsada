<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const runtime = useRuntimeConfig()
const canonicalBase = computed(() => {
  const raw = (runtime.public as any).siteUrl as string | undefined
  return (raw || 'https://majstorsada.rs').replace(/\/+$/, '')
})
const canonicalHref = computed(() => `${canonicalBase.value}${route.path}`)

// Global canonical to prevent host/query duplication issues.
useHead(() => ({
  link: [
    { rel: 'canonical', href: canonicalHref.value, key: 'canonical' }
  ]
}))

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

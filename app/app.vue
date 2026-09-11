<template>
  <NuxtLayout>
    <NuxtPage :page-key="pageKey" />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { accountRoute, requiredRole } from '@/utils/accountRoute'

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

// Remount private views immediately on identity changes, including request drafts.
const pageKey = (page: { path: string }) => page.path + (requiredRole(page.path) ? (auth.currentUser?.uid || 'guest') : '')
async function syncSessionRoute() {
  if (!import.meta.client) return
  const uid = auth.currentUser?.uid
  const expected = requiredRole(route.path)
  if (!uid) {
    if (expected) await navigateTo(expected === 'tradesperson' ? '/majstor/login' : expected === 'admin' ? '/admin/login' : '/login')
    return
  }
  try {
    const role = await auth.resolveUserRole()
    if (uid !== auth.currentUser?.uid) return
    if (expected && role !== expected) await navigateTo(accountRoute(role))
  } catch {
    if (uid === auth.currentUser?.uid && expected) await navigateTo('/account')
  }
}
onMounted(syncSessionRoute)
watch(() => auth.currentUser?.uid, syncSessionRoute)
</script>

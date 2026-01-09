<template>
  <PublicHeader
    class="sticky top-0 z-10"
    variant="solid"
    maxWidth="5xl"
    :rightAction="rightAction"
    :backTo="backTo"
  />
  <slot />
</template>

<script setup lang="ts">
import { computed } from 'vue'

const route = useRoute()

const rightAction = computed(() => {
  // Client login should have an "express lane" back action (instead of a self-linking "Prijava" CTA).
  return route.path === '/login' || route.path === '/finishLogin' ? 'back' : 'auto'
})

const backTo = computed(() => {
  if (route.path === '/finishLogin') {
    const from = typeof route.query.from === 'string' && route.query.from ? route.query.from : '/zahtev'
    return `/login?from=${encodeURIComponent(from)}`
  }
  return '/'
})
</script>



<template>
  <PublicHeader
    class="sticky top-0 z-10"
    variant="solid"
    maxWidth="5xl"
    :rightAction="rightAction"
    backTo="/"
  />
  <slot />
</template>

<script setup lang="ts">
import { computed } from 'vue'

const route = useRoute()

// Login has a back action instead of a link to the page already being shown.
const rightAction = computed(() => route.path === '/login' ? 'back' : 'auto')
</script>

<template>
  <div class="bg-white rounded-xl shadow p-4">
    <div class="text-sm text-gray-500">Žetoni</div>
    <div class="mt-1 text-2xl font-bold text-gray-900">{{ tokens }}</div>
  </div>
  
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTradespersonStore } from '@/stores/tradesperson'

const store = useTradespersonStore()
const tokens = computed(() => store.profile?.balanceTokens ?? 0)
</script>



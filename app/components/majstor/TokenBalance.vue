<template>
  <div class="bg-white rounded-xl shadow p-4">
    <div class="flex items-start justify-between">
      <div>
        <div class="text-sm text-gray-500">Žetoni</div>
        <div class="mt-1 text-2xl font-bold text-gray-900">{{ tokens }}</div>
      </div>
      <div class="text-right">
        <div class="text-sm text-gray-500">Ocena</div>
        <div class="mt-1 text-lg font-semibold text-gray-900">{{ averageText }}</div>
      </div>
    </div>
  </div>
  
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTradespersonStore } from '@/stores/tradesperson'

const store = useTradespersonStore()
const tokens = computed(() => store.profile?.balanceTokens ?? 0)
const averageText = computed(() => {
  const avg = store.profile?.averageRating ?? 0
  const cnt = store.profile?.ratingCount ?? 0
  return cnt > 0 ? `${avg} ★ (${cnt})` : '—'
})
</script>



<template>
  <div class="bg-white rounded-xl shadow p-4 flex items-center justify-between">
    <div>
      <div class="text-sm text-gray-500">Status</div>
      <div
        class="text-lg font-semibold"
        :class="[
          isLoading ? 'text-gray-500' : (isAvailable ? 'text-blue-700' : 'text-gray-700'),
          isLoading ? 'animate-pulse' : ''
        ]"
      >
        {{ isLoading ? 'Učitavanje...' : (isAvailable ? 'Dostupan' : 'Nedostupan') }}
      </div>
    </div>

    <button
      :disabled="isDisabled"
      @click="onToggle"
      class="relative w-16 h-9 rounded-full transition-colors"
      :class="[
        isAvailable ? 'bg-blue-600' : 'bg-gray-300',
        isDisabled ? 'opacity-60 cursor-not-allowed' : ''
      ]"
      role="switch"
      :aria-checked="isAvailable ? 'true' : 'false'"
      :aria-busy="(toggling || isLoading) ? 'true' : 'false'"
    >
      <span
        class="absolute top-1 left-1 w-7 h-7 rounded-full bg-white shadow transform transition-transform"
        :class="isAvailable ? 'translate-x-7' : ''"
      />
    </button>
  </div>

  <p v-if="errorMsg" class="mt-2 text-sm text-red-600">{{ errorMsg }}</p>
  
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTradespersonStore } from '@/stores/tradesperson'

const store = useTradespersonStore()
const isAvailable = computed(() => store.profile?.status === 'available')
const isLoading = computed(() => !store.profile)

const toggling = ref(false)
const errorMsg = ref('')
const isDisabled = computed(() => toggling.value || isLoading.value)

async function onToggle() {
  if (isDisabled.value) return
  const next = !isAvailable.value

  errorMsg.value = ''
  toggling.value = true
  try {
    await store.setAvailability(next)
  } catch (e: any) {
    if (import.meta.dev) {
      console.error('[AvailabilityToggle] setAvailability error', e)
    }
    errorMsg.value = e?.message || 'Greška pri promeni dostupnosti.'
  } finally {
    toggling.value = false
  }
}
</script>



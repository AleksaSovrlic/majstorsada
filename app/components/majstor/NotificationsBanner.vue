<template>
  <div v-if="shouldShow" class="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-3 flex items-center justify-between">
    <div>
      <p class="font-medium">Uključite obaveštenja za nove poslove!</p>
      <p v-if="permission === 'denied'" class="text-sm text-red-600 mt-1">
        Notifikacije su blokirane u podešavanjima vašeg browsera. Molimo omogućite ih ručno.
      </p>
    </div>
    <button v-if="permission !== 'denied'" @click="enableNotifications" :disabled="loading" class="ml-4 px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60">
      {{ loading ? 'Uključivanje...' : 'Uključi' }}
    </button>
  </div>
  </template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const nuxt = useNuxtApp() as any
const permission = ref<NotificationPermission>('default')
const loading = ref(false)
const shouldShow = computed(() => permission.value !== 'granted')

onMounted(() => {
  if (typeof Notification !== 'undefined') permission.value = Notification.permission
})

async function enableNotifications() {
  loading.value = true
  try {
    const perm = await nuxt.$fcm.requestPermission()
    permission.value = perm
    if (perm === 'granted') {
      await nuxt.$fcm.getAndSaveFcmToken()
    }
  } finally {
    loading.value = false
  }
}
</script>



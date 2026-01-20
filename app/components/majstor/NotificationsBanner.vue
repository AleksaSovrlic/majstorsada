<template>
  <div
    v-if="shouldShow"
    class="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-black/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
  >
    <div class="flex items-start gap-3">
      <div class="mt-0.5 h-10 w-10 rounded-2xl bg-brand-blue/10 flex items-center justify-center shrink-0" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="h-5 w-5 text-brand-blue" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2m6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1z"
          />
        </svg>
      </div>
      <div class="min-w-0">
        <p class="font-bold text-brand-navy">Uključite obaveštenja za nove poslove</p>
        <p class="mt-1 text-sm text-slate-600 leading-relaxed">
          Notifikacije vam pomažu da reagujete brže i ne propustite posao.
        </p>
        <p v-if="permission === 'denied'" class="mt-2 text-sm text-rose-700">
          Notifikacije su blokirane u podešavanjima vašeg browsera. Molimo omogućite ih ručno.
        </p>
      </div>
    </div>

    <button
      v-if="permission !== 'denied'"
      @click="enableNotifications"
      :disabled="loading"
      class="shrink-0 inline-flex items-center justify-center rounded-xl bg-brand-blue text-white px-5 py-3 text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-brand-blue-dark transition-transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {{ loading ? 'Uključivanje…' : 'Uključi' }}
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



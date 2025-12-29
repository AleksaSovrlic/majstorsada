<template>
  <div class="space-y-4">
    <div class="bg-white rounded-xl shadow p-4">
      <div class="text-lg font-semibold text-gray-900 mb-3">Podešavanja</div>

      <div class="space-y-3">
        <div>
          <label class="block text-sm text-gray-700 mb-1">Grad</label>
          <select v-model="city" class="w-full rounded-md border border-gray-300 px-3 py-2">
            <option v-for="c in SUPPORTED_CITIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Preferencija notifikacija</label>
          <select v-model="pref" class="w-full rounded-md border border-gray-300 px-3 py-2">
            <option value="push">Push</option>
            <option value="viber">Viber</option>
            <option value="sms">SMS</option>
          </select>
        </div>
        <button class="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 active:scale-[0.99]" @click="save" :disabled="saving">
          {{ saving ? 'Čuvanje...' : 'Sačuvaj' }}
        </button>
        <p v-if="msg" class="text-green-600 text-sm">{{ msg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTradespersonStore } from '@/stores/tradesperson'
import { DEFAULT_CITY, SUPPORTED_CITIES, isSupportedCity, type SupportedCity } from '@/utils/cities'

definePageMeta({ layout: 'majstor', middleware: 'auth' })

const auth = useAuthStore()
const tp = useTradespersonStore()
const pref = ref<'push' | 'viber' | 'sms'>('push')
const city = ref<SupportedCity>(DEFAULT_CITY)
const saving = ref(false)
const msg = ref('')

watchEffect(() => {
  if (tp.profile?.notificationPreference) {
    pref.value = tp.profile.notificationPreference
  }
  const c = (tp.profile as any)?.city
  city.value = isSupportedCity(c) ? c : DEFAULT_CITY
})

async function save() {
  msg.value = ''
  saving.value = true
  try {
    await Promise.all([
      tp.setNotificationPreference(pref.value),
      tp.setCity(city.value)
    ])
    msg.value = 'Sačuvano.'
  } finally {
    saving.value = false
  }
}
</script>



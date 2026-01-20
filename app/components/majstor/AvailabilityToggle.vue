<template>
  <section
    aria-label="Dostupnost"
    class="rounded-[2rem] p-6 sm:p-8 shadow-xl ring-1 backdrop-blur"
    :class="
      isLoading
        ? 'bg-white/70 ring-black/5'
        : (isAvailable ? 'bg-emerald-50/70 ring-emerald-200' : 'bg-white/80 ring-black/5')
    "
  >
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="text-sm font-semibold text-slate-500">Status</div>

        <div class="mt-2 flex flex-wrap items-center gap-2">
          <span
            class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1"
            :class="
              isLoading
                ? 'bg-slate-100 text-slate-600 ring-slate-200'
                : (isAvailable ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-700 ring-slate-200')
            "
          >
            {{ isLoading ? 'Učitavanje…' : (isAvailable ? 'Dostupan' : 'Nedostupan') }}
          </span>
          <span class="text-sm text-slate-600">
            {{ isLoading ? 'Učitavanje profila…' : (isAvailable ? 'Spremni ste za nove poslove.' : 'Nećete dobijati nove poslove.') }}
          </span>
        </div>

        <p class="mt-3 text-sm text-slate-600 leading-relaxed">
          Uključite dostupnost kada ste spremni da prihvatite posao u vašem gradu.
        </p>
      </div>

      <button
        :disabled="isDisabled"
        @click="onToggle"
        class="relative w-16 h-9 sm:w-20 sm:h-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/15"
        :class="[
          isAvailable ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 hover:bg-slate-400',
          isDisabled ? 'opacity-60 cursor-not-allowed hover:bg-inherit' : ''
        ]"
        role="switch"
        :aria-checked="isAvailable ? 'true' : 'false'"
        :aria-busy="(toggling || isLoading) ? 'true' : 'false'"
      >
        <span
          class="absolute top-1 left-1 w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-white shadow transform transition-transform"
          :class="isAvailable ? 'translate-x-7 sm:translate-x-9' : ''"
        />
      </button>
    </div>

    <p v-if="errorMsg" class="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
      {{ errorMsg }}
    </p>
  </section>
  
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



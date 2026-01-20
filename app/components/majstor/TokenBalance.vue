<template>
  <section aria-label="Novčanik" class="rounded-[2rem] bg-white/80 backdrop-blur shadow-xl ring-1 ring-black/5 p-6 sm:p-8">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="text-sm font-semibold text-slate-500">Novčanik</div>
        <h2 class="mt-1 text-lg sm:text-xl font-extrabold text-brand-navy tracking-tight">
          Žetoni i ocene
        </h2>
      </div>

      <button
        type="button"
        class="shrink-0 inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue text-white px-4 py-2 text-sm font-semibold shadow-sm shadow-blue-500/20 hover:bg-brand-blue-dark transition-transform active:scale-[0.99]"
        @click="showTopUp = !showTopUp"
        :aria-expanded="showTopUp ? 'true' : 'false'"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
          <path fill="currentColor" d="M11 5a1 1 0 0 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6z" />
        </svg>
        Dopuni
      </button>
    </div>

    <div class="mt-6 grid grid-cols-2 gap-4">
      <div class="rounded-2xl bg-white/70 ring-1 ring-black/5 p-4">
        <div class="text-xs font-semibold text-slate-500">Žetoni</div>
        <div class="mt-1 text-3xl sm:text-4xl font-extrabold text-brand-navy tabular-nums">
          {{ tokens }}
        </div>
        <p class="mt-1 text-xs text-slate-600">
          Koriste se za prihvatanje poslova.
        </p>
      </div>

      <div class="rounded-2xl bg-white/70 ring-1 ring-black/5 p-4">
        <div class="text-xs font-semibold text-slate-500">Ocena</div>
        <div class="mt-1 text-lg sm:text-xl font-bold text-brand-navy tabular-nums">
          {{ averageText }}
        </div>
        <p class="mt-1 text-xs text-slate-600">
          Na osnovu ocena klijenata.
        </p>
      </div>
    </div>

    <div v-if="showTopUp" class="mt-4 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-900 text-sm">
      <div class="font-semibold">Potrebno vam je još žetona?</div>
      <div class="mt-1 text-amber-800">
        Kontaktirajte administratora na broj: <span class="font-semibold">{{ adminTopUpPhone }}</span>
      </div>
    </div>
  </section>
  
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTradespersonStore } from '@/stores/tradesperson'

const store = useTradespersonStore()
const tokens = computed(() => store.profile?.balanceTokens ?? 0)
const averageText = computed(() => {
  const avg = store.profile?.averageRating ?? 0
  const cnt = store.profile?.ratingCount ?? 0
  return cnt > 0 ? `${avg} ★ (${cnt})` : '—'
})

const showTopUp = ref(false)
// Placeholder: replace with a real number when available.
const adminTopUpPhone = '06X/XXX-XXXX'
</script>



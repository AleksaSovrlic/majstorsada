<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <NuxtLink
        to="/majstor/dashboard"
        class="inline-flex items-center gap-2 rounded-full bg-white/60 ring-1 ring-black/5 px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-white transition-transform active:scale-[0.99]"
      >
        <span aria-hidden="true">←</span>
        Nazad na panel
      </NuxtLink>
    </div>

    <div class="text-center">
      <h1 class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
        Recenzije
      </h1>
      <p class="mt-1 text-slate-600">
        Prikazane su samo ocene koje su klijenti ostavili nakon završenog posla.
      </p>
    </div>

    <div v-if="errorMsg" class="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-rose-800 text-sm">
      {{ errorMsg }}
    </div>

    <section aria-label="Lista recenzija">
      <div v-if="loading" class="rounded-[2rem] bg-white/70 backdrop-blur ring-1 ring-black/5 p-8 text-center">
        <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
            <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m1 14h-2v-6h2zm0-8h-2V6h2z" />
          </svg>
        </div>
        <div class="text-sm text-slate-600">Učitavanje…</div>
      </div>

      <div v-else-if="reviews.length === 0" class="rounded-[2rem] bg-white/70 backdrop-blur ring-1 ring-black/5 p-8 text-center">
        <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
            <path fill="currentColor" d="m12 17.27l5.18 3.73l-1.64-6.03L20 9.24l-6.19-.52L12 3L10.19 8.72L4 9.24l4.46 5.73L6.82 21z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-brand-navy">Još nema recenzija</h2>
        <p class="mt-2 text-slate-600">
          Recenzije će se pojaviti nakon što klijenti ocene završene poslove.
        </p>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="r in reviews"
          :key="r.jobId"
          class="bg-white/80 backdrop-blur rounded-[2rem] ring-1 ring-black/5 shadow-sm p-5 sm:p-6 flex flex-col"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-base font-extrabold text-brand-navy tracking-tight truncate">
                {{ r.problemDescription || 'Posao' }}
              </div>

              <div class="mt-2 flex items-center gap-2">
                <div class="flex items-center gap-0.5" aria-label="Ocena">
                  <span
                    v-for="star in 5"
                    :key="star"
                    class="text-lg leading-none"
                    :class="r.rating >= star ? 'text-yellow-500' : 'text-slate-300'"
                  >★</span>
                </div>
                <div class="text-sm font-semibold text-slate-700 tabular-nums">
                  {{ r.rating }}/5
                </div>
              </div>
            </div>

            <div class="text-xs text-slate-500 whitespace-nowrap">
              {{ formatTimestamp(r.completedAt || r.ratingAt) }}
            </div>
          </div>

          <div class="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-black/5 text-sm text-slate-700 whitespace-pre-line flex-1">
            <span v-if="r.ratingComment">{{ r.ratingComment }}</span>
            <span v-else class="text-slate-500">(Bez komentara)</span>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: 'majstor', middleware: 'auth' })

useSeoMeta({
  title: 'Recenzije — MajstorSada',
  description: 'Pregled recenzija i ocena nakon završenih poslova.',
  robots: 'noindex, nofollow'
})

const auth = useAuthStore()
const reviews = ref<any[]>([])
const loading = ref(true)
const errorMsg = ref('')
let unsub: (() => void) | null = null

onMounted(async () => {
  await auth.ensureAuthReady()
  const uid = auth.currentUser?.uid
  if (!uid) {
    loading.value = false
    return
  }
  const { $firestore } = useNuxtApp()
  const col = collection($firestore, 'jobs')
  const q = query(
    col,
    where('acceptedByTradespersonId', '==', uid),
    where('status', '==', 'completed'),
    orderBy('completedAt', 'desc')
  )
  unsub = onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) }))
      // Only rated completed jobs belong to "Recenzije"
      reviews.value = all
        .filter((j) => typeof j.rating === 'number' && j.rating >= 1 && j.rating <= 5)
        .map((j) => ({
          jobId: j.jobId,
          problemDescription: j.problemDescription,
          rating: j.rating,
          ratingComment: (j.ratingComment || '').toString().trim(),
          ratingAt: j.ratingAt,
          completedAt: j.completedAt
        }))
      loading.value = false
      errorMsg.value = ''
    },
    (err) => {
      console.warn('[recenzije] onSnapshot error', err)
      errorMsg.value = 'Ne mogu da učitam recenzije.'
      loading.value = false
    }
  )
})

onBeforeUnmount(() => {
  if (unsub) { unsub(); unsub = null }
})

function formatTimestamp(ts: any): string {
  if (!ts) return ''
  try {
    if (typeof ts?.toDate === 'function') return ts.toDate().toLocaleString('sr-RS')
    if (ts instanceof Date) return ts.toLocaleString('sr-RS')
    if (typeof ts === 'string') {
      const d = new Date(ts)
      if (!Number.isNaN(d.getTime())) return d.toLocaleString('sr-RS')
    }
  } catch {
    // ignore
  }
  return ''
}
</script>



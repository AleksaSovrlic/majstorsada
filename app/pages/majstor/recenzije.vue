<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <NuxtLink to="/majstor/dashboard" class="text-sm text-blue-700 hover:underline">← Nazad na panel</NuxtLink>
    </div>

    <div class="bg-white rounded-xl shadow p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-lg font-semibold text-gray-900">Recenzije</div>
          <div class="text-sm text-gray-500">Prikazane su samo ocene koje su klijenti ostavili nakon završenog posla.</div>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      <div v-for="r in reviews" :key="r.jobId" class="bg-white rounded-xl shadow p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-gray-900 truncate">{{ r.problemDescription || 'Posao' }}</div>
            <div class="mt-1 flex items-center gap-2">
              <div class="flex items-center gap-0.5" aria-label="Ocena">
                <span
                  v-for="star in 5"
                  :key="star"
                  class="text-lg leading-none"
                  :class="r.rating >= star ? 'text-yellow-500' : 'text-gray-300'"
                >★</span>
              </div>
              <div class="text-sm text-gray-600">{{ r.rating }}/5</div>
            </div>
          </div>
          <div class="text-xs text-gray-500 whitespace-nowrap">
            {{ formatTimestamp(r.completedAt || r.ratingAt) }}
          </div>
        </div>

        <div v-if="r.ratingComment" class="mt-3 text-sm text-gray-800 whitespace-pre-line">
          {{ r.ratingComment }}
        </div>
        <div v-else class="mt-3 text-sm text-gray-500">(Bez komentara)</div>
      </div>

      <div v-if="reviews.length === 0 && !loading" class="text-sm text-gray-500 text-center py-10">
        Još uvek nema recenzija.
      </div>
      <div v-if="loading" class="text-sm text-gray-500 text-center py-10">
        Učitavanje...
      </div>
      <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: 'majstor', middleware: 'auth' })

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



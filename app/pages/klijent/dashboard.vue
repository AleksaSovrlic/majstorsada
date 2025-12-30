<template>
  <div class="space-y-8">
    <section>
      <h2 class="text-xl font-bold text-gray-900">Na čekanju</h2>
      <div class="mt-3 space-y-3">
        <div v-for="j in pending" :key="j.jobId" class="bg-white rounded-xl shadow p-6">
          <div class="text-lg font-semibold text-gray-900">{{ j.problemDescription }}</div>
          <div class="text-sm text-gray-600 mt-1">{{ j.location }} · {{ j.specializationRequired }}</div>
          <div class="pt-3 flex items-center justify-end">
            <button
              class="px-4 py-2 rounded-lg bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
              :disabled="isCanceling(j.jobId)"
              @click="cancelJob(j.jobId)"
            >
              {{ isCanceling(j.jobId) ? 'Otkazivanje...' : 'Otkaži zahtev' }}
            </button>
          </div>
        </div>
        <div v-if="pending.length === 0" class="text-sm text-gray-500">Nema poslova na čekanju.</div>
        <p v-if="cancelErrorMsg" class="text-sm text-red-600">{{ cancelErrorMsg }}</p>
      </div>
    </section>

    <section>
      <h2 class="text-xl font-bold text-gray-900">Prihvaćeni</h2>
      <div class="mt-3 space-y-3">
        <div v-for="j in accepted" :key="j.jobId" class="bg-white rounded-xl shadow p-6">
          <div class="text-lg font-semibold text-gray-900">{{ j.problemDescription }}</div>
          <div class="text-sm text-gray-600 mt-1">{{ j.location }} · {{ j.specializationRequired }}</div>
          <div v-if="j.acceptedByTradespersonProfile" class="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <div>
              <div class="text-gray-500">Majstor</div>
              <div class="text-gray-900">{{ j.acceptedByTradespersonProfile.displayName || 'Nepoznato' }}</div>
            </div>
            <div>
              <div class="text-gray-500">Ocena</div>
              <div class="text-gray-900">
                <span v-if="(j.acceptedByTradespersonProfile.averageRating || 0) > 0">
                  {{ j.acceptedByTradespersonProfile.averageRating }} ★ ({{ j.acceptedByTradespersonProfile.ratingCount || 0 }})
                </span>
                <span v-else>Još nema ocena</span>
              </div>
            </div>
            <div>
              <div class="text-gray-500">Telefon</div>
              <div class="text-gray-900">{{ j.acceptedByTradespersonProfile.phoneNumber || '—' }}</div>
            </div>
          </div>
        </div>
        <div v-if="accepted.length === 0" class="text-sm text-gray-500">Nema prihvaćenih poslova.</div>
      </div>
    </section>

    <section>
      <h2 class="text-xl font-bold text-gray-900">Završeni</h2>
      <div class="mt-3 space-y-3">
        <div v-for="j in completed" :key="j.jobId" class="bg-white rounded-xl shadow p-6">
          <div class="text-lg font-semibold text-gray-900">{{ j.problemDescription }}</div>
          <div class="text-sm text-gray-600 mt-1">{{ j.location }} · {{ j.specializationRequired }}</div>
          <div class="pt-3 flex items-center gap-2">
            <button v-if="!j.rating" class="px-4 py-2 rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:scale-[0.99]" @click="openRating(j)">Oceni</button>
            <div v-else class="text-sm text-gray-800">Ocena: {{ j.rating }} ★</div>
          </div>
        </div>
        <div v-if="completed.length === 0" class="text-sm text-gray-500">Nema završenih poslova.</div>
      </div>
    </section>

    <section>
      <h2 class="text-xl font-bold text-gray-900">Otkazani</h2>
      <div class="mt-3 space-y-3">
        <div v-for="j in canceled" :key="j.jobId" class="bg-white rounded-xl shadow p-6">
          <div class="text-lg font-semibold text-gray-900">{{ j.problemDescription }}</div>
          <div class="text-sm text-gray-600 mt-1">{{ j.location }} · {{ j.specializationRequired }}</div>
          <div v-if="formatTimestamp(j.canceledAt)" class="text-xs text-gray-500 mt-2">
            Otkazano: {{ formatTimestamp(j.canceledAt) }}
          </div>
        </div>
        <div v-if="canceled.length === 0" class="text-sm text-gray-500">Nema otkazanih zahteva.</div>
      </div>
    </section>

    <div v-if="showModal" class="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow p-6 w-full max-w-sm">
        <h3 class="text-lg font-semibold text-gray-900">Ocenite posao</h3>
        <div class="mt-4 flex items-center gap-2">
          <button v-for="star in 5" :key="star" class="text-2xl" :class="(ratingStars || 0) >= star ? 'text-yellow-500' : 'text-gray-300'" @click="ratingStars = star">★</button>
        </div>
        <textarea v-model="ratingComment" class="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" rows="3" placeholder="(Opciono) Kratak komentar"></textarea>
        <div class="mt-4 flex items-center justify-end gap-2">
          <button class="px-4 py-2 rounded-md bg-gray-200 text-gray-800" @click="showModal = false">Otkaži</button>
          <button class="px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-60" :disabled="!ratingStars" @click="submitRating">Pošalji</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: 'klijent', middleware: 'client-auth' })

const auth = useAuthStore()
const pending = ref<any[]>([])
const accepted = ref<any[]>([])
const completed = ref<any[]>([])
const canceled = ref<any[]>([])

let unsubPending: (() => void) | null = null
let unsubAccepted: (() => void) | null = null
let unsubCompleted: (() => void) | null = null
let unsubCanceled: (() => void) | null = null

const cancelingJobIds = ref<Set<string>>(new Set())
const cancelErrorMsg = ref('')

const showModal = ref(false)
const ratingStars = ref<number | null>(null)
const ratingComment = ref('')
let ratingJobId: string | null = null

onMounted(async () => {
  await auth.ensureAuthReady()
  const user = auth.currentUser
  if (!user) return
  const { $firestore } = useNuxtApp()
  const col = collection($firestore, 'jobs')

  unsubPending = onSnapshot(query(col, where('clientId', '==', user.uid), where('status', '==', 'pending')), (snap) => {
    pending.value = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) }))
  })
  unsubAccepted = onSnapshot(query(col, where('clientId', '==', user.uid), where('status', '==', 'accepted')), (snap) => {
    accepted.value = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) }))
  })
  unsubCompleted = onSnapshot(query(col, where('clientId', '==', user.uid), where('status', '==', 'completed')), (snap) => {
    completed.value = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) }))
  })
  unsubCanceled = onSnapshot(
    query(col, where('clientId', '==', user.uid), where('status', '==', 'canceled'), orderBy('canceledAt', 'desc')),
    (snap) => {
      canceled.value = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) }))
    }
  )
})

onBeforeUnmount(() => {
  if (unsubPending) { unsubPending(); unsubPending = null }
  if (unsubAccepted) { unsubAccepted(); unsubAccepted = null }
  if (unsubCompleted) { unsubCompleted(); unsubCompleted = null }
  if (unsubCanceled) { unsubCanceled(); unsubCanceled = null }
})

function openRating(job: any) {
  ratingJobId = job.jobId
  ratingStars.value = null
  ratingComment.value = ''
  showModal.value = true
}

async function submitRating() {
  if (!ratingJobId || !ratingStars.value) return
  const { $firebaseAuth } = useNuxtApp()
  const idToken = await $firebaseAuth.currentUser?.getIdToken()
  if (!idToken) return
  const config = useRuntimeConfig()
  const projectId = config.public.firebase.projectId || 'majstorsada-b2ad4'
  const region = config.public.firebase.functionsRegion || 'europe-west3'
  const base = process.env.NODE_ENV === 'development'
    ? `http://localhost:5501/${projectId}/${region}`
    : `https://${region}-${projectId}.cloudfunctions.net`
  const resp = await fetch(`${base}/submitJobRating`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({ data: { jobId: ratingJobId, stars: ratingStars.value, comment: ratingComment.value } })
  })
  if (resp.ok) {
    // Optimistic: hide modal; onSnapshot will reveal rating
    showModal.value = false
  }
}

function isCanceling(jobId: string): boolean {
  return cancelingJobIds.value.has(jobId)
}

function formatTimestamp(ts: any): string {
  if (!ts) return ''
  try {
    if (typeof ts?.toDate === 'function') {
      return ts.toDate().toLocaleString('sr-RS')
    }
    if (ts instanceof Date) {
      return ts.toLocaleString('sr-RS')
    }
  } catch {
    // ignore
  }
  return ''
}

async function cancelJob(jobId: string) {
  if (!jobId) return
  if (isCanceling(jobId)) return
  const ok = confirm('Da li ste sigurni da želite da otkažete ovaj zahtev?')
  if (!ok) return

  cancelErrorMsg.value = ''
  cancelingJobIds.value = new Set(cancelingJobIds.value).add(jobId)
  try {
    const { $firestore } = useNuxtApp()
    await updateDoc(doc($firestore, 'jobs', jobId), {
      status: 'canceled',
      canceledAt: serverTimestamp()
    })
    // Optimistic: immediately remove from pending list; onSnapshot will reconcile anyway.
    pending.value = pending.value.filter((j) => j.jobId !== jobId)
  } catch (e: any) {
    cancelErrorMsg.value = e?.message || 'Greška pri otkazivanju zahteva.'
  } finally {
    const next = new Set(cancelingJobIds.value)
    next.delete(jobId)
    cancelingJobIds.value = next
  }
}
</script>



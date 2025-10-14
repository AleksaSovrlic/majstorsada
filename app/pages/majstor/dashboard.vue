<template>
  <div class="space-y-6">
    <ClientOnly>
      <NotificationsBanner />
    </ClientOnly>
    <div class="grid md:grid-cols-2 gap-4">
      <div class="bg-white rounded-xl shadow p-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Dostupnost</h3>
        </div>
        <div class="mt-3">
          <AvailabilityToggle />
        </div>
      </div>
      <div class="bg-white rounded-xl shadow p-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Žetoni</h3>
        </div>
        <div class="mt-3">
          <TokenBalance />
        </div>
      </div>
    </div>

    <div class="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3">
      Potrebno Vam je još žetona? Kontaktirajte administratora na broj: 06X/XXX-XXXX
    </div>

    <section>
      <h2 class="text-xl font-bold text-gray-900">Novi poslovi</h2>
      <div class="pt-2 space-y-3">
        <NewJobCard v-for="j in newJobs" :key="j.jobId" :job="j" @dismiss="onDismiss(j.jobId)" @accepted="onAccepted" />
        <div v-if="newJobs.length === 0" class="text-sm text-gray-500 text-center py-6">Nema novih poslova trenutno.</div>
      </div>
    </section>

    <section>
      <h2 class="text-xl font-bold text-gray-900">Aktivni poslovi</h2>
      <div class="pt-2 space-y-3">
        <div v-for="j in activeJobs" :key="j.jobId" class="bg-white rounded-xl shadow p-6 space-y-2">
          <div class="text-lg font-semibold text-gray-900">{{ j.problemDescription }}</div>
          <div class="text-sm text-gray-600">{{ j.location }} · {{ j.specializationRequired }}</div>
          <div class="text-sm text-gray-800 mt-1">Kontakt: {{ j.contactPhone }}</div>
          <div class="pt-2 flex items-center gap-2">
            <button class="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium shadow-sm hover:bg-blue-700 active:scale-[0.99]" :disabled="finishingJobIds.has(j.jobId)" @click="onFinish(j.jobId)">
              {{ finishingJobIds.has(j.jobId) ? 'Završavanje...' : 'Završi Posao' }}
            </button>
          </div>
        </div>
        <div v-if="activeJobs.length === 0" class="text-sm text-gray-500 text-center py-6">Nema aktivnih poslova.</div>
      </div>
    </section>

    <section>
      <h2 class="text-xl font-bold text-gray-900">Završeni poslovi</h2>
      <div class="pt-2 space-y-3">
        <div v-for="j in completedJobs" :key="j.jobId" class="bg-white rounded-xl shadow p-6 space-y-2">
          <div class="text-lg font-semibold text-gray-900">{{ j.problemDescription }}</div>
          <div class="text-sm text-gray-600">{{ j.location }} · {{ j.specializationRequired }}</div>
        </div>
        <div v-if="completedJobs.length === 0" class="text-sm text-gray-500 text-center py-6">Nema završenih poslova.</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import AvailabilityToggle from '@/components/majstor/AvailabilityToggle.vue'
import TokenBalance from '@/components/majstor/TokenBalance.vue'
import NewJobCard from '@/components/majstor/NewJobCard.vue'
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import NotificationsBanner from '@/components/majstor/NotificationsBanner.vue'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'
import { useTradespersonStore } from '@/stores/tradesperson'

definePageMeta({ layout: 'majstor', middleware: 'auth' })

const auth = useAuthStore()
const tpStore = useTradespersonStore()
const newJobs = ref<Array<any>>([])
const activeJobs = ref<Array<any>>([])
const completedJobs = ref<Array<any>>([])
let unsub: (() => void) | null = null
let unsubActive: (() => void) | null = null
let unsubCompleted: (() => void) | null = null
const finishingJobIds = new Set<string>()
const errorMsg = ref('')
const successMsg = ref('')

function startJobsFeed() {
  stopPendingFeed()
  const { $firestore } = useNuxtApp()
  const col = collection($firestore, 'jobs')
  // Guard: only subscribe when available and specialization is set
  const isAvailable = tpStore.profile?.status === 'available'
  const spec = tpStore.profile?.specialization
  if (!isAvailable || !spec) {
    newJobs.value = []
    return
  }
  const constraints: any[] = [where('status', '==', 'pending'), where('specializationRequired', '==', spec)]
  const q = query(col, ...constraints)
  unsub = onSnapshot(q, (snap) => {
    const raw = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) }))
    const dismissed = new Set(tpStore.profile?.dismissedJobs || [])
    newJobs.value = raw.filter((j) => !dismissed.has(j.jobId))
  })
}
function startOwnedFeeds() {
  const uid = auth.currentUser?.uid || ''
  const { $firestore } = useNuxtApp()
  if (!uid) {
    if (unsubActive) { unsubActive(); unsubActive = null }
    if (unsubCompleted) { unsubCompleted(); unsubCompleted = null }
    activeJobs.value = []
    completedJobs.value = []
    return
  }
  if (unsubActive) { unsubActive(); unsubActive = null }
  if (unsubCompleted) { unsubCompleted(); unsubCompleted = null }
  // Single owned feed: subscribe by owner, split by status client-side
  unsubActive = onSnapshot(
    query(collection($firestore, 'jobs'), where('acceptedByTradespersonId', '==', uid)),
    (snap) => {
      const all = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) }))
      activeJobs.value = all.filter((j) => j.status === 'accepted')
      completedJobs.value = all.filter((j) => j.status === 'completed')
    }
  )
}

function stopPendingFeed() {
  if (unsub) { unsub(); unsub = null }
}

function stopOwnedFeeds() {
  if (unsubActive) { unsubActive(); unsubActive = null }
  if (unsubCompleted) { unsubCompleted(); unsubCompleted = null }
}

function onDismiss(jobId: string) {
  tpStore.dismissJob(jobId)
}

function onAccepted(job: any) {
  // Optimistički ukloni iz "Novi"
  newJobs.value = newJobs.value.filter((j) => j.jobId !== job.jobId)
  // Optimistički dodaj u "Aktivni" ako već nije tamo
  if (!activeJobs.value.some((j) => j.jobId === job.jobId)) {
    activeJobs.value = [{ ...job, status: 'accepted' }, ...activeJobs.value]
  }
  // Konsoliduj sa Firestore feedom
  startOwnedFeeds()
}

onMounted(async () => {
  await auth.ensureAuthReady()
  if (auth.currentUser) {
    tpStore.subscribeProfile(auth.currentUser.uid)
  }
  // Proaktivna sinhronizacija FCM tokena
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const nuxt = useNuxtApp() as any
    await nuxt.$fcm?.getAndSaveFcmToken?.()
  }
  startOwnedFeeds()
})

watch(
  () => ({ status: tpStore.profile?.status, spec: tpStore.profile?.specialization }),
  () => {
    if (tpStore.profile?.status !== 'available') {
      stopPendingFeed()
      newJobs.value = []
      return
    }
    startJobsFeed()
  },
  { deep: false, immediate: true }
)

watch(() => auth.currentUser?.uid, () => {
  // Re-subscribe owned feeds if UID becomes available or changes
  startOwnedFeeds()
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const nuxt = useNuxtApp() as any
    nuxt.$fcm?.getAndSaveFcmToken?.()
  }
})

watch(() => tpStore.profile?.dismissedJobs, () => {
  // Re-filter new jobs when dismissed list changes
  if (newJobs.value.length > 0) {
    const dismissed = new Set(tpStore.profile?.dismissedJobs || [])
    newJobs.value = newJobs.value.filter((j) => !dismissed.has(j.jobId))
  }
})

onBeforeUnmount(() => {
  stopPendingFeed()
  stopOwnedFeeds()
  tpStore.unsubscribe()
})

async function onFinish(jobId: string) {
  if (finishingJobIds.has(jobId)) return
  finishingJobIds.add(jobId)
  errorMsg.value = ''
  successMsg.value = ''
  try {
    const authStore = useAuthStore()
    await authStore.ensureAuthReady()
    const { $firebaseAuth } = useNuxtApp()
    const idToken = await $firebaseAuth.currentUser?.getIdToken()
    if (!idToken) throw new Error('Niste prijavljeni.')

    const config = useRuntimeConfig()
    const projectId = config.public.firebase.projectId || 'majstorsada-18a99'
    const region = config.public.firebase.functionsRegion || 'europe-west3'
    const base = process.env.NODE_ENV === 'development'
      ? `http://localhost:5501/${projectId}/${region}`
      : `https://${region}-${projectId}.cloudfunctions.net`

    const resp = await fetch(`${base}/markJobAsComplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ data: { jobId } })
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok || json?.ok === false) {
      // Treat 412 as idempotent success
      const msg = (json?.error || '').toString()
      if (resp.status === 412 || /precondition/i.test(msg)) {
        successMsg.value = 'Posao je već označen kao završen.'
      } else {
        throw new Error(json?.error || 'Greška pri završetku posla.')
      }
    } else {
      successMsg.value = 'Posao je označen kao završen.'
    }
    // Optimistic UI: move from active to completed immediately
    const idx = activeJobs.value.findIndex((j) => j.jobId === jobId)
    if (idx !== -1) {
      const job = activeJobs.value[idx]
      activeJobs.value.splice(idx, 1)
      completedJobs.value = [{ ...job, status: 'completed', completedAt: new Date().toISOString() }, ...completedJobs.value]
    }
  } catch (e: any) {
    errorMsg.value = e?.message || 'Greška pri završetku posla.'
  } finally {
    finishingJobIds.delete(jobId)
  }
}
</script>



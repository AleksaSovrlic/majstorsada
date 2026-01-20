<template>
  <div class="space-y-6">
    <!-- Top overview -->
    <div class="text-center">
      <h1 class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
        Majstorski komandni centar
      </h1>
      <p class="mt-1 text-slate-600">
        Novi poslovi i status se ažuriraju u realnom vremenu.
      </p>
    </div>

    <ClientOnly>
      <NotificationsBanner />
    </ClientOnly>

    <!-- HERO GRID -->
    <section aria-label="Pregled" class="grid gap-4 lg:grid-cols-2">
      <AvailabilityToggle />
      <TokenBalance />
    </section>

    <!-- JOBS TABS -->
    <section aria-labelledby="jobs-title" class="rounded-[2rem] bg-white/70 backdrop-blur ring-1 ring-black/5 shadow-sm p-4 sm:p-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 id="jobs-title" class="text-lg sm:text-xl font-extrabold text-brand-navy tracking-tight">
            Poslovi
          </h2>
          <p class="mt-1 text-sm text-slate-600">
            Organizovano po standardu modernih SaaS panela.
          </p>
        </div>
      </div>

      <div class="mt-4">
        <div
          role="tablist"
          aria-label="Poslovi"
          class="grid grid-cols-3 rounded-2xl bg-slate-100/80 p-1 ring-1 ring-black/5"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'new' ? 'true' : 'false'"
            class="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/15"
            :class="activeTab === 'new' ? 'bg-white text-brand-navy shadow-sm ring-1 ring-black/5' : 'text-slate-600 hover:text-brand-navy'"
            @click="activeTab = 'new'"
          >
            Novi
            <span
              v-if="newJobs.length > 0"
              class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand-blue text-white text-xs font-bold tabular-nums"
              aria-label="Broj novih poslova"
            >
              {{ newJobs.length }}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'active' ? 'true' : 'false'"
            class="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/15"
            :class="activeTab === 'active' ? 'bg-white text-brand-navy shadow-sm ring-1 ring-black/5' : 'text-slate-600 hover:text-brand-navy'"
            @click="activeTab = 'active'"
          >
            Aktivni
            <span
              v-if="activeJobs.length > 0"
              class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand-blue text-white text-xs font-bold tabular-nums"
              aria-label="Broj aktivnih poslova"
            >
              {{ activeJobs.length }}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'history' ? 'true' : 'false'"
            class="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/15"
            :class="activeTab === 'history' ? 'bg-white text-brand-navy shadow-sm ring-1 ring-black/5' : 'text-slate-600 hover:text-brand-navy'"
            @click="activeTab = 'history'"
          >
            Istorija
          </button>
        </div>
      </div>

      <div class="mt-5">
        <!-- TAB: NEW -->
        <div v-if="activeTab === 'new'" role="tabpanel" class="space-y-3">
          <template v-if="newJobs.length > 0">
            <NewJobCard
              v-for="j in newJobs"
              :key="j.jobId"
              :job="j"
              @dismiss="onDismiss(j.jobId)"
              @accepted="onAccepted"
            />
            <div v-if="dismissErrorMsg" class="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-rose-800 text-sm">
              {{ dismissErrorMsg }}
            </div>
          </template>

          <div v-else class="rounded-[2rem] bg-white/60 backdrop-blur ring-1 ring-black/5 p-8 text-center">
            <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
                <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m1 15h-2v-2h2zm0-4h-2V7h2z" />
              </svg>
            </div>
            <h3 class="text-xl font-bold text-brand-navy">Nema novih poslova</h3>
            <p class="mt-2 text-slate-600">
              Ostanite <span class="font-semibold">dostupni</span> — čim stigne novi posao, pojaviće se ovde.
            </p>
          </div>
        </div>

        <!-- TAB: ACTIVE -->
        <div v-else-if="activeTab === 'active'" role="tabpanel" class="space-y-3">
          <div v-if="errorMsg" class="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-rose-800 text-sm">
            {{ errorMsg }}
          </div>
          <div v-if="successMsg" class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-sm">
            {{ successMsg }}
          </div>

          <template v-if="activeJobs.length > 0">
            <div
              v-for="j in activeJobs"
              :key="j.jobId"
              class="bg-white/80 backdrop-blur rounded-[2rem] ring-1 ring-black/5 shadow-sm p-5 sm:p-6"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-lg font-extrabold text-brand-navy tracking-tight">
                    {{ j.problemDescription }}
                  </div>
                  <div class="mt-1 text-sm text-slate-600">
                    {{ j.specializationRequired }}
                  </div>
                </div>
                <span class="shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                  Aktivno
                </span>
              </div>

              <div class="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                <div class="rounded-2xl bg-slate-50 p-4 ring-1 ring-black/5">
                  <div class="text-xs text-slate-500">Lokacija</div>
                  <div class="font-semibold text-brand-navy">
                    {{ j.location || '—' }}
                  </div>
                </div>
                <div class="rounded-2xl bg-slate-50 p-4 ring-1 ring-black/5">
                  <div class="text-xs text-slate-500">Kontakt</div>
                  <div class="font-semibold text-brand-navy">
                    {{ j.contactPhone || '—' }}
                  </div>
                </div>
              </div>

              <div class="mt-4 flex items-center gap-2">
                <button
                  class="inline-flex items-center justify-center rounded-xl bg-brand-blue text-white px-5 py-3 text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-brand-blue-dark transition-transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
                  :disabled="finishingJobIds.has(j.jobId)"
                  @click="onFinish(j.jobId)"
                >
                  {{ finishingJobIds.has(j.jobId) ? 'Završavanje…' : 'Završi posao' }}
                </button>
              </div>
            </div>
          </template>

          <div v-else class="rounded-[2rem] bg-white/60 backdrop-blur ring-1 ring-black/5 p-8 text-center">
            <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
                <path fill="currentColor" d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m0 2v16h10V4zm2 3h6v2H9zm0 4h6v2H9z" />
              </svg>
            </div>
            <h3 class="text-xl font-bold text-brand-navy">Nema aktivnih poslova</h3>
            <p class="mt-2 text-slate-600">
              Kada prihvatite posao iz taba <span class="font-semibold">Novi</span>, pojaviće se ovde.
            </p>
          </div>
        </div>

        <!-- TAB: HISTORY -->
        <div v-else role="tabpanel" class="space-y-3">
          <template v-if="completedJobs.length > 0">
            <div
              v-for="j in completedJobs"
              :key="j.jobId"
              class="bg-white/80 backdrop-blur rounded-[2rem] ring-1 ring-black/5 shadow-sm p-5 sm:p-6"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-lg font-extrabold text-brand-navy tracking-tight">
                    {{ j.problemDescription }}
                  </div>
                  <div class="mt-1 text-sm text-slate-600">
                    {{ j.specializationRequired }}
                  </div>
                </div>
                <span class="shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200">
                  Završeno
                </span>
              </div>
              <div v-if="j.location" class="mt-3 text-sm text-slate-600">
                {{ j.location }}
              </div>
            </div>
          </template>

          <div v-else class="rounded-[2rem] bg-white/60 backdrop-blur ring-1 ring-black/5 p-8 text-center">
            <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
                <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m5 8H7V8h10zm0 4H7v-2h10z" />
              </svg>
            </div>
            <h3 class="text-xl font-bold text-brand-navy">Još nema istorije</h3>
            <p class="mt-2 text-slate-600">
              Završeni poslovi će se automatski pojaviti ovde.
            </p>
          </div>
        </div>
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
import { DEFAULT_CITY } from '@/utils/cities'

definePageMeta({ layout: 'majstor', middleware: 'auth' })

useSeoMeta({
  title: 'Majstor Dashboard — MajstorSada',
  description: 'Majstorski panel za nove poslove, aktivne poslove i istoriju.',
  robots: 'noindex, nofollow'
})

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
const dismissingJobIds = ref<Set<string>>(new Set())
const dismissErrorMsg = ref('')

type DashboardTab = 'new' | 'active' | 'history'
const activeTab = ref<DashboardTab>('new')

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
  // Silent fallback: if tradesperson has no city yet, treat them as "Beograd".
  const rawCity = (tpStore.profile as any)?.city
  const city = typeof rawCity === 'string' && rawCity.trim().length ? rawCity.trim() : DEFAULT_CITY
  const constraints: any[] = [
    where('status', '==', 'pending'),
    where('specializationRequired', '==', spec),
    where('city', '==', city)
  ]
  const q = query(col, ...constraints)
  unsub = onSnapshot(q, (snap) => {
    const raw = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) }))
    const dismissed = new Set(tpStore.profile?.dismissedJobs || [])
    // Hide jobs that are still uploading images (Option B): they become visible once `imagesReady` flips to true.
    newJobs.value = raw.filter((j) => !dismissed.has(j.jobId) && j.imagesReady !== false)
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

async function onDismiss(jobId: string) {
  if (!jobId) return
  if (dismissingJobIds.value.has(jobId)) return

  dismissErrorMsg.value = ''
  dismissingJobIds.value = new Set(dismissingJobIds.value).add(jobId)

  // Optimistic: remove immediately to avoid "blink + return" UX
  const prev = newJobs.value
  newJobs.value = newJobs.value.filter((j) => j.jobId !== jobId)
  try {
    await tpStore.dismissJob(jobId)
  } catch (e: any) {
    // Revert on failure
    newJobs.value = prev
    dismissErrorMsg.value = e?.message || 'Ne mogu da odbijem posao. Pokušajte ponovo.'
  } finally {
    const next = new Set(dismissingJobIds.value)
    next.delete(jobId)
    dismissingJobIds.value = next
  }
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
  () => ({ status: tpStore.profile?.status, spec: tpStore.profile?.specialization, city: (tpStore.profile as any)?.city }),
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
  const uid = auth.currentUser?.uid
  if (uid) {
    tpStore.subscribeProfile(uid)
  }
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
    const projectId = config.public.firebase.projectId || 'majstorsada-b2ad4'
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



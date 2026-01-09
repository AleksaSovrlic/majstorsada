<template>
  <div class="space-y-8">
    <!-- Top overview -->
    <div class="text-center">
      <h1 class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
        Klijentski komandni centar
      </h1>
      <p class="mt-1 text-slate-600">
        Status Vaših zahteva se ažurira u realnom vremenu.
      </p>
    </div>

    <div
      v-if="cancelErrorMsg"
      class="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-rose-800 text-sm"
    >
      {{ cancelErrorMsg }}
    </div>

    <!-- Active requests -->
    <template v-if="activeJob">
      <!-- Primary active job (hero card) -->
      <section class="bg-white/80 backdrop-blur rounded-[2rem] shadow-xl ring-1 ring-black/5 p-6 sm:p-8">
        <div class="flex flex-col gap-6">
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold"
                  :class="statusPillClass(activeJob.status)"
                >
                  {{ statusLabel(activeJob.status) }}
                </span>
                <span v-if="activeJob.status === 'pending'" class="text-sm text-slate-600">
                  Majstori su obavešteni - čekamo prvog slobodnog.
                </span>
                <span v-else-if="activeJob.status === 'accepted'" class="text-sm text-slate-600">
                  Majstor je prihvatio zahtev - očekujte poziv.
                </span>
              </div>

              <h2 class="mt-3 text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
                {{ activeJob.problemDescription }}
              </h2>
              <p class="mt-2 text-slate-600">
                {{ activeJob.specializationRequired }}
              </p>
            </div>
          </div>

          <div class="grid gap-4" :class="isPending ? 'sm:grid-cols-2' : ''">
            <!-- Phone CTA (pending only) -->
            <div v-if="isPending" class="rounded-2xl bg-slate-50 p-5 ring-1 ring-black/5">
              <div class="flex items-center gap-3">
                <div class="h-11 w-11 rounded-full bg-brand-blue/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" class="h-5 w-5 text-brand-blue" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.59a1 1 0 01-.25 1.01z"
                    />
                  </svg>
                </div>
                <div class="min-w-0">
                  <div class="text-sm text-slate-500">Sledeći korak</div>
                  <div class="font-bold text-brand-navy text-lg leading-snug">
                    Držite telefon pri ruci.
                  </div>
                </div>
              </div>
              <p class="mt-3 text-slate-700 text-sm leading-relaxed">
                Prvi slobodan majstor će Vas pozvati direktno na broj telefona koji ste unlei prilikom kreiranja zahteva.
              </p>
            </div>

            <!-- Tradesperson or progress -->
            <div class="rounded-2xl bg-slate-50 p-5 ring-1 ring-black/5">
              <div v-if="activeJob.status === 'accepted' && activeJob.acceptedByTradespersonProfile">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <div class="text-sm text-slate-500">Majstor</div>
                    <div class="font-bold text-brand-navy">
                      {{ activeJob.acceptedByTradespersonProfile.displayName || 'Nepoznato' }}
                    </div>
                  </div>
                  <ClientOnly>
                    <TradespersonAvatar
                      :path="activeJob.acceptedByTradespersonProfile.avatarPath"
                      :updatedAt="activeJob.acceptedByTradespersonProfile.avatarUpdatedAt"
                      :size="48"
                      alt="Profilna slika majstora"
                    />
                  </ClientOnly>
                </div>
                <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div v-if="(activeJob.acceptedByTradespersonProfile.ratingCount || 0) > 0">
                    <div class="text-slate-500">Ocena</div>
                    <div class="text-brand-navy font-semibold">
                      {{ activeJob.acceptedByTradespersonProfile.averageRating }} ★ ({{ activeJob.acceptedByTradespersonProfile.ratingCount }})
                    </div>
                  </div>
                  <div>
                    <div class="text-slate-500">Telefon</div>
                    <div class="text-brand-navy font-semibold">
                      {{ activeJob.acceptedByTradespersonProfile.phoneNumber || '—' }}
                    </div>
                  </div>
                </div>
                <div
                  v-if="((activeJob.acceptedByTradespersonProfile.bio || '') + '').trim().length"
                  class="mt-3 text-sm text-slate-700 whitespace-pre-line"
                >
                  {{ activeJob.acceptedByTradespersonProfile.bio }}
                </div>
              </div>

              <div v-else>
                <div class="text-sm text-slate-500">Tok zahteva</div>
                <div class="mt-3 space-y-3">
                  <div class="flex items-center gap-3">
                    <div class="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center ring-1 ring-emerald-200">
                      <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
                        <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                      </svg>
                    </div>
                    <div class="text-sm text-slate-700">Zahtev je poslat</div>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center ring-1 ring-emerald-200">
                      <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
                        <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                      </svg>
                    </div>
                    <div class="text-sm text-slate-700">Majstori su alarmirani</div>
                  </div>
                  <div class="flex items-center gap-3">
                    <div
                      class="h-7 w-7 rounded-full flex items-center justify-center ring-1"
                      :class="activeJob.status === 'pending' ? 'bg-yellow-100 text-yellow-800 ring-yellow-200' : 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'"
                    >
                      <svg v-if="activeJob.status === 'pending'" viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
                        <path fill="currentColor" d="M12 22a10 10 0 1 1 10-10a10 10 0 0 1-10 10m0-2a8 8 0 1 0-8-8a8 8 0 0 0 8 8m-1-13h2v6h-2zm0 8h2v2h-2z" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
                        <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                      </svg>
                    </div>
                    <div class="text-sm text-slate-700">
                      {{ activeJob.status === 'pending' ? 'Čeka se majstor' : 'Majstor prihvatio zahtev' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Cancel (pending only; moved to bottom for less distraction) -->
          <div v-if="activeJob.status === 'pending'" class="pt-1">
            <button
              class="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-sm font-semibold hover:bg-rose-100 transition-transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="isCanceling(activeJob.jobId)"
              @click="cancelJob(activeJob.jobId)"
            >
              {{ isCanceling(activeJob.jobId) ? 'Otkazivanje…' : 'Otkaži zahtev' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Other active jobs (cards; not part of history) -->
      <section v-if="otherActiveJobs.length > 0" class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-lg sm:text-xl font-bold text-brand-navy">Aktivni zahtevi</h2>
          <div class="text-sm text-slate-600">
            {{ otherActiveJobs.length }} dodatno
          </div>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="j in otherActiveJobs"
            :key="j.jobId"
            class="bg-white/80 backdrop-blur rounded-[2rem] ring-1 ring-black/5 shadow-sm p-5 flex flex-col"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-semibold text-brand-navy leading-snug">
                  {{ j.problemDescription }}
                </div>
                <div class="mt-1 text-sm text-slate-600">
                  {{ j.specializationRequired }}
                </div>
              </div>
              <span
                class="shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                :class="statusPillClass(j.status)"
              >
                {{ statusLabel(j.status) }}
              </span>
            </div>

            <div v-if="j.status === 'accepted' && j.acceptedByTradespersonProfile" class="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-black/5">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-xs text-slate-500">Majstor</div>
                  <div class="font-semibold text-brand-navy truncate">
                    {{ j.acceptedByTradespersonProfile.displayName || 'Nepoznato' }}
                  </div>
                </div>
                <ClientOnly>
                  <TradespersonAvatar
                    :path="j.acceptedByTradespersonProfile.avatarPath"
                    :updatedAt="j.acceptedByTradespersonProfile.avatarUpdatedAt"
                    :size="40"
                    alt="Profilna slika majstora"
                  />
                </ClientOnly>
              </div>
              <div class="mt-2 text-sm">
                <div class="text-slate-500">Telefon</div>
                <div class="text-brand-navy font-semibold">
                  {{ j.acceptedByTradespersonProfile.phoneNumber || '—' }}
                </div>
              </div>
            </div>

            <div v-else-if="j.status === 'pending'" class="mt-4 text-sm text-slate-700">
              Majstori su obavešteni - čekamo prvog slobodnog.
            </div>

            <div class="mt-4 flex items-center gap-2">
              <button
                v-if="j.status === 'pending'"
                class="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-2 text-sm font-semibold hover:bg-rose-100 transition-transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
                :disabled="isCanceling(j.jobId)"
                @click="cancelJob(j.jobId)"
              >
                {{ isCanceling(j.jobId) ? 'Otkazivanje…' : 'Otkaži' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- Empty state -->
    <section v-else class="rounded-[2rem] bg-white/70 backdrop-blur ring-1 ring-black/5 p-8 text-center">
      <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center">
        <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
          <path fill="currentColor" d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm2 0v12h14V6zm2 3h10v2H7zm0 4h7v2H7z" />
        </svg>
      </div>
      <h2 class="text-xl font-bold text-brand-navy">Još nemate aktivan zahtev</h2>
      <p class="mt-2 text-slate-600">
        Kreirajte novi zahtev i pratite status ovde, kao u modernoj aplikaciji.
      </p>
      <NuxtLink
        to="/zahtev"
        class="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-blue text-white px-5 py-3 font-bold shadow-lg shadow-blue-500/20 hover:bg-brand-blue-dark transition-transform active:scale-[0.99]"
      >
        Kreiraj novi zahtev
      </NuxtLink>
    </section>

    <!-- History (completed only) -->
    <section>
      <div class="flex items-center justify-between gap-4">
        <h2 class="text-lg sm:text-xl font-bold text-brand-navy">Završeni zahtevi</h2>
        <div class="text-sm text-slate-600">
          {{ historyJobs.length }} stavki
        </div>
      </div>

      <!-- Stats (moved here to keep focus on active request) -->
      <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="rounded-2xl bg-white/70 backdrop-blur px-3 py-2 ring-1 ring-black/5">
          <div class="text-xs text-slate-500">Na čekanju</div>
          <div class="text-base font-bold text-brand-navy">{{ pending.length }}</div>
        </div>
        <div class="rounded-2xl bg-white/70 backdrop-blur px-3 py-2 ring-1 ring-black/5">
          <div class="text-xs text-slate-500">Prihvaćeni</div>
          <div class="text-base font-bold text-brand-navy">{{ accepted.length }}</div>
        </div>
        <div class="rounded-2xl bg-white/70 backdrop-blur px-3 py-2 ring-1 ring-black/5">
          <div class="text-xs text-slate-500">Završeni</div>
          <div class="text-base font-bold text-brand-navy">{{ completed.length }}</div>
        </div>
        <div class="rounded-2xl bg-white/70 backdrop-blur px-3 py-2 ring-1 ring-black/5">
          <div class="text-xs text-slate-500">Otkazani</div>
          <div class="text-base font-bold text-brand-navy">{{ canceled.length }}</div>
        </div>
      </div>

      <div v-if="historyJobs.length > 0" class="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="j in historyJobs"
          :key="j.jobId"
          class="bg-white/80 backdrop-blur rounded-2xl ring-1 ring-black/5 shadow-sm p-5 flex flex-col"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-semibold text-brand-navy leading-snug">
                {{ j.problemDescription }}
              </div>
              <div class="mt-1 text-sm text-slate-600">
                {{ j.specializationRequired }}
              </div>
            </div>
            <span
              class="shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
              :class="statusPillClass(j.status)"
            >
              {{ statusLabel(j.status) }}
            </span>
          </div>

          <div class="mt-4 flex items-center gap-2">
            <button
              v-if="!j.rating"
              class="inline-flex items-center justify-center rounded-xl bg-brand-blue text-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-brand-blue-dark transition-transform active:scale-[0.99]"
              @click="openRating(j)"
            >
              Oceni
            </button>
            <div v-else class="text-sm text-slate-700">
              Ocena: <span class="font-semibold text-slate-900">{{ j.rating }} ★</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="mt-4 rounded-[2rem] bg-white/60 backdrop-blur ring-1 ring-black/5 p-6 text-center text-sm text-slate-600">
        Nema završenih zahteva za prikaz.
      </div>
    </section>

    <!-- Canceled (kept separate from completed history) -->
    <section v-if="canceled.length > 0">
      <div class="flex items-center justify-between gap-4">
        <h2 class="text-lg sm:text-xl font-bold text-brand-navy">Otkazani zahtevi</h2>
        <div class="text-sm text-slate-600">
          {{ canceled.length }} stavki
        </div>
      </div>

      <div class="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="j in canceled"
          :key="j.jobId"
          class="bg-white/70 backdrop-blur rounded-2xl ring-1 ring-black/5 shadow-sm p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-semibold text-brand-navy leading-snug">
                {{ j.problemDescription }}
              </div>
              <div class="mt-1 text-sm text-slate-600">
                {{ j.specializationRequired }}
              </div>
            </div>
            <span
              class="shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
              :class="statusPillClass('canceled')"
            >
              Otkazano
            </span>
          </div>

          <div v-if="formatTimestamp(j.canceledAt)" class="mt-3 text-xs text-slate-500">
            Otkazano: {{ formatTimestamp(j.canceledAt) }}
          </div>
        </div>
      </div>
    </section>

    <!-- Rating modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl ring-1 ring-black/5 p-6">
        <h3 class="text-lg font-bold text-brand-navy">Ocenite posao</h3>
        <p class="mt-1 text-sm text-slate-600">Vaša ocena pomaže da platforma bude bolja.</p>

        <div class="mt-5 flex items-center justify-center gap-2">
          <button
            v-for="star in 5"
            :key="star"
            class="text-3xl leading-none transition-transform active:scale-[0.98]"
            :class="(ratingStars || 0) >= star ? 'text-yellow-500' : 'text-slate-300'"
            @click="ratingStars = star"
            aria-label="Ocena zvezdicom"
          >
            ★
          </button>
        </div>

        <textarea
          v-model="ratingComment"
          class="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
          rows="3"
          placeholder="(Opciono) Kratak komentar"
        />

        <div class="mt-5 flex items-center justify-end gap-2">
          <button
            class="px-4 py-2 rounded-xl bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200 transition-transform active:scale-[0.99]"
            @click="showModal = false"
          >
            Otkaži
          </button>
          <button
            class="px-4 py-2 rounded-xl bg-brand-blue text-white font-semibold hover:bg-brand-blue-dark disabled:opacity-60 disabled:cursor-not-allowed transition-transform active:scale-[0.99]"
            :disabled="!ratingStars"
            @click="submitRating"
          >
            Pošalji
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'
import TradespersonAvatar from '@/components/TradespersonAvatar.vue'

definePageMeta({ layout: 'klijent', middleware: 'client-auth' })

const auth = useAuthStore()
const pending = ref<any[]>([])
const accepted = ref<any[]>([])
const completed = ref<any[]>([])
const canceled = ref<any[]>([])

function tsMillis(ts: any): number {
  if (!ts) return 0
  // Firestore Timestamp
  if (typeof ts?.toMillis === 'function') return ts.toMillis()
  if (typeof ts?.toDate === 'function') return ts.toDate().getTime()
  // Date / number
  if (ts instanceof Date) return ts.getTime()
  if (typeof ts === 'number') return ts
  return 0
}

const sortedAccepted = computed<any[]>(() => {
  // Prefer acceptedAt; fallback to createdAt for safety.
  return [...accepted.value].sort((a, b) => tsMillis((b.acceptedAt || b.createdAt)) - tsMillis((a.acceptedAt || a.createdAt)))
})

const sortedPending = computed<any[]>(() => {
  return [...pending.value].sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt))
})

const activeJob = computed<any | null>(() => {
  return sortedAccepted.value[0] || sortedPending.value[0] || null
})

const isPending = computed<boolean>(() => activeJob.value?.status === 'pending')

const activeJobId = computed<string | null>(() => {
  return activeJob.value?.jobId || null
})

const activeJobs = computed<any[]>(() => {
  // Accepted first (most recently accepted), then pending (most recently created).
  return [...sortedAccepted.value, ...sortedPending.value]
})

const otherActiveJobs = computed<any[]>(() => {
  const id = activeJobId.value
  return activeJobs.value.filter((j) => j.jobId !== id)
})

const historyJobs = computed<any[]>(() => {
  return [...completed.value]
})

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

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Čeka se majstor'
    case 'accepted':
      return 'Majstor prihvatio'
    case 'completed':
      return 'Završeno'
    case 'canceled':
      return 'Otkazano'
    default:
      return 'Status'
  }
}

function statusPillClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200'
    case 'accepted':
      return 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
    case 'completed':
      return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
    case 'canceled':
      return 'bg-rose-100 text-rose-800 ring-1 ring-rose-200'
    default:
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  }
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



<template>
  <div class="space-y-6">
    <NuxtLink to="/admin/dashboard" class="text-sm text-blue-600 hover:underline">← Nazad na dashboard</NuxtLink>

    <div class="bg-white border rounded-lg p-4">
      <h2 class="text-lg font-semibold mb-4">Detalji majstora</h2>
      <div v-if="loading" class="text-gray-500 text-sm">Učitavanje...</div>
      <div v-else-if="!profile" class="text-gray-500 text-sm">Majstor nije pronađen.</div>
      <div v-else class="space-y-2">
        <div><span class="text-gray-500 text-sm">Ime:</span> <span class="font-medium">{{ profile.displayName || '—' }}</span></div>
        <div><span class="text-gray-500 text-sm">Email:</span> <span class="font-medium">{{ profile.email || '—' }}</span></div>
        <div><span class="text-gray-500 text-sm">Stanje Žetona:</span> <span class="font-medium">{{ profile.balanceTokens ?? 0 }}</span></div>
      </div>
    </div>

    <div class="bg-white border rounded-lg p-4">
      <h3 class="text-md font-semibold mb-3">Promena žetona</h3>
      <div class="flex items-center gap-3">
        <input v-model.number="amount" type="number" min="1" class="w-32 rounded border px-3 py-2 text-sm" />
        <button class="bg-green-600 hover:bg-green-700 text-white rounded px-3 py-2 text-sm disabled:opacity-60" :disabled="busy" @click="addTokens">{{ busy ? 'Obrada...' : 'Dodaj Žetone' }}</button>
        <button class="bg-red-600 hover:bg-red-700 text-white rounded px-3 py-2 text-sm disabled:opacity-60" :disabled="busy" @click="removeTokens">{{ busy ? 'Obrada...' : 'Oduzmi Žetone' }}</button>
      </div>
      <p v-if="errorMessage" class="text-sm text-red-600 mt-3">{{ errorMessage }}</p>
      <p v-if="successMessage" class="text-sm text-green-600 mt-3">{{ successMessage }}</p>
    </div>

    <div class="bg-white border rounded-lg p-4">
      <h3 class="text-md font-semibold mb-3">Istorija poslova</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-white">
            <tr>
              <th class="text-left p-3 font-medium text-gray-700">Datum</th>
              <th class="text-left p-3 font-medium text-gray-700">Status</th>
              <th class="text-left p-3 font-medium text-gray-700">Opis</th>
              <th class="text-left p-3 font-medium text-gray-700">Lokacija</th>
              <th class="text-left p-3 font-medium text-gray-700">Telefon</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in jobs" :key="j.jobId" class="border-t">
              <td class="p-3">{{ (j.acceptedAt || j.createdAt)?.toDate?.() ? (j.acceptedAt || j.createdAt).toDate().toLocaleString() : '—' }}</td>
              <td class="p-3">
                <span :class="j.status === 'completed' ? 'text-green-700' : j.status === 'accepted' ? 'text-blue-700' : 'text-gray-700'">{{ j.status }}</span>
              </td>
              <td class="p-3">{{ j.problemDescription || '—' }}</td>
              <td class="p-3">{{ j.location || '—' }}</td>
              <td class="p-3">{{ j.contactPhone || '—' }}</td>
            </tr>
            <tr v-if="jobs.length === 0">
              <td colspan="5" class="p-6 text-center text-gray-500">Nema poslova.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

interface AdminTradespersonProfile {
  uid: string
  displayName?: string
  email?: string
  balanceTokens?: number
}

const route = useRoute()
const profile = ref<AdminTradespersonProfile | null>(null)
const loading = ref(true)
const amount = ref<number>(1)
const busy = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
let unsub: (() => void) | null = null
let unsubJobs: (() => void) | null = null

type AdminJob = {
  jobId: string
  status: 'pending' | 'accepted' | 'completed' | 'cancelled'
  problemDescription?: string
  location?: string
  specializationRequired?: string
  contactPhone?: string
  createdAt?: any
  acceptedAt?: any
  completedAt?: any
}
const jobs = ref<AdminJob[]>([])

async function callUpdate(delta: number) {
  if (!profile.value) return
  errorMessage.value = ''
  successMessage.value = ''
  if (!Number.isFinite(amount.value) || amount.value <= 0) {
    errorMessage.value = 'Unesite pozitivan broj žetona.'
    return
  }
  busy.value = true
  try {
    const auth = useAuthStore()
    await auth.ensureAuthReady()
    const { $firebaseAuth } = useNuxtApp()
    const idToken = await $firebaseAuth.currentUser?.getIdToken()
    if (!idToken) throw new Error('Niste prijavljeni.')

    const config = useRuntimeConfig()
    const projectId = config.public.firebase.projectId || 'majstorsada-b2ad4'
    const region = config.public.firebase.functionsRegion || 'europe-west3'
  const base = process.env.NODE_ENV === 'development'
    ? `http://localhost:5501/${projectId}/${region}`
      : `https://${region}-${projectId}.cloudfunctions.net`

    const resp = await fetch(`${base}/updateTokensByAdmin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ data: { uid: profile.value.uid, delta } })
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(json?.error?.message || json?.error || 'Greška pri ažuriranju stanja žetona.')
    }
    successMessage.value = 'Uspešno ažurirano stanje žetona.'
  } catch (e: any) {
    errorMessage.value = e?.message || 'Greška pri ažuriranju stanja žetona.'
  } finally {
    busy.value = false
  }
}

function addTokens() {
  callUpdate(Math.trunc(Math.abs(amount.value)))
}
function removeTokens() {
  callUpdate(-Math.trunc(Math.abs(amount.value)))
}

onMounted(() => {
  const id = String(route.params.id || '')
  if (!id) {
    loading.value = false
    return
  }
  const { $firestore } = useNuxtApp()
  const ref = doc($firestore, 'tradespeople', id)
  unsub = onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      profile.value = { uid: snap.id, ...(snap.data() as any) }
    } else {
      profile.value = null
    }
    loading.value = false
  })

  // Jobs history for this tradesperson (real-time)
  const col = collection($firestore, 'jobs')
  const q = query(col, where('acceptedByTradespersonId', '==', id), orderBy('createdAt', 'desc'))
  unsubJobs = onSnapshot(q, (snap) => {
    jobs.value = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) })) as AdminJob[]
  })
})

onBeforeUnmount(() => {
  if (unsub) {
    unsub()
    unsub = null
  }
  if (unsubJobs) {
    unsubJobs()
    unsubJobs = null
  }
})
</script>



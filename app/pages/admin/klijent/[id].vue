<template>
  <div class="space-y-6">
    <NuxtLink to="/admin/dashboard" class="text-sm text-blue-600 hover:underline">← Nazad na dashboard</NuxtLink>

    <div class="bg-white border rounded-lg p-4">
      <h2 class="text-lg font-semibold mb-3">Detalji klijenta</h2>
      <div v-if="loading" class="text-gray-500 text-sm">Učitavanje...</div>
      <div v-else-if="!client" class="text-gray-500 text-sm">Klijent nije pronađen.</div>
      <div v-else class="space-y-2">
        <div><span class="text-gray-500 text-sm">Email:</span> <span class="font-medium">{{ client.email || '—' }}</span></div>
        <div><span class="text-gray-500 text-sm">Kreiran:</span> <span class="font-medium">{{ client.createdAt?.toDate?.() ? client.createdAt.toDate().toLocaleString() : '—' }}</span></div>
      </div>
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
              <th class="text-left p-3 font-medium text-gray-700">Tip majstora</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in jobs" :key="j.jobId" class="border-t">
              <td class="p-3">{{ j.createdAt?.toDate?.() ? j.createdAt.toDate().toLocaleString() : '—' }}</td>
              <td class="p-3">
                <span :class="j.status === 'completed' ? 'text-green-700' : j.status === 'accepted' ? 'text-blue-700' : 'text-gray-700'">{{ j.status }}</span>
              </td>
              <td class="p-3">{{ j.problemDescription || '—' }}</td>
              <td class="p-3">{{ j.location || '—' }}</td>
              <td class="p-3">{{ j.specializationRequired || '—' }}</td>
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
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const route = useRoute()
const client = ref<any | null>(null)
const loading = ref(true)
let unsubClient: (() => void) | null = null
let unsubJobs: (() => void) | null = null
const jobs = ref<any[]>([])

onMounted(() => {
  const id = String(route.params.id || '')
  if (!id) {
    loading.value = false
    return
  }
  const { $firestore } = useNuxtApp()
  unsubClient = onSnapshot(doc($firestore, 'clients', id), (snap) => {
    client.value = snap.exists() ? ({ uid: snap.id, ...(snap.data() as any) }) : null
    loading.value = false
  })
  const q = query(collection($firestore, 'jobs'), where('clientId', '==', id), orderBy('createdAt', 'desc'))
  unsubJobs = onSnapshot(q, (snap) => {
    jobs.value = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) }))
  })
})

onBeforeUnmount(() => {
  if (unsubClient) { unsubClient(); unsubClient = null }
  if (unsubJobs) { unsubJobs(); unsubJobs = null }
})
</script>



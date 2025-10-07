<template>
  <div class="space-y-6">
    <h2 class="text-xl font-semibold">Svi Majstori</h2>
    <div class="overflow-x-auto bg-white border rounded-lg">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left p-3 font-medium text-gray-700">Ime</th>
            <th class="text-left p-3 font-medium text-gray-700">Email</th>
            <th class="text-left p-3 font-medium text-gray-700">Stanje Žetona</th>
            <th class="text-left p-3 font-medium text-gray-700">Ocena</th>
            <th class="text-left p-3 font-medium text-gray-700">Akcije</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tradespeople" :key="t.uid" class="border-t">
            <td class="p-3">{{ t.displayName || '—' }}</td>
            <td class="p-3">{{ t.email || '—' }}</td>
            <td class="p-3">{{ t.balanceTokens ?? 0 }}</td>
            <td class="p-3">{{ (t as any).averageRating ? `${(t as any).averageRating} ★ (${(t as any).ratingCount ?? 0})` : '—' }}</td>
            <td class="p-3">
              <NuxtLink class="text-blue-600 hover:underline" :to="`/admin/majstor/${t.uid}`">Otvori</NuxtLink>
            </td>
          </tr>
          <tr v-if="tradespeople.length === 0">
            <td colspan="4" class="p-6 text-center text-gray-500">Nema majstora.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div class="space-y-6 mt-8">
    <h2 class="text-xl font-semibold">Svi Klijenti</h2>
    <div class="overflow-x-auto bg-white border rounded-lg">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left p-3 font-medium text-gray-700">Email</th>
            <th class="text-left p-3 font-medium text-gray-700">Kreiran</th>
            <th class="text-left p-3 font-medium text-gray-700">Akcije</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in clients" :key="c.uid" class="border-t">
            <td class="p-3">{{ c.email || '—' }}</td>
            <td class="p-3">{{ c.createdAt?.toDate?.() ? c.createdAt.toDate().toLocaleString() : '—' }}</td>
            <td class="p-3">
              <NuxtLink class="text-blue-600 hover:underline" :to="`/admin/klijent/${c.uid}`">Otvori</NuxtLink>
            </td>
          </tr>
          <tr v-if="clients.length === 0">
            <td colspan="3" class="p-6 text-center text-gray-500">Nema klijenata.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

interface AdminTradesperson {
  uid: string
  displayName?: string
  email?: string
  balanceTokens?: number
}

const tradespeople = ref<AdminTradesperson[]>([])
let unsub: (() => void) | null = null
const auth = useAuthStore()

type AdminClient = { uid: string; email?: string; createdAt?: any }
const clients = ref<AdminClient[]>([])
let unsubClients: (() => void) | null = null

onMounted(async () => {
  await auth.ensureAuthReady()
  const { $firestore } = useNuxtApp()
  const col = collection($firestore, 'tradespeople')
  const q = query(col)
  unsub = onSnapshot(q, (snap) => {
    const adminUid = auth.currentUser?.uid
    const all = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }))
    tradespeople.value = adminUid ? all.filter((t) => t.uid !== adminUid) : all
  })

  // Clients table realtime
  const clientsCol = collection($firestore, 'clients')
  const cq = query(clientsCol)
  unsubClients = onSnapshot(cq, (snap) => {
    clients.value = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }))
  })
})

onBeforeUnmount(() => {
  if (unsub) {
    unsub()
    unsub = null
  }
  if (unsubClients) {
    unsubClients()
    unsubClients = null
  }
})
</script>



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
            <th class="text-left p-3 font-medium text-gray-700">Akcije</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tradespeople" :key="t.uid" class="border-t">
            <td class="p-3">{{ t.displayName || '—' }}</td>
            <td class="p-3">{{ t.email || '—' }}</td>
            <td class="p-3">{{ t.balanceTokens ?? 0 }}</td>
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
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { collection, onSnapshot, query } from 'firebase/firestore'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

interface AdminTradesperson {
  uid: string
  displayName?: string
  email?: string
  balanceTokens?: number
}

const tradespeople = ref<AdminTradesperson[]>([])
let unsub: (() => void) | null = null

onMounted(() => {
  const { $firestore } = useNuxtApp()
  const col = collection($firestore, 'tradespeople')
  const q = query(col)
  unsub = onSnapshot(q, (snap) => {
    tradespeople.value = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }))
  })
})

onBeforeUnmount(() => {
  if (unsub) {
    unsub()
    unsub = null
  }
})
</script>



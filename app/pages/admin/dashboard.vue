<template>
  <div class="space-y-6">
    <h2 class="text-xl font-bold text-gray-900">Svi Majstori</h2>
    <div class="overflow-x-auto bg-white rounded-xl shadow">
      <table class="min-w-full text-sm">
        <thead class="bg-white">
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
    <PageControls :loading="tradesPage.loading.value" :more="tradesPage.hasMore.value" :error="tradesPage.error.value" @more="tradesPage.more" @refresh="tradesPage.refresh" />
  </div>
  <div class="space-y-6 mt-8">
    <h2 class="text-xl font-bold text-gray-900">Svi Klijenti</h2>
    <div class="overflow-x-auto bg-white rounded-xl shadow">
      <table class="min-w-full text-sm">
        <thead class="bg-white">
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
    <PageControls :loading="clientsPage.loading.value" :more="clientsPage.hasMore.value" :error="clientsPage.error.value" @more="clientsPage.more" @refresh="clientsPage.refresh" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { collection, query, orderBy, documentId } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const tradesPage = usePagedQuery(20)
const tradespeople = tradesPage.rows
const auth = useAuthStore()

const clientsPage = usePagedQuery(20)
const clients = clientsPage.rows

onMounted(async () => {
  await auth.ensureAuthReady()
  const { $firestore } = useNuxtApp()
  tradesPage.reset(query(collection($firestore, 'tradespeople'), orderBy(documentId())))
  clientsPage.reset(query(collection($firestore, 'clients'), orderBy(documentId())))
  void tradesPage.more(); void clientsPage.more()

})

</script>



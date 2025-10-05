<template>
  <div class="space-y-8">
    <section>
      <h2 class="text-lg font-semibold text-gray-900">Na čekanju</h2>
      <div class="mt-3 space-y-3">
        <div v-for="j in pending" :key="j.jobId" class="bg-white rounded-xl shadow p-4">
          <div class="font-medium text-gray-900">{{ j.problemDescription }}</div>
          <div class="text-sm text-gray-600">{{ j.location }} · {{ j.specializationRequired }}</div>
        </div>
        <div v-if="pending.length === 0" class="text-sm text-gray-500">Nema poslova na čekanju.</div>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-semibold text-gray-900">Prihvaćeni</h2>
      <div class="mt-3 space-y-3">
        <div v-for="j in accepted" :key="j.jobId" class="bg-white rounded-xl shadow p-4">
          <div class="font-medium text-gray-900">{{ j.problemDescription }}</div>
          <div class="text-sm text-gray-600">{{ j.location }} · {{ j.specializationRequired }}</div>
        </div>
        <div v-if="accepted.length === 0" class="text-sm text-gray-500">Nema prihvaćenih poslova.</div>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-semibold text-gray-900">Završeni</h2>
      <div class="mt-3 space-y-3">
        <div v-for="j in completed" :key="j.jobId" class="bg-white rounded-xl shadow p-4">
          <div class="font-medium text-gray-900">{{ j.problemDescription }}</div>
          <div class="text-sm text-gray-600">{{ j.location }} · {{ j.specializationRequired }}</div>
        </div>
        <div v-if="completed.length === 0" class="text-sm text-gray-500">Nema završenih poslova.</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: 'klijent', middleware: 'client-auth' })

const auth = useAuthStore()
const pending = ref<any[]>([])
const accepted = ref<any[]>([])
const completed = ref<any[]>([])

let unsubPending: (() => void) | null = null
let unsubAccepted: (() => void) | null = null
let unsubCompleted: (() => void) | null = null

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
})

onBeforeUnmount(() => {
  if (unsubPending) { unsubPending(); unsubPending = null }
  if (unsubAccepted) { unsubAccepted(); unsubAccepted = null }
  if (unsubCompleted) { unsubCompleted(); unsubCompleted = null }
})
</script>



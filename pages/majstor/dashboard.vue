<template>
  <div class="space-y-4">
    <AvailabilityToggle />
    <TokenBalance />

    <div class="pt-2 space-y-3">
      <NewJobCard v-for="j in jobs" :key="j.jobId" :job="j" @dismiss="dismissJob" />
      <div v-if="jobs.length === 0" class="text-sm text-gray-500 text-center py-6">Nema novih poslova trenutno.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AvailabilityToggle from '@/components/majstor/AvailabilityToggle.vue'
import TokenBalance from '@/components/majstor/TokenBalance.vue'
import NewJobCard from '@/components/majstor/NewJobCard.vue'
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'
import { useTradespersonStore } from '@/stores/tradesperson'

definePageMeta({ layout: 'majstor', middleware: 'auth' })

const auth = useAuthStore()
const tpStore = useTradespersonStore()
const jobs = ref<Array<{ jobId: string; problemDescription: string; location: string; specializationRequired: string }>>([])
let unsub: (() => void) | null = null

function startJobsFeed() {
  stopJobsFeed()
  const { $firestore } = useNuxtApp()
  const col = collection($firestore, 'jobs')
  const constraints: any[] = [where('status', '==', 'pending')]
  const spec = tpStore.profile?.specialization
  if (spec) constraints.push(where('specializationRequired', '==', spec))
  const q = query(col, ...constraints)
  unsub = onSnapshot(q, (snap) => {
    jobs.value = snap.docs.map((d) => ({ jobId: d.id, ...(d.data() as any) }))
  })
}

function stopJobsFeed() {
  if (unsub) { unsub(); unsub = null }
}

function dismissJob(jobId: string) {
  jobs.value = jobs.value.filter((j) => j.jobId !== jobId)
}

onMounted(async () => {
  await auth.ensureAuthReady()
  if (auth.currentUser) {
    tpStore.subscribeProfile(auth.currentUser.uid)
  }
})

watch(() => tpStore.profile?.specialization, () => {
  startJobsFeed()
})

onBeforeUnmount(() => {
  stopJobsFeed()
  tpStore.unsubscribe()
})
</script>



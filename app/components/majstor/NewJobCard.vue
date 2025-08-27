<template>
  <div class="bg-white rounded-xl shadow p-4 space-y-2">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="text-base font-semibold text-gray-900">{{ job.problemDescription }}</div>
        <div class="text-sm text-gray-600">{{ job.location }} · {{ job.specializationRequired }}</div>
      </div>
    </div>
    <div class="pt-2 flex items-center gap-2">
      <button
        class="px-4 py-2 rounded-md bg-green-600 text-white font-medium hover:bg-green-700 active:scale-[0.99]"
        :disabled="accepting"
        @click="onAccept"
      >{{ accepting ? 'Prihvatanje...' : 'Prihvati' }}</button>
      <button
        class="px-4 py-2 rounded-md bg-gray-800 text-white font-medium hover:bg-gray-900 active:scale-[0.99]"
        @click="$emit('dismiss', job.jobId)"
      >Odbij</button>
    </div>
    <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
    <p v-if="successMsg" class="text-green-600 text-sm">{{ successMsg }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

interface JobItem {
  jobId: string
  problemDescription: string
  location: string
  specializationRequired: string
}

const props = defineProps<{ job: JobItem }>()
defineEmits<{ (e: 'dismiss', jobId: string): void }>()

const accepting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

async function onAccept() {
  accepting.value = true
  errorMsg.value = ''
  successMsg.value = ''
  try {
    const auth = useAuthStore()
    await auth.ensureAuthReady()
    const { $firebaseAuth } = useNuxtApp()
    const idToken = await $firebaseAuth.currentUser?.getIdToken()
    if (!idToken) throw new Error('Niste prijavljeni.')

    const config = useRuntimeConfig()
    const projectId = config.public.firebase.projectId || 'majstorsada-18a99'
    const region = config.public.firebase.functionsRegion || 'europe-west3'
    const base = process.env.NODE_ENV === 'development'
      ? `http://127.0.0.1:5501/${projectId}/${region}`
      : `https://${region}-${projectId}.cloudfunctions.net`

    const resp = await fetch(`${base}/acceptJob`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ data: { jobId: props.job.jobId } })
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok || json?.ok === false) {
      throw new Error(json?.error || 'Greška pri prihvatanju posla.')
    }
    successMsg.value = 'Posao prihvaćen.'
  } catch (e: any) {
    errorMsg.value = e?.message || 'Greška pri prihvatanju posla.'
  } finally {
    accepting.value = false
  }
}
</script>



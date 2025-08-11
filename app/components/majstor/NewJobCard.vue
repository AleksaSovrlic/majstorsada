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
import { httpsCallable } from 'firebase/functions'

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
    const { $functions } = useNuxtApp()
    const fn = httpsCallable($functions, 'acceptJob')
    await fn({ jobId: props.job.jobId })
    successMsg.value = 'Posao prihvaćen.'
  } catch (e: any) {
    errorMsg.value = e?.message || 'Greška pri prihvatanju posla.'
  } finally {
    accepting.value = false
  }
}
</script>



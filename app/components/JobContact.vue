<template>
  <span v-if="phone"><a :href="'tel:' + phone" class="underline">{{ phone }}</a></span>
  <button v-else-if="error" type="button" class="text-red-700 underline" @click="load">Telefon nije učitan. Pokušaj ponovo</button>
  <span v-else>{{ loading ? 'Učitavanje telefona…' : 'Kontakt nije dostupan.' }}</span>
</template>
<script setup lang="ts">
import { doc, getDocFromServer } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'
const props = defineProps<{ jobId: string }>()
const { $firestore } = useNuxtApp()
const auth = useAuthStore()
const phone = ref(''), loading = ref(false), error = ref(false)
let generation = 0
async function load() {
  const version = ++generation
  const uid = auth.currentUser?.uid
  phone.value = ''; error.value = false
  if (!uid || !props.jobId) return
  loading.value = true
  try {
    const snap = await getDocFromServer(doc($firestore, 'jobs', props.jobId, 'private', 'contact'))
    if (generation === version && auth.currentUser?.uid === uid) phone.value = snap.data()?.contactPhone || ''
  } catch { if (generation === version) error.value = true }
  finally { if (generation === version) loading.value = false }
}
watch(() => [props.jobId, auth.currentUser?.uid], load, { immediate: true })
onBeforeUnmount(() => { generation++; phone.value = '' })
</script>

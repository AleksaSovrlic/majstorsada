<template>
  <article ref="card" class="bg-white/80 backdrop-blur rounded-[2rem] ring-1 ring-black/5 shadow-sm p-5 sm:p-6 space-y-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-lg font-extrabold text-brand-navy tracking-tight">
          {{ job.problemDescription }}
        </div>
        <div class="mt-1 text-sm text-slate-600">
          {{ job.specializationRequired }}<span v-if="job.location"> · {{ job.location }}</span>
        </div>
      </div>
      <span class="shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200">
        Novo
      </span>
    </div>

    <ClientOnly>
      <div v-if="hasImages && !imagesReady" class="pt-2 text-sm text-gray-500">
        Slike se još uvek uploaduju...
      </div>
      <div v-else-if="loadingImages" class="pt-2 text-sm text-gray-500">Učitavanje slika...</div>
      <div v-else-if="imageUrls.length > 0" class="pt-2 flex items-center gap-2">
        <button
          v-for="(u, idx) in imageUrls"
          :key="u"
          type="button"
          class="h-16 w-16 rounded-xl overflow-hidden ring-1 ring-black/10 hover:ring-black/20 transition-colors"
          @click="openImage(u)"
          :aria-label="`Otvori sliku ${idx + 1}`"
        >
          <img :src="u" alt="Slika kvara" class="h-full w-full object-cover" />
        </button>
      </div>
      <div v-else-if="imageErrorMsg" class="pt-2 text-sm text-red-600">{{ imageErrorMsg }}</div>
    </ClientOnly>

    <div class="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-xl bg-brand-blue text-white px-5 py-3 text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-brand-blue-dark transition-transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
        :disabled="accepting || acceptedOnce || (hasImages && !imagesReady)"
        @click="onAccept"
      >{{ accepting ? 'Prihvatanje...' : 'Prihvati' }}</button>
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 px-5 py-3 text-sm font-semibold hover:bg-slate-50 transition-transform active:scale-[0.99]"
        @click="$emit('dismiss', job.jobId)"
      >Odbij</button>
    </div>
    <div v-if="errorMsg" class="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-rose-800 text-sm">
      {{ errorMsg }}
    </div>
    <div v-if="successMsg" class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-sm">
      {{ successMsg }}
    </div>
  </article>

  <ClientOnly>
    <div v-if="showImageModal" class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeImage">
      <div class="max-w-3xl w-full">
        <div class="bg-white rounded-2xl shadow-2xl ring-1 ring-black/10 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div class="text-sm font-semibold text-brand-navy">Slika kvara</div>
            <button type="button" class="text-sm font-semibold text-slate-600 hover:text-brand-navy" @click="closeImage">Zatvori</button>
          </div>
          <div class="bg-black">
            <img v-if="activeImageUrl" :src="activeImageUrl" alt="Slika kvara" class="max-h-[80vh] w-full object-contain" />
          </div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useApi } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { timestampCacheKey } from '@/utils/timestampCacheKey'

interface JobItem {
  jobId: string
  problemDescription: string
  location: string
  specializationRequired: string
  imagePaths?: string[]
  imagesReady?: boolean
  imagesUpdatedAt?: any
}

const props = defineProps<{ job: JobItem }>()
const emit = defineEmits<{ (e: 'dismiss', jobId: string): void; (e: 'accepted', job: JobItem): void }>()

const api = useApi()
const auth = useAuthStore()
const card = ref<HTMLElement | null>(null)
const visible = ref(false)
let observer: IntersectionObserver | null = null
let imageGeneration = 0
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { visible.value = true; observer?.disconnect() }
  }, { rootMargin: '100px' })
  if (card.value) observer.observe(card.value)
})
function clearImages() {
  for (const url of imageUrls.value) URL.revokeObjectURL(url)
  imageUrls.value = []; closeImage()
}
onBeforeUnmount(() => { observer?.disconnect(); imageGeneration++; clearImages() })
const accepting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const acceptedOnce = ref(false)

const imageUrls = ref<string[]>([])
const loadingImages = ref(false)
const imageErrorMsg = ref('')
const showImageModal = ref(false)
const activeImageUrl = ref<string | null>(null)

const hasImages = computed(() => Array.isArray(props.job?.imagePaths) && (props.job.imagePaths || []).length > 0)
const imagesReady = computed(() => (props.job as any)?.imagesReady !== false)

const cacheKey = computed(() => timestampCacheKey((props.job as any)?.imagesUpdatedAt))

function openImage(url: string) {
  activeImageUrl.value = url
  showImageModal.value = true
}
function closeImage() {
  showImageModal.value = false
  activeImageUrl.value = null
}

async function loadImageUrls() {
  const generation = ++imageGeneration
  const uid = auth.currentUser?.uid
  clearImages()
  if (!import.meta.client || !visible.value || !uid || !imagesReady.value) return
  const paths = (props.job.imagePaths || []).slice(0, 3)
  if (!paths.length) return
  loadingImages.value = true; imageErrorMsg.value = ''
  try {
    const blobs = await Promise.all(paths.map(path => api<Blob>('readJobImage', { jobId: props.job.jobId, slot: Number(path.split('/').pop()?.replace('.jpg', '')) }, 'blob')))
    if (generation !== imageGeneration || auth.currentUser?.uid !== uid) return
    imageUrls.value = blobs.map(blob => URL.createObjectURL(blob))
  } catch {
    if (generation === imageGeneration) imageErrorMsg.value = 'Ne mogu da učitam slike. Osvežite stranicu i pokušajte ponovo.'
  } finally { if (generation === imageGeneration) loadingImages.value = false }
}
watch(() => [(props.job.imagePaths || []).join('|'), imagesReady.value, cacheKey.value, visible.value, auth.currentUser?.uid], loadImageUrls, { immediate: true })

async function onAccept() {
  accepting.value = true
  errorMsg.value = ''
  successMsg.value = ''
  try {
    await api('acceptJob', { jobId: props.job.jobId })
    successMsg.value = 'Posao prihvaćen.'
    acceptedOnce.value = true
    emit('accepted', props.job)
  } catch (e: any) {
    errorMsg.value = e?.message || 'Greška pri prihvatanju posla.'
  } finally {
    accepting.value = false
  }
}
</script>

<template>
  <div class="bg-white rounded-xl shadow p-4 space-y-2">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="text-base font-semibold text-gray-900">{{ job.problemDescription }}</div>
        <div class="text-sm text-gray-600">{{ job.location }} · {{ job.specializationRequired }}</div>
      </div>
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
          class="h-16 w-16 rounded-md overflow-hidden border border-gray-200 hover:border-gray-300"
          @click="openImage(u)"
          :aria-label="`Otvori sliku ${idx + 1}`"
        >
          <img :src="u" alt="Slika kvara" class="h-full w-full object-cover" />
        </button>
      </div>
      <div v-else-if="imageErrorMsg" class="pt-2 text-sm text-red-600">{{ imageErrorMsg }}</div>
    </ClientOnly>

    <div class="pt-2 flex items-center gap-2">
      <button
        type="button"
        class="px-4 py-2 rounded-md bg-green-600 text-white font-medium hover:bg-green-700 active:scale-[0.99]"
        :disabled="accepting || acceptedOnce || (hasImages && !imagesReady)"
        @click="onAccept"
      >{{ accepting ? 'Prihvatanje...' : 'Prihvati' }}</button>
      <button
        type="button"
        class="px-4 py-2 rounded-md bg-gray-800 text-white font-medium hover:bg-gray-900 active:scale-[0.99]"
        @click="$emit('dismiss', job.jobId)"
      >Odbij</button>
    </div>
    <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
    <p v-if="successMsg" class="text-green-600 text-sm">{{ successMsg }}</p>
  </div>

  <ClientOnly>
    <div v-if="showImageModal" class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" @click.self="closeImage">
      <div class="max-w-3xl w-full">
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b">
            <div class="text-sm font-medium text-gray-900">Slika kvara</div>
            <button type="button" class="text-gray-600 hover:text-gray-900" @click="closeImage">Zatvori</button>
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
import { computed, ref, watch } from 'vue'
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
  if (!import.meta.client) return
  if (!imagesReady.value) {
    imageUrls.value = []
    imageErrorMsg.value = ''
    return
  }
  const paths = Array.isArray(props.job?.imagePaths) ? props.job.imagePaths : []
  if (!paths.length) {
    imageUrls.value = []
    imageErrorMsg.value = ''
    return
  }

  const { $storage } = useNuxtApp() as any
  if (!$storage) {
    imageUrls.value = []
    imageErrorMsg.value = 'Storage nije dostupan.'
    return
  }

  loadingImages.value = true
  imageErrorMsg.value = ''
  try {
    const { ref: storageRef, getDownloadURL } = await import('firebase/storage')
    const key = cacheKey.value
    const urls = await Promise.all(
      paths.slice(0, 3).map(async (p) => {
        const u = await getDownloadURL(storageRef($storage, p))
        return key ? `${u}${u.includes('?') ? '&' : '?'}v=${encodeURIComponent(key)}` : u
      })
    )
    imageUrls.value = urls
  } catch {
    imageUrls.value = []
    imageErrorMsg.value = 'Ne mogu da učitam slike.'
  } finally {
    loadingImages.value = false
  }
}

watch(
  () => ({ paths: (props.job?.imagePaths || []).join('|'), ready: imagesReady.value, key: cacheKey.value }),
  () => {
    loadImageUrls()
  },
  { immediate: true }
)

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
    const projectId = config.public.firebase.projectId || 'majstorsada-b2ad4'
    const region = config.public.firebase.functionsRegion || 'europe-west3'
  const base = process.env.NODE_ENV === 'development'
    ? `http://localhost:5501/${projectId}/${region}`
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
    acceptedOnce.value = true
    emit('accepted', props.job)
  } catch (e: any) {
    const msg = e?.message || 'Greška pri prihvatanju posla.'
    if (/not available/i.test(msg) || /precondition/i.test(msg) || /412/.test(msg)) {
      errorMsg.value = 'Posao je već prihvaćen od drugog majstora.'
      emit('dismiss', props.job.jobId)
    } else {
      errorMsg.value = msg
    }
  } finally {
    accepting.value = false
  }
}
</script>



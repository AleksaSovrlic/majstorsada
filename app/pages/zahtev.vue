<template>
  <div class="min-h-screen flex items-start justify-center px-4 py-8">
    <div class="w-full max-w-xl bg-white rounded-xl shadow p-6">
      <h1 class="text-2xl font-semibold text-gray-900 text-center">Novi zahtev</h1>
      <p class="text-gray-600 text-center mt-1">Opišite problem i pošaljite zahtev majstorima.</p>

      <form class="mt-6 space-y-5" @submit.prevent="submit">
        <div>
          <label class="block text-sm text-gray-700 mb-1">Vaš e-mail</label>
          <input :value="userEmail" type="email" readonly class="w-full rounded-md border border-gray-200 bg-white/60 backdrop-blur-sm px-3 py-2 text-gray-700" />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Potreban mi je:</label>
          <select v-model="specializationRequired" required class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Izaberite tip majstora</option>
            <option value="vodoinstalater">Vodoinstalater</option>
            <option value="električar">Električar</option>
            <option value="bravar">Bravar</option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Kratak opis problema</label>
          <textarea v-model="problemDescription" rows="6" required class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Npr: curi voda iz slavine, ventil ne zatvara..." />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Adresa</label>
          <AppLocationInput v-model="addressText" v-model:selected="selectedLocation" placeholder="Počnite da kucate i izaberite iz liste" />
          <p v-if="addressText && !selectedLocation" class="mt-1 text-sm text-red-600">
            Morate izabrati adresu iz liste kako bismo dobili tačne koordinate.
          </p>
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Kontakt telefon</label>
          <input v-model="contactPhone" type="tel" required class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="06x xxx xxxx" />
          <p class="text-sm mt-1" :class="phoneValid ? 'text-green-700' : 'text-red-600'">
            {{ phoneValid ? 'Broj telefona je validan.' : 'Unesite ispravan broj telefona.' }}
          </p>
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Slike kvara (opciono, max 3)</label>
          <input type="file" accept="image/*" multiple @change="onFiles" class="w-full text-sm text-gray-600" />
          <p class="mt-1 text-xs text-gray-500">Slike se automatski kompresuju (max 1280px, kvalitet 0.8) pre slanja.</p>

          <div v-if="selectedImages.length > 0" class="mt-3 grid grid-cols-3 gap-2">
            <div v-for="(img, idx) in selectedImages" :key="img.previewUrl" class="relative">
              <img :src="img.previewUrl" alt="preview" class="h-24 w-full rounded-md object-cover border border-gray-200" />
              <button
                type="button"
                class="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-black/70 text-white text-sm flex items-center justify-center hover:bg-black disabled:opacity-60"
                @click="removeImage(idx)"
                :disabled="submitting"
                aria-label="Ukloni sliku"
              >
                ✕
              </button>
            </div>
          </div>

          <div v-if="uploading" class="mt-3">
            <div class="h-2 w-full rounded bg-gray-200 overflow-hidden">
              <div class="h-2 bg-blue-600" :style="{ width: `${uploadProgress}%` }" />
            </div>
            <div class="mt-1 text-xs text-gray-600">Upload: {{ uploadProgress }}%</div>
          </div>
        </div>

        <button
          type="submit"
          :disabled="submitting || !phoneValid || !specializationRequired || !selectedLocation"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg shadow active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {{ submitting ? 'Slanje...' : '[ Pošalji Zahtev ]' }}
        </button>
        <button
          v-if="createdJobId"
          type="button"
          class="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium px-6 py-3 rounded-lg shadow active:scale-[0.99]"
          @click="router.push('/potvrda')"
        >
          Nastavi bez slika
        </button>
        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { useJobStore } from '@/stores/job'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import AppLocationInput, { type LocationSelection } from '@/components/AppLocationInput.vue'
import { compressImageToJpeg } from '@/utils/imageCompression'

definePageMeta({
  middleware: ['client-auth']
})

const router = useRouter()
const jobStore = useJobStore()
const authStore = useAuthStore()

const problemDescription = ref('')
const addressText = ref('')
const selectedLocation = ref<LocationSelection | null>(null)
const contactPhone = ref('')
const selectedImages = ref<Array<{ file: File; previewUrl: string }>>([])
const specializationRequired = ref('')

const submitting = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const createdJobId = ref<string | null>(null)
const errorMsg = ref('')

const userEmail = computed(() => authStore.currentUser?.email || '')
const phoneValid = computed(() => {
  if (!contactPhone.value) return false
  const parsed = parsePhoneNumberFromString(contactPhone.value, 'RS')
  return parsed ? parsed.isValid() : false
})
const e164Phone = computed(() => {
  const parsed = parsePhoneNumberFromString(contactPhone.value, 'RS')
  return parsed && parsed.isValid() ? parsed.number : ''
})

const MAX_IMAGES = 3

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  // Reset input so user can select the same file again
  input.value = ''

  for (const f of files) {
    if (selectedImages.value.length >= MAX_IMAGES) break
    if (!f.type || !f.type.startsWith('image/')) continue
    const previewUrl = URL.createObjectURL(f)
    selectedImages.value.push({ file: f, previewUrl })
  }
}

function removeImage(idx: number) {
  const item = selectedImages.value[idx]
  if (item) {
    try { URL.revokeObjectURL(item.previewUrl) } catch { /* noop */ }
  }
  selectedImages.value.splice(idx, 1)
}

onBeforeUnmount(() => {
  for (const i of selectedImages.value) {
    try { URL.revokeObjectURL(i.previewUrl) } catch { /* noop */ }
  }
})

async function submit() {
  errorMsg.value = ''
  submitting.value = true
  try {
    if (!specializationRequired.value) {
      throw new Error('Molimo izaberite tip majstora.')
    }
    if (!phoneValid.value) {
      throw new Error('Molimo unesite ispravan broj telefona.')
    }
    if (!selectedLocation.value) {
      throw new Error('Molimo izaberite adresu iz liste.')
    }

    // 1) Create the job first (we need jobId to namespace Storage paths).
    let jobId = createdJobId.value
    if (!jobId) {
      const res = await jobStore.createJob({
        problemDescription: problemDescription.value,
        address: selectedLocation.value.address,
        coordinates: selectedLocation.value.coordinates,
        city: selectedLocation.value.city,
        contactPhone: e164Phone.value,
        specializationRequired: specializationRequired.value,
        imagesReady: selectedImages.value.length === 0,
        // legacy field (not used for new uploads)
        imageUrl: undefined
      })
      jobId = res.jobId
      createdJobId.value = jobId
    }

    // 2) Upload images (optional)
    if (selectedImages.value.length > 0) {
      await uploadJobImages(jobId, selectedImages.value.map((x) => x.file))
    }

    router.push('/potvrda')
  } catch (e: any) {
    errorMsg.value = e?.message || 'Greška pri slanju zahteva.'
  } finally {
    submitting.value = false
  }
}

function makeRandomId() {
  // Short random id for filenames (non-crypto)
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

async function uploadJobImages(jobId: string, files: File[]) {
  uploading.value = true
  uploadProgress.value = 0

  const { $storage, $firestore } = useNuxtApp() as any
  if (!$storage) {
    throw new Error('Upload slika trenutno nije dostupan (Storage nije inicijalizovan).')
  }

  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
  const { ref: storageRef, uploadBytesResumable } = await import('firebase/storage')

  // Compress first (so progress is based on actual upload bytes)
  const compressed = await Promise.all(
    files.slice(0, MAX_IMAGES).map((f) => compressImageToJpeg(f, { maxSide: 1280, quality: 0.8 }))
  )
  const totalBytes = compressed.reduce((sum, c) => sum + (c.blob?.size || 0), 0) || 1

  // Declare allowed Storage paths in Firestore first (Storage rules depend on this).
  const names = compressed.map((_, idx) => `img-${idx + 1}-${makeRandomId()}.jpg`)
  const imagePaths = names.map((n) => `jobs/${jobId}/${n}`)
  const jobRef = doc($firestore, 'jobs', jobId)
  await updateDoc(jobRef, { imagePaths, imagesReady: false, imagesUpdatedAt: serverTimestamp() })

  const succeeded: string[] = []
  let uploadedSoFar = 0

  try {
    // Upload sequentially for predictable progress and lower peak memory.
    for (const [i, c] of compressed.entries()) {
      const path = imagePaths[i]
      if (!path) {
        throw new Error('Greška pri uploadu slika (nedostaje putanja fajla).')
      }
      const blob = c.blob
      const task = uploadBytesResumable(storageRef($storage, path), blob, { contentType: 'image/jpeg' })

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            const current = uploadedSoFar + snap.bytesTransferred
            uploadProgress.value = Math.min(100, Math.round((current / totalBytes) * 100))
          },
          (err) => reject(err),
          () => resolve()
        )
      })

      uploadedSoFar += blob.size
      succeeded.push(path)
      uploadProgress.value = Math.min(100, Math.round((uploadedSoFar / totalBytes) * 100))
    }

    // Mark images as ready only after all uploads completed.
    await updateDoc(jobRef, { imagesReady: true, imagesUpdatedAt: serverTimestamp() })
  } catch {
    // Keep Firestore consistent with what was actually uploaded.
    try {
      await updateDoc(jobRef, { imagePaths: succeeded, imagesReady: true, imagesUpdatedAt: serverTimestamp() })
    } catch {
      // ignore secondary failure
    }
    throw new Error('Zahtev je poslat, ali upload slika nije uspeo. Pokušajte ponovo ili nastavite bez slika.')
  } finally {
    uploading.value = false
  }
}
</script>



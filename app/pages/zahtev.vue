<template>
  <div class="min-h-screen flex items-start justify-center px-4 py-8">
    <div class="w-full max-w-xl bg-white rounded-xl shadow p-6">
      <h1 class="text-2xl font-bold text-[#05243a] text-center">Hajde da rešimo kvar.</h1>
      <p class="mt-1 text-gray-600 text-center">
        Izaberite kategoriju i opišite problem. Majstori su spremni.
      </p>

      <form class="mt-5 space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-sm text-gray-700 mb-1">Vaš e-mail</label>
          <input
            :value="userEmail"
            type="email"
            readonly
            class="w-full bg-slate-50 border-0 rounded-xl px-4 py-3 text-gray-700"
          />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-3">Potreban mi je:</label>
          <div class="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              v-for="spec in specializationOptions"
              :key="spec.value"
              type="button"
              :class="[
                'rounded-xl border px-2 py-3 sm:px-3 sm:py-4 text-center transition-colors',
                specializationRequired === spec.value
                  ? 'bg-blue-50 border-2 border-[#1186dc] text-[#1186dc]'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
              ]"
              @click="specializationRequired = spec.value"
            >
              <div
                class="mx-auto flex h-9 w-9 items-center justify-center rounded-lg"
                :class="specializationRequired === spec.value ? 'bg-[#1186dc]/10' : spec.iconBgClass"
              >
                <span
                  class="h-6 w-6"
                  :class="specializationRequired === spec.value ? 'text-[#1186dc]' : spec.iconClass"
                  v-html="spec.icon"
                  aria-hidden="true"
                ></span>
              </div>
              <div class="mt-2 text-xs sm:text-sm font-medium leading-tight">{{ spec.label }}</div>
            </button>
          </div>
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Kratak opis problema</label>
          <textarea
            v-model="problemDescription"
            rows="4"
            required
            class="w-full bg-slate-50 border-0 focus:ring-2 focus:ring-[#1186dc] rounded-xl p-3 sm:p-4"
            placeholder="Npr: curi voda iz slavine, ventil ne zatvara..."
          />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Adresa</label>
          <AppLocationInput
            v-model="addressText"
            v-model:selected="selectedLocation"
            placeholder="Počnite da kucate i izaberite iz liste"
            :inputClass="'w-full bg-slate-50 border-0 focus:ring-2 focus:ring-[#1186dc] rounded-xl p-3 sm:p-4'"
          />
          <p v-if="addressText && !selectedLocation" class="mt-1 text-sm text-red-600">
            Morate izabrati adresu iz liste kako bismo dobili tačne koordinate.
          </p>
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Kontakt telefon</label>
          <input
            v-model="contactPhone"
            type="tel"
            required
            class="w-full bg-slate-50 border-0 focus:ring-2 focus:ring-[#1186dc] rounded-xl p-3 sm:p-4"
            placeholder="06x xxx xxxx"
          />
          <p class="text-sm mt-1" :class="phoneValid ? 'text-green-700' : 'text-red-600'">
            {{ phoneValid ? 'Broj telefona je validan.' : 'Unesite ispravan broj telefona.' }}
          </p>
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Slike kvara (opciono, max 3)</label>
          <input type="file" accept="image/*" multiple @change="onFiles" class="w-full text-sm text-gray-600" />

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

        <div class="sticky bottom-0 -mx-6 px-6 py-3 bg-white/90 backdrop-blur border-t border-slate-100 md:static md:mx-0 md:px-0 md:py-0 md:bg-transparent md:backdrop-blur-0 md:border-0">
          <button
            type="submit"
            :disabled="submitting || !phoneValid || !specializationRequired || !selectedLocation"
            class="w-full bg-[#1186dc] text-white font-bold py-4 md:py-3 rounded-xl shadow-lg md:shadow-md hover:bg-[#0f78c3] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M11 5l7 7-7 7M4 12h14" />
            </svg>
            {{ submitting ? 'Slanje...' : 'Pronađi Majstora' }}
          </button>
        </div>
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

const specializationOptions = [
  {
    value: 'vodoinstalater',
    label: 'Vodoinstalater',
    iconClass: 'text-sky-600',
    iconBgClass: 'bg-sky-50',
    // Faucet (two-tone)
    icon: `<svg viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 10h6" />
      <path d="M8 10V7a2 2 0 0 1 2-2h1" />
      <path d="M12 5h4" />
      <path d="M16 5v3a2 2 0 0 1-2 2h-3" />
      <path d="M11 10v4h4v-2h4v-2" />
      <path d="M19 12v-2a2 2 0 0 0-2-2h-2" />
      <path d="M19 18c0 1.1-.9 2-2 2s-2-.9-2-2c0-1.5 2-3.5 2-3.5S19 16.5 19 18z" />
    </svg>`
  },
  {
    value: 'električar',
    label: 'Električar',
    iconClass: 'text-amber-500',
    iconBgClass: 'bg-amber-50',
    // Bulb (two-tone)
    icon: `<svg viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12c.7.6 1 1.1 1 2h6c0-.9.3-1.4 1-2a7 7 0 0 0-4-12z" />
    </svg>`
  },
  {
    value: 'bravar',
    label: 'Bravar',
    iconClass: 'text-slate-600',
    iconBgClass: 'bg-slate-50',
    // Key (two-tone)
    icon: `<svg viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 14a4 4 0 1 1 3.7-5.5" />
      <path d="M10.7 8.5L22 8v4l-3 1v2l-2 1v-2l-2 1" />
      <path d="M7 14l-2 2" />
    </svg>`
  }
]

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



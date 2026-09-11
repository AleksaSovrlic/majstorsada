<template>
  <div class="min-h-screen flex items-start justify-center px-4 py-8">
    <div class="w-full max-w-xl bg-white rounded-xl shadow p-6">
      <h1 class="text-2xl font-bold text-[#05243a] text-center">Hajde da rešimo kvar.</h1>
      <p class="mt-1 text-gray-600 text-center">
        Izaberite kategoriju i opišite problem. Majstori su spremni.
      </p>

      <form class="mt-5 space-y-4" @submit.prevent="submit">
        <fieldset class="space-y-4" :disabled="submitting || !!createdJobId || recovering">
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
            rows="4" minlength="3" maxlength="2000"
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
        </fieldset>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Slike kvara (opciono, max 3)</label>
          <p v-if="createdJobId" class="text-sm text-slate-600 mb-2">Zahtev je sačuvan. Dovršite fotografije ili objavite bez njih. {{ uploadedSlots.length }} fotografija je otpremljeno.</p>
          <input :disabled="submitting || recovering || finalizationStarted" type="file" accept="image/*" multiple @change="onFiles" class="w-full text-sm text-gray-600" />

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
            :disabled="submitting || recovering || (!createdJobId && (!phoneValid || !specializationRequired || !selectedLocation))"
            class="w-full bg-[#1186dc] text-white font-bold py-4 md:py-3 rounded-xl shadow-lg md:shadow-md hover:bg-[#0f78c3] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M11 5l7 7-7 7M4 12h14" />
            </svg>
            {{ submitting ? 'Slanje...' : createdJobId ? 'Dovrši slanje zahteva' : 'Pronađi Majstora' }}
          </button>
        </div>
        <button
          v-if="createdJobId"
          type="button"
          class="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium px-6 py-3 rounded-lg shadow active:scale-[0.99]"
          :disabled="submitting || recovering"
          @click="finishWithoutImages"
        >
          Nastavi bez slika
        </button>
        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { useJobStore } from '@/stores/job'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import AppLocationInput, { type LocationSelection } from '@/components/AppLocationInput.vue'
import { compressImageToJpeg } from '@/utils/imageCompression'
import { useApi } from '@/utils/api'
import { doc, getDocFromServer } from 'firebase/firestore'
import { ref as storageRef, getMetadata, uploadBytesResumable } from 'firebase/storage'

definePageMeta({
  middleware: ['client-auth']
})

const route = useRoute()
const router = useRouter()
const jobStore = useJobStore()
const api = useApi()
const { $firestore, $storage } = useNuxtApp()
const requestId = ref('')
const photoCount = ref(0)
const finalizationStarted = ref(false)
const uploadedSlots = ref<number[]>([])
const recovering = ref(true)
const draftKey = () => 'job-draft:' + authStore.currentUser?.uid
const authStore = useAuthStore()

const problemDescription = ref('')
const addressText = ref('')
const selectedLocation = ref<LocationSelection | null>(null)
const contactPhone = ref('')
const selectedImages = ref<Array<{ file: File; previewUrl: string; slot?: number }>>([])
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

function mapTipToSpecialization(tip: string): string | null {
  const normalized = tip.trim().toLowerCase()
  if (!normalized) return null

  // Support both URL-safe slugs and any legacy/hand-typed values.
  if (normalized === 'vodoinstalater') return 'vodoinstalater'
  if (normalized === 'bravar') return 'bravar'
  if (normalized === 'elektricar' || normalized === 'električar') return 'električar'

  return null
}

onMounted(async () => {
  try {
    const tip = route.query.tip
    if (typeof tip === 'string') specializationRequired.value = mapTipToSpecialization(tip) || ''
    const saved = typeof route.query.resume === 'string' ? route.query.resume : localStorage.getItem(draftKey())
    if (saved && /^[a-zA-Z0-9_-]{16,100}$/.test(saved)) {
      requestId.value = saved
      await recoverJob()
    }
  } catch (e: any) { errorMsg.value = 'Nastavak zahteva nije učitan. Osvežite stranicu kada se veza vrati. ' + (e.message || '') }
  finally { recovering.value = false }
})

async function recoverJob() {
  if (!requestId.value) return
  const snap = await getDocFromServer(doc($firestore, 'jobs', requestId.value))
  if (!snap.exists()) return
  const job = snap.data()
  if (job.clientId !== authStore.currentUser?.uid) throw new Error('Zahtev nije vaš.')
  createdJobId.value = snap.id
  if (job.imagesReady === true || job.status !== 'pending') {
    localStorage.removeItem(draftKey())
    await router.replace('/klijent/dashboard'); return
  }
  const contact = await getDocFromServer(doc($firestore, 'jobs', snap.id, 'private', 'contact'))
  problemDescription.value = job.problemDescription
  addressText.value = job.address
  selectedLocation.value = { address: job.address, coordinates: { lat: job.coordinates.latitude, lng: job.coordinates.longitude }, city: job.city }
  contactPhone.value = contact.data()?.contactPhone || ''
  specializationRequired.value = job.specializationRequired
  photoCount.value = job.photoCount
  finalizationStarted.value = Array.isArray(job.imageFinalizationSlots)
  await inspectUploads()
}
async function inspectUploads() {
  uploadedSlots.value = []
  for (let slot = 0; slot < photoCount.value; slot++) {
    try {
      await getMetadata(storageRef($storage, 'job-uploads/' + authStore.currentUser?.uid + '/' + createdJobId.value + '/' + slot + '.jpg'))
      uploadedSlots.value.push(slot)
    } catch (e: any) { if (e.code !== 'storage/object-not-found') throw e }
  }
}

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
    if (selectedImages.value.length >= (createdJobId.value ? photoCount.value - uploadedSlots.value.length : MAX_IMAGES)) break
    if (!f.type || !f.type.startsWith('image/')) continue
    const previewUrl = URL.createObjectURL(f)
    const slot = createdJobId.value ? Array.from({ length: photoCount.value }, (_, i) => i).find(i => !uploadedSlots.value.includes(i) && !selectedImages.value.some(image => image.slot === i)) : undefined
    selectedImages.value.push({ file: f, previewUrl, slot })
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

async function done() {
  localStorage.removeItem(draftKey())
  await router.push('/potvrda')
}
async function submit() {
  if (submitting.value) return
  errorMsg.value = ''; submitting.value = true
  try {
    if (!createdJobId.value) {
      if (!specializationRequired.value || !phoneValid.value || !selectedLocation.value) throw new Error('Popunite opis, telefon i izaberite adresu iz liste.')
      if (!requestId.value) requestId.value = crypto.randomUUID()
      // Persist only an opaque ID. The backend owns the request and its contact.
      localStorage.setItem(draftKey(), requestId.value)
      photoCount.value = selectedImages.value.length
      selectedImages.value.forEach((image, slot) => { image.slot = slot })
      const result = await jobStore.createJob({
        requestId: requestId.value, problemDescription: problemDescription.value,
        address: selectedLocation.value.address, coordinates: selectedLocation.value.coordinates,
        city: 'Beograd', contactPhone: e164Phone.value,
        specializationRequired: specializationRequired.value, photoCount: photoCount.value
      })
      createdJobId.value = result.jobId
      if (result.imagesReady) { await done(); return }
    }
    if (!finalizationStarted.value) await uploadJobImages()
    await api('finalizeJobImages', { jobId: createdJobId.value, slots: uploadedSlots.value })
    await done()
  } catch (e: any) {
    errorMsg.value = e?.message || 'Slanje nije dovršeno. Pokušajte ponovo; sačuvani zahtev se neće duplirati.'
    // A lost create response must not strand a request. Recover the exact same ID.
    if (requestId.value) {
      try { await recoverJob() } catch { /* Keep ID for the next explicit retry. */ }
    }
  } finally { submitting.value = false }
}
async function finishWithoutImages() {
  if (submitting.value || !createdJobId.value) return
  submitting.value = true; errorMsg.value = ''
  try { await api('finalizeJobImages', { jobId: createdJobId.value, slots: [] }); await done() }
  catch (e: any) { errorMsg.value = e.message || 'Zahtev nije dovršen. Pokušajte ponovo.' }
  finally { submitting.value = false }
}
async function uploadJobImages() {
  uploading.value = true; uploadProgress.value = 0
  try {
    await inspectUploads()
    // A response may be lost after the upload succeeded. Keep each local file
    // tied to its original slot, never shift it into the next missing slot.
    for (const image of selectedImages.value) if (image.slot !== undefined && uploadedSlots.value.includes(image.slot)) URL.revokeObjectURL(image.previewUrl)
    selectedImages.value = selectedImages.value.filter(image => image.slot !== undefined && !uploadedSlots.value.includes(image.slot))
    const files = [...selectedImages.value]
    // Use remaining selections for remaining slots after a reload. Already uploaded
    // slots are immutable, so retries cannot replace photos another call published.
    for (const [index, item] of files.entries()) {
      const slot = item.slot!
      const { blob } = await compressImageToJpeg(item.file, { maxSide: 1280, quality: 0.8 })
      const path = 'job-uploads/' + authStore.currentUser?.uid + '/' + createdJobId.value + '/' + slot + '.jpg'
      const task = uploadBytesResumable(storageRef($storage, path), blob, { contentType: 'image/jpeg' })
      await new Promise<void>((resolve, reject) => task.on('state_changed', snap => {
        uploadProgress.value = Math.round(((index + snap.bytesTransferred / snap.totalBytes) / files.length) * 100)
      }, reject, resolve))
      uploadedSlots.value.push(slot)
      // Successful selections are removed so a retry associates only unuploaded files.
      URL.revokeObjectURL(item.previewUrl)
      selectedImages.value = selectedImages.value.filter(selected => selected !== item)
    }
    if (!uploadedSlots.value.length && photoCount.value > 0) throw new Error('Izaberite fotografije ponovo ili kliknite „Nastavi bez slika“.')
  } finally { uploading.value = false }
}
</script>

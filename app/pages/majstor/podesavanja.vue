<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <NuxtLink to="/majstor/dashboard" class="text-sm text-blue-700 hover:underline">← Nazad na panel</NuxtLink>
    </div>

    <div class="bg-white rounded-xl shadow p-4">
      <div class="text-lg font-semibold text-gray-900 mb-3">Moj profil</div>

      <div class="space-y-4">
        <div class="flex items-start gap-4">
          <div class="h-20 w-20 rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
            <img v-if="avatarDisplayUrl" :src="avatarDisplayUrl" alt="Profilna slika" class="h-full w-full object-cover" />
            <svg v-else viewBox="0 0 24 24" class="h-10 w-10 text-gray-400" aria-hidden="true">
              <path fill="currentColor" d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5c0-2.5-3.58-4.5-8-4.5" />
            </svg>
          </div>

          <div class="flex-1 space-y-2">
            <div>
              <label class="block text-sm text-gray-700 mb-1">Profilna slika</label>
              <input
                type="file"
                accept="image/*"
                class="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-800 hover:file:bg-gray-200"
                @change="onAvatarPicked"
              />
              <p class="mt-1 text-xs text-gray-500">Kompresija: 500×500 JPG (automatski).</p>
            </div>

            <div v-if="avatarUploadProgress > 0 && avatarUploadProgress < 100" class="w-full">
              <div class="h-2 w-full rounded bg-gray-200 overflow-hidden">
                <div class="h-2 bg-blue-600" :style="{ width: `${avatarUploadProgress}%` }"></div>
              </div>
              <div class="mt-1 text-xs text-gray-500">Upload: {{ avatarUploadProgress }}%</div>
            </div>
          </div>
        </div>

        <div>
          <label class="block text-sm text-gray-700 mb-1">Biografija</label>
          <textarea
            v-model="bio"
            rows="4"
            maxlength="500"
            class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Kratko opišite iskustvo i veštine (opciono)"
            @input="onBioInput"
          ></textarea>
          <div class="mt-1 flex items-center justify-between text-xs text-gray-500">
            <span>Maksimalno 500 karaktera.</span>
            <span>{{ bio.length }}/500</span>
          </div>
        </div>

        <button
          class="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
          @click="saveProfile"
          :disabled="savingProfile"
        >
          {{ savingProfile ? 'Čuvanje...' : 'Sačuvaj profil' }}
        </button>
        <p v-if="profileErr" class="text-red-600 text-sm">{{ profileErr }}</p>
        <p v-if="profileMsg" class="text-green-600 text-sm">{{ profileMsg }}</p>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow p-4">
      <div class="text-lg font-semibold text-gray-900 mb-3">Podešavanja</div>

      <div class="space-y-3">
        <div>
          <label class="block text-sm text-gray-700 mb-1">Grad</label>
          <select v-model="city" class="w-full rounded-md border border-gray-300 px-3 py-2">
            <option v-for="c in SUPPORTED_CITIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <button class="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 active:scale-[0.99]" @click="savePrefs" :disabled="savingPrefs">
          {{ savingPrefs ? 'Čuvanje...' : 'Sačuvaj podešavanja' }}
        </button>
        <p v-if="prefsMsg" class="text-green-600 text-sm">{{ prefsMsg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTradespersonStore } from '@/stores/tradesperson'
import { DEFAULT_CITY, SUPPORTED_CITIES, isSupportedCity, type SupportedCity } from '@/utils/cities'
import { compressImageToSquareJpeg } from '@/utils/imageCompression'
import { timestampCacheKey } from '@/utils/timestampCacheKey'

definePageMeta({ layout: 'majstor', middleware: 'auth' })

const auth = useAuthStore()
const tp = useTradespersonStore()
const city = ref<SupportedCity>(DEFAULT_CITY)
const savingPrefs = ref(false)
const prefsMsg = ref('')

const bio = ref('')
const bioDirty = ref(false)
const savingProfile = ref(false)
const profileMsg = ref('')
const profileErr = ref('')

const pickedAvatarFile = ref<File | null>(null)
const pickedAvatarPreviewUrl = ref<string | null>(null)
const currentAvatarUrl = ref<string | null>(null)
const avatarUploadProgress = ref(0)

const avatarDisplayUrl = computed(() => pickedAvatarPreviewUrl.value || currentAvatarUrl.value)

watchEffect(() => {
  const c = (tp.profile as any)?.city
  city.value = isSupportedCity(c) ? c : DEFAULT_CITY
})

watch(
  () => (tp.profile as any)?.bio,
  (newBio) => {
    if (bioDirty.value) return
    bio.value = typeof newBio === 'string' ? newBio : ''
  },
  { immediate: true }
)

function onBioInput() {
  bioDirty.value = true
}

function clearPickedAvatarPreview() {
  const u = pickedAvatarPreviewUrl.value
  pickedAvatarPreviewUrl.value = null
  pickedAvatarFile.value = null
  if (u) {
    try { URL.revokeObjectURL(u) } catch { /* noop */ }
  }
}

function onAvatarPicked(e: Event) {
  const input = e.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return
  // Reset any previous preview to avoid leaking object URLs
  clearPickedAvatarPreview()
  pickedAvatarFile.value = file
  pickedAvatarPreviewUrl.value = URL.createObjectURL(file)
}

async function loadCurrentAvatar() {
  if (!import.meta.client) return
  const path = (tp.profile as any)?.avatarPath
  if (!path || typeof path !== 'string') {
    currentAvatarUrl.value = null
    return
  }
  const { $storage } = useNuxtApp() as any
  if (!$storage) {
    currentAvatarUrl.value = null
    return
  }
  try {
    const { ref: storageRef, getDownloadURL } = await import('firebase/storage')
    const url = await getDownloadURL(storageRef($storage, path))
    const key = timestampCacheKey((tp.profile as any)?.avatarUpdatedAt)
    currentAvatarUrl.value = key ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(key)}` : url
  } catch {
    currentAvatarUrl.value = null
  }
}

watch(
  () => ({ path: (tp.profile as any)?.avatarPath, key: timestampCacheKey((tp.profile as any)?.avatarUpdatedAt) }),
  () => {
    loadCurrentAvatar()
  },
  { immediate: true }
)

onMounted(async () => {
  await auth.ensureAuthReady()
  const uid = auth.currentUser?.uid
  if (uid) {
    tp.subscribeProfile(uid)
  }
})

onBeforeUnmount(() => {
  clearPickedAvatarPreview()
})

async function saveProfile() {
  profileMsg.value = ''
  profileErr.value = ''
  savingProfile.value = true
  avatarUploadProgress.value = 0
  try {
    await auth.ensureAuthReady()
    const uid = auth.currentUser?.uid
    if (!uid) throw new Error('Niste prijavljeni.')
    const { $firestore, $storage } = useNuxtApp() as any
    if (!$storage) throw new Error('Upload slika trenutno nije dostupan (Storage nije inicijalizovan).')

    const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
    const { ref: storageRef, uploadBytesResumable } = await import('firebase/storage')

    const updates: Record<string, any> = {}

    const normalizedBio = bio.value.trim().slice(0, 500)
    updates.bio = normalizedBio.length ? normalizedBio : null

    // Upload avatar if picked
    const f = pickedAvatarFile.value
    if (f) {
      const compressed = await compressImageToSquareJpeg(f, { size: 500, quality: 0.85 })
      const path = `avatars/${uid}/profile.jpg`
      const task = uploadBytesResumable(storageRef($storage, path), compressed.blob, { contentType: 'image/jpeg' })
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            const total = snap.totalBytes || 1
            avatarUploadProgress.value = Math.min(100, Math.round((snap.bytesTransferred / total) * 100))
          },
          (err) => reject(err),
          () => resolve()
        )
      })
      updates.avatarPath = path
      updates.avatarUpdatedAt = serverTimestamp()
    }

    await updateDoc(doc($firestore, 'tradespeople', uid), updates)

    // Reset local UI state
    bioDirty.value = false
    clearPickedAvatarPreview()
    profileMsg.value = 'Sačuvano.'
  } catch (e: any) {
    profileErr.value = e?.message || 'Greška pri čuvanju profila.'
  } finally {
    savingProfile.value = false
    avatarUploadProgress.value = 0
  }
}

async function savePrefs() {
  prefsMsg.value = ''
  savingPrefs.value = true
  try {
    await tp.setCity(city.value)
    prefsMsg.value = 'Sačuvano.'
  } finally {
    savingPrefs.value = false
  }
}
</script>



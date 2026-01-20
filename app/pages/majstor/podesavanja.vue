<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <NuxtLink
        to="/majstor/dashboard"
        class="inline-flex items-center gap-2 rounded-full bg-white/60 ring-1 ring-black/5 px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-white transition-transform active:scale-[0.99]"
      >
        <span aria-hidden="true">←</span>
        Nazad na panel
      </NuxtLink>
    </div>

    <div class="text-center">
      <h1 class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
        Podešavanja
      </h1>
      <p class="mt-1 text-slate-600">
        Uredite profil i parametre naloga.
      </p>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <!-- PROFILE -->
      <section aria-labelledby="profile-title" class="lg:col-span-2 bg-white/80 backdrop-blur rounded-[2rem] ring-1 ring-black/5 shadow-sm p-6 sm:p-8">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 id="profile-title" class="text-lg sm:text-xl font-extrabold text-brand-navy tracking-tight">
              Moj profil
            </h2>
            <p class="mt-1 text-sm text-slate-600">
              Profilna slika i kratka biografija (opciono).
            </p>
          </div>
        </div>

        <div class="mt-6 space-y-6">
          <div class="flex flex-col sm:flex-row sm:items-start gap-4">
            <div class="h-20 w-20 rounded-2xl overflow-hidden bg-slate-100 ring-1 ring-black/10 flex items-center justify-center shrink-0">
              <img v-if="avatarDisplayUrl" :src="avatarDisplayUrl" alt="Profilna slika" class="h-full w-full object-cover" />
              <svg v-else viewBox="0 0 24 24" class="h-10 w-10 text-slate-400" aria-hidden="true">
                <path fill="currentColor" d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5c0-2.5-3.58-4.5-8-4.5" />
              </svg>
            </div>

            <div class="flex-1 min-w-0 space-y-3">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Profilna slika</label>
                <input
                  type="file"
                  accept="image/*"
                  class="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-brand-blue/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-navy hover:file:bg-brand-blue/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/15"
                  @change="onAvatarPicked"
                />
                <p class="mt-2 text-xs text-slate-500">
                  Kompresija: 500×500 JPG (automatski).
                </p>
              </div>

              <div v-if="avatarUploadProgress > 0 && avatarUploadProgress < 100" class="w-full">
                <div class="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div class="h-2 bg-brand-blue" :style="{ width: `${avatarUploadProgress}%` }"></div>
                </div>
                <div class="mt-2 text-xs text-slate-500">Upload: {{ avatarUploadProgress }}%</div>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Biografija</label>
            <textarea
              v-model="bio"
              rows="4"
              maxlength="500"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
              placeholder="Kratko opišite iskustvo i veštine (opciono)"
              @input="onBioInput"
            ></textarea>
            <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Maksimalno 500 karaktera.</span>
              <span class="tabular-nums">{{ bio.length }}/500</span>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              class="inline-flex items-center justify-center rounded-xl bg-brand-blue text-white px-5 py-3 text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-brand-blue-dark transition-transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              @click="saveProfile"
              :disabled="savingProfile"
            >
              {{ savingProfile ? 'Čuvanje…' : 'Sačuvaj profil' }}
            </button>
            <div class="flex-1" />
          </div>

          <div v-if="profileErr" class="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-rose-800 text-sm">
            {{ profileErr }}
          </div>
          <div v-if="profileMsg" class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-sm">
            {{ profileMsg }}
          </div>
        </div>
      </section>

      <!-- PREFERENCES -->
      <section aria-labelledby="prefs-title" class="bg-white/80 backdrop-blur rounded-[2rem] ring-1 ring-black/5 shadow-sm p-6 sm:p-8">
        <h2 id="prefs-title" class="text-lg sm:text-xl font-extrabold text-brand-navy tracking-tight">
          Podešavanja naloga
        </h2>
        <p class="mt-1 text-sm text-slate-600">
          Grad se koristi za filtriranje novih poslova.
        </p>

        <div class="mt-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Grad</label>
            <select
              v-model="city"
              class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
            >
              <option v-for="c in SUPPORTED_CITIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>

          <button
            class="w-full inline-flex items-center justify-center rounded-xl bg-brand-blue text-white px-5 py-3 text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-brand-blue-dark transition-transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
            @click="savePrefs"
            :disabled="savingPrefs"
          >
            {{ savingPrefs ? 'Čuvanje…' : 'Sačuvaj podešavanja' }}
          </button>

          <div v-if="prefsMsg" class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-sm">
            {{ prefsMsg }}
          </div>
        </div>
      </section>
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

useSeoMeta({
  title: 'Podešavanja — MajstorSada',
  description: 'Podešavanja profila i naloga za majstore.',
  robots: 'noindex, nofollow'
})

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



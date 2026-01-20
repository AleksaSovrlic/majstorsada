<template>
  <main class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
    <section
      aria-labelledby="majstor-register-title"
      class="min-h-[100svh] flex items-center justify-center py-10"
    >
      <div class="w-full max-w-md">
        <div class="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 p-6 sm:p-8">
          <div class="text-center">
            <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M15 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5C23 16 19.42 14 15 14M6 10V7a3 3 0 0 1 6 0v3h2V7a5 5 0 0 0-10 0v3z"
                />
              </svg>
            </div>

            <h1 id="majstor-register-title" class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
              Registracija za majstore
            </h1>
            <p class="mt-3 text-gray-600 text-sm sm:text-base leading-relaxed">
              Napravite nalog i odaberite specijalizaciju — spremni ste za nove zahteve.
            </p>
          </div>

          <form class="mt-6 space-y-4" @submit.prevent="submit">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Ime i prezime</label>
              <input
                v-model="displayName"
                type="text"
                required
                autocomplete="name"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
                placeholder="Pera Perić"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                v-model="email"
                type="email"
                required
                autocomplete="email"
                inputmode="email"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
                placeholder="vasa.adresa@primer.com"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Kontakt telefon</label>
              <input
                v-model="phone"
                type="tel"
                required
                autocomplete="tel"
                inputmode="tel"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
                placeholder="06x xxx xxxx"
              />
              <p class="mt-2 text-xs font-medium" :class="phoneValid ? 'text-emerald-700' : 'text-red-600'">
                {{ phoneValid ? 'Broj telefona je validan.' : 'Unesite ispravan broj telefona.' }}
              </p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Lozinka</label>
              <input
                v-model="password"
                type="password"
                minlength="8"
                required
                autocomplete="new-password"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
                placeholder="min 8 karaktera"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Specijalizacija</label>
              <select
                v-model="specialization"
                required
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
              >
                <option value="">Izaberite</option>
                <option value="vodoinstalater">Vodoinstalater</option>
                <option value="električar">Električar</option>
                <option value="bravar">Bravar</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Grad</label>
              <select
                v-model="city"
                required
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
              >
                <option v-for="c in SUPPORTED_CITIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>

            <button
              type="submit"
              :disabled="loading || !phoneValid"
              class="w-full h-12 sm:h-14 inline-flex items-center justify-center rounded-xl bg-brand-blue text-white font-bold text-base sm:text-lg shadow-lg shadow-blue-500/25 hover:bg-brand-blue-dark active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {{ loading ? 'Kreiranje naloga…' : 'Registruj se' }}
            </button>

            <div v-if="errorMsg" class="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
              {{ errorMsg }}
            </div>
            <div v-if="successMsg" class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-sm">
              {{ successMsg }}
            </div>
          </form>

          <div class="mt-6 pt-4 border-t border-gray-100 text-sm text-center">
            <NuxtLink
              to="/majstor/login"
              class="inline-flex items-center justify-center font-semibold text-brand-navy hover:text-brand-blue transition-colors"
            >
              Već imate nalog? Prijavite se
            </NuxtLink>
          </div>

          <div class="mt-4 text-center">
            <NuxtLink to="/" class="text-sm font-semibold text-brand-navy hover:text-brand-blue transition-colors">
              Nazad na početnu stranicu
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { DEFAULT_CITY, SUPPORTED_CITIES } from '@/utils/cities'

definePageMeta({ layout: false })

useSeoMeta({
  title: 'Registracija za majstore — MajstorSada',
  description: 'Registrujte se kao majstor i počnite da primate nove zahteve.',
  robots: 'noindex, nofollow'
})

const router = useRouter()
const authStore = useAuthStore()

const displayName = ref('')
const email = ref('')
const phone = ref('')
const password = ref('')
const specialization = ref('')
const city = ref(DEFAULT_CITY)
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const phoneValid = computed(() => {
  if (!phone.value) return false
  const parsed = parsePhoneNumberFromString(phone.value, 'RS')
  return parsed ? parsed.isValid() : false
})
const e164Phone = computed(() => {
  const parsed = parsePhoneNumberFromString(phone.value, 'RS')
  return parsed && parsed.isValid() ? parsed.number : ''
})

onMounted(async () => {
  await authStore.ensureAuthReady()
  if (authStore.currentUser) {
    router.replace('/majstor/dashboard')
  }
})

async function submit() {
  errorMsg.value = ''
  successMsg.value = ''
  loading.value = true
  try {
    const { $firebaseAuth, $firestore } = useNuxtApp()
    if (!phoneValid.value) {
      throw new Error('Molimo unesite ispravan broj telefona.')
    }
    const cred = await createUserWithEmailAndPassword($firebaseAuth, email.value, password.value)
    const uid = cred.user.uid
    await setDoc(doc($firestore, 'tradespeople', uid), {
      uid,
      displayName: displayName.value,
      phoneNumber: e164Phone.value,
      email: cred.user.email || email.value,
      specialization: specialization.value,
      city: city.value,
      status: 'unavailable',
      balanceTokens: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true })
    successMsg.value = 'Nalog je uspešno kreiran.'
    router.push('/majstor/dashboard')
  } catch (e: any) {
    if (e?.code === 'auth/email-already-in-use') {
      errorMsg.value = 'E-mail je već u upotrebi.'
    } else if (e?.code === 'auth/weak-password') {
      errorMsg.value = 'Lozinka je preslaba (min 8 karaktera).'
    } else {
      errorMsg.value = e?.message || 'Greška pri kreiranju naloga.'
    }
  } finally {
    loading.value = false
  }
}
</script>



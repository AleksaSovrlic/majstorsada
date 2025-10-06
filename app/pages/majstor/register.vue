<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="w-full max-w-sm bg-white rounded-xl shadow p-6">
      <div class="mb-6 text-center">
        <div class="text-2xl font-bold text-gray-900">MajstorSada</div>
        <div class="text-sm text-gray-500 mt-1">Registracija za majstore</div>
      </div>

      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-sm text-gray-700 mb-1">Ime i prezime</label>
          <input v-model="displayName" type="text" required class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Pera Perić" />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Email</label>
          <input v-model="email" type="email" required class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="vas@email.com" />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Kontakt telefon</label>
          <input v-model="phone" type="tel" required class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="06x xxx xxxx" />
          <p class="text-sm mt-1" :class="phoneValid ? 'text-green-700' : 'text-red-600'">
            {{ phoneValid ? 'Broj telefona je validan.' : 'Unesite ispravan broj telefona.' }}
          </p>
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Lozinka</label>
          <input v-model="password" type="password" minlength="8" required class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="min 8 karaktera" />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Specijalizacija</label>
          <select v-model="specialization" required class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Izaberite</option>
            <option value="vodoinstalater">Vodoinstalater</option>
            <option value="električar">Električar</option>
            <option value="bravar">Bravar</option>
          </select>
        </div>

        <button type="submit" :disabled="loading || !phoneValid" class="w-full rounded-md bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]">
          {{ loading ? 'Kreiranje naloga...' : 'Registruj se' }}
        </button>
        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
        <p v-if="successMsg" class="text-green-600 text-sm">{{ successMsg }}</p>
      </form>

      <div class="mt-4 text-sm text-center">
        <NuxtLink to="/majstor/login" class="underline">Već imate nalog? Prijavite se</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

definePageMeta({ layout: false })

const router = useRouter()
const authStore = useAuthStore()

const displayName = ref('')
const email = ref('')
const phone = ref('')
const password = ref('')
const specialization = ref('')
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



<template>
  <div class="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-8">
    <div class="w-full max-w-xl bg-white rounded-xl shadow p-6">
      <h1 class="text-2xl font-semibold text-gray-900 text-center">Novi zahtev</h1>
      <p class="text-gray-600 text-center mt-1">Opišite problem i pošaljite zahtev majstorima.</p>

      <form class="mt-6 space-y-5" @submit.prevent="submit">
        <div>
          <label class="block text-sm text-gray-700 mb-1">Vaš e-mail</label>
          <input :value="userEmail" type="email" readonly class="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700" />
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
          <input v-model="location" type="text" class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ulica i broj, grad" />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Kontakt telefon</label>
          <input v-model="contactPhone" type="tel" required class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="06x xxx xxxx" />
          <p class="text-sm mt-1" :class="phoneValid ? 'text-green-700' : 'text-red-600'">
            {{ phoneValid ? 'Broj telefona je validan.' : 'Unesite ispravan broj telefona.' }}
          </p>
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Slika (opciono)</label>
          <input type="file" accept="image/*" @change="onFile" class="w-full text-sm text-gray-600" />
        </div>

        <button type="submit" :disabled="submitting" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg shadow active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed">
          {{ submitting ? 'Slanje...' : '[ Pošalji Zahtev ]' }}
        </button>
        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useJobStore } from '@/stores/job'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

definePageMeta({
  middleware: ['client-auth']
})

const router = useRouter()
const jobStore = useJobStore()
const authStore = useAuthStore()

const problemDescription = ref('')
const location = ref('')
const contactPhone = ref('')
const imageFile = ref<File | null>(null)
const specializationRequired = ref('')

const submitting = ref(false)
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

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  imageFile.value = (input.files && input.files[0]) || null
}

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
    await jobStore.createJob({
      problemDescription: problemDescription.value,
      location: location.value,
      contactPhone: e164Phone.value,
      specializationRequired: specializationRequired.value,
      // image upload is out of scope now; pass null/undefined
      imageUrl: undefined
    })
    router.push('/potvrda')
  } catch (e: any) {
    errorMsg.value = e?.message || 'Greška pri slanju zahteva.'
  } finally {
    submitting.value = false
  }
}
</script>



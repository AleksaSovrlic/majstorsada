<template>
  <main class="mx-auto max-w-md p-6 my-10 bg-white rounded-xl shadow space-y-4">
    <h1 class="text-xl font-bold">Dovršite prijavu</h1>
    <p v-if="auth.role === 'unregistered'">Nalog je prijavljen, ali profil još nije dovršen. Izaberite kako koristite aplikaciju.</p>
    <p v-else>Proveravamo vaš nalog. Ako je veza prekinuta, pokušajte ponovo.</p>
    <p v-if="error" role="alert" class="text-red-700">{{ error }}</p>
    <template v-if="auth.role === 'unregistered'">
      <button :disabled="busy" class="w-full rounded bg-blue-600 p-3 text-white" @click="client">Potreban mi je majstor</button>
      <NuxtLink to="/majstor/register" class="block text-center underline">Registrujem se kao majstor</NuxtLink>
    </template>
    <button v-else :disabled="busy" class="underline" @click="check">Pokušaj ponovo</button>
    <button class="block underline" @click="logout">Odjavi se</button>
  </main>
</template>
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/utils/api'
import { accountRoute } from '@/utils/accountRoute'
const auth = useAuthStore()
const api = useApi()
const error = ref('')
const busy = ref(false)
useSeoMeta({ robots: 'noindex, nofollow' })
async function check() {
  busy.value = true; error.value = ''
  try {
    await auth.ensureAuthReady()
    if (!auth.currentUser) return await navigateTo('/login')
    const role = await auth.resolveUserRole(true)
    if (role !== 'unregistered') await navigateTo(accountRoute(role))
  } catch (e: any) { error.value = e.message || 'Nalog trenutno nije dostupan.' }
  finally { busy.value = false }
}
async function client() {
  busy.value = true; error.value = ''
  try {
    if (!auth.currentUser?.emailVerified) {
      error.value = 'Za klijentski nalog potvrdite e-mail preko linka za prijavu.'
      await auth.signOut(); return await navigateTo('/login')
    }
    await api('completeRegistration', { role: 'client' }); await check()
  } catch (e: any) { error.value = e.message } finally { busy.value = false }
}
async function logout() { await auth.signOut(); await navigateTo('/login') }
onMounted(check)
</script>

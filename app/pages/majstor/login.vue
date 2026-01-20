<template>
  <main class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
    <section
      aria-labelledby="majstor-login-title"
      class="min-h-[100svh] flex items-center justify-center py-10"
    >
      <div class="w-full max-w-md">
        <div class="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 p-6 sm:p-8">
          <div class="text-center">
            <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5m-3 8V7a3 3 0 0 1 6 0v3z"
                />
              </svg>
            </div>

            <h1 id="majstor-login-title" class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
              Prijava za majstore
            </h1>
            <p class="mt-3 text-gray-600 text-sm sm:text-base leading-relaxed">
              Prijavite se da biste videli nove zahteve i upravljali poslovima.
            </p>
          </div>

          <form class="mt-6 space-y-4" @submit.prevent="submit">
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
              <label class="block text-sm font-medium text-gray-700 mb-1">Lozinka</label>
              <input
                v-model="password"
                type="password"
                required
                autocomplete="current-password"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full h-12 sm:h-14 inline-flex items-center justify-center rounded-xl bg-brand-blue text-white font-bold text-base sm:text-lg shadow-lg shadow-blue-500/25 hover:bg-brand-blue-dark active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {{ loading ? 'Prijavljivanje…' : 'Prijavi se' }}
            </button>

            <div v-if="errorMsg" class="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
              {{ errorMsg }}
            </div>
            <div v-if="successMsg" class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-sm">
              {{ successMsg }}
            </div>
          </form>

          <div class="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-sm">
            <NuxtLink
              to="/majstor/register"
              class="inline-flex items-center justify-center font-semibold text-brand-navy hover:text-brand-blue transition-colors"
            >
              Registracija
            </NuxtLink>
            <NuxtLink
              to="/majstor/forgot-password"
              class="inline-flex items-center justify-center font-semibold text-brand-navy hover:text-brand-blue transition-colors"
            >
              Zaboravljena lozinka
            </NuxtLink>
          </div>

          <div class="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
            <svg viewBox="0 0 24 24" class="h-4 w-4 text-brand-blue" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 1a5 5 0 0 0-5 5v4H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5m-3 9V6a3 3 0 0 1 6 0v4z"
              />
            </svg>
            <span>Vaši podaci su bezbedni i nikada nisu javni.</span>
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
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: false })

useSeoMeta({
  title: 'Prijava za majstore — MajstorSada',
  description: 'Prijavite se kao majstor da biste videli zahteve i upravljali poslovima.',
  robots: 'noindex, nofollow'
})

const auth = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

async function submit() {
  errorMsg.value = ''
  loading.value = true
  try {
    await auth.signIn(email.value, password.value)
    successMsg.value = 'Uspešna prijava.'
    router.push('/majstor/dashboard')
  } catch (e: any) {
    errorMsg.value = e?.message || 'Greška pri prijavi.'
  } finally {
    loading.value = false
  }
}
</script>



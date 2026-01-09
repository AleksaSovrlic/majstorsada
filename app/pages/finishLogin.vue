<template>
  <div class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
    <div class="min-h-[calc(100svh-72px)] flex items-center justify-center py-10">
      <div class="w-full max-w-md">
        <div class="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 p-6 sm:p-8">
          <Transition name="finish-swap" mode="out-in">
            <!-- Checking / auto-completing -->
            <div v-if="uiState === 'checking'" key="checking" class="text-center">
              <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 4l-8 5l-8-5V6l8 5l8-5z"
                  />
                </svg>
              </div>
              <h1 class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
                Dovršavamo prijavu
              </h1>
              <p class="mt-3 text-gray-600 text-sm sm:text-base leading-relaxed">
                Samo trenutak - proveravamo link.
              </p>
              <div class="mt-6 flex items-center justify-center">
                <div class="h-6 w-6 rounded-full border-2 border-brand-blue/30 border-t-brand-blue animate-spin" aria-hidden="true" />
              </div>
            </div>

            <!-- Needs email (opened on another device) -->
            <div v-else-if="uiState === 'needsEmail'" key="needsEmail">
              <div class="text-center">
                <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 1a5 5 0 0 0-5 5v4H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5m-3 9V6a3 3 0 0 1 6 0v4z"
                    />
                  </svg>
                </div>
                <h1 class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
                  Potvrdite e-mail
                </h1>
                <p class="mt-3 text-gray-600 text-sm sm:text-base leading-relaxed">
                  Otvorili ste link na drugom uređaju. Iz bezbednosnih razloga unesite e-mail na koji ste primili link.
                </p>
              </div>

              <form class="mt-6 space-y-4" @submit.prevent="completeSignIn">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input
                    ref="emailInput"
                    v-model="email"
                    type="email"
                    required
                    autocomplete="email"
                    inputmode="email"
                    class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue"
                    placeholder="vasa.adresa@primer.com"
                  />
                </div>

                <button
                  type="submit"
                  :disabled="submitting || !normalizedEmail"
                  class="w-full h-12 sm:h-14 inline-flex items-center justify-center rounded-xl bg-brand-blue text-white font-bold text-base sm:text-lg shadow-lg shadow-blue-500/25 hover:bg-brand-blue-dark active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span v-if="submitting">Prijavljivanje…</span>
                  <span v-else>Dovrši prijavu →</span>
                </button>

                <div v-if="errorMsg" class="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
                  {{ errorMsg }}
                </div>

                <NuxtLink :to="loginHref" class="block text-center text-sm font-semibold text-brand-navy hover:text-brand-blue transition-colors">
                  Nazad na prijavu
                </NuxtLink>
              </form>
            </div>

            <!-- Error -->
            <div v-else key="error" class="text-center">
              <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-red-50 flex items-center justify-center ring-1 ring-red-200">
                <svg viewBox="0 0 24 24" class="h-6 w-6 text-red-600" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M11 15h2v2h-2zm0-8h2v6h-2zm1-5C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2"
                  />
                </svg>
              </div>
              <h1 class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
                Nešto nije u redu
              </h1>
              <p class="mt-3 text-gray-600 text-sm sm:text-base leading-relaxed">
                {{ errorMsg || 'Link nije validan ili je istekao. Vratite se na prijavu i zatražite novi link.' }}
              </p>

              <div class="mt-6">
                <NuxtLink
                  :to="loginHref"
                  class="w-full inline-flex items-center justify-center rounded-xl bg-brand-blue text-white font-bold h-12 shadow-lg shadow-blue-500/25 hover:bg-brand-blue-dark active:scale-[0.99] transition-all"
                >
                  Nazad na prijavu →
                </NuxtLink>
              </div>
            </div>
          </Transition>

          <div class="mt-6 pt-4 border-t border-gray-100 flex items-center justify-center gap-2 text-xs text-gray-500">
            <svg viewBox="0 0 24 24" class="h-4 w-4 text-brand-blue" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 1a5 5 0 0 0-5 5v4H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5m-3 9V6a3 3 0 0 1 6 0v4z"
              />
            </svg>
            <span>Vaši podaci su bezbedni i nikada nisu javni.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth'
import { useAuthStore } from '@/stores/auth'
import { ensureClientProfile } from '@/utils/clients'

definePageMeta({ layout: 'public' })

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const emailInput = ref<HTMLInputElement | null>(null)
const submitting = ref(false)
const errorMsg = ref('')

type UiState = 'checking' | 'needsEmail' | 'error'
const uiState = ref<UiState>('checking')

const normalizedEmail = computed(() => email.value.trim())

onMounted(async () => {
  const { $firebaseAuth } = useNuxtApp()
  await authStore.ensureAuthReady()

  // If already logged in, redirect immediately
  if (authStore.currentUser) {
    redirectAfter()
    return
  }

  const href = window.location.href
  if (isSignInWithEmailLink($firebaseAuth, href)) {
    const storedEmail = localStorage.getItem('emailForSignIn') || ''
    if (storedEmail) {
      email.value = storedEmail
      await completeSignIn()
    } else {
      uiState.value = 'needsEmail'
      await nextTick()
      emailInput.value?.focus()
    }
  } else {
    // Not an email link; show error and let user go back to login
    errorMsg.value = 'Link nije validan ili je istekao. Vratite se na prijavu i zatražite novi link.'
    uiState.value = 'error'
  }
})

async function completeSignIn() {
  submitting.value = true
  errorMsg.value = ''
  try {
    const { $firebaseAuth } = useNuxtApp()
    const href = window.location.href
    const emailToUse = normalizedEmail.value
    email.value = emailToUse
    const cred = await signInWithEmailLink($firebaseAuth, emailToUse, href)
    localStorage.removeItem('emailForSignIn')
    await ensureClientProfile(cred.user.uid, cred.user.email || email.value)
    // Ensure auth.currentUser is available before redirect
    await authStore.ensureAuthReady()
    redirectAfter()
  } catch (e: any) {
    if (e?.code === 'auth/invalid-action-code') {
      errorMsg.value = 'Link je istekao ili je već iskorišćen.'
      uiState.value = 'error'
    } else if (e?.code === 'auth/invalid-email') {
      errorMsg.value = 'E-mail adresa nije validna.'
      uiState.value = 'needsEmail'
    } else {
      errorMsg.value = e?.message || 'Neuspešna prijava preko linka.'
      uiState.value = uiState.value === 'needsEmail' ? 'needsEmail' : 'error'
    }
  } finally {
    submitting.value = false
  }
}

function redirectAfter() {
  // Prefer explicit `from` param; fall back to encoded `continueUrl` if Firebase action links land on `/`
  // and finally to sessionStorage/default.
  const safeReplace = (target: string) => {
    // Prevent open redirects; allow only app-internal paths.
    if (target.startsWith('/') && !target.startsWith('//')) {
      return router.replace(target)
    }
    return router.replace('/zahtev')
  }

  const explicitFrom = route.query.from
  if (typeof explicitFrom === 'string' && explicitFrom) {
    return safeReplace(explicitFrom)
  }

  const continueUrl = route.query.continueUrl
  if (typeof continueUrl === 'string' && continueUrl) {
    // `continueUrl` can be encoded (or partially encoded). Try both decoded and raw.
    const candidates = [continueUrl]
    try {
      const decoded = decodeURIComponent(continueUrl)
      if (decoded && decoded !== continueUrl) candidates.unshift(decoded)
    } catch {
      // ignore decode errors
    }
    for (const c of candidates) {
      try {
        const u = new URL(c)
        const f = u.searchParams.get('from')
        if (f) return safeReplace(f)
      } catch {
        // ignore parse errors
      }
    }
  }

  const stored = sessionStorage.getItem('postAuthRedirect')
  return safeReplace(stored || '/zahtev')
}

const loginHref = computed(() => {
  const from = (route.query.from as string) || sessionStorage.getItem('postAuthRedirect') || '/zahtev'
  return `/login?from=${encodeURIComponent(from)}`
})
</script>

<style scoped>
.finish-swap-enter-active,
.finish-swap-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}
.finish-swap-enter-from,
.finish-swap-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .finish-swap-enter-active,
  .finish-swap-leave-active {
    transition: none;
  }
}
</style>



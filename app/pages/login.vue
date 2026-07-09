<template>
  <div class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
    <div class="min-h-[calc(100svh-72px)] flex items-center justify-center py-10">
      <div class="w-full max-w-md">
        <div class="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 p-6 sm:p-8">
          <Transition name="login-swap" mode="out-in">
            <!-- State A -->
            <div v-if="!linkSent" key="input">
              <div class="text-center">
                <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 4l-8 5l-8-5V6l8 5l8-5z"
                    />
                  </svg>
                </div>

                <h1 class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
                  Još samo jedan korak do majstora
                </h1>
                <p class="mt-3 text-gray-600 text-sm sm:text-base leading-relaxed">
                  Da bismo povezali zahtev sa Vama, potvrdite svoj e-mail. Koristimo bezbedan pristup bez lozinki - najbrži način da nađete pomoć.
                </p>
              </div>

              <form class="mt-6 space-y-4" @submit.prevent="sendLink">
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
                  :disabled="sendDisabled"
                  class="w-full h-12 sm:h-14 inline-flex items-center justify-center rounded-xl bg-brand-blue text-white font-bold text-base sm:text-lg shadow-lg shadow-blue-500/25 hover:bg-brand-blue-dark active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span v-if="sending">Šaljemo link…</span>
                  <span v-else>Nastavi ka kreiranju zahteva →</span>
                </button>

                <p v-if="resendCooldown > 0 && isSameAsSentEmail" class="text-xs text-gray-500 text-center">
                  Možete ponovo poslati za {{ resendCooldown }}s
                </p>

                <div v-if="errorMsg" class="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
                  {{ errorMsg }}
                </div>
              </form>
            </div>

            <!-- State B -->
            <div v-else key="success">
              <div class="text-center">
                <div class="mx-auto mb-4 h-14 w-14 rounded-2xl bg-brand-blue/10 flex items-center justify-center ring-1 ring-brand-blue/20">
                  <div class="relative">
                    <svg viewBox="0 0 24 24" class="h-7 w-7 text-brand-blue" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 4l-8 5l-8-5V6l8 5l8-5z"
                      />
                    </svg>
                    <span class="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-brand-blue flex items-center justify-center ring-2 ring-white">
                      <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 text-white" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"
                        />
                      </svg>
                    </span>
                  </div>
                </div>

                <h1 class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
                  Proverite inboks
                </h1>
                <p class="mt-3 text-gray-600 text-sm sm:text-base leading-relaxed">
                  Poslali smo link na adresu:
                </p>
                <p class="mt-1 text-gray-900 font-semibold">
                  {{ sentEmail }}
                </p>
                <div
                  v-if="infoMsg"
                  class="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-sm flex items-start justify-center gap-2"
                >
                  <svg viewBox="0 0 24 24" class="h-5 w-5 text-emerald-600 mt-[1px]" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"
                    />
                  </svg>
                  <p class="leading-relaxed">
                    {{ infoMsg }}
                  </p>
                </div>
              </div>

              <div class="mt-6 space-y-4">
                <button
                  type="button"
                  :disabled="sending || resendCooldown > 0"
                  class="w-full h-12 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-brand-navy font-semibold hover:bg-gray-100 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  @click="sendLink"
                >
                  <span v-if="sending">Ponovno slanje…</span>
                  <span v-else-if="resendCooldown > 0">Nije stiglo? Pošalji ponovo ({{ resendCooldown }}s)</span>
                  <span v-else>Nije stiglo? Pošalji ponovo</span>
                </button>

                <button
                  type="button"
                  class="w-full inline-flex items-center justify-center text-sm font-semibold text-brand-navy hover:text-brand-blue transition-colors"
                  @click="changeEmail"
                >
                  Pogrešna adresa? Promeni
                </button>

                <div v-if="errorMsg" class="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
                  {{ errorMsg }}
                </div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sendSignInLinkToEmail } from 'firebase/auth'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: 'public' })

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const emailInput = ref<HTMLInputElement | null>(null)
const sending = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const resendCooldown = ref(0)
const linkSent = ref(false)
const sentEmail = ref('')
let cooldownTimer: number | null = null

const normalizedEmail = computed(() => email.value.trim())
const isSameAsSentEmail = computed(() => {
  if (!sentEmail.value) return false
  return normalizedEmail.value.toLowerCase() === sentEmail.value.trim().toLowerCase()
})

const sendDisabled = computed(() => {
  // Prevent immediate spam to the same address while cooldown is active,
  // but still allow correcting an email and sending again right away.
  return sending.value || (resendCooldown.value > 0 && isSameAsSentEmail.value)
})

function startCooldown(seconds: number) {
  resendCooldown.value = seconds
  if (cooldownTimer) {
    window.clearInterval(cooldownTimer)
  }
  cooldownTimer = window.setInterval(() => {
    if (resendCooldown.value <= 1) {
      window.clearInterval(cooldownTimer as number)
      cooldownTimer = null
      resendCooldown.value = 0
    } else {
      resendCooldown.value -= 1
    }
  }, 1000)
}

onMounted(async () => {
  await authStore.ensureAuthReady()
  if (authStore.currentUser) {
    const from = (route.query.from as string) || sessionStorage.getItem('postAuthRedirect') || '/zahtev'
    router.replace(from)
  }
})

onBeforeUnmount(() => {
  if (cooldownTimer) {
    window.clearInterval(cooldownTimer)
    cooldownTimer = null
  }
})

async function sendLink() {
  errorMsg.value = ''
  // Keep the last success hint visible in "waiting" state until we successfully resend.
  sending.value = true
  try {
    const { $firebaseAuth } = useNuxtApp()
    const from = (route.query.from as string) || '/zahtev'
    sessionStorage.setItem('postAuthRedirect', from)

    // Canonical continueUrl:
    // - dev: current origin (localhost)
    // - prod: always branded domain (prevents *.web.app links that won't match the installed PWA origin)
    const runtime = useRuntimeConfig()
    const brandedOriginRaw = ((runtime.public as any).siteUrl as string) || 'https://majstorsada.rs'
    const brandedOrigin = brandedOriginRaw.replace(/\/+$/, '')
    const origin = import.meta.dev ? window.location.origin : brandedOrigin

    const actionCodeSettings = {
      url: `${origin}/finishLogin?from=${encodeURIComponent(from)}`,
      handleCodeInApp: true
    }

    const emailToSend = normalizedEmail.value
    email.value = emailToSend
    await sendSignInLinkToEmail($firebaseAuth, emailToSend, actionCodeSettings)
    localStorage.setItem('emailForSignIn', emailToSend)
    sentEmail.value = emailToSend
    linkSent.value = true
    infoMsg.value = 'Link Vas čeka. Kliknite da odmah aktivirate potragu za majstorom.'
    startCooldown(10)
  } catch (e: any) {
    if (e?.code === 'auth/invalid-email') {
      errorMsg.value = 'Neispravan e-mail.'
    } else if (e?.code === 'auth/too-many-requests') {
      errorMsg.value = 'Previše pokušaja. Pokušajte kasnije.'
    } else {
      errorMsg.value = e?.message || 'Greška pri slanju e-mail linka za prijavu.'
    }
  } finally {
    sending.value = false
  }
}

async function changeEmail() {
  linkSent.value = false
  errorMsg.value = ''
  infoMsg.value = ''
  await nextTick()
  emailInput.value?.focus()
}
</script>

<style scoped>
.login-swap-enter-active,
.login-swap-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}
.login-swap-enter-from,
.login-swap-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .login-swap-enter-active,
  .login-swap-leave-active {
    transition: none;
  }
}
</style>


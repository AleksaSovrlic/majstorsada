<template>
  <div class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
    <div class="min-h-[calc(100svh-72px)] flex items-center justify-center py-10">
      <div class="w-full max-w-md">
        <div class="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 p-6 sm:p-8" :aria-busy="busy || finishing">
          <div class="text-center">
            <div class="mx-auto mb-4 h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" class="h-6 w-6 text-brand-blue" aria-hidden="true">
                <path fill="currentColor" d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 4l-8 5l-8-5V6l8 5l8-5z" />
              </svg>
            </div>
            <h1 class="text-2xl sm:text-3xl font-bold text-brand-navy tracking-tight">
              {{ completionPending ? 'Dovršite prijavu' : waiting ? 'Unesite kod iz mejla' : 'Još samo jedan korak do majstora' }}
            </h1>
            <p class="mt-3 text-gray-600 text-sm sm:text-base leading-relaxed">
              {{ completionPending ? 'Vaš kod je potvrđen. Nastavite ka svom zahtevu.' : waiting ? 'Potvrdite e-mail i nastavite ka svom zahtevu.' : 'Potvrdite svoj e-mail šestocifrenim kodom. Prijava je bez lozinke.' }}
            </p>
            <p v-if="waiting" class="mt-2 text-gray-900 font-semibold break-all">{{ pending?.email || active?.email }}</p>
          </div>

          <form v-if="!waiting" class="mt-6 space-y-4" @submit.prevent="sendCode(false)">
            <div>
              <label for="client-otp-email" class="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input id="client-otp-email" ref="emailInput" v-model="email" type="email" required maxlength="254" autocomplete="email" inputmode="email"
                :disabled="busy || finishing" placeholder="vasa.adresa@primer.com"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue disabled:opacity-60" />
            </div>
            <button type="submit" :disabled="busy || finishing || cooldown > 0"
              class="w-full h-12 sm:h-14 inline-flex items-center justify-center rounded-xl bg-brand-blue text-white font-bold text-base sm:text-lg shadow-lg shadow-blue-500/25 hover:bg-brand-blue-dark active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {{ busy ? 'Pripremamo kod…' : 'Pošalji kod za prijavu →' }}
            </button>
            <p v-if="cooldown > 0" class="text-xs text-gray-500 text-center">Možete ponovo poslati za {{ cooldown }}s.</p>
          </form>

          <div v-else class="mt-6 space-y-4">
            <form v-if="!pending" class="space-y-4" @submit.prevent="verifyCode">
              <div v-if="!completionPending">
                <label for="client-otp-code" class="block text-sm font-medium text-gray-700 mb-1">Šestocifreni kod</label>
                <input id="client-otp-code" ref="codeInput" :value="code" @input="updateCode" @paste="pasteCode" type="text" inputmode="numeric" autocomplete="one-time-code"
                  pattern="[0-9]{6}" maxlength="6" required :disabled="busy || finishing" placeholder="000000" aria-describedby="client-otp-expiry"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-2xl font-semibold tracking-[0.25em] tabular-nums placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/15 focus:border-brand-blue disabled:opacity-60" />
                <p id="client-otp-expiry" class="mt-2 text-xs text-gray-500 text-center">
                  {{ expiresIn > 0 ? `Kod važi još ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, '0')}.` : canResumeAfterExpiry ? 'Ishod prethodne provere nije poznat. Ponovite isti kod da dovršite prijavu.' : 'Kod je istekao. Zatražite novi kod.' }}
                </p>
              </div>
              <button type="submit" :disabled="busy || finishing || (!completionPending && (code.length !== 6 || (expiresIn === 0 && !canResumeAfterExpiry)))"
                class="w-full h-12 sm:h-14 inline-flex items-center justify-center rounded-xl bg-brand-blue text-white font-bold text-base sm:text-lg shadow-lg shadow-blue-500/25 hover:bg-brand-blue-dark active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                {{ finishing ? 'Prijavljivanje…' : completionPending ? 'Dovrši prijavu →' : 'Potvrdi kod i nastavi →' }}
              </button>
            </form>
            <button v-if="pending" type="button" :disabled="busy || finishing" @click="sendCode(false)"
              class="w-full h-12 inline-flex items-center justify-center rounded-xl bg-brand-blue text-white font-bold shadow-lg shadow-blue-500/25 hover:bg-brand-blue-dark transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {{ busy ? 'Proveravamo slanje…' : 'Proveri isti zahtev' }}
            </button>
            <button v-else-if="!completionPending" type="button" :disabled="busy || finishing || cooldown > 0" @click="sendCode(true)"
              class="w-full h-12 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-brand-navy font-semibold hover:bg-gray-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {{ busy ? 'Ponovno slanje…' : cooldown > 0 ? `Nije stiglo? Pošalji ponovo (${cooldown}s)` : 'Nije stiglo? Pošalji ponovo' }}
            </button>
            <button v-if="!completionPending" type="button" :disabled="busy || finishing" @click="editEmail"
              class="w-full text-sm font-semibold text-brand-navy hover:text-brand-blue transition-colors disabled:opacity-60">
              Pogrešna adresa? Promeni
            </button>
          </div>

          <div ref="botContainer" class="mt-3 w-full flex justify-center" />
          <div v-if="error" role="alert" class="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{{ error }}</div>
          <p v-if="info" role="status" aria-live="polite" class="mt-4 rounded-xl bg-brand-blue/5 px-4 py-3 text-brand-navy text-sm leading-relaxed">{{ info }}</p>
          <div class="mt-6 pt-4 border-t border-gray-100 text-center text-xs text-gray-500">Kod ne delite sa drugima. Vaši podaci nisu javni.</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useClientOtp } from '@/composables/useClientOtp'
import { loadClientOtpTurnstile, type ClientOtpTurnstile } from '@/utils/clientOtpTurnstile'

const props = defineProps<{ from?: unknown }>()
const runtime = useRuntimeConfig()
const { email, code, error, info, busy, finishing, active, pending, now, cooldown, expiresIn, waiting, completionPending, canResumeAfterExpiry, restore, send, verify, changeEmail, continueExistingSession, dispose } = useClientOtp(props.from)
const emailInput = ref<HTMLInputElement | null>(null), codeInput = ref<HTMLInputElement | null>(null)
const botContainer = ref<HTMLElement | null>(null)
let ticker: ReturnType<typeof setInterval> | null = null
let widget: string | null = null
let rejectBot: (() => void) | null = null
let cancelled = false
const loaderAbort = new AbortController()
function api(): ClientOtpTurnstile | undefined { return (window as any).turnstile }
async function botToken(requestId: string): Promise<string> {
  // Both build mode and a reserved demo project are required; the server separately
  // requires its emulator-only mode. No production anti-bot bypass is available.
  if (import.meta.dev && runtime.public.firebase.projectId.startsWith('demo-')) return 'demo-turnstile-token'
  if (!runtime.public.turnstileSiteKey) throw new Error('Prijava kodom još nije dostupna. Pokušajte kasnije.')
  await loadClientOtpTurnstile(loaderAbort.signal)
  if (cancelled || !botContainer.value || !api()) throw new Error('Prijava je prekinuta. Pokušajte ponovo.')
  if (widget !== null) { api()!.remove(widget); widget = null }
  return new Promise<string>((resolve, reject) => {
    let settled = false
    const settle = (token?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer); rejectBot = null
      if (token) resolve(token)
      else reject(new Error('Bezbednosna provera nije završena. Pokušajte ponovo.'))
    }
    const timer = setTimeout(() => settle(), 120_000)
    rejectBot = () => settle()
    try {
      widget = api()!.render(botContainer.value!, {
        sitekey: runtime.public.turnstileSiteKey, action: 'client_otp', cData: requestId,
        execution: 'execute', appearance: 'interaction-only', size: 'compact',
        callback: (token: string) => settle(token), 'error-callback': () => settle(),
        'expired-callback': () => settle(), 'timeout-callback': () => settle()
      })
      api()!.execute(widget)
    } catch { settle() }
  })
}
async function sendCode(fresh: boolean) {
  await send(botToken, fresh)
  await nextTick()
  if (!pending.value && waiting.value) codeInput.value?.focus()
}
async function verifyCode() {
  await verify()
  await nextTick()
  if (error.value && !completionPending.value) { codeInput.value?.focus(); codeInput.value?.select() }
}
function updateCode(event: Event) {
  const input = event.target as HTMLInputElement
  code.value = input.value.replace(/[^0-9]/g, '').slice(0, 6)
  input.value = code.value
}
function pasteCode(event: ClipboardEvent) {
  event.preventDefault()
  code.value = (event.clipboardData?.getData('text') || '').replace(/[^0-9]/g, '').slice(0, 6)
}
async function editEmail() { changeEmail(); await nextTick(); emailInput.value?.focus() }
onMounted(() => {
  // Retire only the obsolete link hints; keep Auth sessions and OTP recovery.
  try { localStorage.removeItem('emailForSignIn') } catch {}
  try { sessionStorage.removeItem('postAuthRedirect') } catch {}
  restore()
  if (runtime.public.turnstileSiteKey && !(import.meta.dev && runtime.public.firebase.projectId.startsWith('demo-'))) {
    // Load only on the login page; execution still waits for a deliberate send
    // with its own request ID. A preload failure stays quiet until that send.
    void loadClientOtpTurnstile(loaderAbort.signal).catch(() => {})
  }
  ticker = setInterval(() => { now.value = Date.now() }, 1000)
  // Firebase can still be restoring a persisted session when this page mounts.
  void continueExistingSession()
})
onBeforeUnmount(() => {
  cancelled = true; loaderAbort.abort(); dispose(); rejectBot?.()
  if (ticker) clearInterval(ticker)
  if (widget !== null) api()?.remove(widget)
})
</script>

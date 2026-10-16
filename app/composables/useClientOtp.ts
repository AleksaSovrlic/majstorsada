import { computed, ref } from 'vue'
import { onAuthStateChanged, signInWithCustomToken, type User, type UserCredential } from 'firebase/auth'
import { useAuthStore } from '@/stores/auth'
import { accountRoute } from '@/utils/accountRoute'
import { extractOtpTokenUid, isAuthStorageError, AUTH_STORAGE_MESSAGE } from '@/utils/clientOtpAuthRecovery'

type Delivery = 'accepted' | 'unknown' | 'failed' | 'pending'
type Flow = {
  requestId: string; sessionSecret: string; email: string; from: string
  createdAt: number; expiresAt: number; resendAt: number; delivery: Delivery
}
type SendResult = { requestId: string; expiresAt: number; resendAt: number; delivery: Delivery }
const STORAGE_KEY = 'majstorsada.clientOtp.v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SECRET = /^[A-Za-z0-9_-]{43}$/
const MAX_FLOW_AGE = 20 * 60_000

export function useClientOtp(requestedFrom: unknown) {
  const runtime = useRuntimeConfig()
  const { $firebaseAuth } = useNuxtApp()
  const auth = useAuthStore()
  const router = useRouter()
  const email = ref(''), code = ref(''), error = ref(''), info = ref('')
  const busy = ref(false), finishing = ref(false), now = ref(Date.now())
  const active = ref<Flow | null>(null), pending = ref<Flow | null>(null)
  const from = accountRoute('client', requestedFrom)
  let customToken: string | null = null
  let signedInUid: string | null = null
  let signedInUser: User | null = null
  let partialSignIn: { user: User; epoch: number } | null = null
  const retryDeadline = ref(0)
  let disposed = false
  let authEpoch = 0, signedInEpoch = -1
  let observedUid = import.meta.client ? $firebaseAuth.currentUser?.uid || null : null
  const stopObserving = import.meta.client ? onAuthStateChanged($firebaseAuth, user => {
    const uid = user?.uid || null
    if (uid !== observedUid) { authEpoch++; observedUid = uid }
  }) : () => {}
  const cooldown = computed(() => Math.max(0, Math.ceil((Math.max(active.value?.resendAt || 0, retryDeadline.value) - now.value) / 1000)))
  const expiresIn = computed(() => Math.max(0, Math.ceil(((active.value?.expiresAt || 0) - now.value) / 1000)))
  const waiting = computed(() => !!pending.value || (!!active.value && active.value.delivery !== 'failed'))
  const completionPending = ref(false)
  // An unknown verify response may hide a server-side success. Keep only a
  // short, memory-only retry receipt; the code itself stays out of storage.
  const uncertainVerify = ref<{ requestId: string; code: string; validUntil: number } | null>(null)
  const canResumeAfterExpiry = computed(() => {
    const receipt = uncertainVerify.value, flow = active.value
    return !!receipt && !!flow && receipt.requestId === flow.requestId
      && receipt.code === code.value && now.value < receipt.validUntil
  })

  function persist() {
    try {
      if (!active.value && !pending.value) sessionStorage.removeItem(STORAGE_KEY)
      else sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ active: active.value, pending: pending.value }))
    } catch { /* A private browser can reject storage; the in-memory flow still works. */ }
  }
  function validFlow(value: any): value is Flow {
    const age = Date.now() - value?.createdAt
    return !!value && UUID.test(value.requestId) && SECRET.test(value.sessionSecret)
      && typeof value.email === 'string' && value.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
      && age >= -60_000 && age <= MAX_FLOW_AGE
      && Number.isFinite(value.expiresAt) && value.expiresAt <= value.createdAt + MAX_FLOW_AGE
      && Number.isFinite(value.resendAt) && value.resendAt <= value.createdAt + MAX_FLOW_AGE
      && ['accepted', 'unknown', 'failed', 'pending'].includes(value.delivery)
      && accountRoute('client', value.from) === value.from
  }
  function restore() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
      active.value = validFlow(stored?.active) ? stored.active : null
      pending.value = validFlow(stored?.pending) ? stored.pending : null
      email.value = pending.value?.email || active.value?.email || ''
      if (pending.value) info.value = 'Slanje nije potvrđeno. Proverite isti zahtev pre nastavka.'
      persist()
    } catch { active.value = null; pending.value = null; persist() }
  }
  function newFlow(): Flow {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const sessionSecret = active.value?.sessionSecret || pending.value?.sessionSecret
      || btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const createdAt = Date.now()
    return {
      requestId: crypto.randomUUID(), sessionSecret, email: email.value.trim().toLowerCase(), from,
      createdAt, expiresAt: createdAt + 600_000, resendAt: createdAt, delivery: 'pending'
    }
  }
  async function call<T>(name: 'requestClientOtp' | 'verifyClientOtp', data: object): Promise<T> {
    const { projectId, functionsRegion } = runtime.public.firebase
    const base = import.meta.dev ? `http://localhost:5501/${projectId}/${functionsRegion}` : `https://${functionsRegion}-${projectId}.cloudfunctions.net`
    const response = await fetch(`${base}/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(65_000), cache: 'no-store', credentials: 'omit'
    })
    const result = await response.json()
    if (!response.ok || result.ok !== true) throw Object.assign(new Error(result.error || 'Radnja nije završena. Pokušajte ponovo.'), { code: result.code, retryAfter: result.retryAfter, definitive: response.status >= 400 && response.status < 500 })
    return result
  }
  function displayError(cause: any, fallback: string) {
    error.value = isAuthStorageError(cause) ? AUTH_STORAGE_MESSAGE : cause?.message || fallback
    if (Number.isFinite(cause?.retryAfter) && cause.retryAfter > 0) retryDeadline.value = Date.now() + Math.min(cause.retryAfter, 86_400) * 1000
    now.value = Date.now()
  }
  async function send(getBotToken: (requestId: string) => Promise<string>, fresh = false) {
    if (busy.value || finishing.value || disposed) return
    if ($firebaseAuth.currentUser) { error.value = 'Nalog je već prijavljen. Osvežite stranicu.'; return }
    error.value = ''; info.value = ''; now.value = Date.now()
    const normalized = email.value.trim().toLowerCase()
    if (!pending.value && cooldown.value > 0 && active.value?.email === normalized) return
    busy.value = true
    const replaying = !fresh && pending.value?.email === normalized
    const candidate = replaying ? pending.value! : newFlow()
    pending.value = candidate; persist()
    let dispatched = false
    try {
      const turnstileToken = await getBotToken(candidate.requestId)
      if (disposed) return
      dispatched = true
      const result = await call<SendResult>('requestClientOtp', {
        requestId: candidate.requestId, sessionSecret: candidate.sessionSecret, email: candidate.email, turnstileToken
      })
      if (disposed || pending.value?.requestId !== candidate.requestId) return
      if (result.requestId !== candidate.requestId || !Number.isFinite(result.expiresAt) || !Number.isFinite(result.resendAt)
        || !['accepted', 'unknown', 'failed', 'pending'].includes(result.delivery)) throw new Error('Odgovor slanja nije potvrđen. Proverite isti zahtev.')
      const confirmed = { ...candidate, expiresAt: result.expiresAt, resendAt: result.resendAt, delivery: result.delivery }
      if (result.delivery === 'failed') {
        if (!active.value) active.value = confirmed
        else active.value = { ...active.value, resendAt: Math.max(active.value.resendAt, result.resendAt) }
        pending.value = null
        error.value = 'Mejl nije poslat. Pokušajte ponovo nakon kratke pauze.'
      } else {
        active.value = confirmed
        pending.value = result.delivery === 'pending' ? confirmed : null
        code.value = ''
        uncertainVerify.value = null
        info.value = result.delivery === 'accepted' ? 'Unesite kod iz mejla. Proverite i spam folder.'
          : result.delivery === 'pending' ? 'Slanje još traje. Proverite isti zahtev pre nastavka.'
          : 'Dostava nije potvrđena. Ako je mejl stigao, unesite njegov kod.'
      }
      persist()
    } catch (cause: any) {
      if (disposed) return
      // A replay rejection describes this attempt only. It cannot disprove an
      // earlier send whose response was lost; retain that request for recovery.
      if ((!dispatched || cause?.definitive) && !replaying) { pending.value = null; persist() }
      else info.value = 'Ishod slanja nije poznat. Provera istog zahteva neće poslati drugi mejl.'
      displayError(cause, 'Veza je prekinuta. Proverite isti zahtev.')
    } finally { busy.value = false }
  }
  async function continueExistingSession(uid?: string) {
    if (disposed) return
    await auth.ensureAuthReady()
    if (disposed || finishing.value || completionPending.value) return
    uid ||= $firebaseAuth.currentUser?.uid
    if (!uid) return
    if ($firebaseAuth.currentUser?.uid !== uid || disposed) return
    try {
      const role = await auth.resolveUserRole()
      if ($firebaseAuth.currentUser?.uid !== uid || disposed) return
      const target = active.value?.from || from
      active.value = null; pending.value = null; uncertainVerify.value = null; persist()
      await router.replace(accountRoute(role, target))
    } catch { if (!disposed && $firebaseAuth.currentUser?.uid === uid) await router.replace('/account') }
  }
  function sessionStayedWithAttempt(epoch: number, previousObservedUid: string | null, uid: string) {
    // Only the attempt's own initial null -> UID notification is permitted.
    // Foreign transitions and logout/re-login cannot be forgiven on success.
    return authEpoch === epoch || (previousObservedUid === null && observedUid === uid && authEpoch === epoch + 1)
  }
  async function finish() {
    if (signedInUid) {
      if ($firebaseAuth.currentUser !== signedInUser || $firebaseAuth.currentUser?.uid !== signedInUid || authEpoch !== signedInEpoch) throw new Error('Nalog je promenjen. Osvežite stranicu.')
    } else {
      if (!customToken) throw new Error('Kod nije potvrđen. Pokušajte ponovo.')
      const expectedUid = extractOtpTokenUid(customToken)
      if (partialSignIn) {
        if ($firebaseAuth.currentUser !== partialSignIn.user || partialSignIn.user.uid !== expectedUid || authEpoch !== partialSignIn.epoch) throw new Error('Nalog je promenjen. Osvežite stranicu.')
      } else if ($firebaseAuth.currentUser) throw new Error('Nalog je promenjen. Osvežite stranicu.')
      const attemptEpoch = authEpoch, previousObservedUid = observedUid
      let credential: UserCredential
      try { credential = await signInWithCustomToken($firebaseAuth, customToken) }
      catch (cause) {
        if (disposed) return
        const user = $firebaseAuth.currentUser
        if (user && expectedUid && user.uid === expectedUid && isAuthStorageError(cause)
          && sessionStayedWithAttempt(attemptEpoch, previousObservedUid, expectedUid)) {
          // The SDK can assign currentUser before its persistence write fails.
          // Keep only this exact, token-bound User for a deliberate SDK retry.
          partialSignIn = { user, epoch: authEpoch }
          observedUid = expectedUid
        }
        throw cause
      }
      if (disposed) return
      if ($firebaseAuth.currentUser !== credential.user || (expectedUid && credential.user.uid !== expectedUid)
        || !sessionStayedWithAttempt(attemptEpoch, previousObservedUid, credential.user.uid)) throw new Error('Nalog je promenjen. Osvežite stranicu.')
      observedUid = credential.user.uid
      signedInUid = credential.user.uid
      signedInUser = credential.user
      signedInEpoch = authEpoch
      partialSignIn = null
      customToken = null
    }
    if (disposed) return
    // Join the fresh-UID lookup already started by the Auth watcher. A failed
    // lookup clears its cache, so a deliberate completion retry still rechecks.
    const role = await auth.resolveUserRole()
    if (disposed) return
    if ($firebaseAuth.currentUser !== signedInUser || $firebaseAuth.currentUser?.uid !== signedInUid || authEpoch !== signedInEpoch) throw new Error('Nalog je promenjen. Osvežite stranicu.')
    if (role !== 'client') throw new Error('Prijava klijenta nije potvrđena. Osvežite stranicu.')
    const target = active.value?.from || from
    active.value = null; pending.value = null; uncertainVerify.value = null; persist()
    await router.replace(accountRoute(role, target))
  }
  async function verify() {
    if (busy.value || finishing.value || disposed || pending.value) return
    error.value = ''; finishing.value = true
    let attempted: { requestId: string; code: string; expiresAt: number; authEpoch: number } | null = null
    let verifyReturned = false
    try {
      if (!customToken && !signedInUid) {
        const flow = active.value
        if (!flow || !/^\d{6}$/.test(code.value)) throw new Error('Unesite svih šest cifara koda.')
        if (flow.expiresAt <= Date.now() && !(canResumeAfterExpiry.value && Date.now() < uncertainVerify.value!.validUntil)) throw new Error('Kod je istekao. Zatražite novi kod.')
        if ($firebaseAuth.currentUser) throw new Error('Nalog je promenjen. Osvežite stranicu.')
        const requestEpoch = authEpoch
        attempted = { requestId: flow.requestId, code: code.value, expiresAt: flow.expiresAt, authEpoch: requestEpoch }
        const result = await call<{ customToken: string }>('verifyClientOtp', { requestId: flow.requestId, sessionSecret: flow.sessionSecret, code: code.value })
        if (disposed) return
        if (authEpoch !== requestEpoch) throw new Error('Nalog je promenjen. Osvežite stranicu.')
        if (typeof result.customToken !== 'string' || !result.customToken) throw new Error('Prijava nije potvrđena. Pokušajte ponovo.')
        verifyReturned = true
        uncertainVerify.value = null
        customToken = result.customToken
        completionPending.value = true
        info.value = 'Kod je potvrđen. Za ponovni klik „Dovrši prijavu“ nije potreban novi kod.'
        code.value = ''
      }
      await finish()
    } catch (cause: any) {
      if (!disposed) {
        if (attempted && !verifyReturned && cause?.definitive !== true && authEpoch === attempted.authEpoch && Date.now() < attempted.expiresAt + 120_000) {
          uncertainVerify.value = { requestId: attempted.requestId, code: attempted.code, validUntil: attempted.expiresAt + 120_000 }
        } else if (attempted) uncertainVerify.value = null
        displayError(cause, 'Prijava nije završena. Pokušajte ponovo.')
      }
    }
    finally { finishing.value = false }
  }
  function changeEmail() {
    if (busy.value || finishing.value || completionPending.value) return
    active.value = null; pending.value = null; uncertainVerify.value = null; code.value = ''; error.value = ''; info.value = ''; persist()
  }
  function dispose() { disposed = true; stopObserving(); uncertainVerify.value = null; customToken = null; signedInUid = null; signedInUser = null; partialSignIn = null; completionPending.value = false; code.value = '' }
  return { email, code, error, info, busy, finishing, active, pending, now, cooldown, expiresIn, waiting, completionPending, canResumeAfterExpiry, restore, send, verify, changeEmail, continueExistingSession, dispose }
}

export type ClientOtpTurnstile = {
  render: (element: HTMLElement, options: Record<string, any>) => string
  execute: (widget: string) => void
  remove: (widget: string) => void
}

let pendingLoad: Promise<ClientOtpTurnstile> | null = null

function api(): ClientOtpTurnstile | undefined {
  return (window as any).turnstile
}

function sharedLoad(): Promise<ClientOtpTurnstile> {
  const ready = api()
  if (ready) return Promise.resolve(ready)
  if (pendingLoad) return pendingLoad

  const existing = document.querySelector<HTMLScriptElement>('script[data-client-otp-turnstile]')
  const script = existing || document.createElement('script')
  const attempt = new Promise<ClientOtpTurnstile>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer)
      script.removeEventListener('load', loaded)
      script.removeEventListener('error', failed)
    }
    const fail = (message: string) => {
      if (settled) return
      settled = true; cleanup(); script.remove()
      reject(new Error(message))
    }
    const loaded = () => {
      if (settled) return
      const ready = api()
      if (!ready) { fail('Bezbednosna provera nije spremna. Pokušajte ponovo.'); return }
      settled = true; cleanup(); resolve(ready)
    }
    const failed = () => fail('Bezbednosna provera nije dostupna. Proverite vezu i pokušajte ponovo.')
    timer = setTimeout(failed, 12_000)
    script.addEventListener('load', loaded, { once: true })
    script.addEventListener('error', failed, { once: true })
    if (!existing) {
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true; script.defer = true; script.dataset.clientOtpTurnstile = 'true'
      try { document.head.appendChild(script) } catch { failed() }
    }
  })
  pendingLoad = attempt
  // A failed preload must not poison a later deliberate send or leave an orphan
  // script behind. Recovery makes one new bounded attempt per explicit call.
  const clearAttempt = () => { if (pendingLoad === attempt) pendingLoad = null }
  void attempt.then(clearAttempt, clearAttempt)
  return attempt
}

export function loadClientOtpTurnstile(signal: AbortSignal): Promise<ClientOtpTurnstile> {
  const cancelled = () => new Error('Prijava je prekinuta. Pokušajte ponovo.')
  if (signal.aborted) return Promise.reject(cancelled())
  const shared = sharedLoad()
  return new Promise((resolve, reject) => {
    // Each login owns its waiter, while the script can finish for a remounted
    // login. Cancelling one component must not cancel another component's load.
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(cancelled()) }
    signal.addEventListener('abort', aborted, { once: true })
    void shared.then(ready => {
      signal.removeEventListener('abort', aborted)
      if (signal.aborted) reject(cancelled())
      else resolve(ready)
    }, cause => { signal.removeEventListener('abort', aborted); reject(cause) })
  })
}

export default defineNuxtPlugin(() => {
  let deferredPrompt: any = null
  let listeners: Array<(ready: boolean) => void> = []

  const setReady = (ready: boolean) => {
    listeners.forEach((fn) => {
      try { fn(ready) } catch {}
    })
  }

  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault()
    deferredPrompt = e
    setReady(true)
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    setReady(false)
  })

  return {
    provide: {
      pwaInstall: {
        onReady(cb: (ready: boolean) => void) { listeners.push(cb) },
        isReady() { return !!deferredPrompt },
        async prompt() {
          if (!deferredPrompt) return false
          deferredPrompt.prompt()
          const { outcome } = await deferredPrompt.userChoice
          deferredPrompt = null
          setReady(false)
          return outcome === 'accepted'
        }
      }
    }
  }
})



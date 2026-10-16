// This UID only binds a recovery attempt to the server's custom token. Firebase
// still authenticates the token; decoded JWT data never grants a session/role.
export function extractOtpTokenUid(token: string): string | null {
  try {
    const parts = token.split('.')
    // The Auth emulator produces an empty signature; this reader never verifies one.
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])
      || !/^[A-Za-z0-9_-]*$/.test(parts[2]) || parts[1].length > 16_384) return null
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return typeof payload?.uid === 'string' && payload.uid.length > 0 && payload.uid.length <= 128 ? payload.uid : null
  } catch { return null }
}

export function isAuthStorageError(error: any): boolean {
  if (error?.code !== 'auth/internal-error') return false
  // Firebase's persistence wrapper retains the original DOMException here.
  // A generic internal/network error must not open the partial-session path.
  const original = error.customData?.originalError
  if (!original || typeof original.message !== 'string') return false
  if (original.name === 'QuotaExceededError') return true
  if (!['InvalidStateError', 'AbortError', 'UnknownError'].includes(original.name)) return false
  return /indexeddb|idbdatabase|idbtransaction|database connection|backing store/i.test(original.message)
}

export const AUTH_STORAGE_MESSAGE = 'Pregledač nije uspeo da sačuva prijavu. Pokušajte ponovo preko „Dovrši prijavu“. Ako se greška ponavlja, proverite slobodan prostor i ponovo pokrenite pregledač.'

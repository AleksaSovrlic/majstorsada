import { HttpsError } from 'firebase-functions/v2/https'

// Local burst brake only. Durable business quotas live in Firestore transactions.
// Bounded memory and no additional Firestore reads/writes per HTTP request.
const windows = new Map<string, { start: number; count: number }>()
export function consumeBurst(key: string, maximum = 120, now = Date.now()) {
  let state = windows.get(key)
  if (!state || now - state.start >= 60_000) {
    if (windows.size >= 5000) {
      for (const [id, window] of windows) if (now - window.start >= 60_000) windows.delete(id)
      if (windows.size >= 5000) throw new HttpsError('resource-exhausted', 'Previše zahteva. Pokušajte ponovo za minut.')
    }
    state = { start: now, count: 0 }; windows.set(key, state)
  }
  if (++state.count > maximum) throw new HttpsError('resource-exhausted', 'Previše zahteva. Pokušajte ponovo za minut.')
}

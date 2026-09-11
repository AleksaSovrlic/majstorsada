export function useApi() {
  const { $firebaseAuth } = useNuxtApp()
  const config = useRuntimeConfig()
  const { projectId, functionsRegion } = config.public.firebase
  const base = import.meta.dev ? 'http://localhost:5501/' + projectId + '/' + functionsRegion : 'https://' + functionsRegion + '-' + projectId + '.cloudfunctions.net'
  return async function call<T = any>(name: string, data: object = {}, responseType: 'json' | 'blob' = 'json'): Promise<T> {
    const user = $firebaseAuth.currentUser
    if (!user) throw new Error('Morate biti prijavljeni.')
    const token = await user.getIdToken()
    const endpoint = name === 'readJobImage' ? (import.meta.dev ? 'http://localhost:5501/' + projectId + '/us-central1' : 'https://us-central1-' + projectId + '.cloudfunctions.net') : base
    const response = await fetch(endpoint + '/' + name, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ data }), signal: AbortSignal.timeout(70000)
    })
    if (response.ok && responseType === 'blob') {
      const blob = await response.blob()
      if ($firebaseAuth.currentUser?.uid !== user.uid) throw new Error('Nalog je promenjen.')
      return blob as T
    }
    const result = await response.json()
    if ($firebaseAuth.currentUser?.uid !== user.uid) throw new Error('Nalog je promenjen. Pokušajte ponovo.')
    if (!response.ok) throw Object.assign(new Error(result.error?.message || result.error || 'Zahtev nije uspeo. Pokušajte ponovo.'), { code: result.error?.code || result.code, status: response.status })
    return result.data ?? result
  }
}

import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { getDocs, limit, query, startAfter, type Query, type QueryDocumentSnapshot } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'

// History is fetched only on demand. A document cursor breaks timestamp ties correctly.
export function usePagedQuery(size = 3) {
  const rows = ref<any[]>([]), loading = ref(false), error = ref(''), hasMore = ref(false), initialized = ref(false)
  const base = shallowRef<Query | null>(null)
  const auth = useAuthStore()
  let cursor: QueryDocumentSnapshot | null = null, generation = 0, disposed = false
  function reset(q: Query | null = null) {
    generation++; base.value = q; rows.value = []; cursor = null; loading.value = false; error.value = ''; hasMore.value = !!q; initialized.value = false
  }
  async function more() {
    if (disposed || loading.value || !base.value || !hasMore.value) return
    const current = generation, user = auth.currentUser
    loading.value = true; error.value = ''
    try {
      const snap = await getDocs(query(base.value, ...(cursor ? [startAfter(cursor)] : []), limit(size)))
      if (disposed || current !== generation || user !== auth.currentUser) return
      const ids = new Set(rows.value.map(row => row.jobId))
      rows.value.push(...snap.docs.filter(doc => !ids.has(doc.id)).map(doc => ({ ...doc.data(), jobId: doc.id, uid: doc.id })))
      cursor = snap.docs.at(-1) || cursor; hasMore.value = snap.size === size; initialized.value = true
    } catch { if (current === generation) error.value = 'Učitavanje nije uspelo. Pokušajte ponovo.' }
    finally { if (current === generation) loading.value = false }
  }
  async function refresh() { const q = base.value; reset(q); await more() }
  watch(() => auth.currentUser, () => reset(), { flush: 'sync' })
  onScopeDispose(() => { disposed = true; reset() })
  return { rows, loading, error, hasMore, initialized, reset, more, refresh }
}

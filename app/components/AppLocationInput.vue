<template>
  <div ref="rootEl" class="relative">
    <input
      v-model="textModel"
      type="text"
      class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      :placeholder="placeholder"
      :disabled="disabled"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="isOpen ? 'true' : 'false'"
      @focus="onFocus"
      @input="onInput"
      @keydown.down.prevent="onArrowDown"
      @keydown.up.prevent="onArrowUp"
      @keydown.enter.prevent="onEnter"
      @keydown.esc.prevent="close"
    />

    <div v-if="showDropdown" class="absolute z-30 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
      <div v-if="loading" class="px-3 py-2 text-sm text-gray-600">Pretraga...</div>
      <div v-else-if="errorMsg" class="px-3 py-2 text-sm text-red-600">{{ errorMsg }}</div>
      <div v-else-if="suggestions.length === 0" class="px-3 py-2 text-sm text-gray-600">Nema rezultata.</div>
      <ul v-else class="max-h-64 overflow-auto py-1">
        <li
          v-for="(s, idx) in suggestions"
          :key="s.id"
          class="cursor-pointer px-3 py-2 text-sm"
          :class="idx === highlightedIdx ? 'bg-blue-50 text-blue-900' : 'text-gray-800 hover:bg-gray-50'"
          @mousemove="highlightedIdx = idx"
          @mousedown.prevent="selectSuggestion(s)"
        >
          {{ s.label }}
        </li>
      </ul>
      <div class="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500">
        Powered by Mapbox
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BELGRADE_BBOX_PARAM, isWithinBelgradeBbox } from '@/utils/geofence'

export type LocationSelection = {
  address: string
  coordinates: { lat: number; lng: number }
  city: string | null
  mapboxFeatureId?: string
}

type Suggestion = {
  id: string
  label: string
  coordinates: { lat: number; lng: number }
  city: string | null
}

const props = withDefaults(defineProps<{
  placeholder?: string
  disabled?: boolean
  minChars?: number
  debounceMs?: number
}>(), {
  placeholder: 'Ulica i broj, grad',
  disabled: false,
  minChars: 3,
  debounceMs: 250
})

// Two-model API:
// - default v-model: text displayed in the input
// - v-model:selected: the strict selection (address + coordinates). When user edits text manually, selection is cleared.
const textModel = defineModel<string>({ default: '' })
const selectedModel = defineModel<LocationSelection | null>('selected', { default: null })

const config = useRuntimeConfig()
const token = computed(() => (config.public as any)?.mapboxToken as string | undefined)

const rootEl = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const loading = ref(false)
const errorMsg = ref('')
const suggestions = ref<Suggestion[]>([])
const highlightedIdx = ref(-1)

const query = computed(() => (textModel.value || '').trim())
const showDropdown = computed(() => {
  if (!isOpen.value) return false
  if (props.disabled) return false
  const q = query.value
  if (!q || q.length < props.minChars) return false
  return true
})

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let aborter: AbortController | null = null

function close() {
  isOpen.value = false
  highlightedIdx.value = -1
}

function onFocus() {
  isOpen.value = true
}

function onInput() {
  // Keep dropdown open while user types (also after a previous selection).
  isOpen.value = true
}

function onArrowDown() {
  if (!showDropdown.value) {
    isOpen.value = true
    return
  }
  if (suggestions.value.length === 0) return
  highlightedIdx.value = Math.min(highlightedIdx.value + 1, suggestions.value.length - 1)
}

function onArrowUp() {
  if (suggestions.value.length === 0) return
  highlightedIdx.value = Math.max(highlightedIdx.value - 1, 0)
}

function onEnter() {
  if (!showDropdown.value) return
  const idx = highlightedIdx.value
  if (idx >= 0 && idx < suggestions.value.length) {
    const s = suggestions.value[idx]
    if (s) selectSuggestion(s)
  }
}

function selectSuggestion(s: Suggestion) {
  textModel.value = s.label
  selectedModel.value = {
    address: s.label,
    coordinates: { ...s.coordinates },
    city: s.city,
    mapboxFeatureId: s.id
  }
  suggestions.value = []
  close()
}

function extractCity(feature: any): string | null {
  // Mapbox returns administrative pieces in `context` (and for place results, the feature itself).
  const items: any[] = []
  if (feature && typeof feature === 'object') {
    items.push({ id: feature.id, text: feature.text })
  }
  const ctx = Array.isArray(feature?.context) ? feature.context : []
  items.push(...ctx)

  const pick = (prefixes: string[]) =>
    items.find((c) => typeof c?.id === 'string' && prefixes.some((p) => c.id.startsWith(p)))

  const cityItem =
    pick(['municipality.', 'place.']) ||
    // In some datasets "district" or "locality" maps better to municipality-level labels.
    pick(['district.']) ||
    pick(['locality.'])

  const text = (cityItem?.text ?? '').toString().trim()
  return text ? text : null
}

function normalizeSuggestions(features: any[]): Suggestion[] {
  const out: Suggestion[] = []
  for (const f of features || []) {
    const id = String(f?.id || '')
    const label = String(f?.place_name || '')
    const center = Array.isArray(f?.center) ? f.center : null
    const lng = center && Number(center[0])
    const lat = center && Number(center[1])
    if (!id || !label) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    // Hard geofence on the client side even if Mapbox returns edge-case results.
    if (!isWithinBelgradeBbox(lat, lng)) continue
    out.push({ id, label, coordinates: { lat, lng }, city: extractCity(f) })
  }
  return out
}

async function fetchSuggestions(q: string) {
  const t = token.value
  if (!t) {
    errorMsg.value = 'Mapbox token nije podešen (NUXT_PUBLIC_MAPBOX_TOKEN).'
    suggestions.value = []
    loading.value = false
    return
  }

  aborter?.abort()
  aborter = new AbortController()

  loading.value = true
  errorMsg.value = ''
  highlightedIdx.value = -1
  try {
    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`)
    url.searchParams.set('access_token', t)
    url.searchParams.set('autocomplete', 'true')
    url.searchParams.set('limit', '6')
    url.searchParams.set('country', 'rs')
    url.searchParams.set('language', 'sr')
    url.searchParams.set('types', 'address,place,locality,neighborhood')
    // Geofence: wider Belgrade bounding box (minLon,minLat,maxLon,maxLat).
    url.searchParams.set('bbox', BELGRADE_BBOX_PARAM)
    const resp = await fetch(url.toString(), { signal: aborter.signal })
    if (!resp.ok) {
      throw new Error(`Mapbox error: ${resp.status}`)
    }
    const json = await resp.json().catch(() => ({}))
    suggestions.value = normalizeSuggestions(json?.features || [])
  } catch (e: any) {
    if (e?.name === 'AbortError') return
    errorMsg.value = 'Greška pri pretrazi adrese. Pokušajte ponovo.'
    suggestions.value = []
  } finally {
    loading.value = false
  }
}

// Strictness: if user edits text (not equal to chosen address), clear selection.
watch(
  () => textModel.value,
  (val) => {
    const sel = selectedModel.value
    if (sel && val !== sel.address) {
      selectedModel.value = null
    }
  }
)

watch(
  query,
  (q) => {
    if (!import.meta.client) return
    if (props.disabled) return

    // clear stale state
    errorMsg.value = ''
    if (debounceTimer) clearTimeout(debounceTimer)
    aborter?.abort()
    aborter = null

    if (!q || q.length < props.minChars) {
      suggestions.value = []
      loading.value = false
      highlightedIdx.value = -1
      return
    }

    debounceTimer = setTimeout(() => {
      fetchSuggestions(q)
    }, props.debounceMs)
  }
)

function onDocumentClick(e: MouseEvent) {
  const target = e.target as Node | null
  if (!target) return
  if (rootEl.value && rootEl.value.contains(target)) return
  close()
}

onMounted(() => {
  if (!import.meta.client) return
  document.addEventListener('mousedown', onDocumentClick)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.removeEventListener('mousedown', onDocumentClick)
  if (debounceTimer) clearTimeout(debounceTimer)
  aborter?.abort()
})
</script>



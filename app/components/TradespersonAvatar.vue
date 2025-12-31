<template>
  <div
    class="rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center"
    :style="boxStyle"
  >
    <img v-if="url" :src="url" :alt="alt" class="h-full w-full object-cover" />
    <svg v-else viewBox="0 0 24 24" class="h-1/2 w-1/2 text-gray-400" aria-hidden="true">
      <path fill="currentColor" d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5c0-2.5-3.58-4.5-8-4.5" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { timestampCacheKey } from '@/utils/timestampCacheKey'

const props = defineProps<{
  path?: string | null
  updatedAt?: any
  size?: number
  alt?: string
}>()

const url = ref<string | null>(null)

const sizePx = computed(() => {
  const n = Number(props.size)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 48
})

const boxStyle = computed(() => ({ width: `${sizePx.value}px`, height: `${sizePx.value}px` }))

async function refresh() {
  if (!import.meta.client) return
  const p = props.path
  if (!p || typeof p !== 'string') {
    url.value = null
    return
  }
  const { $storage } = useNuxtApp() as any
  if (!$storage) {
    url.value = null
    return
  }
  try {
    const { ref: storageRef, getDownloadURL } = await import('firebase/storage')
    const u = await getDownloadURL(storageRef($storage, p))
    const key = timestampCacheKey(props.updatedAt)
    url.value = key ? `${u}${u.includes('?') ? '&' : '?'}v=${encodeURIComponent(key)}` : u
  } catch {
    url.value = null
  }
}

watch(
  () => ({ p: props.path, k: timestampCacheKey(props.updatedAt) }),
  () => { refresh() },
  { immediate: true }
)
</script>



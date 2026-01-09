<template>
  <header :class="rootClass">
    <div :class="containerClass">
      <NuxtLink to="/" class="inline-flex items-center" aria-label="MajstorSada">
        <img
          ref="logoImg"
          :src="logoSrc"
          :srcset="logoSrcset"
          alt="MajstorSada"
          :class="logoClass"
          width="32"
          height="32"
          decoding="async"
          fetchpriority="high"
          @error="onLogoError"
        />
      </NuxtLink>

      <!-- Explicit right action override (e.g. login page "← Nazad") -->
      <NuxtLink
        v-if="props.rightAction === 'back'"
        :to="props.backTo"
        :class="backLinkClass"
      >
        {{ props.backLabel }}
      </NuxtLink>

      <ClientOnly v-else>
        <template #default>
          <div>
            <template v-if="isLoggedIn">
              <!-- Tradesperson -->
              <NuxtLink
                v-if="role === 'tradesperson'"
                to="/majstor/dashboard"
                :class="tradespersonClass"
                aria-label="Panel za majstore"
                title="Panel za majstore"
              >
                <template v-if="variant === 'transparent'">
                  <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5C20 16 16.42 14 12 14"
                    />
                  </svg>
                </template>
                <template v-else>
                  Moj Panel
                </template>
              </NuxtLink>

              <!-- Client -->
              <NuxtLink
                v-else-if="role === 'client'"
                to="/klijent/dashboard"
                :class="clientClass"
              >
                <span v-if="variant === 'transparent'">Moji zahtevi</span>
                <span v-else>Moji zahtevi</span>
              </NuxtLink>

              <!-- Admin -->
              <NuxtLink
                v-else-if="role === 'admin'"
                to="/admin/dashboard"
                :class="clientClass"
              >
                Admin
              </NuxtLink>

              <!-- Unknown -->
              <div :class="skeletonClass" />
            </template>

            <!-- Signed out -->
            <NuxtLink
              v-else
              :to="signedOutTo"
              :class="signedOutClass"
            >
              {{ signedOutLabel }}
            </NuxtLink>
          </div>
        </template>
        <template #fallback>
          <div :class="skeletonClass" />
        </template>
      </ClientOnly>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

type HeaderVariant = 'transparent' | 'solid'
type HeaderWidth = '5xl' | '6xl'
type HeaderRightAction = 'auto' | 'back'

const props = withDefaults(
  defineProps<{
    variant?: HeaderVariant
    maxWidth?: HeaderWidth
    rightAction?: HeaderRightAction
    backTo?: string
    backLabel?: string
  }>(),
  {
    variant: 'solid',
    maxWidth: '5xl',
    rightAction: 'auto',
    backTo: '/',
    backLabel: '← Nazad'
  }
)

const auth = useAuthStore()
const isLoggedIn = computed(() => !!auth.currentUser)
const role = computed(() => auth.role)

const variant = computed(() => props.variant)
const maxWidth = computed(() => props.maxWidth)

const logoImg = ref<HTMLImageElement | null>(null)
const isMounted = ref(false)
const logoErrorSeen = ref(false)

const DEFAULT_LOGO_SRC = '/logo/logo-32.png'
const DEFAULT_LOGO_SRCSET = '/logo/logo-32.png 1x, /logo/logo-64.png 2x, /logo/logo-96.png 3x'
const FALLBACK_LOGO_SRC = '/icons/icon-192.png'
const FALLBACK_LOGO_SRCSET = '/icons/icon-192.png 1x, /icons/icon-192.png 2x, /icons/icon-512.png 3x'

const logoSrc = ref(DEFAULT_LOGO_SRC)
const logoSrcset = ref(DEFAULT_LOGO_SRCSET)

const rootClass = computed(() => {
  return variant.value === 'solid' ? 'bg-white border-b border-gray-200' : 'bg-transparent'
})

const containerClass = computed(() => {
  const width = maxWidth.value === '6xl' ? 'max-w-6xl' : 'max-w-5xl'
  const py = variant.value === 'transparent' ? 'py-4' : 'py-3'
  return `${width} mx-auto px-4 sm:px-6 lg:px-8 ${py} flex items-center justify-between`
})

const logoClass = computed(() => (variant.value === 'transparent' ? 'h-9 w-auto' : 'h-8 w-auto'))

const skeletonClass = computed(() => 'hidden')

const backLinkClass = computed(() => {
  if (variant.value === 'transparent') {
    return 'inline-flex items-center text-sm font-semibold text-white/90 hover:text-white transition-colors'
  }
  return 'inline-flex items-center text-sm font-semibold text-[#05243a] hover:text-[#1186dc] transition-colors'
})

const tradespersonClass = computed(() => {
  if (variant.value === 'transparent') {
    return 'h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/80 backdrop-blur-md text-[#05243a] shadow-sm hover:bg-white/90 transition-colors active:scale-[0.99]'
  }
  // Solid header: keep it clean and consistent with the "ghost" style (no heavy shadows).
  return 'inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-[#05243a] px-4 py-2 text-sm font-semibold hover:border-slate-300 hover:bg-slate-50 transition-colors active:scale-[0.99]'
})

const clientClass = computed(() => {
  if (variant.value === 'transparent') {
    return 'inline-flex items-center justify-center bg-white/80 backdrop-blur-md text-[#05243a] px-4 py-2 rounded-full text-sm font-semibold shadow-sm hover:bg-white/90 transition-colors active:scale-[0.99]'
  }
  // Solid header: clean outline style for consistency with the home ghost button.
  return 'inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-[#05243a] px-4 py-2 text-sm font-semibold hover:border-slate-300 hover:bg-slate-50 transition-colors active:scale-[0.99]'
})

const signedOutTo = computed(() => {
  return variant.value === 'transparent' ? '/majstor/login' : '/login?from=/klijent/dashboard'
})

const signedOutLabel = computed(() => (variant.value === 'transparent' ? 'Pristup za majstore' : 'Prijava'))

const signedOutClass = computed(() => {
  if (variant.value === 'transparent') {
    return 'inline-flex items-center justify-center bg-white/80 backdrop-blur-md text-[#05243a] px-4 py-2 rounded-full text-sm font-semibold shadow-sm hover:bg-white/90 transition-colors active:scale-[0.99]'
  }
  return 'text-sm px-3 py-2 rounded-md bg-gray-900 text-white hover:bg-black active:scale-[0.99]'
})

function onLogoError(e: Event) {
  // Hydration-safe: do not mutate DOM attributes during SSR hydration.
  // If an image fails before/during hydration, we apply fallback after mount.
  logoErrorSeen.value = true
  if (!isMounted.value) return
  if (logoSrc.value === FALLBACK_LOGO_SRC) return
  logoSrc.value = FALLBACK_LOGO_SRC
  logoSrcset.value = FALLBACK_LOGO_SRCSET
}

onMounted(() => {
  isMounted.value = true
  const img = logoImg.value
  // If the image failed before Vue attached @error, it may already be "complete" but broken.
  const broken = !!img && img.complete && img.naturalWidth === 0
  if (logoErrorSeen.value || broken) {
    logoSrc.value = FALLBACK_LOGO_SRC
    logoSrcset.value = FALLBACK_LOGO_SRCSET
  }
})
</script>



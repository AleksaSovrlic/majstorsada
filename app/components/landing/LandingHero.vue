<template>
  <section :aria-labelledby="titleId" :id="sectionId" class="relative w-full">
    <!-- Grid overlay: image defines height; content overlays without creating scroll containers -->
    <div
      class="relative grid lg:mx-auto lg:max-w-6xl lg:px-8 lg:gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(400px,520px)]"
    >
      <img
        src="/hero/city-map.webp"
        width="1632"
        height="2624"
        :alt="imageAlt"
        class="col-start-1 row-start-1 block w-full h-auto select-none lg:col-start-2"
        decoding="async"
        fetchpriority="high"
        loading="eager"
      />

      <!-- White scrim for readability (behind text; fades out early so the craftsman stays crisp) -->
      <div
        class="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-white via-white/90 to-transparent via-[28%] to-[46%] lg:bg-gradient-to-r lg:via-[52%] lg:to-[76%]"
        aria-hidden="true"
      />

      <!-- Overlay content -->
      <div class="relative z-10 col-start-1 row-start-1 flex">
        <div
          class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-0 lg:mx-0 lg:max-w-none pt-[92px] sm:pt-[108px] pb-4 sm:pb-6 flex flex-col lg:pt-0 lg:pb-0 lg:justify-center"
        >
          <!-- Text overlay -->
          <div class="mx-auto max-w-2xl text-center lg:mx-0 lg:max-w-xl lg:text-left">
            <p
              class="mx-auto lg:mx-0 inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-4 py-2 text-xs sm:text-sm font-semibold text-brand-navy ring-1 ring-black/5"
            >
              <span class="inline-flex h-2 w-2 rounded-full bg-brand-blue" aria-hidden="true" />
              {{ badgeText }}
            </p>

            <h1
              :id="titleId"
              class="mt-4 text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-brand-navy"
            >
              <slot name="title" />
            </h1>

          </div>

          <!-- Selector Card (STRADDLE): pushed down with negative margin into the next section -->
          <div class="mt-auto w-full lg:mt-8">
            <div
              class="relative z-10 mx-auto lg:mx-0 w-full max-w-md rounded-[2rem] bg-white p-4 sm:p-5 shadow-2xl shadow-black/20 ring-1 ring-black/5 -mb-20 sm:-mb-24 lg:mb-0"
            >
              <!-- small handle for "sheet" feel -->
              <div class="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" aria-hidden="true" />

              <nav aria-label="Izaberite uslugu">
                <div class="grid grid-cols-3 gap-2">
                  <NuxtLink
                    v-for="opt in serviceOptions"
                    :key="opt.slug"
                    :to="opt.landingPath"
                    class="group block cursor-pointer select-none rounded-2xl border px-2.5 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/20"
                    :class="
                      activeTip === opt.slug
                        ? 'border-brand-blue bg-brand-blue/5'
                        : 'border-slate-200 bg-white hover:border-brand-blue/40 hover:bg-slate-50'
                    "
                    :aria-current="activeTip === opt.slug ? 'page' : undefined"
                  >
                    <div
                      class="mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
                      :class="activeTip === opt.slug ? 'bg-brand-blue/10' : 'bg-slate-50 group-hover:bg-brand-blue/5'"
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
                        <path
                          fill="currentColor"
                          :class="activeTip === opt.slug ? 'text-brand-blue' : 'text-slate-600 group-hover:text-brand-blue'"
                          :d="opt.iconPath"
                        />
                      </svg>
                    </div>
                    <div
                      class="mt-2 text-[11px] sm:text-sm font-semibold leading-tight"
                      :class="activeTip === opt.slug ? 'text-brand-blue' : 'text-slate-700'"
                    >
                      {{ opt.label }}
                    </div>
                  </NuxtLink>
                </div>
              </nav>

              <NuxtLink
                :to="ctaTo"
                class="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-blue text-white h-12 sm:h-14 px-6 text-base sm:text-lg font-bold shadow-lg shadow-brand-blue/25 hover:bg-brand-blue-dark active:scale-[0.99] transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/20"
              >
                <span>{{ ctaText }}</span>
                <svg
                  viewBox="0 0 24 24"
                  class="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  aria-hidden="true"
                >
                  <path d="M11 5l7 7-7 7M4 12h14" />
                </svg>
              </NuxtLink>

              <p class="mt-3 text-center text-xs text-slate-600">
                Zahtev šaljemo trenutno dostupnim proverenim majstorima. Vaši podaci nisu javno prikazani.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { serviceOptions, type ServiceTipSlug } from '@/utils/services'

withDefaults(
  defineProps<{
    titleId?: string
    sectionId?: string
    badgeText?: string
    imageAlt?: string
  }>(),
  {
    titleId: 'home-hero-title',
    sectionId: 'hero',
    badgeText: 'Pošaljite zahtev 24/7 • Beograd',
    imageAlt: 'Mapa dostupnih majstora za hitne intervencije'
  }
)

const route = useRoute()

const normalizedPath = computed(() => route.path.replace(/\/+$/, '') || '/')

const activeOption = computed(() => {
  return serviceOptions.find((o) => o.landingPath === normalizedPath.value) ?? null
})

const activeTip = computed<ServiceTipSlug | null>(() => activeOption.value?.slug ?? null)
const ctaText = computed(() => 'Pošalji zahtev')

const ctaTo = computed(() => {
  return activeOption.value ? { path: '/zahtev', query: { tip: activeOption.value.slug } } : { path: '/zahtev' }
})
</script>

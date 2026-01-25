<template>
  <main class="w-full">
    <!-- HERO -->
    <section
      aria-labelledby="home-hero-title"
      id="hero"
      class="relative w-full"
    >
      <!-- Grid overlay: image defines height; content overlays without creating scroll containers -->
      <div
        class="relative grid lg:mx-auto lg:max-w-6xl lg:px-8 lg:gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(400px,520px)]"
      >
        <img
          src="/hero/city-map.webp"
          width="1632"
          height="2624"
          alt="Mapa dostupnih majstora za hitne intervencije"
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
                Provereni majstori • Dostupni odmah
              </p>

              <h1
                id="home-hero-title"
                class="mt-4 text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-brand-navy"
              >
                Majstor na vašim vratima <span class="whitespace-nowrap">za 30 min.</span>
              </h1>
            </div>

            <!-- Selector Card (STRADDLE): pushed down with negative margin into the next section -->
            <div class="mt-auto w-full lg:mt-8">
              <div
                class="relative z-10 mx-auto lg:mx-0 w-full max-w-md rounded-[2rem] bg-white p-4 sm:p-5 shadow-2xl shadow-black/20 ring-1 ring-black/5 -mb-20 sm:-mb-24 lg:mb-0"
              >
                <!-- small handle for "sheet" feel -->
                <div class="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" aria-hidden="true" />

                <fieldset>
                  <legend class="sr-only">Izaberite uslugu</legend>
                  <div class="grid grid-cols-3 gap-2">
                    <label
                      v-for="opt in serviceOptions"
                      :key="opt.slug"
                      class="group cursor-pointer select-none rounded-2xl border px-2.5 py-3 text-center transition-colors"
                      :class="
                        selectedTip === opt.slug
                          ? 'border-brand-blue bg-brand-blue/5'
                          : 'border-slate-200 bg-white hover:border-brand-blue/40 hover:bg-slate-50'
                      "
                    >
                      <input v-model="selectedTip" class="sr-only" type="radio" name="service" :value="opt.slug" />

                      <div
                        class="mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
                        :class="selectedTip === opt.slug ? 'bg-brand-blue/10' : 'bg-slate-50 group-hover:bg-brand-blue/5'"
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
                          <path
                            fill="currentColor"
                            :class="selectedTip === opt.slug ? 'text-brand-blue' : 'text-slate-600 group-hover:text-brand-blue'"
                            :d="opt.iconPath"
                          />
                        </svg>
                      </div>
                      <div
                        class="mt-2 text-[11px] sm:text-sm font-semibold leading-tight"
                        :class="selectedTip === opt.slug ? 'text-brand-blue' : 'text-slate-700'"
                      >
                        {{ opt.label }}
                      </div>
                    </label>
                  </div>
                </fieldset>

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
                  Svi majstori prolaze bezbednosnu proveru. Vaši podaci nisu javni.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- KAKO RADI -->
    <section
      aria-labelledby="home-how-title"
      id="how-it-works"
      class="w-full bg-gradient-to-b from-slate-50 via-blue-50 to-blue-100 pt-32 sm:pt-36 lg:pt-20 pb-12 sm:pb-16"
    >
      <div class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="text-center">
          <h2 id="home-how-title" class="text-xl sm:text-2xl font-extrabold text-brand-navy">
            Kako radi
          </h2>
          <p class="mt-2 text-slate-600 text-sm sm:text-base">
            Tri kratka koraka do rešenja – brzo, jednostavno i bez nepotrebnih koraka.
          </p>
        </div>

        <ol class="mt-6 grid gap-4 sm:grid-cols-3">
          <li
            v-for="step in howSteps"
            :key="step.key"
            class="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-black/5 p-5 sm:p-6 text-center"
          >
            <div class="mx-auto h-11 w-11 rounded-full bg-brand-blue/10 shadow-sm flex items-center justify-center text-brand-navy" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
                <path fill="currentColor" :d="step.iconPath" />
              </svg>
            </div>
            <h3 class="mt-3 text-base font-bold text-brand-navy">
              {{ step.title }}
            </h3>
            <p class="mt-1 text-sm text-slate-600 leading-relaxed">
              {{ step.description }}
            </p>
          </li>
        </ol>

        <div class="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-slate-600 text-xs font-medium">
          <span class="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" class="h-4 w-4 text-brand-blue" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 1a5 5 0 0 0-5 5v4H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5m-3 9V6a3 3 0 0 1 6 0v4z"
              />
            </svg>
            <span>Bez lozinki (Magic Link)</span>
          </span>
          <span class="text-slate-300">•</span>
          <span class="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" class="h-4 w-4 text-brand-blue" aria-hidden="true">
              <path
                fill="currentColor"
                d="m12 17.27l5.18 3.73l-1.64-6.03L20 9.24l-6.19-.52L12 3L10.19 8.72L4 9.24l4.46 5.73L6.82 21z"
              />
            </svg>
            <span>4.9 (2k+ ocena)</span>
          </span>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

definePageMeta({ layout: 'home' })

useSeoMeta({
  title: 'Hitne Intervencije: Stižemo za 30 min',
  description: 'Izaberite kategoriju i pošaljite zahtev za minut. Provereni majstori su dostupni odmah.',
  ogTitle: 'MajstorSada',
  ogDescription: 'Izaberite kategoriju i pošaljite zahtev za minut. Provereni majstori su dostupni odmah.'
})

type ServiceTipSlug = 'vodoinstalater' | 'elektricar' | 'bravar'

interface HomeServiceOption {
  slug: ServiceTipSlug
  label: string
  ctaLabel: string
  iconPath: string
}

const serviceOptions = [
  {
    slug: 'vodoinstalater',
    label: 'Vodoinstalater',
    ctaLabel: 'Vodoinstalatera',
    iconPath: 'M12 2.5s5 6 5 10a5 5 0 1 1-10 0c0-4 5-10 5-10z'
  },
  {
    slug: 'elektricar',
    label: 'Električar',
    ctaLabel: 'Električara',
    iconPath: 'M13 2L3 14h7l-1 8l10-12h-7z'
  },
  {
    slug: 'bravar',
    label: 'Bravar',
    ctaLabel: 'Bravara',
    iconPath: 'M17 11V8a5 5 0 0 0-10 0v3H5v10h14V11zm-2 0H9V8a3 3 0 0 1 6 0v3z'
  }
] as const satisfies readonly HomeServiceOption[]

const selectedTip = ref<ServiceTipSlug>(serviceOptions[0].slug)

const selectedOption = computed(() => {
  return serviceOptions.find((o) => o.slug === selectedTip.value) ?? serviceOptions[0]
})

const ctaText = computed(() => `Zatraži ${selectedOption.value.ctaLabel}`)
const ctaTo = computed(() => ({ path: '/zahtev', query: { tip: selectedTip.value } }))

interface HowStep {
  key: 'describe' | 'send' | 'arrive'
  title: string
  description: string
  iconPath: string
}

const howSteps = [
  {
    key: 'describe',
    title: 'Opiši kvar',
    description: 'Napišite kratak opis problema i unesite adresu.',
    iconPath:
      'M19 2H8a2 2 0 0 0-2 2v4H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4h1a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2m-1 18H5V10h13zm3-6h-3v-4a2 2 0 0 0-2-2H8V4h13z'
  },
  {
    key: 'send',
    title: 'Pošalji zahtev',
    description: 'Potvrdite unos i mi odmah obaveštavamo majstore u vašem kraju.',
    iconPath: 'M2 21l21-9L2 3v7l15 2l-15 2z'
  },
  {
    key: 'arrive',
    title: 'Majstor vas zove',
    description: 'Prvi slobodan majstor će vas pozvati direktno – dogovarate detalje odmah.',
    iconPath: 'M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5C20 16 16.42 14 12 14'
  }
] as const satisfies readonly HowStep[]
</script>


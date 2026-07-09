<template>
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
          Jedan zahtev ide trenutno dostupnim proverenim majstorima za izabranu intervenciju.
        </p>
      </div>

      <ol class="mt-6 grid gap-4 sm:grid-cols-3">
        <li
          v-for="step in howSteps"
          :key="step.key"
          class="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-black/5 p-5 sm:p-6 text-center"
        >
          <div
            class="mx-auto h-11 w-11 rounded-full bg-brand-blue/10 shadow-sm flex items-center justify-center text-brand-navy"
            aria-hidden="true"
          >
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
          <span>Bez lozinki i komplikovane registracije</span>
        </span>
        <span class="text-slate-300">•</span>
        <span class="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" class="h-4 w-4 text-brand-blue" aria-hidden="true">
            <path
              fill="currentColor"
              d="m12 17.27l5.18 3.73l-1.64-6.03L20 9.24l-6.19-.52L12 3L10.19 8.72L4 9.24l4.46 5.73L6.82 21z"
            />
          </svg>
          <span>Cenu, dolazak i detalje dogovarate pre rada</span>
        </span>
      </div>

      <div v-if="hasExtra" class="mt-10 sm:mt-12">
        <slot />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

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
    description: 'Izaberite uslugu, napišite kratak opis problema i unesite adresu.',
    iconPath:
      'M19 2H8a2 2 0 0 0-2 2v4H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4h1a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2m-1 18H5V10h13zm3-6h-3v-4a2 2 0 0 0-2-2H8V4h13z'
  },
  {
    key: 'send',
    title: 'Pošalji zahtev 24/7',
    description: 'Zahtev šaljemo trenutno dostupnim proverenim majstorima za izabranu uslugu.',
    iconPath: 'M2 21l21-9L2 3v7l15 2l-15 2z'
  },
  {
    key: 'arrive',
    title: 'Majstor vas kontaktira',
    description: 'Majstor koji prihvati zahtev kontaktira vas radi dogovora oko cene, dolaska i detalja.',
    iconPath: 'M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5C20 16 16.42 14 12 14'
  }
] as const satisfies readonly HowStep[]

const slots = useSlots()
const hasExtra = computed(() => typeof slots.default === 'function')
</script>


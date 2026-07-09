<template>
  <main class="w-full">
    <LandingHero :badgeText="landing.hero.badgeText" titleId="bravar-hero-title">
      <template #title>
        Bravari za hitno otvaranje vrata u Beogradu
      </template>

      <template #subtitle>
        Zaključani ste, izgubili ste ključ ili brava ne radi? Pošaljite jedan zahtev — šaljemo ga trenutno dostupnim proverenim bravarima u Beogradu.
      </template>

      <template #trust>
        Bravar koji prihvati intervenciju kontaktira vas direktno radi dogovora oko cene i dolaska.
      </template>
    </LandingHero>

    <LandingHowItWorks>
      <!-- SEO CONTENT (Below the fold) -->
      <section aria-labelledby="bravar-content-title">
        <h2 id="bravar-content-title" class="sr-only">
          Bravarske usluge i hitno otvaranje vrata
        </h2>

        <div class="grid gap-4 lg:grid-cols-2">
          <section
            aria-labelledby="bravar-problems-title"
            class="rounded-3xl bg-white/75 backdrop-blur ring-1 ring-black/5 p-6 sm:p-8"
          >
            <h3 id="bravar-problems-title" class="text-lg sm:text-xl font-extrabold text-brand-navy">
              Za koje situacije možete poslati zahtev
            </h3>
            <p class="mt-2 text-sm sm:text-base text-slate-600">
              Ako ste ispred vrata, izgubili ste ključ ili brava ne radi, jedan zahtev šaljemo trenutno dostupnim proverenim bravarima.
            </p>
            <ul class="mt-4 space-y-2 text-sm sm:text-base text-slate-700">
              <li v-for="item in landing.content.commonProblems" :key="item" class="flex gap-2">
                <span class="mt-1 inline-flex h-2 w-2 flex-none rounded-full bg-brand-blue/70" aria-hidden="true" />
                <span>{{ item }}</span>
              </li>
            </ul>
          </section>

          <section
            aria-labelledby="bravar-usp-title"
            class="rounded-3xl bg-white/75 backdrop-blur ring-1 ring-black/5 p-6 sm:p-8"
          >
            <h3 id="bravar-usp-title" class="text-lg sm:text-xl font-extrabold text-brand-navy">
              Zašto MajstorSada
            </h3>
            <p class="mt-2 text-sm sm:text-base text-slate-600">
              Umesto da zovete više brojeva dok stojite ispred vrata, pošaljite jedan zahtev i dogovorite detalje sa bravarom koji prihvati intervenciju.
            </p>
            <ul class="mt-4 space-y-2 text-sm sm:text-base text-slate-700">
              <li v-for="item in landing.content.usp" :key="item" class="flex gap-2">
                <svg viewBox="0 0 24 24" class="mt-0.5 h-5 w-5 flex-none text-brand-blue" aria-hidden="true">
                  <path fill="currentColor" d="M9.55 18.2L3.8 12.45l1.4-1.4l4.35 4.35L18.8 6.15l1.4 1.4z" />
                </svg>
                <span>{{ item }}</span>
              </li>
            </ul>

            <NuxtLink
              :to="requestTo"
              class="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-blue text-white h-12 sm:h-14 px-6 text-base sm:text-lg font-bold shadow-lg shadow-brand-blue/25 hover:bg-brand-blue-dark active:scale-[0.99] transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/20"
            >
              <span>Pošalji zahtev za bravara</span>
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M11 5l7 7-7 7M4 12h14" />
              </svg>
            </NuxtLink>

            <p class="mt-3 text-center text-xs text-slate-600">
              * Cenu, dolazak i način intervencije dogovarate direktno sa majstorom pre početka rada.
            </p>
          </section>
        </div>
      </section>

      <section aria-labelledby="bravar-faq-title" class="mt-8 sm:mt-10">
        <h2 id="bravar-faq-title" class="text-lg sm:text-xl font-extrabold text-brand-navy text-center">
          Česta pitanja
        </h2>

        <div class="mt-4 space-y-3">
          <details
            v-for="item in landing.content.faq"
            :key="item.question"
            class="group rounded-2xl bg-white/75 backdrop-blur ring-1 ring-black/5 px-5 py-4"
          >
            <summary class="cursor-pointer list-none font-bold text-brand-navy flex items-start justify-between gap-4">
              <span>{{ item.question }}</span>
              <svg
                viewBox="0 0 24 24"
                class="mt-0.5 h-5 w-5 flex-none text-brand-blue transition-transform group-open:rotate-180"
                aria-hidden="true"
              >
                <path fill="currentColor" d="M7 10l5 5l5-5z" />
              </svg>
            </summary>
            <p class="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
              {{ item.answer }}
            </p>
          </details>
        </div>
      </section>
    </LandingHowItWorks>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { bravarLanding as landing } from '@/utils/serviceLandings'

definePageMeta({ layout: 'home' })

const config = useRuntimeConfig()
const siteUrl = (config.public.siteUrl || 'https://majstorsada.rs').replace(/\/+$/, '')
const canonicalUrl = `${siteUrl}${landing.path}`

useSeoMeta({
  title: landing.seo.title,
  description: landing.seo.description,
  ogTitle: landing.seo.title,
  ogDescription: landing.seo.description,
  ogUrl: canonicalUrl
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
  script: [
    {
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            '@id': `${canonicalUrl}#webpage`,
            url: canonicalUrl,
            name: landing.seo.title,
            description: landing.seo.description,
            inLanguage: 'sr-RS',
            primaryImageOfPage: {
              '@type': 'ImageObject',
              url: `${siteUrl}/hero/city-map.webp`
            },
            mainEntity: { '@id': `${canonicalUrl}#service` }
          },
          {
            '@type': 'Service',
            '@id': `${canonicalUrl}#service`,
            name: 'Hitno otvaranje vrata i bravarske intervencije',
            serviceType: 'Bravarske usluge',
            description: landing.seo.description,
            provider: { '@id': `${siteUrl}/#organization` },
            areaServed: { '@type': 'City', name: 'Beograd' }
          },
          {
            '@type': 'FAQPage',
            '@id': `${canonicalUrl}#faq`,
            mainEntity: landing.content.faq.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: { '@type': 'Answer', text: item.answer }
            }))
          },
          {
            '@type': 'BreadcrumbList',
            '@id': `${canonicalUrl}#breadcrumb`,
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Početna', item: siteUrl },
              { '@type': 'ListItem', position: 2, name: 'Bravar', item: canonicalUrl }
            ]
          }
        ]
      })
    }
  ]
})

const requestTo = computed(() => ({ path: '/zahtev', query: { tip: landing.tipQuery } }))
</script>

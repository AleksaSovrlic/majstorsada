<template>
  <main class="w-full">
    <LandingHero titleId="home-hero-title">
      <template #title>
        Majstor na vašim vratima <span class="whitespace-nowrap">za 30 min.</span>
      </template>
    </LandingHero>

    <LandingHowItWorks />
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'home' })

useSeoMeta({
  title: 'Hitne Intervencije: Stižemo za 30 min',
  description:
    'Majstor na vašim vratima za 30 minuta. Naš pametni sistem odmah pronalazi slobodnog stručnjaka u vašem kraju. Vodoinstalater, električar, bravar - 00-24h.',
  ogTitle: 'MajstorSada',
  ogDescription:
    'Majstor na vašim vratima za 30 minuta. Naš pametni sistem odmah pronalazi slobodnog stručnjaka u vašem kraju. Vodoinstalater, električar, bravar - 00-24h.'
})
</script>


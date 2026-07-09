<template>
  <main class="w-full">
    <LandingHero titleId="home-hero-title">
      <template #title>
        Majstor za hitne intervencije u Beogradu — 24/7
      </template>

      <template #subtitle>
        Pošaljite zahtev za manje od minut. Zahtev odmah šaljemo trenutno dostupnim proverenim majstorima za brz dolazak — bez zvanja 10 brojeva.
      </template>

      <template #trust>
        Majstor koji prihvati intervenciju kontaktira vas direktno radi dogovora oko cene, dolaska i detalja.
      </template>
    </LandingHero>

    <LandingHowItWorks>
      <section aria-labelledby="home-faq-title">
        <h2 id="home-faq-title" class="text-lg sm:text-xl font-extrabold text-brand-navy text-center">
          Česta pitanja
        </h2>

        <div class="mt-4 space-y-3">
          <details
            v-for="item in homeFaq"
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
definePageMeta({ layout: 'home' })

useSeoMeta({
  title: 'Majstor za hitne intervencije Beograd 24/7',
  description:
    'Majstor za hitne intervencije u Beogradu 24/7. Pošaljite jedan zahtev trenutno dostupnim proverenim majstorima — bez zvanja 10 brojeva.',
  ogTitle: 'MajstorSada',
  ogDescription:
    'Majstor za hitne intervencije u Beogradu 24/7. Pošaljite jedan zahtev trenutno dostupnim proverenim majstorima — bez zvanja 10 brojeva.'
})

const homeFaq = [
  {
    question: 'Kako funkcioniše MajstorSada?',
    answer:
      'Popunite kratak zahtev i izaberete kategoriju kvara. Zahtev šaljemo trenutno dostupnim proverenim majstorima za tu vrstu intervencije. Majstor koji prihvati zahtev kontaktira vas direktno.'
  },
  {
    question: 'Da li mogu da pošaljem zahtev 24/7?',
    answer:
      'Da. Zahtev možete poslati u bilo kom trenutku, a sistem ga prosleđuje trenutno dostupnim proverenim majstorima za izabranu kategoriju.'
  },
  {
    question: 'Koliko brzo mogu da dođem do majstora?',
    answer:
      'Zahtev odmah šaljemo trenutno dostupnim proverenim majstorima. Majstor koji prihvati intervenciju kontaktira vas direktno, a brz dolazak, cenu i detalje dogovarate pre početka rada.'
  },
  {
    question: 'Da li moram da zovem više majstora?',
    answer:
      'Ne. Pošaljete jedan zahtev, a MajstorSada ga prosleđuje majstorima koji su dostupni za izabranu uslugu.'
  },
  {
    question: 'Kako se dogovara cena intervencije?',
    answer:
      'Cenu, dolazak i detalje dogovarate direktno sa majstorom koji prihvati intervenciju, pre početka rada.'
  },
  {
    question: 'Ko vidi moje kontakt podatke?',
    answer:
      'Vaši podaci nisu javno prikazani. Koriste se za obradu zahteva i kontakt sa majstorom koji prihvati intervenciju.'
  },
  {
    question: 'Da li me slanje zahteva obavezuje da angažujem majstora?',
    answer:
      'Ne. Zahtev služi da vas povežemo sa dostupnim majstorom, a odluku donosite nakon dogovora o ceni, dolasku i detaljima.'
  }
] as const
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
    <div class="min-h-[calc(100svh-72px)] flex items-center justify-center py-10">
      <div class="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 md:p-10 text-center mx-4">
        <!-- Hero (check) -->
        <div class="mx-auto mb-6 h-20 w-20 rounded-full bg-green-50 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            class="h-11 w-11 text-green-500 motion-safe:animate-[check-pop_520ms_ease-out] motion-reduce:animate-none"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"
            />
          </svg>
        </div>

        <h1 class="text-2xl md:text-3xl font-bold text-[#05243a] mb-2">
          Zahtev je uspešno poslat!
        </h1>
        <p class="text-slate-600 text-lg mb-6">
          Alarmirali smo majstore u vašoj okolini.
        </p>

        <!-- Highlight -->
        <div class="bg-slate-50 rounded-xl p-4">
          <div class="flex items-center justify-center gap-3">
            <div class="h-10 w-10 rounded-full bg-[#1186dc]/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" class="h-5 w-5 text-[#1186dc]" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.59a1 1 0 01-.25 1.01z"
                />
              </svg>
            </div>
            <p class="font-bold text-[#05243a] text-xl">
              Držite telefon pri ruci.
            </p>
          </div>
        </div>

        <!-- Explainer -->
        <p class="mt-5 text-slate-700 text-base leading-relaxed">
          Prvi slobodan majstor će vas pozvati direktno.
        </p>
        <p class="mt-3 text-slate-600 text-base leading-relaxed">
          <span class="inline-flex items-center justify-center gap-2">
            <svg viewBox="0 0 24 24" class="h-5 w-5 text-[#1186dc]" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 2a8 8 0 1 1-8 8a8 8 0 0 1 8-8m-1 3a1 1 0 0 1 1 1v4.9l3.4 2a1 1 0 0 1-1 1.72l-3.9-2.3A1 1 0 0 1 11 13V8a1 1 0 0 1 1-1z"
              />
            </svg>
            <span>
              Očekivano vreme: ~<span class="text-[#1186dc] font-semibold">15 minuta</span>.
            </span>
          </span>
        </p>

        <NuxtLink
          to="/klijent/dashboard"
          class="w-full mt-6 py-4 rounded-xl bg-[#1186dc] text-white font-bold text-lg shadow-lg hover:bg-[#0f78c3] transition-transform active:scale-95 inline-flex items-center justify-center"
        >
          Prati status zahteva
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Zahtev poslat' })
</script>

<style scoped>
@keyframes check-pop {
  0% {
    transform: scale(0.75);
    opacity: 0;
  }
  60% {
    transform: scale(1.08);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>


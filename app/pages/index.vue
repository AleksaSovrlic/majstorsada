<template>
  <div class="min-h-[100svh] bg-gradient-to-b from-slate-50 via-blue-50 to-blue-100 flex flex-col">
    <!-- HERO + HOW IT WORKS -->
    <main class="flex-1 w-full">
      <!-- Hero (responsive split) -->
      <!-- Keep spacing identical to the current design:
           old: header-in-flow (~72px) + section pt (mobile 8px / desktop 40px) -->
      <section class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-[80px] pb-8 lg:pt-[112px] lg:pb-10">
        <div class="grid gap-6 lg:grid-cols-2 lg:gap-12 lg:items-center">
          <!-- Copy + (desktop) decision helpers -->
          <div class="text-center lg:text-left">
            <h1 class="text-3xl font-bold text-gray-900 tracking-tight sm:text-4xl">
              Treba vam majstor?
            </h1>
            <p class="mt-2 text-gray-500 text-base sm:text-lg">
              Rešenje je na jedan klik.
            </p>

            <!-- Desktop: keep CTA + How + Trust tightly grouped under the copy -->
            <div class="hidden lg:block">
              <HomeDecisionStack ctaWrapperClass="mt-6 max-w-md mx-auto lg:mx-0">
                <template #cta>
                  <ClientOnly>
                    <template #default>
                      <CtaButton />
                    </template>
                    <template #fallback>
                      <div class="w-full sm:w-auto sm:px-12 inline-flex items-center justify-center rounded-2xl bg-[#1186dc] h-14 text-lg font-bold text-white shadow-lg shadow-blue-500/30 opacity-60">
                        Zatraži Majstora
                      </div>
                    </template>
                  </ClientOnly>
                </template>
              </HomeDecisionStack>
            </div>
          </div>

          <!-- Portrait image (exact aspect ratio to avoid cropping) -->
          <div class="w-full">
            <div class="mx-auto max-w-sm sm:max-w-md lg:max-w-lg">
              <div class="overflow-hidden rounded-3xl shadow-xl ring-1 ring-black/5 aspect-[212/279] bg-gray-200">
                <img
                  src="/majstor.jpg"
                  alt=""
                  class="h-full w-full object-cover"
                  decoding="async"
                  fetchpriority="high"
                  loading="eager"
                />
              </div>
            </div>
          </div>

          <!-- CTA + How it works + trust (grouped; becomes left column on desktop) -->
          <div class="text-center lg:text-left lg:hidden">
            <HomeDecisionStack ctaWrapperClass="max-w-md mx-auto lg:mx-0">
              <template #cta>
                <ClientOnly>
                  <template #default>
                    <CtaButton />
                  </template>
                  <template #fallback>
                    <div class="w-full sm:w-auto sm:px-12 inline-flex items-center justify-center rounded-2xl bg-[#1186dc] h-14 text-lg font-bold text-white shadow-lg shadow-blue-500/30 opacity-60">
                      Zatraži Majstora
                    </div>
                  </template>
                </ClientOnly>
              </template>
            </HomeDecisionStack>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, resolveComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

definePageMeta({ layout: 'home' })

const auth = useAuthStore()

const CtaButton = defineComponent({
  setup() {
    return () => {
      const to = auth.currentUser ? '/zahtev' : '/login?from=/zahtev'
      return h(
        resolveComponent('NuxtLink'),
        {
          to,
          class:
            'w-full sm:w-auto sm:px-12 inline-flex items-center justify-center bg-[#1186dc] text-white text-lg font-bold h-14 rounded-2xl shadow-lg shadow-blue-500/30 hover:bg-[#0f78c3] active:scale-[0.99] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1186dc]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-50'
        },
        { default: () => 'Zatraži Majstora' }
      )
    }
  }
})
</script>


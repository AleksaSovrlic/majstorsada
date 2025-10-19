<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-2xl text-center">
      <h1 class="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight">
        <span class="block">Treba vam majstor?</span>
        <span class="block">Rešenje je na jedan klik.</span>
      </h1>
      <p class="mt-4 text-lg text-gray-600">
        1. Opišite problem. 2. Pošaljite zahtev. 3. Sačekajte poziv majstora.
      </p>
      <div class="mt-10">
        <ClientOnly>
          <template #default>
            <CtaButton />
          </template>
          <template #fallback>
            <div class="inline-block bg-blue-600 text-white font-bold px-8 py-4 text-lg rounded-xl shadow-lg opacity-50">
              [ Zatraži Majstora ]
            </div>
          </template>
        </ClientOnly>
      </div>

      <div class="mt-12 text-sm">
        <ClientOnly>
          <NuxtLink v-if="!isLoggedIn" to="/majstor/login" class="text-gray-500 underline hover:text-gray-700 transition-colors">
            Prijava za majstore
          </NuxtLink>
          <template #fallback>
            <span class="h-5 inline-block"></span>
          </template>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, resolveComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const isLoggedIn = computed(() => !!auth.currentUser)

const CtaButton = defineComponent({
  setup() {
    return () => {
      const to = auth.currentUser ? '/zahtev' : '/login?from=/zahtev'
      return h(
        resolveComponent('NuxtLink'),
        {
          to,
          class: 'inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-4 text-lg rounded-xl shadow-lg transition-transform hover:scale-105 active:scale-[0.99]'
        },
        { default: () => '[ Zatraži Majstora ]' }
      )
    }
  }
})
</script>


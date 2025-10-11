<template>
  <div>
    <header v-if="showNav" class="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <NuxtLink to="/" class="text-lg font-semibold text-gray-900">MajstorSada</NuxtLink>
        <ClientOnly>
          <template #default>
            <div>
              <template v-if="isLoggedIn">
                <NuxtLink v-if="role === 'tradesperson'" to="/majstor/dashboard" class="text-sm px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99]">Moj Panel</NuxtLink>
                <NuxtLink v-else-if="role === 'client'" to="/klijent/dashboard" class="text-sm px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99]">Moj Panel</NuxtLink>
                <NuxtLink v-else-if="role === 'admin'" to="/admin/dashboard" class="text-sm px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99]">Admin</NuxtLink>
                <div v-else class="w-28 h-8 rounded-md bg-gray-200" />
              </template>
              <NuxtLink v-else to="/login?from=klijent/dashboard" class="text-sm px-3 py-2 rounded-md bg-gray-900 text-white hover:bg-black active:scale-[0.99]">Prijava</NuxtLink>
            </div>
          </template>
          <template #fallback>
            <div class="w-28 h-8 rounded-md bg-gray-200" />
          </template>
        </ClientOnly>
      </div>
    </header>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

const showNav = computed(() => !route.path.startsWith('/admin') && !route.path.startsWith('/majstor'))
const authReady = computed(() => auth.isInitialized)
const isLoggedIn = computed(() => !!auth.currentUser)
const role = computed(() => auth.role)
</script>

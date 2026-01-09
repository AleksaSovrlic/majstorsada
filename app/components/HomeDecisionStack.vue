<template>
  <div>
    <div :class="ctaWrapperClass">
      <slot name="cta" />
    </div>

    <div class="mt-6">
      <div class="grid grid-cols-3 gap-3 lg:gap-6">
        <div v-for="step in howSteps" :key="step.key" class="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div class="h-11 w-11 lg:h-12 lg:w-12 rounded-full bg-[#1186dc]/10 shadow-sm flex items-center justify-center text-[#05243a]">
            <svg viewBox="0 0 24 24" class="h-5 w-5 lg:h-6 lg:w-6" aria-hidden="true">
              <path fill="currentColor" :d="step.path" />
            </svg>
          </div>
          <div class="mt-2 text-xs lg:text-sm font-bold text-gray-900">{{ step.label }}</div>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-x-3 gap-y-1 text-center lg:text-left text-gray-500 text-xs font-medium">
        <span class="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" class="h-4 w-4 text-[#1186dc]" aria-hidden="true">
            <path
              fill="currentColor"
              d="M17 3H7v3c0 2.76 2.24 5 5 5s5-2.24 5-5zM6 3v3c0 3.31 2.69 6 6 6s6-2.69 6-6V3h2v3c0 2.76 2.24 5 5 5V9c-2.21 0-4-1.79-4-4V3h-3v3c0 3.31-2.69 6-6 6s-6-2.69-6-6V3H3v2c0 2.21-1.79 4-4 4v2c2.76 0 5-2.24 5-5V3zM12 13c-2.21 0-4 1.79-4 4v4h8v-4c0-2.21-1.79-4-4-4z"
            />
          </svg>
          <span>Prva platforma u Srbiji</span>
        </span>
        <span class="text-gray-300">•</span>
        <span class="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" class="h-4 w-4 text-[#1186dc]" aria-hidden="true">
            <path
              fill="currentColor"
              d="m12 17.27l5.18 3.73l-1.64-6.03L20 9.24l-6.19-.52L12 3L10.19 8.72L4 9.24l4.46 5.73L6.82 21z"
            />
          </svg>
          <span>4.9 (2k+ ocena)</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    ctaWrapperClass?: string
  }>(),
  {
    // Default matches the mobile block (no extra mt)
    ctaWrapperClass: 'max-w-md mx-auto lg:mx-0'
  }
)

const ctaWrapperClass = props.ctaWrapperClass

const howSteps = [
  {
    key: 'describe',
    label: 'Opiši kvar',
    path:
      'M19 2H8a2 2 0 0 0-2 2v4H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4h1a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2m-1 18H5V10h13zm3-6h-3v-4a2 2 0 0 0-2-2H8V4h13z'
  },
  {
    key: 'send',
    label: 'Pošalji',
    path: 'M2 21l21-9L2 3v7l15 2l-15 2z'
  },
  {
    key: 'arrive',
    label: 'Majstor stiže',
    path: 'M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5C20 16 16.42 14 12 14'
  }
] as const
</script>



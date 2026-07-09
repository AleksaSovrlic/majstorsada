<template>
  <section class="relative z-0 bg-slate-50 pt-28 sm:pt-32 lg:pt-12 pb-0 -mb-24 sm:-mb-28 lg:-mb-12">
    <div class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-3xl rounded-[2rem] bg-white/90 p-5 text-center shadow-xl shadow-slate-900/5 ring-1 ring-black/5 sm:p-7">
        <p class="text-xs font-bold uppercase tracking-[0.11em] text-brand-blue sm:tracking-[0.16em]">
          Kako MajstorSada pomaže
        </p>

        <h2 class="mt-2 text-xl font-extrabold tracking-tight text-brand-navy sm:text-2xl">
          {{ heading }}
        </h2>

        <p class="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          {{ text }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  heading: string
  text: string
}>()
</script>
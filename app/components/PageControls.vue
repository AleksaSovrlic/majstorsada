<template>
  <div class="mt-4 flex flex-wrap items-center gap-3 text-sm">
    <button v-if="more || error" type="button" :disabled="loading" class="rounded-xl bg-brand-blue px-4 py-2 font-semibold text-white disabled:opacity-60" @click="$emit('more')">{{ loading ? 'Učitavanje…' : error ? 'Pokušaj ponovo' : 'Učitaj još' }}</button>
    <button type="button" :disabled="loading" class="rounded-xl border px-4 py-2 font-semibold disabled:opacity-60" @click="$emit('refresh')">Osveži</button>
    <span v-if="error" role="alert" class="text-red-700">{{ error }}</span>
  </div>
</template>
<script setup lang="ts">
defineProps<{ loading: boolean; more: boolean; error: string }>()
defineEmits(['more', 'refresh'])
</script>

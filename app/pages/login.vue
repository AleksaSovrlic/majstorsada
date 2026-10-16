<template>
  <ClientOtpLogin :from="route.query.from" />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'public' })
const route = useRoute()
</script>

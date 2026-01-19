<template>
  <!-- Absolute + transparent, NOT sticky; must NOT reserve layout height -->
  <PublicHeader class="absolute top-0 inset-x-0 z-50" variant="transparent" maxWidth="6xl" />
  <slot />
</template>



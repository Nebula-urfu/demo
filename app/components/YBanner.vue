<script setup lang="ts">
defineProps<{ eyebrow?: string; title: string; text?: string }>()
</script>

<template>
  <section class="relative overflow-hidden rounded-card bg-accent text-on-accent p-6 md:p-9">
    <!-- decorative Y mark, cut off by the edges, not clickable -->
    <svg class="absolute -right-6 -top-8 h-[130%] w-auto opacity-20 pointer-events-none" viewBox="0 0 313 349" aria-hidden="true">
      <path fill="#fff" d="M0 56h72l84 125L240 0h73L193 232v117h-76V232z" />
    </svg>
    <div class="relative max-w-[640px]">
      <p v-if="eyebrow" class="text-[14px]">{{ eyebrow }}</p>
      <h2 class="text-[22px] md:text-[28px] font-semibold leading-tight mt-2">{{ title }}</h2>
      <p v-if="text" class="text-[14px] mt-3">{{ text }}</p>
      <div v-if="$slots.default" class="mt-5"><slot /></div>
    </div>
  </section>
</template>

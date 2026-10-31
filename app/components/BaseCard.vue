<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <section class="bg-surface border border-border rounded-card p-5 md:p-7">
    <h2 v-if="title" class="text-[20px] font-medium mb-4">{{ title }}</h2>
    <slot />
  </section>
</template>

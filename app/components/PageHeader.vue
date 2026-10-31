<script setup lang="ts">
defineProps<{ title: string; crumbs?: string; subtitle?: string }>()
</script>

<template>
  <header class="mt-8 mb-6">
    <p v-if="crumbs" class="text-[12px] text-text-2">{{ crumbs }}</p>
    <h1 class="text-[26px] md:text-[34px] font-semibold leading-tight mt-1 break-words">{{ title }}</h1>
    <p v-if="subtitle" class="text-text-2 mt-2">{{ subtitle }}</p>
    <div v-if="$slots.default" class="mt-4"><slot /></div>
  </header>
</template>

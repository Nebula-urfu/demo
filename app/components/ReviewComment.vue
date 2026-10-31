<script setup lang="ts">
defineProps<{ text?: string | null }>()
</script>

<template>
  <div v-if="text" class="rounded-[16px] bg-accent-tint px-4 py-3 text-[14px] mb-4" data-testid="review-comment">
    <p class="text-[12px] text-text-2">Комментарий проверяющего</p>
    <p class="whitespace-pre-line">{{ text }}</p>
  </div>
</template>

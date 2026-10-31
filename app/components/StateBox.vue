<script setup lang="ts">
defineProps<{ kind: 'empty' | 'loading' | 'error'; text: string }>()
</script>

<template>
  <div
    class="rounded-card p-6 text-center"
    :class="kind === 'error' ? 'bg-danger-tint text-danger-ink' : 'bg-surface border border-border text-text-2'"
    :role="kind === 'error' ? 'alert' : 'status'"
  >
    <span v-if="kind === 'loading'" class="inline-block h-3 w-3 mr-2 rounded-full bg-accent animate-pulse align-middle" />
    {{ text }}
    <slot />
  </div>
</template>

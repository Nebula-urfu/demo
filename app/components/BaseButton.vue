<script setup lang="ts">
const props = withDefaults(
  defineProps<{ variant?: 'primary' | 'secondary'; to?: string; loading?: boolean; disabled?: boolean; type?: 'button' | 'submit'; title?: string; full?: boolean }>(),
  { variant: 'primary', type: 'button' },
)
const cls = computed(() => [
  'inline-flex items-center justify-center rounded-full px-6 py-3 text-[16px] transition-opacity',
  props.full ? 'w-full sm:w-auto' : '',
  props.variant === 'primary' ? 'bg-accent text-on-accent' : 'bg-surface text-text border border-border',
  props.disabled || props.loading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 cursor-pointer',
])
</script>

<template>
  <NuxtLink v-if="to && !disabled" :to="to" :class="cls" :title="title">
    <slot />
  </NuxtLink>
  <button v-else :type="type" :class="cls" :disabled="disabled || loading" :title="title">
    <slot />
  </button>
</template>

<script setup lang="ts">
import type { ApiProblem } from '~/composables/useApi'

defineProps<{ problem: ApiProblem | null }>()
defineEmits<{ reload: [] }>()
</script>

<template>
  <div v-if="problem" class="rounded-[16px] bg-danger-tint text-danger-ink px-4 py-3 text-[14px] mb-4" role="alert">
    {{ problem.text }}
    <button v-if="problem.code === 'STALE_VERSION'" class="underline ml-2" @click="$emit('reload')">Обновить</button>
  </div>
</template>

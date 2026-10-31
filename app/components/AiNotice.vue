<script setup lang="ts">
import type { StepState } from '~/types'

defineProps<{ state: StepState; processing: string; busy?: boolean }>()
defineEmits<{ restart: [] }>()
</script>

<template>
  <StateBox v-if="state === 'PROCESSING'" kind="loading" :text="processing" data-testid="ai-processing" />
  <StateBox v-else-if="state === 'AI_FAILED'" kind="error" text="ИИ не справился с этим шагом (ДЕМО: сбой имитирован).">
    <div class="mt-3"><BaseButton :loading="busy" @click="$emit('restart')">Повторить</BaseButton></div>
  </StateBox>
</template>

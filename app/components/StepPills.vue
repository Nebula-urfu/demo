<script setup lang="ts">
import type { StepInfo, StepName } from '~/types'

const props = defineProps<{ steps: StepInfo[]; active: StepName }>()
defineEmits<{ select: [StepName] }>()

const idx = (s: StepName) => STEP_ORDER.indexOf(s)
// a step that has not started stays inactive, except the one right after an approved step (staff can open it and start work)
const open = (s: StepInfo) => s.state !== 'NOT_STARTED' || props.steps[idx(s.step) - 1]?.state === 'APPROVED'
const cls = (s: StepInfo) => {
  if (s.step === props.active) return 'bg-accent text-on-accent'
  if (s.state === 'APPROVED') return 'bg-accent-2-tint text-accent-2-ink'
  if (s.state === 'AI_FAILED' || s.state === 'NEEDS_REWORK') return 'bg-danger-tint text-danger-ink'
  if (!open(s)) return 'bg-surface border border-border text-text-2 cursor-not-allowed'
  return 'bg-surface border border-border text-text'
}
</script>

<template>
  <nav class="scroll-x flex gap-2 flex-nowrap" aria-label="Шаги заявки">
    <button
      v-for="s in steps"
      :key="s.step"
      type="button"
      class="rounded-full px-4 py-1.5 text-[14px] whitespace-nowrap shrink-0"
      :class="cls(s)"
      :disabled="!open(s)"
      :title="STATE_LABEL[s.state]"
      :data-step="s.step"
      :data-state="s.state"
      @click="$emit('select', s.step)"
    >
      {{ idx(s.step) + 1 }}. {{ STEP_LABEL[s.step] }}
    </button>
  </nav>
</template>

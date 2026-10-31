<script setup lang="ts">
import type { RequestStatus, StepState, Urgency } from '~/types'

const props = defineProps<{
  kind: 'step' | 'request' | 'urgency' | 'extraction' | 'approval'
  value: string | null | undefined
}>()

type Tone = 'gray' | 'accent' | 'solid' | 'teal' | 'danger'

const view = computed<{ label: string; tone: Tone }>(() => {
  const v = props.value ?? ''
  if (props.kind === 'step') {
    const tone: Record<StepState, Tone> = {
      NOT_STARTED: 'gray',
      PROCESSING: 'accent',
      DRAFT_READY: 'gray',
      IN_REVIEW: 'accent',
      NEEDS_REWORK: 'danger',
      APPROVED: 'teal',
      AI_FAILED: 'danger',
    }
    return { label: STATE_LABEL[v as StepState] ?? v, tone: tone[v as StepState] ?? 'gray' }
  }
  if (props.kind === 'request') {
    const tone: Record<RequestStatus, Tone> = { ACCEPTED: 'gray', IN_PROGRESS: 'accent', COMPLETED: 'teal' }
    return { label: REQUEST_STATUS_LABEL[v as RequestStatus] ?? v, tone: tone[v as RequestStatus] ?? 'gray' }
  }
  if (props.kind === 'urgency') {
    const u = v as Urgency
    return u === 'EMERGENCY' ? { label: 'Срочно', tone: 'solid' } : { label: 'Плановая', tone: 'gray' }
  }
  if (props.kind === 'extraction') {
    const map: Record<string, { label: string; tone: Tone }> = {
      EXTRACTING: { label: 'Распознаётся', tone: 'accent' },
      EXTRACTED: { label: 'Распознано', tone: 'teal' },
      AI_FAILED: { label: 'Сбой ИИ', tone: 'danger' },
    }
    return map[v] ?? { label: v, tone: 'gray' }
  }
  const map: Record<string, { label: string; tone: Tone }> = {
    PENDING: { label: 'Ждёт', tone: 'accent' },
    APPROVED: { label: 'Утверждено', tone: 'teal' },
    REJECTED: { label: 'Возвращено', tone: 'danger' },
  }
  return map[v] ?? { label: v, tone: 'gray' }
})

const toneClass: Record<Tone, string> = {
  gray: 'bg-surface-2 text-text-2',
  accent: 'bg-accent-tint text-accent-ink',
  solid: 'bg-accent text-on-accent',
  teal: 'bg-accent-2-tint text-accent-2-ink',
  danger: 'bg-danger-tint text-danger-ink',
}
</script>

<template>
  <span class="inline-block rounded-full px-3 py-0.5 text-[12px] whitespace-nowrap" :class="toneClass[view.tone]" :data-state="value">
    {{ view.label }}
  </span>
</template>

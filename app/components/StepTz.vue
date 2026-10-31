<script setup lang="ts">
import type { RequestDetail, TzDocument } from '~/types'

const props = defineProps<{ req: RequestDetail; tick: number }>()
const emit = defineEmits<{ changed: [] }>()
const { api } = useApi()
const { busy, problem, run } = useAction()
const tz = ref<TzDocument | null>(null)
const texts = reactive<Record<string, string>>({})
const answers = reactive<Record<string, string>>({})
const open = reactive<Record<string, boolean>>({})

async function load() {
  tz.value = await api<TzDocument>(`/requests/${props.req.id}/tz`)
  for (const s of tz.value.sections ?? []) texts[s.id] = s.text
  for (const q of tz.value.openQuestions ?? []) answers[q.id] = q.answer ?? ''
}
onMounted(load)
watch(() => props.tick, load)

const state = computed(() => tz.value?.state ?? 'PROCESSING')
const editable = computed(() => state.value === 'DRAFT_READY')
const changedSections = computed(() => (tz.value?.sections ?? []).filter((s) => texts[s.id] !== s.text))
const changedAnswers = computed(() => (tz.value?.openQuestions ?? []).filter((q) => (answers[q.id] ?? '') !== (q.answer ?? '')))
const dirty = computed(() => changedSections.value.length > 0 || changedAnswers.value.length > 0)

const save = () =>
  run(async () => {
    tz.value = await api<TzDocument>(`/requests/${props.req.id}/tz`, {
      method: 'PUT',
      body: {
        baseVersion: tz.value!.version,
        sections: changedSections.value.map((s) => ({ id: s.id, text: texts[s.id] })),
        answers: changedAnswers.value.map((q) => ({ questionId: q.id, answer: answers[q.id] })),
      },
    })
    await load()
    emit('changed')
  })
const submit = () =>
  run(async () => {
    await api(`/requests/${props.req.id}/tz/submit`, { method: 'POST', body: { version: tz.value!.version } })
    await load()
    emit('changed')
  })
const restart = () =>
  run(async () => {
    await api(`/requests/${props.req.id}/steps/TZ/restart`, { method: 'POST' })
    emit('changed')
  })
</script>

<template>
  <div>
    <ProblemAlert :problem="problem" @reload="load" />
    <AiNotice :state="state" processing="ИИ готовит черновик ТЗ…" :busy="busy" @restart="restart" />
    <template v-if="tz && state !== 'PROCESSING' && state !== 'AI_FAILED'">
      <ReviewComment :text="tz.lastReviewComment" />
      <div class="grid gap-4 lg:grid-cols-2 items-start">
        <BaseCard title="Уточняющие вопросы">
          <div v-for="q in tz.openQuestions" :key="q.id" class="mb-4">
            <p class="inline-block rounded-[16px] bg-surface-2 px-4 py-2">{{ q.text }}</p>
            <input
              v-model="answers[q.id]"
              class="field mt-2"
              :disabled="!editable"
              :aria-label="`Ответ: ${q.text}`"
              placeholder="Напишите ответ агенту"
            />
          </div>
          <p v-if="!tz.openQuestions?.length" class="text-text-2">Вопросов нет.</p>
        </BaseCard>
        <BaseCard title="Черновик ТЗ">
          <p class="text-[12px] text-text-2 mb-3">
            Версия {{ tz.version }} · {{ tz.origin === 'AI' ? 'ИИ' : 'сотрудник' }} · {{ formatDate(tz.updatedAt) }}
          </p>
          <details v-for="(s, i) in tz.sections" :key="s.id" class="border-b border-border py-3" :open="open[s.id] ?? i < 2" @toggle="open[s.id] = ($event.target as HTMLDetailsElement).open">
            <summary class="cursor-pointer">
              {{ i + 1 }}. {{ s.title }}
              <span v-if="s.editedByStaff" class="ml-2 rounded-full bg-accent-tint text-accent-ink px-2 py-0.5 text-[11px]">изменено</span>
            </summary>
            <textarea v-if="editable" v-model="texts[s.id]" class="field mt-2 min-h-[90px]" :aria-label="s.title" />
            <p v-else class="text-text-2 mt-2 whitespace-pre-line">{{ s.text }}</p>
          </details>
          <p v-if="state === 'IN_REVIEW'" class="rounded-[16px] bg-accent-tint px-4 py-3 mt-4 text-[14px]">ТЗ ждёт решения проверяющего.</p>
          <p v-else-if="state === 'APPROVED'" class="rounded-[16px] bg-accent-2-tint text-accent-2-ink px-4 py-3 mt-4 text-[14px]">ТЗ утверждено.</p>
          <div v-if="editable" class="flex flex-wrap gap-3 mt-5">
            <BaseButton variant="secondary" :loading="busy" :disabled="!dirty" full @click="save">Сохранить</BaseButton>
            <BaseButton :loading="busy" :disabled="dirty" :title="dirty ? 'Сначала сохраните правки' : undefined" full @click="submit">Отправить на проверку</BaseButton>
          </div>
        </BaseCard>
      </div>
    </template>
  </div>
</template>

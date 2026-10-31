<script setup lang="ts">
import type { RequestDetail, Triage, TriageValues } from '~/types'

const props = defineProps<{ req: RequestDetail; tick: number }>()
const emit = defineEmits<{ changed: [] }>()
const { api } = useApi()
const { busy, problem, run } = useAction()
const triage = ref<Triage | null>(null)
const editing = ref(false)
const draft = reactive<TriageValues>({ urgency: 'PLANNED', workType: '', route: 'PLANNED_PROCUREMENT' })

const ROUTES: Record<string, string> = {
  EMERGENCY_CONTRACTOR_CALL: 'Аварийный вызов подрядчика',
  PLANNED_PROCUREMENT: 'Плановая закупка',
}

async function load() {
  triage.value = await api<Triage>(`/requests/${props.req.id}/triage`)
  const v = triage.value.confirmed ?? triage.value.proposal
  if (v) Object.assign(draft, v)
}
onMounted(load)
watch(() => props.tick, load)

const state = computed(() => triage.value?.state ?? 'PROCESSING')
const canConfirm = computed(() => state.value === 'DRAFT_READY')
const shown = computed(() => (canConfirm.value && editing.value ? draft : (triage.value?.confirmed ?? triage.value?.proposal)))

const confirm = () =>
  run(async () => {
    triage.value = await api<Triage>(`/requests/${props.req.id}/triage/confirm`, { method: 'POST', body: { ...draft } })
    editing.value = false
    emit('changed')
  })
const restart = () =>
  run(async () => {
    await api(`/requests/${props.req.id}/steps/TRIAGE/restart`, { method: 'POST' })
    emit('changed')
  })
</script>

<template>
  <div>
    <ProblemAlert :problem="problem" @reload="load" />
    <AiNotice :state="state" processing="ИИ готовит триаж и черновик ТЗ…" :busy="busy" @restart="restart" />
    <div v-if="state !== 'PROCESSING' && state !== 'AI_FAILED'" class="grid gap-4 lg:grid-cols-2 items-start">
      <BaseCard title="Фото и описание">
        <PhotoGallery :photos="req.photos" class="mb-3 block" />
        <p>{{ req.description }}</p>
        <p class="text-text-2 text-[14px] mt-3">Житель: {{ req.author?.displayName ?? req.author?.userId }} · {{ req.address }}, подъезд {{ req.entrance }}</p>
      </BaseCard>
      <BaseCard title="Вывод агента">
        <dl v-if="shown" class="grid grid-cols-[130px_1fr] gap-y-3 items-center">
          <dt class="text-text-2">Срочность</dt>
          <dd v-if="canConfirm && editing">
            <select v-model="draft.urgency" class="field" aria-label="Срочность">
              <option value="EMERGENCY">Срочно</option>
              <option value="PLANNED">Плановая</option>
            </select>
          </dd>
          <dd v-else><StatusBadge kind="urgency" :value="shown.urgency" /></dd>
          <dt class="text-text-2">Тип работ</dt>
          <dd v-if="canConfirm && editing"><input v-model="draft.workType" class="field" aria-label="Тип работ" /></dd>
          <dd v-else>{{ shown.workType }}</dd>
          <dt class="text-text-2">Маршрут</dt>
          <dd v-if="canConfirm && editing">
            <select v-model="draft.route" class="field" aria-label="Маршрут">
              <option v-for="(label, key) in ROUTES" :key="key" :value="key">{{ label }}</option>
            </select>
          </dd>
          <dd v-else>{{ ROUTES[shown.route] ?? shown.route }}</dd>
        </dl>
        <p class="text-[12px] text-text-2 mt-4">Это черновик ИИ (ДЕМО): решение принимает сотрудник.</p>
        <div v-if="canConfirm" class="flex flex-wrap gap-3 mt-4">
          <BaseButton :loading="busy" full @click="confirm">Подтвердить маршрут</BaseButton>
          <BaseButton variant="secondary" full @click="editing = !editing">{{ editing ? 'Отмена' : 'Изменить' }}</BaseButton>
        </div>
        <p v-else-if="triage?.confirmedBy" class="rounded-[16px] bg-accent-2-tint text-accent-2-ink px-4 py-3 text-[14px] mt-4">
          Подтвердил {{ triage.confirmedBy.displayName ?? triage.confirmedBy.userId }}, {{ formatDate(triage.confirmedAt) }}
        </p>
      </BaseCard>
    </div>
    <p v-if="shown?.urgency === 'EMERGENCY' && state !== 'PROCESSING'" class="rounded-[16px] bg-accent-tint px-5 py-3 mt-4 text-[15px]">
      Аварийная заявка: подрядчик вызван для временного устранения, документы на ремонт готовятся параллельно (ДЕМО).
    </p>
    <p v-else-if="state === 'DRAFT_READY'" class="text-[14px] text-text-2 mt-4">Плановая заявка: после подтверждения переходите к ТЗ.</p>
  </div>
</template>

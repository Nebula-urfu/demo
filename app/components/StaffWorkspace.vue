<script setup lang="ts">
import type { RequestDetail, StepName } from '~/types'

const props = defineProps<{ id: string }>()
const { api } = useApi()
const route = useRoute()
const router = useRouter()
const req = ref<RequestDetail | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const initial = ref<StepName | null>(null) // the step opened first stays open until the user picks another
const tick = ref(0) // increases when a step changes: panels reload their data

let last = ''
async function load() {
  try {
    const r = await api<RequestDetail>(`/requests/${props.id}`)
    const sig = JSON.stringify(r.steps?.map((s) => [s.step, s.state, s.updatedAt]))
    if (sig !== last) tick.value++
    last = sig
    if (!initial.value) initial.value = r.currentStep ?? 'PACKAGE'
    req.value = r
    state.value = 'ready'
  } catch {
    if (state.value === 'loading') state.value = 'error'
  }
}
onMounted(load)
// while any step is in PROCESSING, the page asks for fresh data every second;
// otherwise every third second (so the staff sees the reviewer's decision)
let idle = 0
usePolling(
  load,
  () => state.value === 'ready' && (!!req.value?.steps?.some((s) => s.state === 'PROCESSING') || ++idle % 3 === 0),
  1000,
)

const steps = computed(() => req.value?.steps ?? [])
const active = computed<StepName>(() => {
  const q = route.query.step as StepName | undefined
  if (q && STEP_ORDER.includes(q)) return q
  return initial.value ?? 'TRIAGE'
})
const stateOf = (s: StepName) => steps.value.find((x) => x.step === s)?.state ?? 'NOT_STARTED'
const select = (s: StepName) => router.replace({ query: { ...route.query, step: s } })
const TITLES: Record<StepName, string> = {
  TRIAGE: 'Триаж заявки',
  TZ: 'Техническое задание',
  QUOTES_NMC: 'Коммерческие предложения и НМЦ',
  TENDER: 'Конкурсная документация',
  PACKAGE: 'Пакет документов',
}
const SUBTITLES: Record<StepName, string> = {
  TRIAGE: 'Агент определил срочность и маршрут. Подтвердите или измените.',
  TZ: 'Агент задаёт вопросы и собирает черновик ТЗ.',
  QUOTES_NMC: 'Отправьте запрос подрядчикам, загрузите ответы и рассчитайте НМЦ.',
  TENDER: 'Баллы по критериям из КП. Выберите победителя.',
  PACKAGE: 'Четыре документа закупки.',
}
</script>

<template>
  <div>
    <StateBox v-if="state === 'loading'" kind="loading" text="Загружаем заявку." class="mt-8" />
    <StateBox v-else-if="state === 'error' || !req" kind="error" text="Заявка не найдена или недоступна." class="mt-8" />
    <template v-else>
      <PageHeader :title="TITLES[active]" :crumbs="`Заявка №${shortId(req.id)} / ${STEP_LABEL[active]}`" :subtitle="SUBTITLES[active]">
        <div class="flex flex-wrap items-center gap-2 mb-4 text-[14px]">
          <StatusBadge kind="urgency" :value="req.urgency ?? 'PLANNED'" />
          <StatusBadge kind="request" :value="req.status" />
          <span class="text-text-2">{{ req.address }}, подъезд {{ req.entrance }}</span>
        </div>
        <StepPills :steps="steps" :active="active" @select="select" />
      </PageHeader>

      <StepTriage v-if="active === 'TRIAGE'" :req="req" :tick="tick" @changed="load" />
      <StepTz v-else-if="active === 'TZ'" :req="req" :tick="tick" @changed="load" />
      <StepQuotes v-else-if="active === 'QUOTES_NMC'" :req="req" :tick="tick" :tz-state="stateOf('TZ')" :state="stateOf('QUOTES_NMC')" @changed="load" />
      <StepTender v-else-if="active === 'TENDER'" :req="req" :tick="tick" :state="stateOf('TENDER')" :package-state="stateOf('PACKAGE')" @changed="load" />
      <StepPackage v-else :req="req" :tick="tick" :state="stateOf('PACKAGE')" @changed="load" />
    </template>
  </div>
</template>

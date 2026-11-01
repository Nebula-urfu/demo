<script setup lang="ts">
import type { ProcurementPackage, RequestDetail, StepState } from '~/types'

const props = defineProps<{ req: RequestDetail; tick: number; state: StepState }>()
const emit = defineEmits<{ changed: [] }>()
const { api, downloadPackageZip } = useApi()
const { busy, problem, run } = useAction()
const pkg = ref<ProcurementPackage | null>(null)

async function load() {
  pkg.value = await api<ProcurementPackage>(`/requests/${props.req.id}/package`)
}
onMounted(load)
watch(() => props.tick, load)

const submit = () =>
  run(async () => {
    await api(`/requests/${props.req.id}/package/submit`, { method: 'POST', body: { version: pkg.value!.version } })
    await load()
    emit('changed')
  })
const downloadAll = () =>
  run(async () => {
    await downloadPackageZip(props.req.id, pkg.value?.version)
  })
</script>

<template>
  <div class="space-y-4">
    <ProblemAlert :problem="problem" @reload="load" />
    <StateBox v-if="state === 'NOT_STARTED'" kind="empty" text="Пакет появится после выбора победителя." />
    <template v-else-if="pkg && pkg.documents.length">
      <ReviewComment :text="pkg.lastReviewComment" />
      <p v-if="state === 'APPROVED'" class="rounded-[16px] bg-accent-2-tint text-accent-2-ink px-5 py-3" data-testid="package-approved">
        Пакет утверждён{{ pkg.approvedAt ? `, ${formatDate(pkg.approvedAt)}` : '' }}. Заявка выполнена.
      </p>
      <p v-else-if="state === 'IN_REVIEW'" class="rounded-[16px] bg-accent-tint px-5 py-3">Пакет ждёт решения проверяющего.</p>
      <div class="rounded-card bg-accent text-on-accent p-5 flex flex-wrap items-center justify-between gap-3">
        <p>Пакет документов, версия {{ pkg.version }} (ДЕМО)</p>
        <BaseButton variant="secondary" :loading="busy" full @click="downloadAll">Скачать всё</BaseButton>
      </div>
      <BaseCard><DocList :docs="pkg.documents" /></BaseCard>
      <div v-if="state === 'DRAFT_READY'">
        <BaseButton :loading="busy" full @click="submit">Отправить на проверку</BaseButton>
      </div>
    </template>
  </div>
</template>

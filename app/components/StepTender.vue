<script setup lang="ts">
import type { Quote, RequestDetail, StepState, Tender } from '~/types'

const props = defineProps<{ req: RequestDetail; tick: number; state: StepState; packageState: StepState }>()
const emit = defineEmits<{ changed: [] }>()
const { api } = useApi()
const { busy, problem, run } = useAction()
const tender = ref<Tender | null>(null)
const quotes = ref<Quote[]>([])
const chosen = ref('')
const comment = ref('')

async function load() {
  tender.value = await api<Tender>(`/requests/${props.req.id}/tender`)
  quotes.value = (await api<{ items: Quote[] }>(`/requests/${props.req.id}/quotes`)).items
  chosen.value = tender.value.selectedWinner?.quoteId ?? tender.value.winnerProposal?.quoteId ?? chosen.value
}
onMounted(load)
watch(() => props.tick, load)

const canSelect = computed(
  () => (props.state === 'DRAFT_READY' || props.state === 'NEEDS_REWORK') && props.packageState !== 'IN_REVIEW' && props.packageState !== 'APPROVED',
)
const extracted = computed(() => quotes.value.filter((q) => q.extraction === 'EXTRACTED'))
const score = (quoteId: string, criterion: string) => tender.value?.winnerProposal?.scores?.find((s) => s.quoteId === quoteId && s.criterion === criterion)?.score
const total = (quoteId: string) => (tender.value?.winnerProposal?.scores ?? []).filter((s) => s.quoteId === quoteId).reduce((a, s) => a + s.score, 0)
const fmt = (n?: number) => (n === undefined ? '—' : n.toFixed(1).replace('.', ','))
const pick = () =>
  run(async () => {
    tender.value = await api<Tender>(`/requests/${props.req.id}/tender/winner`, {
      method: 'PUT',
      body: { quoteId: chosen.value, ...(comment.value.trim() ? { comment: comment.value.trim() } : {}) },
    })
    emit('changed')
  })
const restart = () =>
  run(async () => {
    await api(`/requests/${props.req.id}/steps/TENDER/restart`, { method: 'POST' })
    emit('changed')
  })
</script>

<template>
  <div class="space-y-4">
    <ProblemAlert :problem="problem" @reload="load" />
    <AiNotice :state="state" processing="ИИ готовит конкурсную документацию…" :busy="busy" @restart="restart" />
    <StateBox v-if="state === 'NOT_STARTED'" kind="empty" text="Конкурсная документация появится после утверждения НМЦ." />
    <template v-else-if="tender && state !== 'PROCESSING' && state !== 'AI_FAILED'">
      <ReviewComment :text="tender.lastReviewComment" />
      <div class="grid gap-4 lg:grid-cols-2 items-start">
        <BaseCard title="Документы конкурса">
          <DocList :docs="tender.documents ?? []" />
        </BaseCard>
        <BaseCard v-if="tender.winnerProposal" title="Предложение ИИ">
          <p>{{ tender.winnerProposal.rationale }}</p>
          <p class="text-[12px] text-text-2 mt-2">Это черновик: победителя выбирает сотрудник.</p>
        </BaseCard>
      </div>

      <BaseCard title="Выбор победителя">
        <div class="hidden md:block overflow-x-auto rounded-[16px] border border-border">
          <table class="w-full text-left text-[15px]">
            <thead class="bg-surface-2 text-[12px] text-text-2">
              <tr><th class="px-4 py-3 w-10" /><th class="font-normal">Участник</th><th class="font-normal">Цена заявки</th><th class="font-normal">Цена</th><th class="font-normal">Срок</th><th class="font-normal">Гарантия</th><th class="font-normal">Сумма баллов</th></tr>
            </thead>
            <tbody>
              <tr v-for="q in extracted" :key="q.id" class="border-t border-border" :class="chosen === q.id ? 'bg-accent-2-tint' : ''" :data-winner="chosen === q.id">
                <td class="px-4 py-3"><input v-model="chosen" type="radio" name="winner" :value="q.id" :disabled="!canSelect" :aria-label="q.data?.contractorName" /></td>
                <td>{{ q.data?.contractorName }}<span v-if="tender.winnerProposal?.quoteId === q.id" class="ml-2 rounded-full bg-accent-tint text-accent-ink px-2 py-0.5 text-[11px]">предложил ИИ</span></td>
                <td>{{ formatMoney(q.data?.totalPrice) }}</td>
                <td>{{ fmt(score(q.id, 'Цена')) }}</td><td>{{ fmt(score(q.id, 'Срок')) }}</td><td>{{ fmt(score(q.id, 'Гарантия')) }}</td>
                <td>{{ fmt(total(q.id)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="md:hidden space-y-3">
          <label v-for="q in extracted" :key="q.id" class="block rounded-[16px] border border-border p-4" :class="chosen === q.id ? 'bg-accent-2-tint' : ''">
            <input v-model="chosen" type="radio" name="winner-m" :value="q.id" :disabled="!canSelect" class="mr-2" />{{ q.data?.contractorName }}
            <span class="block text-[14px] text-text-2">{{ formatMoney(q.data?.totalPrice) }} · баллы: {{ fmt(total(q.id)) }}</span>
          </label>
        </div>
        <template v-if="canSelect">
          <label class="field-label mt-4" for="winner-comment">Комментарий (желательно, если выбран не тот победитель, которого предложил ИИ)</label>
          <textarea id="winner-comment" v-model="comment" class="field" maxlength="2000" />
          <div class="mt-4"><BaseButton :loading="busy" :disabled="!chosen" full @click="pick">Выбрать</BaseButton></div>
        </template>
        <p v-else class="text-[14px] text-text-2 mt-4">Победитель выбран, пакет отправлен на проверку или утверждён: выбор закрыт.</p>
      </BaseCard>

      <BaseCard v-if="tender.contract" title="Договор">
        <p>
          <span class="rounded-full px-3 py-0.5 text-[12px]" :class="tender.contract.type === 'STANDARD' ? 'bg-accent-2-tint text-accent-2-ink' : 'bg-accent-tint text-accent-ink'">
            {{ tender.contract.type === 'STANDARD' ? 'Типовой договор' : 'Нестандартный договор' }}
          </span>
        </p>
        <DocList v-if="tender.contract.document" :docs="[tender.contract.document]" />
        <div v-if="tender.contract.lawyerNotes?.length" class="mt-3">
          <p class="text-[12px] text-text-2">Замечания юриста</p>
          <ul class="list-disc pl-5"><li v-for="n in tender.contract.lawyerNotes" :key="n">{{ n }}</li></ul>
        </div>
        <p v-if="tender.selectedWinner" class="text-[12px] text-text-2 mt-3">
          Выбрал {{ tender.selectedWinner.selectedBy.displayName ?? tender.selectedWinner.selectedBy.userId }}, {{ formatDate(tender.selectedWinner.selectedAt) }}
          <template v-if="tender.selectedWinner.comment"> · {{ tender.selectedWinner.comment }}</template>
        </p>
        <BaseButton v-if="packageState === 'DRAFT_READY'" :to="`/requests/${req.id}?step=PACKAGE`" class="mt-4" full>К пакету документов</BaseButton>
      </BaseCard>
    </template>
  </div>
</template>

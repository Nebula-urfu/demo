<script setup lang="ts">
import type { ApprovalDetail, Comparison, NmcCalculation, ProcurementPackage, Quote, RequestDetail, StepName, Tender, TzDocument } from '~/types'

definePageMeta({ roles: ['REVIEWER'] })
const { api, downloadPackageZip } = useApi()
const route = useRoute()
const id = String(route.params.id)
const { busy, problem, run } = useAction()
const detail = ref<ApprovalDetail | null>(null)
const req = ref<RequestDetail | null>(null)
const quotes = ref<Quote[]>([])
const comparison = ref<Comparison | null>(null)
const tender = ref<Tender | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const rejecting = ref(false)
const comment = ref('')

async function load() {
  try {
    const d = await api<ApprovalDetail>(`/approvals/${id}`)
    detail.value = d
    req.value = await api<RequestDetail>(`/requests/${d.requestId}`)
    if (d.subjectType === 'NMC') {
      quotes.value = (await api<{ items: Quote[] }>(`/requests/${d.requestId}/quotes`)).items
      comparison.value = await api<Comparison>(`/requests/${d.requestId}/quotes/comparison`)
    }
    if (d.subjectType === 'PACKAGE') tender.value = await api<Tender>(`/requests/${d.requestId}/tender`)
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const TITLE = { TZ: 'Проверка ТЗ', NMC: 'Проверка НМЦ', PACKAGE: 'Проверка пакета' } as const
const STEP_OF = { TZ: 'TZ', NMC: 'QUOTES_NMC', PACKAGE: 'PACKAGE' } as const
const tz = computed(() => detail.value?.subject as TzDocument)
const nmc = computed(() => detail.value?.subject as NmcCalculation)
const pkg = computed(() => detail.value?.subject as ProcurementPackage)
const pending = computed(() => detail.value?.state === 'PENDING')
const FLAG: Record<string, string> = { MISSING: 'Нет позиции', MISMATCH: 'Другая ед. изм.', OUTLIER: 'Цена выше нормы' }

const decide = (kind: 'approve' | 'reject') =>
  run(async () => {
    await api(`/approvals/${id}/${kind}`, {
      method: 'POST',
      body: { subjectVersion: detail.value!.subjectVersion, ...(kind === 'reject' ? { comment: comment.value.trim() } : {}) },
    })
    rejecting.value = false
    await load()
  })
const zip = () => run(() => downloadPackageZip(detail.value!.requestId, detail.value!.subjectVersion))
const noop = (_s: StepName) => {}
</script>

<template>
  <div>
    <StateBox v-if="state === 'loading'" kind="loading" text="Загружаем задачу." class="mt-8" />
    <StateBox v-else-if="state === 'error' || !detail" kind="error" text="Задача не найдена или недоступна." class="mt-8" />
    <template v-else>
      <PageHeader
        :title="TITLE[detail.subjectType]"
        :crumbs="`Очередь / ${SUBJECT_LABEL[detail.subjectType]} · №${shortId(detail.requestId)}`"
        :subtitle="`${req?.description ?? ''}${req ? ', ' + req.address : ''}`"
      >
        <StepPills v-if="req?.steps" :steps="req.steps" :active="STEP_OF[detail.subjectType]" @select="noop" />
      </PageHeader>
      <div class="grid gap-4 lg:grid-cols-[1fr_380px] items-start">
        <div class="space-y-4 min-w-0">
          <BaseCard v-if="detail.subjectType === 'TZ'" title="Техническое задание">
            <p class="text-[12px] text-text-2 mb-2">Версия {{ detail.subjectVersion }} · {{ tz.origin === 'AI' ? 'ИИ' : 'сотрудник' }}</p>
            <ReviewComment :text="tz.lastReviewComment" />
            <div v-for="(s, i) in tz.sections" :key="s.id" class="py-3 border-b border-border last:border-0">
              <p>{{ i + 1 }}. {{ s.title }}</p>
              <p class="text-text-2 whitespace-pre-line">{{ s.text }}</p>
            </div>
            <div v-if="tz.openQuestions?.length" class="mt-4">
              <p class="text-[12px] text-text-2">Ответы сотрудника</p>
              <p v-for="q in tz.openQuestions" :key="q.id" class="text-[14px] mt-1">{{ q.text }} — <b>{{ q.answer || 'нет ответа' }}</b></p>
            </div>
          </BaseCard>

          <template v-else-if="detail.subjectType === 'NMC'">
            <BaseCard title="КП">
              <div class="overflow-x-auto rounded-[16px] border border-border">
                <table class="w-full text-left text-[15px]">
                  <thead class="bg-surface-2 text-[12px] text-text-2"><tr><th class="px-4 py-3 font-normal">Подрядчик</th><th class="font-normal">Цена</th><th class="font-normal">Срок</th><th class="font-normal">Гарантия</th></tr></thead>
                  <tbody>
                    <tr v-for="q in quotes.filter((x) => x.extraction === 'EXTRACTED')" :key="q.id" class="border-t border-border">
                      <td class="px-4 py-3">{{ q.data?.contractorName }}<span v-if="q.editedByStaff" class="ml-2 rounded-full bg-accent-tint text-accent-ink px-2 py-0.5 text-[11px]">изменено</span></td>
                      <td>{{ formatMoney(q.data?.totalPrice) }}</td><td>{{ q.data?.termsDays }} дн.</td><td>{{ q.data?.warranty }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ul v-if="comparison?.rows.length" class="mt-3 text-[14px]">
                <template v-for="r in comparison.rows" :key="r.name">
                  <li v-for="c in r.cells.filter((x) => x.flag !== 'NONE')" :key="r.name + c.quoteId" class="rounded-full bg-danger-tint text-danger-ink px-3 py-0.5 mt-1 inline-block mr-1">
                    {{ FLAG[c.flag] }}: {{ r.name }} ({{ comparison.quotes.find((q) => q.quoteId === c.quoteId)?.contractorName }})
                  </li>
                </template>
              </ul>
            </BaseCard>
            <BaseCard title="Расчёт НМЦ">
              <ReviewComment :text="nmc.lastReviewComment" />
              <p class="font-display text-[30px] text-accent font-semibold">{{ formatMoney(nmc.amount) }}</p>
              <p class="text-[14px] text-text-2 mt-2">{{ nmc.justification }}</p>
              <p class="text-[12px] text-text-2 mt-1">Метод: {{ nmc.method }} · версия {{ nmc.version }}</p>
            </BaseCard>
          </template>

          <template v-else>
            <BaseCard title="Документы пакета">
              <ReviewComment :text="pkg.lastReviewComment" />
              <p class="text-[12px] text-text-2 mb-1">Версия {{ detail.subjectVersion }}</p>
              <DocList :docs="pkg.documents" />
              <div class="mt-3"><BaseButton variant="secondary" :loading="busy" full @click="zip">Скачать всё (zip)</BaseButton></div>
            </BaseCard>
            <BaseCard v-if="tender?.contract" title="Договор">
              <span class="rounded-full px-3 py-0.5 text-[12px]" :class="tender.contract.type === 'STANDARD' ? 'bg-accent-2-tint text-accent-2-ink' : 'bg-accent-tint text-accent-ink'">
                {{ tender.contract.type === 'STANDARD' ? 'Типовой договор' : 'Нестандартный договор' }}
              </span>
              <div v-if="tender.contract.lawyerNotes?.length" class="mt-3">
                <p class="text-[12px] text-text-2">Замечания юриста</p>
                <ul class="list-disc pl-5"><li v-for="n in tender.contract.lawyerNotes" :key="n">{{ n }}</li></ul>
              </div>
            </BaseCard>
          </template>
        </div>

        <div class="space-y-4 lg:sticky lg:top-28">
          <BaseCard title="Решение">
            <p class="text-[14px] text-text-2 mb-3">Отправил {{ detail.submittedBy.displayName ?? detail.submittedBy.userId }}, {{ formatDate(detail.submittedAt) }}</p>
            <ProblemAlert :problem="problem" @reload="load" />
            <template v-if="pending">
              <div v-if="!rejecting" class="flex flex-col sm:flex-row lg:flex-col gap-3">
                <BaseButton :loading="busy" full @click="decide('approve')">Утвердить</BaseButton>
                <BaseButton variant="secondary" full @click="rejecting = true">Вернуть на доработку</BaseButton>
              </div>
              <template v-else>
                <label class="field-label" for="comment">Что исправить</label>
                <textarea id="comment" v-model="comment" class="field min-h-[90px]" maxlength="2000" placeholder="Например: уточните материал и укажите источник" />
                <p class="rounded-[16px] bg-accent-tint px-4 py-3 text-[14px] mt-3">Комментарий обязателен: сотрудник увидит его рядом с документом.</p>
                <div class="flex flex-col sm:flex-row lg:flex-col gap-3 mt-4">
                  <BaseButton :loading="busy" :disabled="!comment.trim()" :title="!comment.trim() ? 'Добавьте комментарий, чтобы вернуть документ' : undefined" full @click="decide('reject')">Отправить на доработку</BaseButton>
                  <BaseButton variant="secondary" full @click="rejecting = false">Отмена</BaseButton>
                </div>
              </template>
            </template>
            <div v-else data-testid="decision">
              <StatusBadge kind="approval" :value="detail.state" />
              <p class="text-[14px] mt-2">{{ detail.decidedBy?.displayName ?? detail.decidedBy?.userId }}, {{ formatDate(detail.decidedAt) }}</p>
              <p v-if="detail.comment" class="text-[14px] text-text-2 mt-1 whitespace-pre-line">{{ detail.comment }}</p>
            </div>
          </BaseCard>
          <BaseCard v-if="detail.previousDecisions?.length" title="Предыдущие решения">
            <ul class="text-[14px]">
              <li v-for="p in detail.previousDecisions" :key="p.id" class="py-2 border-b border-border last:border-0">
                <StatusBadge kind="approval" :value="p.decision" /> версия {{ p.subjectVersion }} · {{ formatDate(p.decidedAt) }}
                <span v-if="p.comment" class="block text-text-2">{{ p.comment }}</span>
              </li>
            </ul>
          </BaseCard>
        </div>
      </div>
    </template>
  </div>
</template>

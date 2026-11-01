<script setup lang="ts">
import type { Comparison, Contractor, FileRef, NmcCalculation, Quote, QuoteRequestDraft, RequestDetail, StepState } from '~/types'

const props = defineProps<{ req: RequestDetail; tick: number; tzState: StepState; state: StepState }>()
const emit = defineEmits<{ changed: [] }>()
const { api } = useApi()
const { busy, problem, run } = useAction()

const contractors = ref<Contractor[]>([])
const selected = ref<string[]>([])
const draft = ref<QuoteRequestDraft | null>(null)
const quotes = ref<Quote[]>([])
const comparison = ref<Comparison | null>(null)
const nmc = ref<NmcCalculation | null>(null)
const files = ref<File[]>([])
const quoteContractor = ref('')
const editing = ref<string | null>(null)
const edit = reactive({ contractorName: '', amount: '', termsDays: '', warranty: '' })

async function load() {
  const id = props.req.id
  quotes.value = (await api<{ items: Quote[] }>(`/requests/${id}/quotes`)).items
  nmc.value = await api<NmcCalculation>(`/requests/${id}/nmc`)
  comparison.value = quotes.value.some((q) => q.extraction === 'EXTRACTED') ? await api<Comparison>(`/requests/${id}/quotes/comparison`) : null
}
onMounted(async () => {
  contractors.value = (await api<{ items: Contractor[] }>('/dev/contractors')).items
  selected.value = contractors.value.map((c) => c.id)
  await load()
})
watch(() => props.tick, load)

const tzApproved = computed(() => props.tzState === 'APPROVED')
const locked = computed(() => props.state === 'IN_REVIEW' || props.state === 'APPROVED')
const canAdd = computed(() => tzApproved.value && !locked.value)
const extracted = computed(() => quotes.value.filter((q) => q.extraction === 'EXTRACTED'))
const canCalc = computed(() => (props.state === 'DRAFT_READY' || props.state === 'NEEDS_REWORK') && extracted.value.length > 0)
const canSubmitNmc = computed(() => props.state === 'DRAFT_READY' && (nmc.value?.version ?? 0) > 0)
const name = (q: Quote) => q.data?.contractorName ?? contractors.value.find((c) => c.id === q.contractorId)?.name ?? 'Распознаётся…'
const FLAG: Record<string, string> = { MISSING: 'Нет позиции', MISMATCH: 'Другая ед. изм.', OUTLIER: 'Цена выше нормы' }
const flagCls = (f: string) => (f === 'NONE' ? '' : f === 'OUTLIER' ? 'bg-accent-tint' : 'bg-danger-tint')
const nice = (d: string) => d.replace('MISSING', 'нет позиции').replace('MISMATCH', 'другая единица измерения').replace('OUTLIER', 'цена выше нормы')
const flagsOf = (quoteId: string) =>
  (comparison.value?.rows ?? []).flatMap((r) => r.cells.filter((c) => c.quoteId === quoteId && c.flag !== 'NONE').map((c) => `${FLAG[c.flag]}: ${r.name}`))

// the input is cleared after reading, so the same file can be chosen again
function pickFiles(e: Event) {
  const input = e.target as HTMLInputElement
  files.value = Array.from(input.files ?? [])
  input.value = ''
}
const toggle = (id: string) => (selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id])
const prepare = () =>
  run(async () => {
    draft.value = await api<QuoteRequestDraft>(`/requests/${props.req.id}/quote-requests`, { method: 'POST', body: { contractorIds: selected.value } })
  })
const addQuote = () =>
  run(async () => {
    const ids: string[] = []
    for (const f of files.value) {
      const ref = await api<FileRef>('/dev/files', { method: 'POST', body: { name: f.name, mediaType: f.type || 'application/octet-stream', sizeBytes: f.size } })
      ids.push(ref.fileId)
    }
    await api(`/requests/${props.req.id}/quotes`, { method: 'POST', body: { fileIds: ids, contractorId: quoteContractor.value || null } })
    files.value = []
    quoteContractor.value = ''
    await load()
    emit('changed')
  })
const remove = (q: Quote) =>
  run(async () => {
    await api(`/requests/${props.req.id}/quotes/${q.id}`, { method: 'DELETE' })
    await load()
    emit('changed')
  })
function startEdit(q: Quote) {
  editing.value = q.id
  edit.contractorName = q.data?.contractorName ?? ''
  edit.amount = q.data?.totalPrice?.amount ?? ''
  edit.termsDays = String(q.data?.termsDays ?? '')
  edit.warranty = q.data?.warranty ?? ''
}
const saveEdit = (q: Quote) =>
  run(async () => {
    if (edit.amount && !/^-?\d+(\.\d{1,2})?$/.test(edit.amount)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Цена должна быть числом, например 58750.00')
    await api(`/requests/${props.req.id}/quotes/${q.id}/data`, {
      method: 'PUT',
      body: {
        baseVersion: q.version,
        data: {
          ...q.data,
          contractorName: edit.contractorName,
          totalPrice: edit.amount ? { amount: edit.amount, currency: 'RUB' } : undefined,
          termsDays: edit.termsDays ? Number(edit.termsDays) : undefined,
          warranty: edit.warranty,
        },
      },
    })
    editing.value = null
    await load()
  })
const calculate = () =>
  run(async () => {
    nmc.value = await api<NmcCalculation>(`/requests/${props.req.id}/nmc/calculate`, { method: 'POST', body: {} })
    emit('changed')
  })
const submit = () =>
  run(async () => {
    await api(`/requests/${props.req.id}/nmc/submit`, { method: 'POST', body: { version: nmc.value!.version } })
    await load()
    emit('changed')
  })
const restart = () =>
  run(async () => {
    await api(`/requests/${props.req.id}/steps/QUOTES_NMC/restart`, { method: 'POST' })
    emit('changed')
  })
</script>

<template>
  <div class="space-y-4">
    <ProblemAlert :problem="problem" @reload="load" />
    <AiNotice :state="state" processing="ИИ распознаёт КП…" :busy="busy" @restart="restart" />
    <p v-if="!tzApproved" class="rounded-[16px] bg-accent-tint px-5 py-3">Сначала нужно утвердить ТЗ: запрос КП станет доступен после решения проверяющего.</p>

    <div class="grid gap-4 lg:grid-cols-2 items-start">
      <BaseCard title="Кому отправить">
        <ul class="max-h-[320px] overflow-y-auto">
          <li v-for="c in contractors" :key="c.id" class="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0">
            <div class="min-w-0">
              <p class="break-words">{{ c.name }}</p>
              <p class="text-[14px] text-text-2">{{ c.email }}</p>
            </div>
            <button
              type="button"
              class="rounded-full px-3 py-0.5 text-[12px] shrink-0"
              :class="selected.includes(c.id) ? 'bg-accent-tint text-accent-ink' : 'bg-surface-2 text-text-2'"
              :aria-pressed="selected.includes(c.id)"
              @click="toggle(c.id)"
            >
              {{ selected.includes(c.id) ? 'Выбран' : 'Не выбран' }}
            </button>
          </li>
        </ul>
        <p class="rounded-[16px] bg-accent-tint px-4 py-3 text-[14px] mt-4">В письмо автоматически вложены ТЗ и форма КП. Письмо не отправляется (демо).</p>
        <div class="mt-4">
          <BaseButton :loading="busy" :disabled="!tzApproved || !selected.length" :title="!tzApproved ? 'Сначала нужно утвердить ТЗ' : undefined" full @click="prepare">Подготовить письмо</BaseButton>
        </div>
        <div v-if="draft" class="mt-5 rounded-[16px] border border-border p-4 text-[14px]" data-testid="letter">
          <p class="text-text-2">Кому: {{ draft.recipients.map((r) => r.name).join(', ') }}</p>
          <p class="mt-1"><b>Тема:</b> {{ draft.subject }}</p>
          <p class="mt-2 whitespace-pre-line">{{ draft.body }}</p>
          <ul class="mt-2 text-text-2"><li v-for="a in draft.attachments" :key="a.fileId">Вложение: {{ a.name }}</li></ul>
        </div>
      </BaseCard>

      <BaseCard title="Полученные КП">
        <div v-if="canAdd" class="rounded-[20px] border-2 border-dashed border-accent bg-accent-tint p-5">
          <label class="block text-accent-ink text-center cursor-pointer">
            + Загрузите КП подрядчиков
            <span class="block text-[14px] text-text-2">Файл не читается: в демо важны только имя и размер</span>
            <input type="file" multiple class="sr-only" data-testid="quote-files" @change="pickFiles" />
          </label>
          <p v-if="files.length" class="text-[14px] mt-2 text-center">{{ files.map((f) => f.name).join(', ') }}</p>
          <select v-model="quoteContractor" class="field mt-3" aria-label="Подрядчик (необязательно)">
            <option value="">Подрядчик: определить автоматически</option>
            <option v-for="c in contractors" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <div class="mt-3 text-center"><BaseButton :loading="busy" :disabled="!files.length" @click="addQuote">Добавить КП</BaseButton></div>
        </div>
        <p v-else-if="locked" class="text-text-2 text-[14px]">Приём КП закрыт: расчёт НМЦ на проверке или утверждён.</p>
        <StateBox v-if="!quotes.length" kind="empty" text="КП пока нет." class="mt-4" />
        <ul class="mt-2">
          <li v-for="q in quotes" :key="q.id" class="py-3 border-b border-border last:border-0" data-testid="quote">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="break-words">{{ name(q) }} <span v-if="q.editedByStaff" class="ml-1 rounded-full bg-accent-tint text-accent-ink px-2 py-0.5 text-[11px]">изменено</span></p>
                <p class="text-[14px] text-text-2 break-words">{{ q.files.map((f) => f.name).join(', ') }}</p>
                <p v-if="q.data" class="text-[14px] mt-1">{{ formatMoney(q.data.totalPrice) }} · {{ q.data.termsDays }} дн. · {{ q.data.warranty }}</p>
              </div>
              <StatusBadge kind="extraction" :value="q.extraction" />
            </div>
            <div v-if="editing === q.id" class="mt-3 grid gap-2 sm:grid-cols-2">
              <input v-model="edit.contractorName" class="field" aria-label="Подрядчик" placeholder="Подрядчик" />
              <input v-model="edit.amount" class="field" aria-label="Итоговая цена" placeholder="Итого, например 58750.00" inputmode="decimal" />
              <input v-model="edit.termsDays" class="field" aria-label="Срок, дней" placeholder="Срок, дней" inputmode="numeric" />
              <input v-model="edit.warranty" class="field" aria-label="Гарантия" placeholder="Гарантия" />
              <div class="sm:col-span-2 flex gap-2">
                <BaseButton :loading="busy" @click="saveEdit(q)">Сохранить</BaseButton>
                <BaseButton variant="secondary" @click="editing = null">Отмена</BaseButton>
              </div>
            </div>
            <div v-else-if="!locked" class="mt-2 flex gap-4 text-[14px]">
              <button v-if="q.extraction === 'EXTRACTED'" type="button" class="text-accent-ink" @click="startEdit(q)">Править данные</button>
              <button type="button" class="text-danger-ink" @click="remove(q)">Удалить</button>
            </div>
          </li>
        </ul>
      </BaseCard>
    </div>

    <BaseCard v-if="comparison && comparison.quotes.length" title="Сравнение КП">
      <p class="text-[14px] text-text-2 mb-3">Предложения приведены к одному виду. Расхождения подсвечены.</p>
      <div class="hidden md:block overflow-x-auto rounded-[16px] border border-border">
        <table class="w-full text-left text-[15px]">
          <thead class="bg-surface-2 text-[12px] text-text-2">
            <tr>
              <th class="px-4 py-3 font-normal">Позиция</th>
              <th v-for="q in comparison.quotes" :key="q.quoteId" class="px-4 font-normal">{{ q.contractorName }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in comparison.rows" :key="r.name" class="border-t border-border">
              <td class="px-4 py-3">{{ r.name }}<span class="block text-[12px] text-text-2">{{ r.quantity }} {{ r.unit }}</span></td>
              <td v-for="c in r.cells" :key="c.quoteId" class="px-4 py-3" :class="flagCls(c.flag)" :data-flag="c.flag">
                {{ c.unitPrice ? formatMoney(c.unitPrice) : '—' }}
                <span v-if="c.flag !== 'NONE'" class="block text-[12px] text-danger-ink" :title="c.note">{{ FLAG[c.flag] }}</span>
              </td>
            </tr>
            <tr class="border-t border-border bg-bg">
              <td class="px-4 py-3">Итого</td>
              <td v-for="q in comparison.quotes" :key="q.quoteId" class="px-4 py-3">
                {{ formatMoney(q.totalPrice) }}<span class="block text-[12px] text-text-2">{{ q.termsDays }} дн. · {{ q.warranty }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="md:hidden space-y-3">
        <div v-for="q in comparison.quotes" :key="q.quoteId" class="rounded-[16px] border border-border p-4">
          <p class="font-medium">{{ q.contractorName }}</p>
          <p class="text-[14px] text-text-2">{{ formatMoney(q.totalPrice) }} · {{ q.termsDays }} дн. · {{ q.warranty }}</p>
          <ul class="mt-2 text-[14px]">
            <li v-for="f in flagsOf(q.quoteId)" :key="f" class="rounded-full bg-danger-tint text-danger-ink px-3 py-0.5 mt-1 inline-block mr-1">{{ f }}</li>
          </ul>
        </div>
      </div>
    </BaseCard>

    <div v-if="comparison" class="grid gap-4 lg:grid-cols-2 items-start">
      <BaseCard title="Начальная максимальная цена">
        <template v-if="nmc && nmc.version > 0">
          <ReviewComment :text="nmc.lastReviewComment" />
          <p class="font-display text-[34px] text-accent font-semibold" data-testid="nmc-amount">{{ formatMoney(nmc.amount) }}</p>
          <p class="text-[14px] text-text-2 mt-2">{{ nmc.justification }}</p>
          <p class="text-[12px] text-text-2 mt-1">Метод: {{ nmc.method }} · версия {{ nmc.version }} · {{ formatDate(nmc.calculatedAt) }}</p>
        </template>
        <p v-else class="text-text-2">Расчёта ещё нет. Цены ДЕМО: настоящих цен в прототипе нет.</p>
        <p v-if="state === 'IN_REVIEW'" class="rounded-[16px] bg-accent-tint px-4 py-3 text-[14px] mt-4">Расчёт НМЦ ждёт решения проверяющего.</p>
        <p v-else-if="state === 'APPROVED'" class="rounded-[16px] bg-accent-2-tint text-accent-2-ink px-4 py-3 text-[14px] mt-4">Расчёт НМЦ утверждён.</p>
        <div class="flex flex-wrap gap-3 mt-5">
          <BaseButton :variant="canSubmitNmc ? 'secondary' : 'primary'" :loading="busy" :disabled="!canCalc" full @click="calculate">Рассчитать</BaseButton>
          <BaseButton :loading="busy" :disabled="!canSubmitNmc" :title="!canSubmitNmc ? 'Сначала рассчитайте НМЦ' : undefined" full @click="submit">Отправить на проверку</BaseButton>
        </div>
      </BaseCard>
      <BaseCard title="Что проверить">
        <ul v-if="comparison.discrepancies?.length">
          <li v-for="d in comparison.discrepancies" :key="d" class="py-3 border-b border-border last:border-0 text-[15px]">{{ nice(d) }}</li>
        </ul>
        <p v-else class="text-text-2">Расхождений не найдено.</p>
      </BaseCard>
    </div>
  </div>
</template>

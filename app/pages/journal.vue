<script setup lang="ts">
import type { JournalEntry, Page, SubjectType } from '~/types'

definePageMeta({ roles: ['REVIEWER'] })
const { api } = useApi()
const items = ref<JournalEntry[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const type = ref<SubjectType | ''>('')

async function load() {
  state.value = 'loading'
  try {
    items.value = (await api<Page<JournalEntry>>('/approval-journal', { query: { limit: 100, subjectType: type.value || undefined } })).items
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)
watch(type, load)
const filters: { id: SubjectType | ''; label: string }[] = [
  { id: '', label: 'Все' },
  { id: 'TZ', label: 'ТЗ' },
  { id: 'NMC', label: 'НМЦ' },
  { id: 'PACKAGE', label: 'Пакет' },
]
</script>

<template>
  <div>
    <PageHeader title="Журнал согласований" crumbs="Проверяющий / Журнал" subtitle="Записи только добавляются: изменить или удалить решение нельзя." />
    <div class="scroll-x flex gap-2 flex-nowrap mb-4">
      <button
        v-for="f in filters"
        :key="f.id"
        type="button"
        class="rounded-full px-5 py-2 text-[15px] shrink-0 border"
        :class="type === f.id ? 'bg-accent text-on-accent border-accent' : 'bg-transparent text-text border-text/70'"
        @click="type = f.id"
      >
        {{ f.label }}
      </button>
    </div>
    <StateBox v-if="state === 'loading'" kind="loading" text="Загружаем журнал." />
    <StateBox v-else-if="state === 'error'" kind="error" text="Не удалось загрузить журнал." />
    <StateBox v-else-if="!items.length" kind="empty" text="В журнале пока нет записей." />
    <template v-else>
      <div class="hidden md:block bg-surface border border-border rounded-card overflow-auto max-h-[70vh]">
        <table class="w-full text-left">
          <thead class="bg-surface-2 text-[12px] text-text-2 sticky top-0">
            <tr><th class="px-6 py-3 font-normal">Время</th><th class="font-normal">Заявка</th><th class="font-normal">Тип</th><th class="font-normal">Версия</th><th class="font-normal">Решение</th><th class="font-normal">Кто решил</th><th class="font-normal">Комментарий</th></tr>
          </thead>
          <tbody>
            <tr v-for="j in items" :key="j.id" class="border-t border-border align-top">
              <td class="px-6 py-3 whitespace-nowrap">{{ formatDate(j.decidedAt) }}</td>
              <td>№{{ shortId(j.requestId) }}</td>
              <td>{{ SUBJECT_LABEL[j.subjectType] }}</td>
              <td>{{ j.subjectVersion }}</td>
              <td><StatusBadge kind="approval" :value="j.decision" /></td>
              <td>{{ j.decidedBy.displayName ?? j.decidedBy.userId }}</td>
              <td class="pr-4 text-text-2">{{ j.comment || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="md:hidden space-y-3">
        <div v-for="j in items" :key="j.id" class="bg-surface border border-border rounded-card p-4">
          <div class="flex items-center justify-between gap-2"><span>{{ SUBJECT_LABEL[j.subjectType] }} · №{{ shortId(j.requestId) }} · v{{ j.subjectVersion }}</span><StatusBadge kind="approval" :value="j.decision" /></div>
          <p class="text-[14px] text-text-2">{{ formatDate(j.decidedAt) }} · {{ j.decidedBy.displayName ?? j.decidedBy.userId }}</p>
          <p v-if="j.comment" class="text-[14px] mt-1">{{ j.comment }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

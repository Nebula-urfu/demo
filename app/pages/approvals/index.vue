<script setup lang="ts">
import type { Approval, Page } from '~/types'

definePageMeta({ roles: ['REVIEWER'] })
const { api } = useApi()
const { profile } = useSession()
const items = ref<Approval[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const filter = ref<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING')
const shownCount = ref(10)

async function load() {
  try {
    items.value = (await api<Page<Approval>>('/approvals', { query: { limit: 100 } })).items
    state.value = 'ready'
  } catch {
    if (state.value === 'loading') state.value = 'error'
  }
}
onMounted(load)
usePolling(load, () => state.value === 'ready', 2000)

const pending = computed(() => items.value.filter((a) => a.state === 'PENDING'))
const urgent = computed(() => pending.value.filter((a) => a.urgency === 'EMERGENCY'))
const decided = computed(() => items.value.filter((a) => a.state === 'APPROVED'))
const filtered = computed(() => items.value.filter((a) => filter.value === 'ALL' || a.state === filter.value))
const visible = computed(() => filtered.value.slice(0, shownCount.value))
const filters = [
  { id: 'PENDING', label: 'Ждут решения' },
  { id: 'APPROVED', label: 'Утверждено' },
  { id: 'REJECTED', label: 'Возвращено' },
  { id: 'ALL', label: 'Все' },
] as const
const first = computed(() => urgent.value[0] ?? pending.value[0])
const tiles = computed(() => [
  { n: pending.value.length, tag: 'ждут решения', text: 'Задачи на проверку' },
  { n: urgent.value.length, tag: 'срочные', text: 'Аварийные заявки' },
  { n: decided.value.length, tag: 'утверждено', text: 'Утверждено документов' },
])
</script>

<template>
  <div>
    <PageHeader title="Очередь на проверку" crumbs="Проверяющий / Очередь" />
    <StateBox v-if="state === 'loading'" kind="loading" text="Загружаем очередь." />
    <StateBox v-else-if="state === 'error'" kind="error" text="Не удалось загрузить очередь.">
      <button class="underline ml-2" @click="load">Повторить</button>
    </StateBox>
    <template v-else>
      <YBanner
        :eyebrow="`Здравствуйте, ${profile?.displayName}`"
        :title="pending.length ? `${pending.length} ${plural(pending.length, 'задача ждёт', 'задачи ждут', 'задач ждут')} вашего решения` : 'Задач на проверку нет'"
        :text="urgent.length ? `Срочных: ${urgent.length}.` : undefined"
      >
        <BaseButton v-if="first" variant="secondary" :to="`/approvals/${first.id}`">Начать проверку</BaseButton>
      </YBanner>
      <div class="grid gap-4 md:grid-cols-3 mt-4">
        <BaseCard v-for="t in tiles" :key="t.tag">
          <p class="flex items-start gap-2 flex-wrap"><span class="font-display text-[44px] font-semibold leading-none">{{ t.n }}</span><span class="text-[12px] text-text-2">[{{ t.tag }}]</span></p>
          <p class="text-text-2 mt-3">{{ t.text }}</p>
        </BaseCard>
      </div>
      <div class="scroll-x flex gap-2 flex-nowrap mt-6 mb-4">
        <button
          v-for="f in filters"
          :key="f.id"
          type="button"
          class="rounded-full px-5 py-2 text-[15px] shrink-0 border"
          :class="filter === f.id ? 'bg-accent text-on-accent border-accent' : 'bg-transparent text-text border-text/70'"
          @click="filter = f.id"
        >
          {{ f.label }}
        </button>
      </div>
      <StateBox v-if="!filtered.length" kind="empty" text="Задач на проверку нет." />
      <BaseCard v-else>
        <ul>
          <li v-for="a in visible" :key="a.id" class="border-b border-border last:border-0">
            <NuxtLink :to="`/approvals/${a.id}`" class="flex items-center justify-between gap-3 py-4">
              <div class="min-w-0">
                <p>{{ SUBJECT_LABEL[a.subjectType] }} · заявка №{{ shortId(a.requestId) }} <span class="text-[12px] text-text-2">версия {{ a.subjectVersion }}</span></p>
                <p class="text-[14px] text-text-2 break-words">{{ a.address }} · отправил {{ a.submittedBy.displayName ?? a.submittedBy.userId }}, {{ formatDate(a.submittedAt) }}</p>
              </div>
              <span class="flex gap-2 shrink-0">
                <StatusBadge v-if="a.urgency === 'EMERGENCY' && a.state === 'PENDING'" kind="urgency" value="EMERGENCY" />
                <StatusBadge kind="approval" :value="a.state" />
              </span>
            </NuxtLink>
          </li>
        </ul>
        <div class="flex flex-wrap items-center justify-between gap-3 mt-4 text-[14px] text-text-2">
          <span>Показаны {{ visible.length }} из {{ filtered.length }}</span>
          <BaseButton v-if="visible.length < filtered.length" variant="secondary" @click="shownCount += 10">Показать ещё</BaseButton>
        </div>
      </BaseCard>
    </template>
  </div>
</template>

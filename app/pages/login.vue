<script setup lang="ts">
import { QUICK_LOGINS } from '~/utils/nav'

definePageMeta({ layout: 'blank' })
const { login } = useSession()
const form = reactive({ username: '', password: '', role: '', orgId: '', address: '' })
const busy = ref(false)
const failed = ref('')

async function enter(body: Record<string, string | undefined>) {
  busy.value = true
  failed.value = ''
  try {
    // the password is never sent: nothing is checked in the demo
    const p = await login(body)
    await navigateTo(p.role === 'REVIEWER' ? '/approvals' : '/requests')
  } catch {
    failed.value = 'Не удалось войти. Попробуйте ещё раз.'
  } finally {
    busy.value = false
  }
}

const submit = () =>
  enter({ username: form.username, role: form.role || undefined, orgId: form.orgId || undefined, address: form.address || undefined })
</script>

<template>
  <div class="text-center mb-8"><YLogo /></div>
  <BaseCard>
    <h1 class="text-[24px] font-semibold mb-1">Вход</h1>
    <p class="text-text-2 text-[14px] mb-5">Демо: подойдёт любой логин и пароль</p>
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="field-label" for="username">Имя</label>
        <input id="username" v-model="form.username" class="field" autocomplete="off" />
      </div>
      <div>
        <label class="field-label" for="password">Пароль</label>
        <input id="password" v-model="form.password" type="password" class="field" autocomplete="off" />
      </div>
      <div>
        <label class="field-label" for="role">Роль</label>
        <select id="role" v-model="form.role" class="field">
          <option value="">Определить по имени</option>
          <option value="RESIDENT">Житель</option>
          <option value="STAFF">Сотрудник</option>
          <option value="REVIEWER">Проверяющий</option>
        </select>
      </div>
      <details class="text-[14px]">
        <summary class="cursor-pointer text-accent-ink">Дополнительно</summary>
        <div class="space-y-4 mt-3">
          <div>
            <label class="field-label" for="orgId">Организация</label>
            <input id="orgId" v-model="form.orgId" class="field" placeholder="demo-org" />
          </div>
          <div>
            <label class="field-label" for="address">Адрес</label>
            <input id="address" v-model="form.address" class="field" placeholder="ул. Демонстрационная, д. 1 (ДЕМО)" />
          </div>
        </div>
      </details>
      <p v-if="failed" class="text-danger-ink text-[14px]" role="alert">{{ failed }}</p>
      <BaseButton type="submit" :loading="busy" full>Войти</BaseButton>
    </form>
  </BaseCard>
  <div class="mt-5 flex flex-col gap-2">
    <BaseButton
      v-for="q in QUICK_LOGINS"
      :key="q.role"
      variant="secondary"
      :loading="busy"
      full
      @click="enter({ username: q.username, displayName: q.displayName, role: q.role })"
    >
      {{ q.label }}
    </BaseButton>
  </div>
</template>

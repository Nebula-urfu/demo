<script setup lang="ts">
import { ROLE_LABEL } from '~/utils/format'
import { NAV, QUICK_LOGINS } from '~/utils/nav'

const { profile, login, logout } = useSession()
const route = useRoute()
const menu = ref(false)
const links = computed(() => (profile.value ? NAV[profile.value.role] : []))
const isActive = (to: string) => (to === '/requests' ? route.path === '/requests' || /^\/requests\/(?!new)/.test(route.path) : route.path.startsWith(to))

async function switchRole(q: (typeof QUICK_LOGINS)[number]) {
  menu.value = false
  const p = await login({ username: q.username, displayName: q.displayName, role: q.role, orgId: profile.value?.orgId })
  await navigateTo(p.role === 'REVIEWER' ? '/approvals' : '/requests')
}

async function exit() {
  menu.value = false
  logout()
  await navigateTo('/login')
}
</script>

<template>
  <header class="sticky top-[34px] z-40 px-4 md:px-8 pt-3">
    <div class="mx-auto max-w-[1280px] bg-surface border border-border rounded-full flex items-center justify-between gap-3 px-4 md:px-7 py-2.5">
      <NuxtLink :to="profile?.role === 'REVIEWER' ? '/approvals' : '/requests'"><YLogo /></NuxtLink>
      <nav class="hidden md:flex items-center gap-1" aria-label="Основная навигация">
        <NuxtLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="rounded-full px-4 py-2 text-[15px]"
          :class="isActive(l.to) ? 'bg-accent text-on-accent' : 'text-text hover:bg-bg'"
        >
          {{ l.label }}
        </NuxtLink>
        <NuxtLink to="/dev" class="rounded-full px-3 py-2 text-[13px]" :class="route.path === '/dev' ? 'bg-accent text-on-accent' : 'text-text-2 hover:bg-bg'">
          Демо-панель
        </NuxtLink>
      </nav>
      <div class="relative">
        <button
          type="button"
          class="flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-[14px]"
          :aria-expanded="menu"
          @click="menu = !menu"
        >
          <span class="max-w-[140px] truncate">{{ profile ? ROLE_LABEL[profile.role] : '' }}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
        </button>
        <div v-if="menu" class="absolute right-0 mt-2 w-64 bg-surface border border-border rounded-[20px] p-2 shadow-sm z-50">
          <p class="px-3 py-2 text-[12px] text-text-2 truncate">{{ profile?.displayName }} · {{ profile?.orgId }}</p>
          <button
            v-for="q in QUICK_LOGINS"
            :key="q.role"
            type="button"
            class="block w-full text-left rounded-[14px] px-3 py-2 text-[14px] hover:bg-bg"
            :class="profile?.role === q.role ? 'text-accent-ink' : ''"
            @click="switchRole(q)"
          >
            {{ ROLE_LABEL[q.role] }}
          </button>
          <button type="button" class="block w-full text-left rounded-[14px] px-3 py-2 text-[14px] text-text-2 hover:bg-bg" @click="exit">Выйти</button>
        </div>
      </div>
    </div>
  </header>
  <!-- mobile bottom navigation -->
  <nav class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-border flex justify-around px-2 py-2" aria-label="Навигация">
    <NuxtLink
      v-for="l in links"
      :key="l.to"
      :to="l.to"
      class="flex-1 text-center rounded-full py-2 text-[13px] mx-1"
      :class="isActive(l.to) ? 'bg-accent text-on-accent' : 'text-text-2'"
    >
      {{ l.label }}
    </NuxtLink>
    <NuxtLink to="/dev" class="flex-1 text-center rounded-full py-2 text-[13px] mx-1" :class="route.path === '/dev' ? 'bg-accent text-on-accent' : 'text-text-2'">
      Демо-панель
    </NuxtLink>
  </nav>
</template>

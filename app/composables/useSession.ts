import type { Profile } from '~/types'

/** Opaque demo token in cookie `demo_token`; profile (role, name, org) in `demo_profile`. */
export function useSession() {
  const token = useCookie<string | null>('demo_token', { default: () => null, sameSite: 'strict' })
  const profile = useCookie<Profile | null>('demo_profile', { default: () => null, sameSite: 'strict' })

  async function login(body: Record<string, string | undefined>) {
    const res = await $fetch<Profile & { token: string }>('/api/v1/dev/login', { method: 'POST', body })
    token.value = res.token
    profile.value = {
      userId: res.userId,
      displayName: res.displayName,
      role: res.role,
      orgId: res.orgId,
      address: res.address,
    }
    return profile.value
  }

  function logout() {
    token.value = null
    profile.value = null
  }

  const homePath = computed(() => (profile.value?.role === 'REVIEWER' ? '/approvals' : '/requests'))

  return { token, profile, login, logout, homePath, isLoggedIn: computed(() => !!token.value && !!profile.value) }
}

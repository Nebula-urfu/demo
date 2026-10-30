import type { Role } from '~/types'

/** No token: to /login. Page of another role: the 403 screen. */
export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/login') return
  const { token, profile } = useSession()
  if (!token.value || !profile.value) return navigateTo('/login')
  const roles = to.meta.roles as Role[] | undefined
  if (roles && !roles.includes(profile.value.role)) {
    return abortNavigation(createError({ statusCode: 403, statusMessage: 'Недоступно для вашей роли' }))
  }
})

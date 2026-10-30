import type { Role } from '~/types'

export const NAV: Record<Role, { to: string; label: string }[]> = {
  RESIDENT: [
    { to: '/requests', label: 'Мои заявки' },
    { to: '/requests/new', label: 'Новая заявка' },
  ],
  STAFF: [{ to: '/requests', label: 'Входящие' }],
  REVIEWER: [
    { to: '/approvals', label: 'Очередь на проверку' },
    { to: '/journal', label: 'Журнал согласований' },
  ],
}

/** Presets for the quick login buttons and the role switcher. */
export const QUICK_LOGINS: { role: Role; label: string; username: string; displayName: string }[] = [
  { role: 'RESIDENT', label: 'Войти как житель', username: 'anna', displayName: 'Анна' },
  { role: 'STAFF', label: 'Войти как сотрудник', username: 'staff-ivan', displayName: 'Иван' },
  { role: 'REVIEWER', label: 'Войти как проверяющий', username: 'reviewer-maria', displayName: 'Мария' },
]

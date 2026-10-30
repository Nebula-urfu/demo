import { ApiProblem } from '~/composables/useApi'

/** Wraps button handlers: busy flag + the last problem+json error. */
export function useAction() {
  const busy = ref(false)
  const problem = ref<ApiProblem | null>(null)

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    busy.value = true
    problem.value = null
    try {
      return await fn()
    } catch (e) {
      problem.value = e instanceof ApiProblem ? e : new ApiProblem(0, 'ERROR', 'Не удалось выполнить действие')
      return undefined
    } finally {
      busy.value = false
    }
  }

  return { busy, problem, run }
}

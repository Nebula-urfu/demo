export type ProblemCode =
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STEP_NOT_ALLOWED'
  | 'STALE_VERSION'
  | 'UNAUTHORIZED'

export interface FieldError {
  field: string
  message: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ProblemCode,
    public title: string,
    public detail?: string,
    public errors?: FieldError[],
  ) {
    super(detail || title)
  }

  toProblem() {
    return {
      type: 'about:blank',
      title: this.title,
      status: this.status,
      detail: this.detail,
      code: this.code,
      ...(this.errors ? { errors: this.errors } : {}),
    }
  }
}

export const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Требуется вход', 'Нет или неизвестный токен')
export const forbidden = () => new ApiError(403, 'FORBIDDEN', 'Недоступно для вашей роли')
export const notFound = (what = 'Объект') => new ApiError(404, 'NOT_FOUND', 'Не найдено', `${what} не найден`)
export const stepNotAllowed = (detail = 'Действие сейчас недоступно') =>
  new ApiError(409, 'STEP_NOT_ALLOWED', 'Действие сейчас недоступно', detail)
export const staleVersion = () =>
  new ApiError(409, 'STALE_VERSION', 'Версия устарела', 'Данные изменились, обновите страницу')
export const validation = (errors: FieldError[], detail = 'Ошибка в запросе') =>
  new ApiError(400, 'VALIDATION_ERROR', 'Ошибка в запросе', detail, errors)

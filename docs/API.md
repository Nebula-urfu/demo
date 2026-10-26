# API: поведение прототипа

Контракт: `contract/core-api.openapi.yaml` (источник истины для путей, схем и перечислений). Этот документ описывает **поведение**: предусловия, эффекты, мок-детали и автомат состояний. Если здесь и в OpenAPI разные имена, прав OpenAPI.

## 1. Общие правила

- База пути `/api/v1`. Ответы `application/json`, ошибки `application/problem+json` по схеме `Problem` из OpenAPI.
- Авторизация: заголовок `Authorization: Bearer <токен>` из `POST /api/v1/dev/login`. Нет или неизвестный токен: `401` (`code = UNAUTHORIZED`).
- Роли: `RESIDENT`, `STAFF`, `REVIEWER`. Роль не подходит операции (`x-roles` в OpenAPI): `403` (`code = FORBIDDEN`).
- Организация (`org_id`) берётся из сессии. Любой запрос к базе фильтруется по ней. Объект другой организации и объект, которого нет: `404` (`code = NOT_FOUND`).
- Жителю видны только его заявки (`author_user_id` = его `userId`), чужая заявка того же УК для него `404`.
- `400` (`code = VALIDATION_ERROR`): невалидное тело или параметры. В `errors` перечислены поля.
- `409` с двумя кодами: `STEP_NOT_ALLOWED` (действие недопустимо в текущем состоянии) и `STALE_VERSION` (версия в теле не текущая).
- Идентификаторы: UUID в строках. Время: ISO 8601 в UTC.
- Пагинация: `limit` (1..100, по умолчанию 25) и `cursor`. Курсор это строка с числовым смещением, `nextCursor` равен `null` на последней странице.
- Деньги: строка с десятичным числом и валюта (`RUB`), см. схему `Money`.
- Все ответы содержат заголовок `X-Demo-Mode: true`.

## 2. Dev-эндпоинты (не входят в контракт)

| Метод и путь | Авторизация | Назначение |
|---|---|---|
| `POST /api/v1/dev/login` | нет | Принимает любое тело, в том числе пустое. Создаёт сессию, возвращает `{token, userId, displayName, role, orgId, address}`. Правила в `docs/MOCKS.md` |
| `POST /api/v1/dev/reset` | нет | Пересоздаёт базу и заново заполняет справочник подрядчиков. Все сессии удаляются |
| `POST /api/v1/dev/files` | любая роль | Мок-загрузка: принимает JSON `{name, mediaType, sizeBytes}`, пустое тело или multipart. Возвращает `FileRef` со случайным `fileId` |
| `GET /api/v1/dev/files/{fileId}/download` | любая роль | Текст-заглушка `text/plain` (формат в `docs/MOCKS.md`). Для любого UUID |
| `GET /api/v1/dev/contractors` | любая роль | Справочник подрядчиков (мок Reference Data) |
| `GET /api/v1/dev/events` | любая роль | Журнал событий организации, новые сверху, параметры `requestId`, `topic`, `limit` (по умолчанию 100) |

## 3. Операции контракта

Состояния и шаги: см. разделы 4 и 5. «Мок ИИ» это обработчик из `docs/MOCKS.md`.

### Заявки

| operationId | Метод и путь | Роли | Предусловия | Эффекты и мок-поведение |
|---|---|---|---|---|
| `listRequests` | `GET /requests` | все | нет | Житель: свои заявки. Остальные: заявки организации. Порядок: `EMERGENCY` сверху, затем новые. Фильтры `status`, `urgency`, `step`, `q` (подстрока в адресе и описании, без учёта регистра), `createdFrom`, `createdTo`. Житель не видит `urgency`, `currentStep`, `currentStepState` |
| `createRequest` | `POST /requests` | RESIDENT | Заголовок `Idempotency-Key` обязателен (иначе `400`). Тело по `RequestCreate` | Создаёт заявку со статусом `ACCEPTED`, шаги по п. 4, фото в `request_files`, адрес из сессии. Кладёт задание ИИ `triage_and_tz_draft` и событие `ai.jobs`. Повтор с тем же ключом того же пользователя возвращает ту же заявку (`201`, без новых заданий). Заголовок `Location: /api/v1/requests/{id}` |
| `getRequest` | `GET /requests/{requestId}` | все | Житель: заявка своя | Для STAFF первый вызов переводит статус `ACCEPTED` в `IN_PROGRESS` (для REVIEWER и RESIDENT статус не меняется). Житель получает только поля, разрешённые контрактом (без `steps`, `author`, `urgency`, `currentStep`) |
| `restartAiStep` | `POST /requests/{requestId}/steps/{step}/restart` | STAFF | `step` один из `TRIAGE`, `TZ`, `QUOTES_NMC`, `TENDER`. Состояние шага `AI_FAILED`, иначе `409 STEP_NOT_ALLOWED` | `TRIAGE` и `TZ` перезапускают одно и то же задание `triage_and_tz_draft` (оба шага в `PROCESSING`). `QUOTES_NMC` перезапускает неудавшиеся извлечения КП. `TENDER` перезапускает `tender_package`. Ответ `202 StepInfo` |

### Триаж

| operationId | Метод и путь | Роли | Предусловия | Эффекты |
|---|---|---|---|---|
| `getTriage` | `GET /requests/{requestId}/triage` | STAFF, REVIEWER | нет | Возвращает `state` шага `TRIAGE`, `proposal` (мок ИИ), `confirmed` и данные подтверждения |
| `confirmTriage` | `POST /requests/{requestId}/triage/confirm` | STAFF | Шаг `TRIAGE` в `DRAFT_READY`, иначе `409 STEP_NOT_ALLOWED`. Тело по `TriageDecision` | Шаг `TRIAGE` в `APPROVED`, `confirmed` сохранён, `urgency` заявки берётся из подтверждённых значений |

### ТЗ

| operationId | Метод и путь | Роли | Предусловия | Эффекты |
|---|---|---|---|---|
| `getTz` | `GET /requests/{requestId}/tz` | STAFF, REVIEWER | нет | Последняя версия. Если версии ещё нет: `state` шага, `version = 0`, пустые массивы |
| `updateTz` | `PUT /requests/{requestId}/tz` | STAFF | Шаг `TZ` в `DRAFT_READY`, иначе `409 STEP_NOT_ALLOWED`. `baseVersion` равна текущей, иначе `409 STALE_VERSION` | Новая версия (`version + 1`, `origin = STAFF`). Секции обновляются по `id` (поля `title` и `text`), ответы по `questionId`. Неизвестные `id` дают `400` |
| `submitTz` | `POST /requests/{requestId}/tz/submit` | STAFF | Шаг `TZ` в `DRAFT_READY`. `version` равна текущей, иначе `409 STALE_VERSION` | Шаг `TZ` в `IN_REVIEW`. Создаётся `Approval` (`TZ`, версия, `PENDING`). Событие уведомления REVIEWER. Ответ `201 Approval` |

### КП и НМЦ

| operationId | Метод и путь | Роли | Предусловия | Эффекты |
|---|---|---|---|---|
| `createQuoteRequest` | `POST /requests/{requestId}/quote-requests` | STAFF | Шаг `TZ` в `APPROVED`, иначе `409 STEP_NOT_ALLOWED`. Все `contractorIds` есть в справочнике, иначе `400` | Ничего не сохраняет и никуда не отправляет. Возвращает `201 QuoteRequestDraft`: получатели, тема и текст письма по шаблону из `docs/MOCKS.md`, два вложения (ТЗ и форма КП) с новыми мок-`fileId` |
| `listQuotes` | `GET /requests/{requestId}/quotes` | STAFF, REVIEWER | нет | Все КП заявки, старые сверху |
| `createQuote` | `POST /requests/{requestId}/quotes` | STAFF | Шаг `TZ` в `APPROVED`. Шаг `QUOTES_NMC` не в `IN_REVIEW` и не в `APPROVED`. Иначе `409 STEP_NOT_ALLOWED`. `fileIds` не пуст | Создаёт КП с `extraction = EXTRACTING`. Шаг `QUOTES_NMC` в `PROCESSING`. Кладёт задание `quotes_extraction`. Ответ `202 Quote`. Мок ИИ позже заполняет `data` фикстурой по порядковому номеру КП и ставит `EXTRACTED`. Когда ни одно КП не в `EXTRACTING`, шаг `QUOTES_NMC` становится `DRAFT_READY` |
| `getQuoteComparison` | `GET /requests/{requestId}/quotes/comparison` | STAFF, REVIEWER | нет | Строится по текущим данным КП в состоянии `EXTRACTED`. Правила флагов в п. 6 |
| `deleteQuote` | `DELETE /requests/{requestId}/quotes/{quoteId}` | STAFF | Шаг `QUOTES_NMC` не в `IN_REVIEW` и не в `APPROVED`, иначе `409 STEP_NOT_ALLOWED` | `204`. Если КП не осталось, шаг в `NOT_STARTED`. Расчёт НМЦ автоматически не пересчитывается |
| `updateQuoteData` | `PUT /requests/{requestId}/quotes/{quoteId}/data` | STAFF | КП в `EXTRACTED`, шаг не в `IN_REVIEW` и не в `APPROVED`, иначе `409 STEP_NOT_ALLOWED`. `baseVersion` равна `version` КП, иначе `409 STALE_VERSION` | Заменяет `data` целиком, `version + 1`, `editedByStaff = true`, при наличии `contractorId` обновляет его |
| `getNmc` | `GET /requests/{requestId}/nmc` | STAFF, REVIEWER | нет | Последний расчёт. Если расчёта нет: `state` шага `QUOTES_NMC`, `version = 0` |
| `calculateNmc` | `POST /requests/{requestId}/nmc/calculate` | STAFF | Шаг `QUOTES_NMC` в `DRAFT_READY` или `NEEDS_REWORK`, иначе `409 STEP_NOT_ALLOWED`. Есть хотя бы одно КП в `EXTRACTED` (иначе `400`). Все `quoteIds` (если переданы) существуют и в `EXTRACTED`, иначе `400` | Метод по умолчанию `average_of_quotes`: сумма `totalPrice` выбранных КП, делённая на их число, округление до копеек (`HALF_UP`, `BigDecimal`). Новая версия расчёта, шаг в `DRAFT_READY`. Ответ `200 NmcCalculation` |
| `submitNmc` | `POST /requests/{requestId}/nmc/submit` | STAFF | Шаг `QUOTES_NMC` в `DRAFT_READY`, расчёт существует. `version` равна текущей, иначе `409 STALE_VERSION` | Шаг в `IN_REVIEW`, `Approval` (`NMC`). Событие уведомления REVIEWER. `201 Approval` |

### Конкурс и пакет

| operationId | Метод и путь | Роли | Предусловия | Эффекты |
|---|---|---|---|---|
| `getTender` | `GET /requests/{requestId}/tender` | STAFF, REVIEWER | нет | Объект `Tender` с `state` шага `TENDER`. Пока ничего не создано: пустые `documents`, `null` в остальных полях |
| `selectWinner` | `PUT /requests/{requestId}/tender/winner` | STAFF | Шаг `TENDER` в `DRAFT_READY` или `NEEDS_REWORK`, иначе `409 STEP_NOT_ALLOWED`. `quoteId` принадлежит заявке, иначе `400` | Записывает `selectedWinner`. Выбирает договор (правило в `docs/MOCKS.md`). Шаг `TENDER` в `DRAFT_READY`. «Собирает» пакет: новая версия, четыре `DocumentRef`, шаг `PACKAGE` в `DRAFT_READY`. Возвращает `Tender` |
| `getPackage` | `GET /requests/{requestId}/package` | STAFF, REVIEWER | нет | Последняя версия пакета. Пока не собран: пустой `documents`, `state` шага `PACKAGE` |
| `submitPackage` | `POST /requests/{requestId}/package/submit` | STAFF | Шаг `PACKAGE` в `DRAFT_READY`. `version` равна текущей версии пакета, иначе `409 STALE_VERSION` | Шаг в `IN_REVIEW`, `Approval` (`PACKAGE`). Событие REVIEWER. `201 Approval` |

### Согласования

| operationId | Метод и путь | Роли | Предусловия | Эффекты |
|---|---|---|---|---|
| `listApprovals` | `GET /approvals` | REVIEWER, STAFF | нет | Задачи организации. Порядок: `PENDING` сверху, затем срочные (`EMERGENCY`), затем новые. Фильтры `state`, `subjectType`, `requestId` |
| `getApproval` | `GET /approvals/{approvalId}` | REVIEWER, STAFF | нет | `ApprovalDetail`: задача, `subject` (ТЗ, НМЦ или пакет, по `subjectType`, нужной версии) и `previousDecisions` (записи журнала по той же заявке и тому же `subjectType`) |
| `approve` | `POST /approvals/{approvalId}/approve` | REVIEWER | `state = PENDING`, иначе `409 STEP_NOT_ALLOWED`. `subjectVersion` равна версии задачи, иначе `409 STALE_VERSION` | Эффекты по типу в п. 5. Запись в `approval_journal`. Событие уведомления STAFF. `200 Approval` |
| `reject` | `POST /approvals/{approvalId}/reject` | REVIEWER | То же, что у `approve`. `comment` не пуст (после обрезки пробелов), иначе `400` | Эффекты по типу в п. 5. Запись в `approval_journal`. Событие уведомления STAFF. `200 Approval` |
| `listApprovalJournal` | `GET /approval-journal` | REVIEWER, STAFF | нет | Записи журнала организации, новые сверху. Фильтры `requestId`, `subjectType`, `from`, `to` (по `decidedAt`) |

## 4. Шаги и начальные состояния

Шаги по порядку: `TRIAGE`, `TZ`, `QUOTES_NMC`, `TENDER`, `PACKAGE`. Состояния (`StepState`): `NOT_STARTED`, `PROCESSING`, `DRAFT_READY`, `IN_REVIEW`, `NEEDS_REWORK`, `APPROVED`, `AI_FAILED`.

Сразу после `createRequest`:

| Шаг | Состояние |
|---|---|
| `TRIAGE` | `PROCESSING` |
| `TZ` | `PROCESSING` |
| `QUOTES_NMC` | `NOT_STARTED` |
| `TENDER` | `NOT_STARTED` |
| `PACKAGE` | `NOT_STARTED` |

`currentStep` заявки это первый по порядку шаг, который не в `APPROVED`. Если все шаги `APPROVED`, он `null`. `currentStepState` его состояние. Статус заявки: `ACCEPTED` → `IN_PROGRESS` (первый `getRequest` от STAFF) → `COMPLETED` (утверждён пакет).

## 5. Автомат состояний: переходы

| Событие | Шаг | Из | В |
|---|---|---|---|
| Результат мока ИИ `triage_and_tz_draft` | `TRIAGE`, `TZ` | `PROCESSING` | `DRAFT_READY` (оба) |
| Сбой мока ИИ (триггер в `docs/MOCKS.md`) | `TRIAGE`, `TZ` | `PROCESSING` | `AI_FAILED` (оба) |
| `restartAiStep` | указанный шаг (и парный для `TRIAGE`/`TZ`) | `AI_FAILED` | `PROCESSING` |
| `confirmTriage` | `TRIAGE` | `DRAFT_READY` | `APPROVED` |
| `updateTz` | `TZ` | `DRAFT_READY` | `DRAFT_READY` (версия +1) |
| `submitTz` | `TZ` | `DRAFT_READY` | `IN_REVIEW` |
| `approve` для `TZ` | `TZ` | `IN_REVIEW` | `APPROVED` |
| `reject` для `TZ` | `TZ` | `IN_REVIEW` | `PROCESSING`, кладётся задание `tz_revision` с комментарием |
| Результат мока ИИ `tz_revision` | `TZ` | `PROCESSING` | `DRAFT_READY` (новая версия, `origin = AI`, `lastReviewComment`) |
| `createQuote` | `QUOTES_NMC` | `NOT_STARTED`, `DRAFT_READY`, `NEEDS_REWORK`, `PROCESSING` | `PROCESSING` |
| Все КП извлечены | `QUOTES_NMC` | `PROCESSING` | `DRAFT_READY` |
| `deleteQuote`, КП не осталось | `QUOTES_NMC` | любое допустимое | `NOT_STARTED` |
| `calculateNmc` | `QUOTES_NMC` | `DRAFT_READY`, `NEEDS_REWORK` | `DRAFT_READY` |
| `submitNmc` | `QUOTES_NMC` | `DRAFT_READY` | `IN_REVIEW` |
| `approve` для `NMC` | `QUOTES_NMC`, `TENDER` | `IN_REVIEW`; `NOT_STARTED` | `APPROVED`; `PROCESSING` (кладётся задание `tender_package`) |
| `reject` для `NMC` | `QUOTES_NMC` | `IN_REVIEW` | `NEEDS_REWORK` |
| Результат мока ИИ `tender_package` | `TENDER` | `PROCESSING` | `DRAFT_READY` |
| `selectWinner` | `TENDER`, `PACKAGE` | `DRAFT_READY` или `NEEDS_REWORK`; любое | `DRAFT_READY`; `DRAFT_READY` (пакет собран заново, версия +1) |
| `submitPackage` | `PACKAGE` | `DRAFT_READY` | `IN_REVIEW` |
| `approve` для `PACKAGE` | `PACKAGE`; `TENDER` | `IN_REVIEW`; `DRAFT_READY` | `APPROVED`; `APPROVED`. Статус заявки становится `COMPLETED` |
| `reject` для `PACKAGE` | `PACKAGE`, `TENDER` | `IN_REVIEW`; `DRAFT_READY` | `NEEDS_REWORK`; `NEEDS_REWORK` (сотрудник может выбрать другого победителя) |

Любое событие, которого нет в таблице для текущего состояния, даёт `409 STEP_NOT_ALLOWED`. Каждый переход обновляет `updated_at` шага и заявки.

Упрощение для демо: если `selectWinner` вызван с тем же победителем, пакет всё равно собирается заново (версия +1).

## 6. Сравнение КП: правила флагов

Для каждой позиции (по названию, без учёта регистра) в КП в состоянии `EXTRACTED`:

- `MISSING`: позиции нет в этом КП, а в других есть;
- `MISMATCH`: единица измерения отличается от большинства КП;
- `OUTLIER`: цена за единицу больше 1,3 медианы цен этой позиции среди КП, где она есть (нужно минимум три КП с этой позицией);
- иначе `NONE`.

`quotes[]` в ответе содержит итог, срок и гарантию каждого КП. В `discrepancies` кладётся по строке на каждый флаг, отличный от `NONE`, в формате `«Позиция»: флаг у «подрядчика»`.

## 7. Эффекты согласований по типу

| Действие | `TZ` | `NMC` | `PACKAGE` |
|---|---|---|---|
| `approve` | шаг `TZ` в `APPROVED` | `QUOTES_NMC` в `APPROVED`, `TENDER` в `PROCESSING`, задание `tender_package` | `PACKAGE` и `TENDER` в `APPROVED`, заявка `COMPLETED`, версия пакета получает `approvedAt` |
| `reject` | шаг `TZ` в `PROCESSING`, задание `tz_revision` | `QUOTES_NMC` в `NEEDS_REWORK`, `lastReviewComment` в расчёте | `PACKAGE` и `TENDER` в `NEEDS_REWORK`, `lastReviewComment` в пакете и конкурсе |

В любом случае: `state` задачи `APPROVED` или `REJECTED`, `decidedBy`, `decidedAt`, `comment`, запись в `approval_journal`, уведомление STAFF в `event_log`.

# CLAUDE.md

Репозиторий: демонстрационный прототип YKit на Nuxt. Это **демо без реальной работы**: SQLite, любой логин, мок-ответы. Подробности в `docs/SPEC.md`.

## Порядок чтения

`docs/SPEC.md` → `docs/DESIGN.md` → `docs/SCREENS.md` → `docs/API.md` → `docs/DATA.md` → `docs/MOCKS.md` → `docs/DEMO.md`. Контракт сервера: `contract/core-api.openapi.yaml`.

## Команды (оболочка fish)

```fish
npm install
npm run dev -- --host 127.0.0.1             # сайт на 127.0.0.1:3000
env DEMO_AI_DELAY_MS=0 npm run dev -- --host 127.0.0.1   # мок ИИ без задержки
npm test                                    # vitest, включая smoke.test.ts
npx nuxt typecheck
bash scripts/demo.sh                        # сценарий API против запущенного сайта
```

Не используй `VAR=value команда` и `export VAR=...`: это не fish. Для переменных `env VAR=значение команда` или `set -x VAR значение`.

## Правила

- Контракт `contract/core-api.openapi.yaml` не менять. Лишние эндпоинты только под `/api/v1/dev/`.
- Всё «внешнее» (ИИ, Documents, Reference Data, Notifications) только через интерфейсы в `server/gateway` с мок-реализациями в `server/mock`.
- Каждый запрос к базе фильтруется по `org_id` из сессии.
- Слушать только `127.0.0.1`. Заголовок `X-Demo-Mode: true` во всех ответах. Баннер «Демо» в интерфейсе всегда виден.
- Внешний вид только по макету Figma (`docs/DESIGN.md`). Не придумывать экраны, поля и тексты, которых нет в макете и в `docs/SCREENS.md`.
- Мок-тексты и цены всегда с пометкой «ДЕМО». Не придумывать реальные нормативы, статьи законов, ГОСТ и СП, реальные организации и цены.
- Нет данных: выбрать простейший вариант и записать в `docs/DECISIONS.md`. Не угадывать молча.
- Не добавлять: реальную аутентификацию, брокеры, Docker, CI, кеши, ORM, PWA, push, i18n, внешние ресурсы (CDN, шрифты, аналитика).
- Код и идентификаторы на английском, тексты интерфейса и фикстуры на русском.

## Структура

```
app/                         интерфейс Nuxt (если версия Nuxt использует другой корень, записать в DECISIONS.md)
  pages/                     экраны по docs/SCREENS.md
  components/                общие компоненты из макета
  composables/useApi.ts      вызовы /api/v1 с токеном, разбор problem+json
  composables/useSession.ts  токен и профиль
  middleware/                защита страниц по роли
server/
  api/v1/                    эндпоинты контракта и dev/ (файловая маршрутизация Nitro)
  db/                        подключение SQLite, schema.sql, сброс
  gateway/                   интерфейсы AiGateway, DocumentsGateway, ReferenceGateway, NotificationsGateway
  mock/                      мок-реализации и фикстуры *.json
  modules/                   requests, workflow, approvals, quotes (бизнес-логика без HTTP)
  plugins/                   обработчик заданий ИИ (setInterval 200 мс), заголовок X-Demo-Mode
  utils/                     ошибки problem+json, текущий пользователь, роли, время
data/demo.db                 создаётся при запуске, в git не попадает
design/                      экспорт макета (если Figma недоступен через MCP)
scripts/demo.sh
tests/smoke.test.ts
```

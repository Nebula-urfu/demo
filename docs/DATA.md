# DATA: схема SQLite

Файл базы `data/demo.db` (переменная окружения `DEMO_DB_PATH`). При старте сервера база пересоздаётся (`DEMO_RESET_ON_START`, по умолчанию `true`). Схема лежит в `server/db/schema.sql` и применяется при создании базы. Миграционных инструментов нет.

Настройки соединения: режим журнала WAL, `busy_timeout` 5000 мс, внешние ключи включены (`PRAGMA foreign_keys = ON`). Соединение одно, синхронное (драйвер `better-sqlite3`, см. `docs/SPEC.md`), записи делаются в коротких транзакциях.

Правила:

- Каждая таблица, которая принадлежит организации, содержит `org_id`, и все запросы фильтруются по нему.
- Идентификаторы это UUID в тексте. Время это ISO 8601 в UTC в тексте.
- Составные документы (секции ТЗ, данные КП, список документов) лежат как JSON в текстовых колонках `*_json`.
- Чтобы не плодить версии: ТЗ, расчёт НМЦ и пакет хранятся версиями (`PRIMARY KEY (request_id, version)`), «текущая» версия это максимальная.

## DDL

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE sessions (
  token         TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('RESIDENT','STAFF','REVIEWER')),
  org_id        TEXT NOT NULL,
  address       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE requests (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL,
  author_user_id  TEXT NOT NULL,
  author_name     TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('ACCEPTED','IN_PROGRESS','COMPLETED')),
  urgency         TEXT CHECK (urgency IN ('EMERGENCY','PLANNED')),
  address         TEXT NOT NULL,
  entrance        TEXT NOT NULL,
  description     TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_requests_org ON requests(org_id, created_at DESC);

CREATE TABLE idempotency_keys (
  user_id     TEXT NOT NULL,
  key         TEXT NOT NULL,
  request_id  TEXT NOT NULL REFERENCES requests(id),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE request_files (            -- фото заявки
  request_id  TEXT NOT NULL REFERENCES requests(id),
  file_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  media_type  TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  PRIMARY KEY (request_id, file_id)
);

CREATE TABLE request_steps (
  request_id  TEXT NOT NULL REFERENCES requests(id),
  step        TEXT NOT NULL CHECK (step IN ('TRIAGE','TZ','QUOTES_NMC','TENDER','PACKAGE')),
  state       TEXT NOT NULL CHECK (state IN
              ('NOT_STARTED','PROCESSING','DRAFT_READY','IN_REVIEW','NEEDS_REWORK','APPROVED','AI_FAILED')),
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (request_id, step)
);

CREATE TABLE triage (
  request_id      TEXT PRIMARY KEY REFERENCES requests(id),
  proposal_json   TEXT,                 -- {urgency, workType, route}
  confirmed_json  TEXT,                 -- {urgency, workType, route}
  confirmed_by_id TEXT,
  confirmed_by_name TEXT,
  confirmed_at    TEXT
);

CREATE TABLE tz_versions (
  request_id           TEXT NOT NULL REFERENCES requests(id),
  version              INTEGER NOT NULL,
  origin               TEXT NOT NULL CHECK (origin IN ('AI','STAFF')),
  sections_json        TEXT NOT NULL,   -- [{id,title,text,sources,editedByStaff}]
  questions_json       TEXT NOT NULL,   -- [{id,text,answer}]
  last_review_comment  TEXT,
  created_at           TEXT NOT NULL,
  PRIMARY KEY (request_id, version)
);

CREATE TABLE quotes (
  id              TEXT PRIMARY KEY,
  request_id      TEXT NOT NULL REFERENCES requests(id),
  org_id          TEXT NOT NULL,
  contractor_id   TEXT,
  extraction      TEXT NOT NULL CHECK (extraction IN ('EXTRACTING','EXTRACTED','AI_FAILED')),
  version         INTEGER NOT NULL DEFAULT 1,
  data_json       TEXT,                 -- QuoteData
  edited_by_staff INTEGER NOT NULL DEFAULT 0,
  seq             INTEGER NOT NULL,     -- порядковый номер КП в заявке, от 1 (выбирает фикстуру)
  created_at      TEXT NOT NULL
);

CREATE TABLE quote_files (
  quote_id    TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  file_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  media_type  TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  PRIMARY KEY (quote_id, file_id)
);

CREATE TABLE nmc_versions (
  request_id           TEXT NOT NULL REFERENCES requests(id),
  version              INTEGER NOT NULL,
  method               TEXT NOT NULL,
  amount               TEXT NOT NULL,   -- десятичная строка
  currency             TEXT NOT NULL DEFAULT 'RUB',
  justification        TEXT NOT NULL,
  quote_ids_json       TEXT NOT NULL,
  last_review_comment  TEXT,
  calculated_at        TEXT NOT NULL,
  PRIMARY KEY (request_id, version)
);

CREATE TABLE tender (
  request_id              TEXT PRIMARY KEY REFERENCES requests(id),
  documents_json          TEXT NOT NULL DEFAULT '[]',   -- DocumentRef[]
  winner_proposal_json    TEXT,
  selected_winner_json    TEXT,
  contract_json           TEXT,
  last_review_comment     TEXT
);

CREATE TABLE package_versions (
  request_id           TEXT NOT NULL REFERENCES requests(id),
  version              INTEGER NOT NULL,
  documents_json       TEXT NOT NULL,   -- DocumentRef[]
  approved_at          TEXT,
  last_review_comment  TEXT,
  created_at           TEXT NOT NULL,
  PRIMARY KEY (request_id, version)
);

CREATE TABLE approvals (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL,
  request_id         TEXT NOT NULL REFERENCES requests(id),
  subject_type       TEXT NOT NULL CHECK (subject_type IN ('TZ','NMC','PACKAGE')),
  subject_version    INTEGER NOT NULL,
  state              TEXT NOT NULL CHECK (state IN ('PENDING','APPROVED','REJECTED')),
  submitted_by_id    TEXT NOT NULL,
  submitted_by_name  TEXT NOT NULL,
  submitted_at       TEXT NOT NULL,
  decided_by_id      TEXT,
  decided_by_name    TEXT,
  decided_at         TEXT,
  comment            TEXT
);
CREATE INDEX idx_approvals_org ON approvals(org_id, state, submitted_at DESC);

CREATE TABLE approval_journal (           -- только добавление
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL,
  request_id        TEXT NOT NULL,
  subject_type      TEXT NOT NULL,
  subject_version   INTEGER NOT NULL,
  decision          TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  decided_by_id     TEXT NOT NULL,
  decided_by_name   TEXT NOT NULL,
  decided_at        TEXT NOT NULL,
  comment           TEXT
);
CREATE TRIGGER approval_journal_no_update
  BEFORE UPDATE ON approval_journal
  BEGIN SELECT RAISE(ABORT, 'approval_journal is append-only'); END;
CREATE TRIGGER approval_journal_no_delete
  BEFORE DELETE ON approval_journal
  BEGIN SELECT RAISE(ABORT, 'approval_journal is append-only'); END;

CREATE TABLE ai_jobs (                    -- мок очереди ai.jobs
  job_id      TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  request_id  TEXT NOT NULL REFERENCES requests(id),
  job_type    TEXT NOT NULL CHECK (job_type IN
              ('triage_and_tz_draft','tz_revision','quotes_extraction','tender_package')),
  payload_json TEXT NOT NULL DEFAULT '{}', -- например {"comment":"...","quoteId":"..."}
  state       TEXT NOT NULL CHECK (state IN ('QUEUED','DONE','FAILED')),
  run_at      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_ai_jobs_due ON ai_jobs(state, run_at);

CREATE TABLE event_log (                  -- мок outbox и уведомлений
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,
  org_id      TEXT NOT NULL,
  topic       TEXT NOT NULL CHECK (topic IN ('ai.jobs','ai.results','notifications')),
  type        TEXT NOT NULL,
  request_id  TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX idx_event_log_org ON event_log(org_id, id DESC);

CREATE TABLE mock_files (                 -- мок Documents
  file_id     TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  media_type  TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE mock_contractors (           -- мок Reference Data, общий для всех организаций
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  email                   TEXT NOT NULL,
  nonstandard_contract    INTEGER NOT NULL DEFAULT 0
);
```

## Что происходит с данными

- `ai_jobs`: создаётся задание (`QUEUED`, `run_at = now + DEMO_AI_DELAY_MS`). Обработчик (плагин Nitro с `setInterval`) каждые 200 мс берёт задания с `run_at <= now` и `state = QUEUED`, применяет результат одной транзакцией, ставит `DONE` (или `FAILED`, если сработал триггер сбоя), пишет событие `ai.results`. Обработчик один, задания выполняются по очереди.
- `event_log`: событие пишется в **той же транзакции**, что и изменение данных (так выглядит будущий outbox).
- `approval_journal`: запись добавляется в той же транзакции, что и смена `approvals.state`.
- `mock_contractors`: заполняется при создании базы и при `dev/reset` (значения в `docs/MOCKS.md`), `id` фиксированные.
- Сброс (`dev/reset`) удаляет и пересоздаёт все таблицы. Таблицы нельзя чистить построчно, потому что триггеры защищают журнал.

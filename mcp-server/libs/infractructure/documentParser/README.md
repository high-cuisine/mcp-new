## Модуль `documentParser`

Модуль отвечает за:
- разбор текстового документа `text.txt` с правилами клиники;
- сохранение структурированных данных в Redis;
- удобное чтение этих данных из Redis.

Состоит из двух основных сервисов:
- `DocumentParserService` — парсинг и запись в Redis;
- `GettingDocumentInfoService` — чтение уже разобранных данных из Redis.

---

## `DocumentParserService` — парсинг и запись в Redis

Исходный файл: `libs/infractructure/documentParser/text.txt`.
Все методы используют `RedisService` и **перезаписывают** соответствующие ключи.

### 1. `ParseTimeTable()`
- Парсит раздел с расписанием (даты и текст по дням).
- Сохраняет в **zset**:
  - ключ: `timetable`
  - member: `JSON.stringify({ date: string, items: string[] })`
  - score: `timestamp` начала дня (`Date.getTime()`).

### 2. `parseDoctors()`
- Парсит блок «Состав врачей и их профили».
- Сохраняет в **hash**:
  - ключ: `doctors`
  - поле: фамилия врача (`lastName`)
  - значение: `JSON.stringify({ lastName: string, details: string[] })`.

### 3. `parseReceptionRules()`
- Парсит раздел **3. Правила записи на приём к врачам** (3.1–3.3).
- Сохраняет:
  - ключ `rules:reception:index` (string) — JSON-массив:
    - `{ code: "3.1" | "3.2" | "3.3", title, type: "doctors" | "general" }`
  - hash `rules:reception:items`:
    - поле: `"3.1"`, `"3.2"`, `"3.3"`
    - значение: `JSON.stringify({ code, title, type, doctors?: string[], lines: string[] })`.

### 4. `parseSurgeryRules()`
- Парсит раздел **4. Хирургия (Ступакова)** и подпункты 4.1–4.3.
- Сохраняет:
  - `rules:surgery:index` — JSON-массив `{ code: "4" | "4.1" | "4.2" | "4.3", title }`
  - `rules:surgery:items` — hash, поле = код, значение = `JSON.stringify({ code, title, lines: string[] })`.

### 5. `parseDentistryRules()`
- Парсит раздел **5. Стоматологические операции (10 февраля)**.
- Сохраняет:
  - `rules:dentistry:index` — `[{ code: "5", title }]`
  - `rules:dentistry:items` — поле `"5"`, значение `{ code: "5", title, lines: string[] }`.

### 6. `parseCardiologyRules()`
- Парсит раздел **6. Кардиология (Храмцова)**.
- Сохраняет:
  - `rules:cardiology:index` — `[{ code: "6", title }]`
  - `rules:cardiology:items` — поле `"6"`, значение `{ code: "6", title, lines: string[] }`.

### 7. `parseProceduresRules()`
- Парсит раздел **7. Процедуры и работа фельдшеров** (7, 7.1, 7.2, 7.3).
- Сохраняет:
  - `rules:procedures:index` — список `{ code: "7" | "7.1" | "7.2" | "7.3", title }`
  - `rules:procedures:items` — hash, поле = код, значение `{ code, title, lines: string[] }`.

### 8. `parseUltrasoundRules()`
- Парсит раздел **8. УЗИ брюшной и грудной полости**.
- Сохраняет:
  - `rules:ultrasound:index` — `[{ code: "8", title }]`
  - `rules:ultrasound:items` — поле `"8"`, значение `{ code: "8", title, lines: string[] }`.

### 9. `parseLaboratoryRules()`
- Парсит раздел **9. Лаборатория** (9, 9.1, 9.2, 9.3).
- Сохраняет:
  - `rules:laboratory:index` — список `{ code: "9" | "9.1" | "9.2" | "9.3", title }`
  - `rules:laboratory:items` — hash, поле = код, значение `{ code, title, lines: string[] }`.

### 10. `parseExternalClinicRules()`
- Парсит раздел **10. Назначения сторонних клиник: препараты и анализы** (10, 10.1, 10.2).
- Сохраняет:
  - `rules:external:index` — список `{ code: "10" | "10.1" | "10.2", title }`
  - `rules:external:items` — hash, поле = код, значение `{ code, title, lines: string[] }`.

### 11. `parseStationaryRules()`
- Парсит раздел **11. Стационар**.
- Сохраняет:
  - `rules:stationary:index` — `[{ code: "11", title }]`
  - `rules:stationary:items` — поле `"11"`, значение `{ code: "11", title, lines: string[] }`.

---

## `GettingDocumentInfoService` — чтение из Redis

Этот сервис даёт удобные методы для получения уже разобранных данных.
Все методы используют `RedisService` и возвращают типизированные структуры.

### 1. `getTimetable(): Promise<TimetableDay[]>`
- Читает zset `timetable` через `zrangeWithScores`.
- Возвращает массив:
  - `{ date: string; items: string[]; score?: number }`
  - `score` — исходный `timestamp` из Redis.

### 2. `getDoctors()`
- Читает hash `doctors`.
- Возвращает массив:
  - `{ lastName: string; details: string[] }`.

### 3. Универсальный helper `getIndexedRules<T>(indexKey, itemsKey)`
- Внутренний метод:
  - читает string `indexKey` → JSON в `RuleIndexItem[]` (`{ code, title, ... }`);
  - читает hash `itemsKey` → парсит JSON в `Record<string, T>`.
- Используется ниже для всех разделов.

### 4. Методы для правил
Каждый метод возвращает `IndexedRules<T>`:

- **`getReceptionRules()`**
  - читает `rules:reception:index` и `rules:reception:items`.
- **`getSurgeryRules()`**
  - читает `rules:surgery:index` и `rules:surgery:items`.
- **`getDentistryRules()`**
  - читает `rules:dentistry:index` и `rules:dentistry:items`.
- **`getCardiologyRules()`**
  - читает `rules:cardiology:index` и `rules:cardiology:items`.
- **`getProceduresRules()`**
  - читает `rules:procedures:index` и `rules:procedures:items`.
- **`getUltrasoundRules()`**
  - читает `rules:ultrasound:index` и `rules:ultrasound:items`.
- **`getLaboratoryRules()`**
  - читает `rules:laboratory:index` и `rules:laboratory:items`.
- **`getExternalClinicRules()`**
  - читает `rules:external:index` и `rules:external:items`.
- **`getStationaryRules()`**
  - читает `rules:stationary:index` и `rules:stationary:items`.

---

## Как использовать в других модулях

1. Импортировать модуль:
   - в нужный `*.module.ts` добавить:
     - `import { DocumentParser } from '@infra/documentParser/documentParser.module';`
     - и в `imports: [DocumentParser, ...]`.

2. Инжектить сервисы:
   - `constructor(private readonly documentParserService: DocumentParserService, private readonly gettingDocumentInfoService: GettingDocumentInfoService) {}`

3. Типичный сценарий:
   - один раз выполнить методы парсинга (`ParseTimeTable`, `parseDoctors`, `parse...Rules()`), например, при миграции/инициализации;
   - далее в рантайме использовать только `GettingDocumentInfoService` для быстрых чтений из Redis.


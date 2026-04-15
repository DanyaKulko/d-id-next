# Stage 2 — Технический план реализации

## Текущая архитектура (как есть)

```
User Speech → Azure STT → page.client.tsx → chatAction() → didService.chat() → D-ID Agent
                                                                                      ↓
User sees ← AvatarStage (WebRTC video) ← RTCPeerConnection ← D-ID Stream ← D-ID Response
```

**Ключевые файлы:**

| Файл | Роль |
|------|------|
| `src/app/(client)/[avatarSlug]/page.client.tsx` | Главный клиент — оркестрация всей логики |
| `src/app/(client)/[avatarSlug]/_hooks/useAgent.ts` | WebRTC + DataChannel + D-ID сессия |
| `src/app/(client)/[avatarSlug]/_hooks/useAzureSTT.ts` | Распознавание речи |
| `src/app/(client)/[avatarSlug]/_components/AvatarStage/AvatarStage.tsx` | Рендер видео |
| `src/app/actions/agent.actions.ts` | Server actions (session, chat, messages) |
| `src/lib/services/did.service.ts` | D-ID REST API клиент |
| `src/app/(client)/[avatarSlug]/page.css` | Стили страницы аватара |
| `prisma/schema.prisma` | Схема БД |
| `scripts/cron/knowledge-cron-worker.ts` | CRON воркер парсинга блога |

**Текущий flow отправки сообщения:**
1. `handleUserSpeech()` в `page.client.tsx` получает распознанный текст
2. `sendTranscript()` валидирует и вызывает `speak()`
3. `speak()` вызывает `chatAction()` — server action
4. `chatAction()` в `agent.actions.ts`: получает историю чата, вызывает `didService.chat()`, сохраняет сообщения
5. `didService.chat()` отправляет POST в D-ID API `/agents/{agentId}/chat/{chatId}`
6. D-ID обрабатывает через RAG + LLM и стримит ответ через WebRTC DataChannel

---

## Блок 1: Pre-rendered видео

### 1.1 Схема БД

Новая таблица `prerendered_videos`:

```prisma
model PrerenderedVideo {
  id        Int      @id @default(autoincrement())
  agentId   Int
  agent     Agent    @relation(fields: [agentId], references: [id])

  eventType String   // "user_silent" | "avatar_thinking" | "user_interrupt" | "system_error"
  sortOrder Int      @default(0)  // для round-robin порядка

  videoUrl  String   // путь к файлу /uploads/prerendered/xxx.mp4
  duration  Float?   // длительность в секундах (для UI)
  label     String?  // название для админки ("Hmm let me think...")

  isEnabled Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([agentId, eventType, isEnabled])
}
```

### 1.2 Бэкенд

**Новый API route:** `src/app/api/prerendered-videos/route.ts`
- GET: список видео для агента (по agentId)
- Возвращает видео сгруппированные по eventType

**Новый server action:** `src/app/admin/(protected)/actions/prerendered.actions.ts`
- Upload видео файлов
- CRUD операции
- Переупорядочивание (sortOrder)

**Хранение:** `public/uploads/prerendered/{agentId}/`
- Docker volume монтируется как `./public/uploads:/app/public/uploads`

### 1.3 Фронтенд

**Новый хук:** `src/app/(client)/[avatarSlug]/_hooks/usePrerenderedVideo.ts`

```typescript
// Входные данные:
// - agentStatus: "idle" | "listening" | "thinking" | "speaking" | "error"
// - connectionStatus: "idle" | "connecting" | "connected" | "error"
// - videos: PrerenderedVideo[] (загружаются при инициализации)

// Логика:
// - Таймеры для каждого eventType
// - Round-robin счётчики
// - Вероятность для interrupt (Math.random() < 0.33)
// - Прерывание при speech detected

// Выходные данные:
// - currentVideo: string | null (URL текущего видео для показа)
// - isPlaying: boolean
// - dismiss(): void (принудительно закрыть)
```

**Изменение AvatarStage:** Добавить `<video>` элемент для pre-rendered видео:
- z-index выше D-ID стрима (z-20)
- opacity: 0 → 1 при показе (CSS transition 300ms)
- Событие `onEnded` → скрыть и вернуться к стриму

### 1.4 Админка

**Новая вкладка в Training:** "Pre-rendered Videos"
- Drag-and-drop загрузка видео
- Выбор eventType из dropdown
- Предпросмотр видео
- Переупорядочивание (drag-and-drop)
- Включение/выключение отдельных видео

---

## Блок 2: Source Routing (обогащение запросов внешними данными)

### 2.1 Точка перехвата

**Файл:** `src/app/actions/agent.actions.ts` → функция `chatAction()`

Текущий flow:
```
chatAction(message) → didService.chat(message) → D-ID
```

Новый flow:
```
chatAction(message) → sourceRouter.classify(message) →
  if (needsExternalSearch) → searchService.search(message) → enrichedMessage
  didService.chat(enrichedMessage || message) → D-ID
```

### 2.2 Классификатор запросов

**Новый файл:** `src/lib/routing/source-classifier.ts`

```typescript
// Шаг 1: Keyword matching (0ms)
const EXTERNAL_KEYWORDS = {
  news: ["новости", "news", "дайджест", "digest", "headlines"],
  weather: ["погода", "weather", "температура", "temperature"],
  current: ["сегодня", "today", "вчера", "yesterday", "последние", "latest", "актуальные", "current", "сейчас", "now", "recently"],
  media_photo: ["фото", "photo", "картинка", "picture", "image", "изображение", "покажи", "show me"],
  media_video: ["видео", "video", "видосик", "ролик", "clip"],
  prerender: [] // определяется на клиенте по событиям
}

// Шаг 2: LLM fallback (если keywords не сработали)
// gpt-4o-mini с промптом:
// "Classify the user intent:
//   'knowledge' — question about personal experience/knowledge
//   'external' — needs current/real-time data
//   'media_photo' — user wants to see photos
//   'media_video' — user wants to see video
// Return JSON: { intent: string, confidence: number }"
```

### 2.3 Сервис поиска

**Новый файл:** `src/lib/routing/external-search.ts`

```typescript
// OpenAI Responses API с web_search tool
// POST https://api.openai.com/v1/responses
// model: "gpt-4o-mini"
// tools: [{ type: "web_search_preview" }]
//
// Промпт: "Search the web for current information about: {query}.
//          Return a concise summary (max 500 characters) with key facts."
//
// Результат оборачивается в <ext_source>...</ext_source> теги
// и добавляется к оригинальному сообщению пользователя
```

**Ограничения:**
- Максимум 500 символов подсказки (чтобы не превысить лимит D-ID)
- Таймаут 5 секунд (если поиск не вернул — отправляем без обогащения)
- Кэширование на 5 минут (одинаковые запросы не ищем повторно)

### 2.4 Интеграция с pre-rendered видео

Когда source router определяет `intent = "external"`:
1. Фронтенд получает сигнал "thinking_extended" (через return из chatAction)
2. Запускается pre-rendered "thinking" видео
3. Параллельно backend делает поиск
4. Когда поиск завершён — отправляет обогащённый запрос в D-ID
5. D-ID начинает стрим → pre-rendered видео прерывается

### 2.5 Уведомление фронтенда о типе ответа

**Изменение chatAction:**
```typescript
// Возвращаемое значение расширяется:
return {
  ok: true,
  intent: "external" | "knowledge" | "media_photo" | "media_video",
  media?: { photos: string[], video: string | null }, // для медиа-роутинга
  searchUsed: boolean
}
```

Фронтенд использует `intent` чтобы:
- Показать pre-rendered "thinking" видео при `external`
- Показать медиа-панель при `media_photo` / `media_video`

---

## Блок 3: Медиа-роутинг (фото + видео)

### 3.1 Схема БД

```prisma
model MediaAsset {
  id          Int      @id @default(autoincrement())
  agentId     Int
  agent       Agent    @relation(fields: [agentId], references: [id])

  type        String   // "photo" | "video"
  sourceType  String   // "blog" | "manual" | "external"

  url         String   // URL картинки/видео
  thumbnailUrl String? // превью для видео

  title       String?  // заголовок
  description String   // описание для поиска (из статьи или сгенерированное)
  tags        String[] // ключевые слова ["turkey", "grand canyon", "travel"]

  // Для блога — связь с исходной статьей
  sourcePostId  Int?      // ID из ProcessedPost
  sourceUrl     String?   // URL оригинальной статьи

  // Полнотекстовый поиск
  searchVector  Unsupported("tsvector")? // PostgreSQL tsvector

  isEnabled   Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([agentId, type, isEnabled])
}
```

**Миграция:** Добавить GIN индекс для полнотекстового поиска:
```sql
CREATE INDEX media_assets_search_idx ON media_assets USING GIN (search_vector);
```

### 3.2 Парсинг медиа из блога

**Расширение cron worker:** `scripts/cron/knowledge-cron-worker.ts`

При парсинге каждого поста (уже есть flow):
1. Извлекаем все `<img>` теги из HTML
2. Для каждой картинки:
   - URL (src)
   - Alt text (если есть)
   - Описание = заголовок статьи + alt text + ближайший параграф
   - Tags = ключевые слова из описания
3. Извлекаем все `<iframe>` (YouTube/Vimeo) и `<video>` теги
4. Сохраняем в `MediaAsset`
5. Генерируем `searchVector` через PostgreSQL `to_tsvector()`

### 3.3 Поиск медиа

**Новый файл:** `src/lib/routing/media-search.ts`

```typescript
// PostgreSQL full-text search:
// SELECT * FROM media_assets
// WHERE agent_id = $1
//   AND type = $2
//   AND is_enabled = true
//   AND search_vector @@ plainto_tsquery($3)
// ORDER BY ts_rank(search_vector, plainto_tsquery($3)) DESC
// LIMIT 10;
//
// Если найдено > 4 фото → берём топ-4
// Если найдено 0 → возвращаем пустой массив (без медиа)
// Fallback на external search — Phase 2
```

### 3.4 Интеграция в chatAction

```
chatAction(message) → sourceClassifier.classify(message) →
  if (intent === "media_photo" || "media_video") {
    // Параллельно:
    // 1. Ищем медиа в базе
    // 2. Отправляем вопрос в D-ID (без обогащения)
    const [media, didResponse] = await Promise.all([
      mediaSearch.find(agentId, type, message),
      didService.chat(message)
    ])
    return { ok: true, intent, media }
  }
```

### 3.5 Фронтенд: медиа-панель

**Новый компонент:** `src/app/(client)/[avatarSlug]/_components/MediaPanel/MediaPanel.tsx`

```typescript
// Props:
// - photos: string[] (до 4 URL)
// - video: string | null (1 URL)
// - isVisible: boolean

// Layout:
// Фото: grid 2x2 (или 1 если одна фото)
// Видео: aspect-ratio 16:9 плеер
// Анимация появления: slide-in + fade

// CSS уже частично готов:
// .na-media-panels, .na-photo-grid, .na-video-container
```

**Расположение:** Справа от аватара (desktop) / под аватаром (mobile)

---

## Блок 4: Общий source router (объединение)

### 4.1 Общий flow

```
Пользователь говорит
      ↓
Azure STT → текст
      ↓
page.client.tsx → chatAction(text)
      ↓
┌─── Source Classifier ───┐
│                         │
│  Keywords → match?      │
│  yes → intent           │
│  no → LLM classifier    │
│       → intent          │
│                         │
└──── intent ─────────────┘
      ↓
┌─── Route by intent ────────────────────────────────┐
│                                                     │
│  "knowledge" → didService.chat(originalMessage)     │
│                                                     │
│  "external"  → 1. signal frontend: "thinking"       │
│                 2. externalSearch(message)           │
│                 3. enrichedMsg = original + <ext>    │
│                 4. didService.chat(enrichedMsg)      │
│                                                     │
│  "media_photo/video" → Promise.all([                │
│                           mediaSearch(message),      │
│                           didService.chat(message)   │
│                         ])                           │
│                         return { media }             │
│                                                     │
└─────────────────────────────────────────────────────┘
      ↓
Frontend получает:
  - intent (тип ответа)
  - media (если есть)
  - D-ID стрим (через WebRTC, как обычно)
      ↓
Frontend показывает:
  - Pre-rendered видео (если thinking)
  - Медиа-панель (если фото/видео)
  - Аватар отвечает (D-ID стрим)
```

### 4.2 Новые файлы (итого)

```
src/lib/routing/
  source-classifier.ts     — классификация intent (keywords + LLM)
  external-search.ts       — поиск во внешних источниках (OpenAI)
  media-search.ts          — поиск медиа в БД

src/app/(client)/[avatarSlug]/_hooks/
  usePrerenderedVideo.ts   — логика pre-rendered видео
  useMediaPanel.ts         — состояние медиа-панели

src/app/(client)/[avatarSlug]/_components/
  MediaPanel/
    MediaPanel.tsx         — компонент медиа-панели
    MediaPanel.css         — стили

src/app/admin/(protected)/actions/
  prerendered.actions.ts   — CRUD pre-rendered видео
  media.actions.ts         — управление медиа-ассетами

src/app/api/
  prerendered-videos/route.ts  — API для клиента
```

### 4.3 Изменяемые файлы

```
prisma/schema.prisma               — новые модели
src/app/actions/agent.actions.ts    — интеграция source router в chatAction
src/app/(client)/[avatarSlug]/page.client.tsx — обработка intent, медиа, pre-rendered
src/app/(client)/[avatarSlug]/_components/AvatarStage/AvatarStage.tsx — слой pre-rendered видео
src/app/(client)/[avatarSlug]/page.css — стили медиа-панели
scripts/cron/knowledge-cron-worker.ts — парсинг медиа из блога
docker-compose.yml                  — volume для prerendered видео
```

---

## Порядок реализации

### Фаза 1: Pre-rendered видео (1-2 недели)
1. Prisma миграция (PrerenderedVideo)
2. Админка: загрузка и управление видео
3. API route для клиента
4. Хук usePrerenderedVideo
5. Интеграция в AvatarStage (overlay слой)
6. Тестирование на iOS/Android

### Фаза 2: Source Routing + External Search (1-2 недели)
1. Source classifier (keywords)
2. External search service (OpenAI web_search)
3. Интеграция в chatAction
4. LLM classifier fallback
5. Связка с pre-rendered "thinking" видео
6. Тестирование задержек и качества

### Фаза 3: Медиа-роутинг (1-2 недели)
1. Prisma миграция (MediaAsset)
2. Расширение cron worker — парсинг картинок/видео из блога
3. Media search service (PostgreSQL full-text)
4. Компонент MediaPanel
5. Интеграция в page.client.tsx
6. Тестирование показа медиа

### Фаза 4: Полировка и edge cases (1 неделя)
1. Кэширование внешних запросов
2. Обработка таймаутов и ошибок
3. Аналитика (какие запросы идут в external search, какие в media)
4. Оптимизация задержек
5. Тестирование на мобильных устройствах

---

## ENV переменные (новые)

```env
# Source routing
OPENAI_WEB_SEARCH_MODEL=gpt-4o-mini       # Модель для web search
SOURCE_CLASSIFIER_LLM_ENABLED=true         # Включить LLM-классификатор
EXTERNAL_SEARCH_TIMEOUT_MS=5000            # Таймаут поиска
EXTERNAL_SEARCH_CACHE_TTL_MS=300000        # Кэш 5 минут

# Media
MEDIA_SEARCH_LIMIT=10                      # Макс результатов поиска
MEDIA_PHOTO_DISPLAY_LIMIT=4                # Макс фото для показа
MEDIA_VIDEO_DISPLAY_LIMIT=1                # Макс видео для показа
```

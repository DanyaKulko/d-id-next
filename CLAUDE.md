# CLAUDE.md — Project Context for Claude Code

## Project Overview

Neil Avatar — сайт с интерактивными AI-аватарами. Пользователь выбирает «роль» Neil и через D-ID streaming общается с говорящим аватаром.
Цепочка: Azure Speech (распознавание голоса) -> OpenAI (генерация ответа) -> D-ID (рендер говорящего аватара).

- Backend: настройки аватаров (роли, инструкции), знания (предобработка, нарезка) — передается через API в D-ID.
- Frontend: выводит агентов из D-ID, пред-обрабатывает общение с пользователями.

## Tech Stack

- Next.js 16.1.1, React 19, TypeScript
- Prisma + PostgreSQL 18.1 (БД: `d-id-main`)
- BullMQ + Redis 8 (очереди задач)
- OpenAI API, Microsoft Speech SDK, D-ID Streaming API
- Biome (линтер/форматтер)

## Infrastructure

**Проект полностью работает через Docker Compose. Node.js на хосте НЕ установлен.**

- `node_modules` и `.next` существуют только внутри контейнера, на хосте их нет — это нормально.
- Docker Compose: `docker-compose.yml`
- Env-файл: `.env`

### Контейнеры

| Сервис | Контейнер | Назначение | Restart |
|--------|-----------|------------|---------|
| `app` | `d-id_next` | Next.js (порт 3000) | нет |
| `worker` | `d-id_cron_worker` | Cron-воркер (`tsx scripts/cron/knowledge-cron-worker.ts`) | always |
| `postgres` | `d-id_postgres` | PostgreSQL 18.1 | unless-stopped |
| `redis` | `d-id_redis` | Redis 8 | always |
| `external_sources_cron` | `d-id_external_sources_cron` | Alpine cron-скрипт | unless-stopped |

### Сеть

- Nginx на хосте проксирует `neilavatar.com` -> `localhost:3000`
- SSL — Let's Encrypt
- Prisma внутри docker-сети подключается к `d-id_postgres:5432`

## Key Commands

```bash
# Статус всех сервисов
sudo docker compose ps

# Запустить сайт (если контейнер остановлен)
sudo docker compose up -d app

# Пересобрать после изменений кода (ВАЖНО: всегда использовать --no-cache)
# Docker кеширует слой COPY, и без --no-cache изменения в src/ не попадут в билд
sudo docker compose build --no-cache app && sudo docker compose up -d app

# Логи приложения
sudo docker compose logs app --since 5m

# Логи воркера
sudo docker compose logs worker --since 5m
```

## Troubleshooting

- Если сайт не работает — первым делом `sudo docker compose ps`. Контейнер `d-id_next` может быть просто остановлен.
- У сервиса `app` нет `restart: always`, поэтому после перезагрузки сервера или краша он не поднимется автоматически.
- Prisma миграции запускаются автоматически при старте контейнера (entrypoint скрипт).

## Frontend Structure

### Глобальные стили

| Что | Файл |
|-----|------|
| Глобальный CSS | `src/app/globals.css` |
| Корневой layout | `src/app/layout.tsx` |

CSS-переменные (`--na-*`): цвета, отступы, типографика, тени. Шрифт — Nasalization.

### Главная страница (Home `/`)

| Что | Файл |
|-----|------|
| Верстка | `src/app/(client)/page.tsx` |
| CSS | `src/app/(client)/page.css` |

Сетка карточек с доступными ролями/аватарами (видео/фото фон, overlay с описанием).

### Страница роли (Avatar `/[avatarSlug]`)

| Что | Файл |
|-----|------|
| Верстка | `src/app/(client)/[avatarSlug]/page.tsx` |
| CSS | `src/app/(client)/[avatarSlug]/page.css` |
| Компонент AvatarStage | `src/app/(client)/[avatarSlug]/_components/AvatarStage/AvatarStage.css` |

Интерактивный интерфейс: D-ID стриминг, кнопка микрофона, выбор языка, fullscreen, медиа-панели.

### Логин

| Что | Файл |
|-----|------|
| Логин клиента | `src/app/login/page.tsx` + `src/app/login/page.css` |
| Логин админа | `src/app/admin/login/page.tsx` + `src/app/admin/login/page.css` |

### Админка

| Что | Файл |
|-----|------|
| Layout админки | `src/app/admin/(protected)/layout.tsx` + `layout.css` |
| Общие стили админки | `src/app/admin/(protected)/admin-shared.css` |
| Редактор ролей | `src/app/admin/(protected)/roles/[agentKey]/page.tsx` + `page.css` |
| Training | `src/app/admin/(protected)/training/page.tsx` + `page.css` |
| Settings | `src/app/admin/(protected)/settings/page.tsx` + `page.css` |

### Именование CSS-классов

- **`.na-*`** — клиентские компоненты (Neil Avatar)
- **`.gokhale-*`** — навбар админки
- Формы/кнопки в админке — семантические имена (`.btn-primary`, `.form-grid`, `.input-group`)

## Self-Instruction

При получении новых технических знаний о проекте — дополнять этот файл.
Добавлять только то, что нельзя быстро вычитать из кода: архитектурные решения, неочевидные зависимости, инфраструктурные особенности.

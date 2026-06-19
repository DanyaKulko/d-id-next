# Neil Avatar 3.0 — План внедрения

Ветка: `redesign/3.0-space` · Бэкап: тег `backup/pre-3.0-89c8bde` на `main`.

Принцип: фундамент → флагман (главная) → остальные поверхности → проверка сборкой → ревью.

## Этап 0. Страховка ✅
- [x] Ветка `redesign/3.0-space`.
- [x] Тег `backup/pre-3.0-<sha>` на main.
- [x] Документы SPEC.md / PLAN.md.

## Этап 1. Фундамент темы
- [ ] `src/app/theme-space.css`: `.na-theme-space { ...переопределение --na-* токенов... }`
      + базовые стили (текст, ссылки, скроллбар, селекшен), `@media reduced-motion`.
- [ ] `src/components/Starfield/Starfield.tsx` (`'use client'`) — порт `starfield.js`.
- [ ] `src/components/SpaceBackground/SpaceBackground.tsx` — фикс-слой: градиент + glow + grid + `<Starfield/>`.
- [ ] `(client)/layout.tsx`: обёртка `.na-theme-space` + `<SpaceBackground/>`.
- [ ] Импорт `theme-space.css` (в layout или globals).

## Этап 2. Главная `/` (флагман — «первый пример»)
- [ ] `.na-card-overlay`: белый `rgba(255,255,255,.5/.6)` → тёмный навы-скрим.
- [ ] `.na-card-title` / `.na-card-desc`: `#284664` → `#d8e3f2` (через токен).
- [ ] `.na-card` бордер/тень: персиковый → холодный blue + amber-glow на hover.
- [ ] HUD-углы `.na-card::before/::after` (amber, hover-яркость).
- [ ] inline-цвет в `page.tsx:65` («Click on any image») → класс/токен.
- [ ] `.na-card-image--empty` градиент → космический.
- [ ] Проверить reflow на 768px.

## Этап 3. Страница роли `/[avatarSlug]`
- [ ] page.css: mic-overlay/card, role-title/desc, status-badge, stage-btn, language-select,
      btn--primary (тёмный текст на amber), btn--interrupt, media-panel.
- [ ] AvatarStage.css: spinner → blue/amber, фон-сцены, рамка.
- [ ] MediaOverlay / MediaCarousel / DebugMediaPanel: уже тёмные — выровнять под палитру + glow.
- [ ] HUD-углы на `.na-stage-btn` и сцене `.na-avatar-container`.
- [ ] НЕ трогать status-indicator цвета, mute--active, transcript inline, WebGL canvas.
- [ ] Проверить pseudo-fullscreen и мобильный reflow контролов.

## Этап 4. Логин `/login`
- [ ] `.na-login-shell` тема + фон-слой.
- [ ] Карточка/инпуты/бордеры/тени → тёмные; amber focus-ring сохранить.
- [ ] Текст #284665 → светлый. Secure-badge — amber на тёмном.
- [ ] Лого — только цвет текста рядом; Lottie не трогаем.

## Этап 5. Popup-инструкция + Прелоадер
- [ ] UserGuideModal.module.css: тени `rgba(39,70,99,…)` → тёмные, неактивные точки, бордер-нав.
- [ ] Прелоадер `.na-preloader` в globals.css: белый градиент `#fff→#f5f7fb` → космический навы.

## Этап 6. Проверка и приёмка
- [ ] `docker compose build --no-cache app && up -d app` — сборка проходит.
- [ ] Скриншоты главная/роль/логин на desktop + мобайл (Safari-вью).
- [ ] Контраст AA, reduced-motion, отсутствие сдвигов вёрстки.
- [ ] Логика D-ID/микрофон/fullscreen не задета.
- [ ] Ревью изменений, мерж по решению заказчика.

## Принцип отката
Любая правка — только CSS + минимальные классы. Откат: `git checkout main` (тег-бэкап на месте).

# Проверки frontend

Команды выполняются из `frontend/`, Node.js 24 LTS. Браузерные наборы требуют установленного Google Chrome. Для локального интерфейсного просмотра backend не нужен: используется отдельный fixture API с вымышленными данными.

## Статические и unit-проверки

```sh
npm run typecheck
npm run lint
npm run lint:types
npm run test:boundaries
node --experimental-strip-types --test tests/history-v2.test.mjs tests/calendar-v2.test.mjs tests/portfolio-data.test.mjs tests/popover-position.test.mjs
```

Последние локальные результаты на 2026-11-08: typecheck, обычный и typed ESLint — код0; unit25/25, boundary56/56. В собственном `src/**/*.ts(x)` AST-проверка нашла0 explicit any. Type-aware правила охватывают все собственные TS-файлы, а не отдельный благополучный компонент.

## Браузерные наборы

```sh
npm run test:portfolio
npm run test:precision
```

Наборы запускаются по очереди: каждый владеет портами3210/3211 и автоматически поднимает локальный preview. Приёмка precision использует `QA_PHASE=after`.

Дополнительные темы и мобильная матрица, PowerShell:

```powershell
$env:THEME_QA_PHASE='after'
$env:THEME_QA_RUN='local'
npx --no-install playwright test --config playwright.theme.config.ts
$env:MOBILE_QA_PHASE='after'
npx --no-install playwright test --config playwright.mobile.config.ts
```

| Набор | Последний локальный результат |
|---|---|
| Portfolio | 84 PASS |
| Precision | 36 PASS |
| Темы | 160 PASS; после заключительных мобильных изменений страницы повторены8/8 |
| Mobile | 268 PASS, 20 SKIP; после заключительных CSS-изменений повторено48/48 |
| Startup/transport | 10 PASS в production и10 PASS с отдельным dev cache |
| Production build | PASS |

20 мобильных SKIP относятся к компактному меню/панелям на desktop1024/1280, где они отсутствуют по дизайну. Полный и targeted прогоны указаны отдельно; результаты не выдаются за один новый полный запуск. В fixture-режиме неуспешные внешние операции не подменяются успешными записями.

Мобильная матрица:320×740,360×800,390×844,430×932,768×1024,1024×768,1280×800 и landscape844×390, light/dark, touch. Матрица тем:390×844,768×1024,1280×800,1920×900. Проверяются14 страниц, геометрия и прокрутка, диалоги и формы, focus/Escape, длинный текст, loading/empty/error, переключение и сохранение темы.

## Изолированная production-сборка для QA

PowerShell:

```powershell
$env:PORTFOLIO_QA='1'
$env:PORTFOLIO_QA_MODE='production'
$env:AUTH_API_URL='http://127.0.0.1:3211'
$env:NEXT_PUBLIC_WS_API_URL='http://127.0.0.1:3211'
$env:AUTH_APP_ORIGIN='http://127.0.0.1:3210'
$env:AUTH_APP_ORIGINS='http://127.0.0.1:3210'
npm run build
npm run test:portfolio
```

Build запускается до preview: они используют один `.next-portfolio-production`. Для обычного production-окружения задайте настоящие адреса отдельно. Обычный dev использует `.next`, QA dev — `.next-portfolio`; исходный живой dev-сервер не требуется останавливать.

## Скриншоты

Изображения README находятся в `docs/assets/`. Для повторного создания базовой галереи запустите `npm run demo:portfolio`, затем в другом терминале из `frontend/` — `node scripts/capture-portfolio.mjs`. Это явное обновление выбранных изображений; результат необходимо просмотреть. Тёмный Tasks-снимок в галерее взят из theme-матрицы.

Логи, traces, подробные JSON-отчёты и массовые QA-снимки сохраняются в игнорируемой `artifacts/`; в Git публикуется только выбранная галерея. Проверки не обновляют golden snapshots молча.

## Ограничения

Мобильная версия находится в разработке. Физическая клавиатура/IME, screen reader, Firefox/WebKit и полная WCAG-сертификация NOT VERIFIED. Реальные OAuth/AI, внешняя синхронизация, запись финансов и настоящий upload/download не подтверждаются fixture-тестами. Исторический ChunkLoadError не воспроизведён, его исходная причина не установлена.

Последняя проверка зависимостей: production audit0; полный audit8 moderate dev-зависимостей в цепочке minimatch, без high/critical. Связанная advisory: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Major override не применялся. Это локальные результаты, а не обещание неизменности будущего audit или статус GitHub CI. Перед реальным deployment необходима отдельная проверка backend, секретов и провайдеров.

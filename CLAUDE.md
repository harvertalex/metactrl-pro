# MetaCtrl PRO — Контекст проекта

## Что это

JS bookmarklet для Facebook Ads Manager — автоматизация правил паузирования/включения кампаний, column presets, аналитика, inspector. Генерирует FB API v23.0 autorules через adrules_library.

**Статус:** Production  
**Live (primary):** https://harvertalex.github.io/metactrl-pro/  
**Live (backup):** http://94.130.220.232/metactrl/

---

## Где живёт проект

| Место | Адрес | Назначение |
|-------|-------|-----------|
| **GitHub** | https://github.com/harvertalex/metactrl-pro | Source of truth, git history |
| **GitHub Pages** | https://harvertalex.github.io/metactrl-pro/ | Primary хостинг (HTTPS, CDN) |
| **Локально** | `c:/Users/vert/claude-workspace/code/metactrl-pro/` | Разработка |
| **Сервер backup** | `http://94.130.220.232/metactrl/` | Fallback, CAPI Server 1 |

**Remote:** `https://github.com/harvertalex/metactrl-pro.git`  
**Branch:** `main` — GitHub Pages деплоит автоматически при каждом пуше

---

## Сервер (backup)

| Параметр | Значение |
|----------|----------|
| **IP** | `94.130.220.232` (CAPI Server 1) |
| **SSH ключ** | `~/.ssh/capi-server1` |
| **Web root** | `/var/www/html/metactrl/` |
| **URL mapping** | Apache default DocumentRoot `/var/www/html/` → URL `/metactrl/` |
| **Web server** | Apache2 (общий с CAPI Panel — НЕ трогать VirtualHost) |

```bash
ssh -i ~/.ssh/capi-server1 root@94.130.220.232
ssh -i ~/.ssh/capi-server1 root@94.130.220.232 "ls -lah /var/www/html/metactrl/"
ssh -i ~/.ssh/capi-server1 root@94.130.220.232 "tail -f /var/log/apache2/error.log"
```

⚠️ **На сервере живёт CAPI Panel** — `deploy.ts` НЕ должен трогать Apache config/VirtualHost/PHP install, только заливать `install-page.html` + `index.html` в `/var/www/html/metactrl/`.

---

## Рабочий процесс разработки → деплой

### 1. Изменения в коде (bookmarklet.js)

```bash
# Отредактировать код
code/metactrl-pro/bookmarklet.js

# Тестировать локально в браузере через index.html
```

### 2. Регенерация Base64 (обязательно перед деплоем)

Bookmarklet работает как B64-кодированная строка. B64 живёт в **одном файле** — `install-page.html`. ⚠️ `index.html` теперь = **hub-витрина** (карточки на 3 инструмента), B64 в нём нет — не писать туда.

```bash
cd code/metactrl-pro && node -e "
const fs = require('fs');
const code = fs.readFileSync('bookmarklet.js', 'utf8');
const b64 = Buffer.from(code, 'utf8').toString('base64');
const tag = \"var B64 = '\" + b64 + \"'\";
['install-page.html'].forEach(f => {
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/var B64 = '[^']*'/, tag), 'utf8');
});
console.log('B64 updated, length:', b64.length);
"
```

**FB Launcher** — отдельный бакмарклет (`launcher.js` → `install-launcher.html`), регенится и версионируется ОДНИМ скриптом:

```bash
cd code/metactrl-pro && node regen-launcher.mjs
```

Source of truth версии = баннер в шапке `launcher.js` (`FB Launcher vX.Y.Z — Bookmarklet`). Скрипт: (1) регенит B64, (2) стемпит эту версию во все вывески `install-launcher.html` (badge + footer), (3) sanity-чек на дрейф с in-panel заголовком (`>FB LAUNCHER // vX.Y.Z<`). **Версию бампаешь ТОЛЬКО в двух местах `launcher.js` — шапка + заголовок — остальное синхронится само.** `deploy.bat regen` дёргает и MetaCtrl, и этот скрипт.

### 3. Пуш на GitHub → GitHub Pages (primary)

```bash
cd code/metactrl-pro
git add bookmarklet.js install-page.html index.html
git commit -m "Update bookmarklet: [описание]"
git push
# GitHub Pages задеплоит за 1-2 минуты автоматически
```

### 4. Опционально: обновить backup сервер

```bash
cd code/metactrl-pro && bun deploy.ts
```

### 5. Проверка

```bash
curl -s -o /dev/null -w "%{http_code}" https://harvertalex.github.io/metactrl-pro/
# 200 = OK
```

---

## Структура проекта

```
code/metactrl-pro/
├── CLAUDE.md                  ← этот файл (контекст проекта)
├── index.html                 ← HUB-витрина (карточки на 3 инструмента, без B64)
├── bookmarklet.js             ← MetaCtrl PRO — основной код (3100+ строк)
├── install-page.html          ← MetaCtrl PRO — страница установки (содержит B64)
├── loader.html                ← MetaCtrl PRO — auto-update loader (не на хабе, untracked)
├── launcher.js                ← FB Launcher — код
├── install-launcher.html      ← FB Launcher — страница установки (содержит B64)
├── regen-launcher.mjs         ← FB Launcher — регенератор B64 + version-stamp
├── creative-uploader/         ← Creative Uploader — отдельный инструмент (заливка + JSON-хеши)
│   ├── index.html             ←   страница установки (содержит B64)
│   ├── bookmarklet.js         ←   код
│   └── build.js               ←   сборка index.html из bookmarklet.js
├── deploy.ts                  ← Деплой на CAPI Server 1: hub + все страницы + creative-uploader/
├── deploy-check.ts            ← Проверка SSH доступа и структуры сервера
└── README.md                  ← документация для пользователей
```

**Страницы (одинаковы на GitHub Pages и backup):**

| URL | Что |
|-----|-----|
| `/` (`index.html`) | Hub — витрина инструментов |
| `/install-page.html` | MetaCtrl PRO (установка) |
| `/install-launcher.html` | FB Launcher (установка) |
| `/creative-uploader/` | Creative Uploader (установка) |

---

## FB API Ограничения (ВАЖНО!)

### Заблокированные поля на ADSET/AD уровне (FB API error #CBO)

Эти поля работают только на CAMPAIGN level:

- `cost_per_link_click`
- `cost_per_lead_fb`
- `cost_per_purchase_fb`
- `cost_per_complete_registration_fb`
- `website_purchase_roas`
- `ctr`
- `frequency`

**Если используешь эти поля на ADSET/AD**, правила будут пропущены с логом `⚠️ skip`.

### Разрешённые поля на всех уровнях

- `spent` (спенд)
- `link_click` (счётчик кликов)
- `impressions` (показы)
- `offsite_conversion.fb_pixel_*` (conversions)
- `name` (имя сущности)
- `time_preset` (TODAY, LAST_7D и т.д.)

---

## Rate Limiting (FB API)

При создании правил API может отвергнуть запрос с ошибкой `code: 17` ("User request limit").

**Конфиг в bookmarklet.js:**

```javascript
CONFIG.RATE_MS = 3000;              // пауза между каждым rule POST (3 сек)
CONFIG.ACCOUNT_PAUSE_MS = 8000;     // пауза между аккаунтами (8 сек)
CONFIG.BACKOFF_BASE_MS = 20000;     // экспоненциальный backoff (20 сек)
CONFIG.MAX_RETRIES = 5;             // макс 5 попыток перед сдачей
```

Если кажется что правила создаются слишком медленно, можно снизить RATE_MS, но риск превышить лимит выше.

---

## Правила генератора (runGenerator)

**Все правила в bookmarklet.js ~строки 1100–1586.**

### PAUSE правила (отключение)

Используют свободные поля (spent, link_click, impressions):

- **TurnOff Without Clicks** — 0 кликов + спенд ≥ maxCPC × 2
- **TurnOff Expensive CPC** — CPC > max + спенд ≥ maxCPC × 2
- **TurnOff Without Leads** — 3+ клика + спенд ≥ maxLeadCost × 1.5
- **TurnOff Expensive Leads** — CPL > max + спенд ≥ maxLeadCost × 1.5
- **TurnOff Without Registrations** — 3+ клика + 2+ лида + спенд ≥ maxCPARegistration × 1.5
- **TurnOff Expensive Registrations** — CPA > max (2+ рег)
- **TurnOff Without Purchases** — спенд ≥ maxDepositCost, 0 purchases
- **TurnOff Expensive Purchases** — CPP > max + ROAS < min + спенд проверен
- **CTR Guard** — низкий CTR + спенд (CAMPAIGN only)
- **Frequency Burn** — частота > max + спенд (CAMPAIGN only)
- **Impressions Guard** — много имп + 0 conversions
- **Daily Budget Exhaustion** — спенд исчерпал дневной бюджет

### UNPAUSE правила (включение)

- **TurnOn If Clicks Present** — клики есть + CPC ok + спенд ≥ maxCPC × 2
- **TurnOn If Leads Present** — лид есть + CPL ok (CAMPAIGN only)
- **TurnOn If Registrations Present** — рег есть + CPA ok (CAMPAIGN only)
- **TurnOn If Purchases Present** — purchase есть + CPP ok (CAMPAIGN only)
- **TurnOn If Cheap Lead/Registration/Purchase** — цена ниже на recoveryMult % (CAMPAIGN only)

### Schedule правила

- **TurnOn/Off by Name at Time** — включить/отключить по названию в конкретное время
- **ROAS: Boost/Cut budget if...** — изменить бюджет если ROAS выше/ниже

---

## Примечания по кодированию

- **Язык:** JavaScript (ES6+)
- **Стиль:** Компактный, без излишних комментариев
- **Переиспользование:** ssh-client модуль для деплоя
- **Тестирование:** Локально в браузере через install-page.html перед деплоем

---

## Чек-лист перед деплоем

- [ ] Отредактирован bookmarklet.js
- [ ] Регенерирован B64 в install-page.html (`node -e "..."`)
- [ ] Локально тестирована новая версия
- [ ] Запущен `bun deploy.ts`
- [ ] Проверена доступность http://94.130.220.232/metactrl/install-page.html
- [ ] Проверена доступность https://harvertalex.github.io/metactrl-pro/

---

## Полезные команды

```bash
# Деплой + проверка
cd code/metactrl-pro && bun deploy.ts && echo "✅ Deploy complete"

# Регенерация B64 + деплой (один шаг)
cd code/metactrl-pro && \
  node -e "const fs = require('fs'); const code = fs.readFileSync('bookmarklet.js', 'utf8'); const b64 = Buffer.from(code, 'utf8').toString('base64'); const html = fs.readFileSync('install-page.html', 'utf8'); fs.writeFileSync('install-page.html', html.replace(/var B64 = '[^']*'/, \"var B64 = '\" + b64 + \"'\"), 'utf8'); console.log('B64 updated');" && \
  bun deploy.ts

# Проверка что файлы на сервере
ssh -i ~/.ssh/capi-server1 root@94.130.220.232 "ls -lah /var/www/html/metactrl/"

# Размер B64 в текущей версии
grep -o "var B64 = '[^']*'" code/metactrl-pro/install-page.html | wc -c
```

---

## История версий

| Версия | Дата | Что изменилось |
|--------|------|----------------|
| 1.0 | 2026-04-08 | Первичный деплой на tessa-bot. Авторулы, column presets, analytics, inspector. B64: 220552 |
| | | Улучшены правила на клики: спенд × 2. Улучшены правила на лиды/регистрации: спенд × 1.5 |

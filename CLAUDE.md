# MetaCtrl PRO — Контекст проекта

## Что это

JS bookmarklet для Facebook Ads Manager — автоматизация правил паузирования/включения кампаний, column presets, аналитика, inspector. Генерирует FB API v23.0 autorules через adrules_library.

**Статус:** Production  
**Live (primary):** https://harvertalex.github.io/metactrl-pro/  
**Live (backup):** http://192.248.190.182/

---

## Где живёт проект

| Место | Адрес | Назначение |
|-------|-------|-----------|
| **GitHub** | https://github.com/harvertalex/metactrl-pro | Source of truth, git history |
| **GitHub Pages** | https://harvertalex.github.io/metactrl-pro/ | Primary хостинг (HTTPS, CDN) |
| **Локально** | `c:/Users/harve/claude-workspace/code/metactrl-pro/` | Разработка |
| **Сервер backup** | `http://192.248.190.182/` | Fallback, tessa-bot |

**Remote:** `https://github.com/harvertalex/metactrl-pro.git`  
**Branch:** `main` — GitHub Pages деплоит автоматически при каждом пуше

---

## Сервер (backup)

| Параметр | Значение |
|----------|----------|
| **IP** | `192.248.190.182` (tessa-bot) |
| **SSH ключ** | `~/.ssh/tessa-bot` |
| **Web root** | `/var/www/metactrl-pro` |
| **Web server** | Apache2 |

```bash
ssh -i ~/.ssh/tessa-bot root@192.248.190.182
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "systemctl restart apache2"
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "tail -f /var/log/apache2/metactrl-pro-error.log"
```

---

## Рабочий процесс разработки → деплой

### 1. Изменения в коде (bookmarklet.js)

```bash
# Отредактировать код
code/metactrl-pro/bookmarklet.js

# Тестировать локально в браузере через index.html
```

### 2. Регенерация Base64 (обязательно перед деплоем)

Bookmarklet работает как B64-кодированная строка. B64 хранится в **двух файлах**: `install-page.html` и `index.html`.

```bash
cd code/metactrl-pro && node -e "
const fs = require('fs');
const code = fs.readFileSync('bookmarklet.js', 'utf8');
const b64 = Buffer.from(code, 'utf8').toString('base64');
const tag = \"var B64 = '\" + b64 + \"'\";
['install-page.html', 'index.html'].forEach(f => {
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/var B64 = '[^']*'/, tag), 'utf8');
});
console.log('B64 updated in both files, length:', b64.length);
"
```

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
├── bookmarklet.js             ← основной код (3100+ строк)
├── install-page.html          ← страница установки (содержит B64)
├── deploy.ts                  ← Depo скрипт (установка Apache + загрузка файлов)
├── deploy-check.ts            ← Проверка SSH доступа и структуры сервера
└── README.md                  ← документация для пользователей
```

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
- [ ] Проверена доступность http://192.248.190.182/install-page.html
- [ ] Логи Apache чистые (нет 5xx ошибок)

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
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "ls -lah /var/www/metactrl-pro/"

# Размер B64 в текущей версии
grep -o "var B64 = '[^']*'" code/metactrl-pro/install-page.html | wc -c
```

---

## История версий

| Версия | Дата | Что изменилось |
|--------|------|----------------|
| 1.0 | 2026-04-08 | Первичный деплой на tessa-bot. Авторулы, column presets, analytics, inspector. B64: 220552 |
| | | Улучшены правила на клики: спенд × 2. Улучшены правила на лиды/регистрации: спенд × 1.5 |

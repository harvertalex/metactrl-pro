# MetaCtrl PRO — Контекст проекта (Чек-лист для Claude)

## 🚀 Когда начинаешь работать с проектом

### 1️⃣ Прочитать контекст
- [ ] `code/metactrl-pro/CLAUDE.md` — основной контекст (SSH, API, правила)
- [ ] `code/metactrl-pro/QUICKSTART.md` — быстрый старт разработки

### 2️⃣ Запомнить ключевые параметры

**Сервер деплоя:**
```
IP: 192.248.190.182 (tessa-bot)
SSH ключ: ~/.ssh/tessa-bot
Web root: /var/www/metactrl-pro
Web server: Apache2
Live: http://192.248.190.182/install-page.html
```

**Регенерация B64:**
```bash
# Всегда после изменений bookmarklet.js!
node -e "const fs = require('fs'); const code = fs.readFileSync('bookmarklet.js', 'utf8'); const b64 = Buffer.from(code, 'utf8').toString('base64'); const html = fs.readFileSync('install-page.html', 'utf8'); fs.writeFileSync('install-page.html', html.replace(/var B64 = '[^']*'/, \"var B64 = '\" + b64 + \"'\"), 'utf8'); console.log('✓ B64 updated');"
```

**Деплой:**
```bash
cd code/metactrl-pro && bun deploy.ts
```

### 3️⃣ Проверить что стоит

```bash
# Node.js
node --version

# Bun
bun --version

# SSH ключ
ls ~/.ssh/tessa-bot

# SSH доступ (должна быть ok)
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "echo ok"
```

---

## 📝 Типовые задачи

### Задача: Добавить новое правило

1. Отредактировать `bookmarklet.js` (~строки 1100–1586)
2. Добавить условия в `runGenerator()`
3. Регенерировать B64
4. Деплой на сервер
5. Тестировать в Ads Manager

**Пример:** TurnOff Without X

```javascript
if (selectedRules.includes('TurnOff Without X')) {
  const spendThreshold = Math.round(maxCost * 1.5);
  await addRule(
    `TurnOff ${artype} Without X (3+ events & spend≥${(spendThreshold/100).toFixed(2)})`,
    kw([
      { field:'link_click', operator:'GREATER_THAN', value:2 },
      { field:'spent', operator:'GREATER_THAN', value:spendThreshold },
      { field:'offsite_conversion.fb_pixel_X', operator:'LESS_THAN', value:1 },
      { field:'entity_type', operator:'EQUAL', value:artype },
      presetToday
    ]),
    execPause(), schedSemi
  );
}
```

### Задача: Изменить пороги (maxCPC, maxLeadCost и т.д.)

Это делается в UI (install-page.html → Settings), не в коде.

Пороги хранятся в объекте `thresholds`:
```javascript
const { maxCPC, maxLeadCost, maxCPARegistration, maxDepositCost } = thresholds;
```

### Задача: Обновить UI (кнопки, инпуты и т.д.)

UI находится в `mountUI()` (~строки 400–1100).

Обновить, регенерировать B64, деплой.

---

## ⚠️ Важные ограничения

### FB API field restrictions

Эти поля работают только на CAMPAIGN level:
- `cost_per_link_click`
- `cost_per_lead_fb`
- `cost_per_purchase_fb`
- `cost_per_complete_registration_fb`
- `website_purchase_roas`
- `ctr`
- `frequency`

Если использовать на ADSET/AD — правило будет пропущено с логом ⚠️.

### Rate limiting

FB API может отклонить запрос с `code: 17` (User request limit).

Система автоматически ждит и повторяет. Если много правил — может занять 2-3 минуты.

### Спенд для запуска правил

- **Клики:** спенд ≥ maxCPC × 2
- **Лиды:** спенд ≥ maxLeadCost × 1.5
- **Регистрации:** спенд ≥ maxCPARegistration × 1.5
- **Покупки:** спенд ≥ maxDepositCost × 2

---

## 🐛 Трабушутинг

### Деплой не работает

```bash
# 1. Проверить SSH
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "echo ok"

# 2. Проверить что Node.js установлен
node --version

# 3. Проверить Bun
bun --version

# 4. Запустить деплой с логами
bun deploy.ts 2>&1 | tail -50
```

### Правила не создаются в Ads Manager

1. Открыть F12 → Console в браузере
2. Проверить логи (должны быть URL созданных правил)
3. Если ошибка 17 — подождать 5 минут и повторить
4. Если ошибка 🚫 CAMPAIGN only — используешь ADSET/AD с запрещённым полем

### Сайт не доступен по IP

```bash
# Проверить что на сервере
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "ls -lah /var/www/metactrl-pro/"

# Проверить Apache
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "systemctl status apache2"

# Перезагрузить
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "systemctl restart apache2"

# Проверить логи
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "tail -20 /var/log/apache2/metactrl-pro-error.log"
```

### B64 не обновился после deплоя

B64 регенерируется отдельно! После изменения bookmarklet.js **ОБЯЗАТЕЛЬНО** запустить:

```bash
node -e "const fs = require('fs'); const code = fs.readFileSync('bookmarklet.js', 'utf8'); const b64 = Buffer.from(code, 'utf8').toString('base64'); const html = fs.readFileSync('install-page.html', 'utf8'); fs.writeFileSync('install-page.html', html.replace(/var B64 = '[^']*'/, \"var B64 = '\" + b64 + \"'\"), 'utf8'); console.log('✓ B64 length:', b64.length);"
```

Потом деплоить.

---

## 📊 Размеры B64

| Версия | Дата | Размер |
|--------|------|--------|
| 1.0 | 2026-04-08 | 220552 |
| | (после улучшения спенд-проверок) | 220552 |

Размер зависит от количества символов в bookmarklet.js. Если кодом получается ~3100 строк → B64 ~220000 символов.

---

## 🔗 Полезные ссылки

- **Live:** http://192.248.190.182/install-page.html
- **SSH:** `ssh -i ~/.ssh/tessa-bot root@192.248.190.182`
- **Логи:** `ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "tail -f /var/log/apache2/metactrl-pro-error.log"`
- **Docs:** [code/metactrl-pro/CLAUDE.md](CLAUDE.md)
- **Quick start:** [code/metactrl-pro/QUICKSTART.md](QUICKSTART.md)

---

## ✅ Чек-лист перед finish сессии

- [ ] Все изменения закоммичены
- [ ] B64 регенерирован (если были изменения bookmarklet.js)
- [ ] Деплой прошел успешно
- [ ] Сайт доступен http://192.248.190.182/install-page.html
- [ ] Обновлена память проекта (если нужно)

---

**Last updated:** 2026-04-08

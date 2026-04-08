# MetaCtrl PRO — Структура проекта

## Файлы проекта

```
code/metactrl-pro/
├── CLAUDE.md                 ← ГЛАВНЫЙ КОНТЕКСТ ПРОЕКТА
│                              - SSH параметры (192.248.190.182, ~/.ssh/tessa-bot)
│                              - Web root (/var/www/metactrl-pro)
│                              - Все параметры сервера и API
│                              - История версий
│
├── QUICKSTART.md             ← Быстрый старт для разработки
│                              - Шаги: отредактировать → регенерировать → деплой
│                              - Примеры команд
│                              - Трабушутинг
│
├── README.md                 ← Для пользователей
│                              - Как установить bookmarklet
│                              - Какие правила доступны
│                              - FAQ
│
├── PROJECT-STRUCTURE.md      ← этот файл
│
├── bookmarklet.js            ← ОСНОВНОЙ КОД (~3100 строк)
│                              - runGenerator() — генератор правил (~1100-1586)
│                              - UI компоненты
│                              - FB API интеграция
│                              - Column Presets логика
│                              - Inspector
│
├── install-page.html         ← Страница установки (с B64 переменной!)
│                              - Содержит весь код bookmarklet.js как Base64
│                              - var B64 = '...' (~220000+ символов)
│                              - UI для копирования bookmarklet
│
├── deploy.ts                 ← Bun скрипт для деплоя на сервер
│                              - Установка Apache2 + PHP
│                              - Загрузка файлов
│                              - Конфигурация Apache
│                              - Проверка доступности
│
├── deploy-check.ts           ← Проверка SSH доступа и структуры сервера
│                              - Ping до сервера
│                              - Проверка web root
│                              - Проверка дискового пространства
│
├── deploy.bat                ← Windows скрипт для быстрого деплоя
│                              - deploy.bat full → регенерирует B64 + деплоит
│                              - deploy.bat regen → только регенерирует B64
│                              - deploy.bat check → проверка сервера
│
├── makefile.sh               ← Bash скрипт для управления
│                              - ./makefile.sh deploy-full
│                              - ./makefile.sh check
│                              - ./makefile.sh logs
│                              - ./makefile.sh restart
│
└── .gitignore               ← Исключены узлы (не трекируем B64)
```

## Workflow разработки

### 1. Изменяешь код
```bash
# Отредактировать bookmarklet.js
code bookmarklet.js
```

### 2. Регенерируешь B64
```bash
# Windows
deploy.bat regen

# или Bash
./makefile.sh regen-b64

# или вручную
node -e "..."
```

### 3. Деплоишь на сервер
```bash
# Windows
deploy.bat

# или Bash
./makefile.sh deploy

# или вручную
bun deploy.ts
```

### 4. Все в одну команду
```bash
# Windows
deploy.bat full

# или Bash
./makefile.sh deploy-full
```

## Сервер

- **IP:** 192.248.190.182 (tessa-bot)
- **SSH ключ:** ~/.ssh/tessa-bot
- **Web root:** /var/www/metactrl-pro
- **Web server:** Apache2
- **Live:** http://192.248.190.182/install-page.html

### SSH команды

```bash
# Подключение
ssh -i ~/.ssh/tessa-bot root@192.248.190.182

# Проверить статус Apache
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "systemctl status apache2"

# Перезагрузить
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "systemctl restart apache2"

# Просмотреть файлы на сервере
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "ls -lah /var/www/metactrl-pro/"
```

## Важные моменты

### B64 регенерация

Bookmarklet работает как закодированная строка в install-page.html:
```html
<script>var B64 = 'YWxlcnQoInRlc3QiKTsgLy8gY...очень много символов...';</script>
```

Когда меняешь bookmarklet.js, **ОБЯЗАТЕЛЬНО** регенерировать эту переменную, иначе changes не попадут на клиентов.

### FB API ограничения (CAMPAIGN ONLY)

Эти поля работают только на CAMPAIGN level:
- cost_per_link_click
- cost_per_lead_fb
- cost_per_purchase_fb
- cost_per_complete_registration_fb
- website_purchase_roas
- ctr
- frequency

Если используешь их на ADSET/AD, правила будут пропущены.

### Rate limiting

При создании 30+ правил одновременно FB API может выдать ошибку:
```
code: 17 (User request limit)
```

Система автоматически retry с exponential backoff. Если очень много правил, они создаваться будут ~2-3 минуты.

## Git/Version control

```bash
# Отслеживаем исходный код
git add bookmarklet.js
git add CLAUDE.md
git add deploy.ts
git add *.md

# НЕ отслеживаем большую B64 переменную (если в отдельном файле)
# Но так как она в install-page.html, можно отследить (только html, не exe)
git add install-page.html
```

## Проверки перед пушем в main

- [ ] Код отредактирован и протестирован локально
- [ ] B64 регенерирован (`node -e "..."`)
- [ ] Деплой прошел успешно (`bun deploy.ts`)
- [ ] Сайт доступен по IP (http://192.248.190.182/install-page.html)
- [ ] Нет 5xx ошибок в логах Apache
- [ ] Коммит на English с описанием changes

---

**Created:** 2026-04-08  
**Last updated:** 2026-04-08

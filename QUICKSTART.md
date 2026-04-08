# MetaCtrl PRO — Quickstart

## Первая установка

Уже готово! Сайт установлен на http://192.248.190.182/install-page.html

## Разработка → Деплой (стандартный процесс)

### Шаг 1: Отредактируй код
```bash
code bookmarklet.js
```
Изменяешь логику правил, UI или конфиг.

### Шаг 2: Регенерируй B64 + Деплой

**Вариант A (Windows):**
```bash
deploy.bat full
```

**Вариант B (Bash/Mac/Linux):**
```bash
./makefile.sh deploy-full
```

**Вариант C (Вручную):**
```bash
# 1. Регенерация B64
node -e "const fs = require('fs'); const code = fs.readFileSync('bookmarklet.js', 'utf8'); const b64 = Buffer.from(code, 'utf8').toString('base64'); const html = fs.readFileSync('install-page.html', 'utf8'); fs.writeFileSync('install-page.html', html.replace(/var B64 = '[^']*'/, \"var B64 = '\" + b64 + \"'\"), 'utf8'); console.log('✓ B64 updated');"

# 2. Деплой
bun deploy.ts
```

### Шаг 3: Проверка

Открыть http://192.248.190.182/install-page.html в браузере.

---

## Что означает регенерация B64?

Bookmarklet работает как bookmarklet — JavaScript код, который браузер выполняет при клике.

Сайт хранит весь код в виде Base64 строки в переменной `var B64` в `install-page.html`.

Когда ты меняешь `bookmarklet.js`, нужно регенерировать эту строку, чтобы install-page.html получила обновленный код.

---

## Часто используемые команды

```bash
# Деплой (полный цикл)
deploy.bat full          # или
./makefile.sh deploy-full

# Только регенерация B64 (без деплоя)
deploy.bat regen         # или
./makefile.sh regen-b64

# Только деплой (если B64 уже обновлен)
deploy.bat               # или
bun deploy.ts

# Проверка что на сервере
./makefile.sh check      # или
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "ls -lah /var/www/metactrl-pro/"

# Просмотр логов Apache
./makefile.sh logs       # или
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "tail -20 /var/log/apache2/metactrl-pro-error.log"
```

---

## Структура файлов

| Файл | Назначение |
|------|-----------|
| `bookmarklet.js` | Основной код (3100+ строк) |
| `install-page.html` | Страница установки + B64 переменная |
| `deploy.ts` | Деплой скрипт (bun) |
| `deploy.bat` | Быстрый деплой (Windows) |
| `makefile.sh` | Команды управления (Bash) |
| `CLAUDE.md` | Полный контекст проекта |

---

## Сервер

- **IP:** 192.248.190.182
- **Web root:** /var/www/metactrl-pro
- **Web server:** Apache2
- **SSH ключ:** ~/.ssh/tessa-bot
- **Доступ:** http://192.248.190.182/install-page.html

---

## Трабушутинг

### deploy.bat full не работает

Убедись что:
1. Стоит Node.js: `node --version`
2. Стоит Bun: `bun --version`
3. SSH ключ на месте: `ls ~/.ssh/tessa-bot`

### Apache не перезагружается

```bash
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "systemctl restart apache2"
```

### Сайт недоступен по IP

```bash
ssh -i ~/.ssh/tessa-bot root@192.248.190.182 "curl -I http://localhost/install-page.html"
```

Если 404 — файл не загрузился. Запустить deploy.ts заново.

### Проверить размер B64

```bash
grep -o "var B64 = '[^']*'" install-page.html | wc -c
```

Должен быть примерно 220000+ символов.

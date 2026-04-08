# MetaCtrl PRO

**Автоматизация правил управления кампаниями в Facebook Ads Manager.**

- ✅ Автоматические правила паузирования/включения (Autorules)
- ✅ Column Presets для быстрой фильтрации
- ✅ Analytics Dashboard встроенная
- ✅ Inspector для отладки

---

## Установка

1. Открыть 
2. Нажать "Copy Bookmarklet"
3. Создать новую закладку в браузере
4. Вставить код в URL закладки
5. Открыть Facebook Ads Manager и нажать закладку

---

## Использование

### 1. Генерация автоправил

После установки bookmarklet в Ads Manager:

1. Нажать закладку MetaCtrl PRO
2. Перейти на вкладку **Generator**
3. Выбрать уровень (Campaign/Adset/Ad)
4. Настроить пороги (maxCPC, maxLeadCost и т.д.)
5. Выбрать нужные правила
6. Нажать **Generate Rules**

Правила создадутся в Facebook Ads Manager → Tools → Autorules.

### 2. Column Presets

Сохранить свой набор колонок:
1. Настроить нужные колонки в Ads Manager
2. Нажать MetaCtrl → **Column Presets** → **Save**
3. Дать имя пресету
4. В следующий раз быстро переключаться между пресетами

### 3. Inspector

Отладка правил:
1. MetaCtrl → **Inspector**
2. Выбрать кампанию/адсет
3. Посмотреть какие правила на неё действуют

---

## Доступные правила

### Паузирование (PAUSE)

- **TurnOff Without Clicks** — нет кликов после спенда
- **TurnOff Expensive CPC** — слишком дорогой клик
- **TurnOff Without Leads** — нет лидов после спенда
- **TurnOff Expensive Leads** — слишком дорогой лид
- **TurnOff Without Registrations** — нет рег после спенда и лидов
- **TurnOff Without Purchases** — нет покупок после спенда
- **TurnOff Expensive Purchases** — слишком дорогая покупка
- **CTR Guard** — слишком низкий CTR
- **Frequency Burn** — частота слишком высокая
- **Daily Budget Exhaustion** — дневной бюджет исчерпан

### Включение (UNPAUSE)

- **TurnOn If Clicks Present** — клики есть и цена хорошая
- **TurnOn If Leads Present** — лиды есть и цена хорошая
- **TurnOn If Registrations Present** — регистрации есть и цена хорошая
- **TurnOn If Purchases Present** — покупки есть и цена хорошая

### ROAS правила

- **ROAS: Boost budget if high** — увеличить бюджет если ROAS высокий
- **ROAS: Cut budget if low** — снизить бюджет если ROAS низкий
- **ROAS: Pause if low** — паузировать если ROAS упал ниже минимума

---

## Что означают пороги?

| Параметр | Пример | Значение |
|----------|--------|----------|
| **maxCPC** | $0.50 | Максимальная цена за клик. Если дороже — паузировать |
| **maxLeadCost** | $5.00 | Максимальная цена за лид. Если дороже — паузировать |
| **maxCPARegistration** | $8.00 | Максимальная цена за регистрацию |
| **maxDepositCost** | $25.00 | Максимальная цена за покупку |

**Спенд для запуска правил:**
- Клики/CPC: спенд должен быть ≥ maxCPC × 2 (для достоверности)
- Лиды: спенд должен быть ≥ maxLeadCost × 1.5
- Регистрации: спенд должен быть ≥ maxCPARegistration × 1.5
- Покупки: спенд должен быть ≥ maxDepositCost

---

## FAQ

**Q: Почему правила не создаются?**
A: Проверь лог в браузере (F12 → Console). Обычно это ограничение FB API — подожди 5 минут и повтори.

**Q: Можно ли использовать на Adset уровне?**
A: Да, но некоторые правила (CPC, CPL, CPP, ROAS) работают только на Campaign level (FB API ограничение). На Adset/Ad будут пропущены с логом ⚠️.

**Q: Как удалить все правила?**
A: Перейти в Facebook Ads Manager → Tools → Autorules → выбрать все → Delete.

**Q: Правила создаются слишком медленно.**
A: Это нормально — система ждёт между запросами чтобы не превысить API лимит Facebook. Обычно 30 правил ~2-3 минуты.

**Q: Можно ли скопировать правила между аккаунтами?**
A: Да — используй кнопку **Export** в Manager, потом **Import** в другом браузере/аккаунте.

---

## Техподдержка

Контекст проекта: `code/metactrl-pro/CLAUDE.md`
Быстрый старт: `code/metactrl-pro/QUICKSTART.md`

---

**Made with ❤️ for Facebook Ads optimization**

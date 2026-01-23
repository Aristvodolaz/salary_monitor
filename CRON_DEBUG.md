# 🔍 Диагностика автоматической синхронизации

## Проблема: Cron не срабатывает ночью

**Настроено**: Синхронизация каждый день в **02:00** (`@Cron(CronExpression.EVERY_DAY_AT_2AM)`)

---

## ✅ Шаг 1: Проверка статуса PM2

```bash
# На сервере
pm2 list
```

**Ожидаемый результат:**
- `salary-monitor-backend` в статусе `online`
- `uptime` > 0

**Если offline:**
```bash
pm2 restart salary-monitor-backend
pm2 save
```

---

## ✅ Шаг 2: Проверка логов PM2

```bash
# Логи за последние 24 часа
pm2 logs salary-monitor-backend --lines 1000 | grep -E "(Запуск ежедневной синхронизации|SapScheduler|Cron)"

# ИЛИ просмотр в реальном времени
pm2 logs salary-monitor-backend
```

**Что искать:**
- ✅ `🕐 Запуск ежедневной синхронизации с SAP`
- ✅ `✅ Ежедневная синхронизация завершена успешно`
- ❌ `❌ Ошибка при ежедневной синхронизации`

---

## ✅ Шаг 3: Проверка данных в БД

```bash
# На сервере
cd /home/admin-lc/salary_monitor
node backend/scripts/check-cron-status.js
```

Скрипт покажет:
1. Последние синхронизации из `sync_logs`
2. Последние добавленные операции
3. Статистику по дням
4. Выводы и рекомендации

---

## ✅ Шаг 4: Проверка часового пояса

```bash
# Текущая дата/время на сервере
date

# Часовой пояс
timedatectl
```

**Проблема:** Если сервер в UTC, а нужно по МСК (UTC+3), то cron запускается в неправильное время!

**Решение:** Изменить время в декораторе:

```typescript
// backend/src/sap-integration/sap-scheduler.service.ts

// БЫЛО (UTC):
@Cron(CronExpression.EVERY_DAY_AT_2AM)  // 02:00 UTC

// СТАЛО (МСК):
@Cron('0 2 * * *', { timeZone: 'Europe/Moscow' })  // 02:00 МСК
```

---

## ✅ Шаг 5: Ручная проверка синхронизации

### Через API (для админов):

```bash
curl -X POST http://localhost:3000/api/sap/sync \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Через скрипт:

```bash
cd /home/admin-lc/salary_monitor
node backend/scripts/test-sap-sync.js
```

---

## 🐛 Возможные причины

### 1. ScheduleModule не подключен
**Проверка:**
```typescript
// backend/src/app.module.ts
imports: [
  ScheduleModule.forRoot(),  // ← Должен быть!
  ...
]
```

### 2. PM2 перезапускается ночью
**Проверка:**
```bash
pm2 logs salary-monitor-backend | grep -E "(restart|stopped|killed)"
```

**Решение:**
```bash
# Отключить автоматический перезапуск по расписанию
pm2 startup
pm2 save
```

### 3. Недостаточно памяти
**Проверка:**
```bash
pm2 monit
# Или
free -h
```

**Решение:**
```javascript
// backend/ecosystem.config.js
{
  max_memory_restart: '500M',  // Увеличить лимит
}
```

### 4. Timeout при синхронизации
**Проверка логов:**
```bash
pm2 logs salary-monitor-backend | grep -E "(timeout|ECONNRESET|ETIMEDOUT)"
```

**Решение:**
```typescript
// backend/src/sap-integration/sap-integration.service.ts
private axiosInstance = axios.create({
  timeout: 300000,  // 5 минут вместо 3
});
```

### 5. База данных недоступна
**Проверка:**
```bash
node backend/scripts/check-calculation.js
```

**Ошибка:** `Cannot connect to database`

**Решение:** Проверить сетевое соединение с `PRM-SRV-MSSQL-01.komus.net:59587`

---

## 🔧 Быстрые исправления

### Включить подробное логирование:

```typescript
// backend/src/sap-integration/sap-scheduler.service.ts

@Cron(CronExpression.EVERY_DAY_AT_2AM)
async handleDailySync() {
  this.logger.log('🕐 [CRON] Запуск ежедневной синхронизации', 'SapScheduler');
  this.logger.log(`🕐 [CRON] Время сервера: ${new Date().toISOString()}`, 'SapScheduler');
  
  try {
    const startTime = Date.now();
    await this.sapIntegrationService.syncAllWarehouses();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    this.logger.log(`✅ [CRON] Синхронизация завершена за ${duration}с`, 'SapScheduler');
  } catch (error) {
    this.logger.error(`❌ [CRON] Ошибка синхронизации: ${error.message}`, error.stack, 'SapScheduler');
  }
}
```

### Изменить время запуска:

```typescript
// 03:00 вместо 02:00 (если конфликт с другими задачами)
@Cron('0 3 * * *')

// Или каждые 12 часов (в 02:00 и 14:00)
@Cron('0 2,14 * * *')

// Или каждые 6 часов
@Cron('0 */6 * * *')
```

---

## ✅ Тест после исправлений

1. **Пересоберите backend:**
```bash
cd /home/admin-lc/salary_monitor/backend
npm run build
```

2. **Перезапустите PM2:**
```bash
pm2 restart salary-monitor-backend
```

3. **Проверьте, что cron зарегистрирован:**
```bash
pm2 logs salary-monitor-backend | grep -i "nest"
# Должно быть: "Nest application successfully started"
```

4. **Дождитесь следующего запуска или запустите вручную:**
```bash
# Через 2 минуты (для теста)
# Временно измените на:
@Cron('*/2 * * * *')  // Каждые 2 минуты
```

---

## 📊 Мониторинг

Добавьте в crontab проверку (на сервере):

```bash
crontab -e

# Добавить:
0 6 * * * cd /home/admin-lc/salary_monitor && node backend/scripts/check-cron-status.js >> /tmp/cron-check.log 2>&1
```

Проверка каждое утро в 06:00, результат в `/tmp/cron-check.log`

---

## 🆘 Если ничего не помогло

1. **Отключите встроенный cron** и используйте системный:

```bash
# Отключить @Cron декоратор в коде

# Добавить в crontab:
0 2 * * * cd /home/admin-lc/salary_monitor && /usr/bin/node backend/scripts/test-sap-sync.js >> /var/log/sap-sync.log 2>&1
```

2. **Обратитесь к логам:**
```bash
# Логи backend
tail -f /home/admin-lc/salary_monitor/backend/logs/combined.log

# Логи PM2
tail -f ~/.pm2/logs/salary-monitor-backend-error.log
tail -f ~/.pm2/logs/salary-monitor-backend-out.log
```

---

**Автор:** AI Assistant  
**Дата:** 23.01.2026

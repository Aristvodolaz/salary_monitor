# Руководство по установке SalaryMonitor

## 📋 Предварительные требования

- **Node.js** v18 или выше
- **MS SQL Server** 2016 или выше
- **npm** или **yarn**
- **Git** (опционально)

---

## 🗄️ Шаг 1: Настройка базы данных

### 1.1 Создание базы данных

Откройте **SQL Server Management Studio (SSMS)** и выполните следующие скрипты по порядку:

```bash
database/schema.sql      # Создание таблиц и индексов
database/seed.sql        # Тестовые данные
database/views.sql       # SQL Views для расчетов
```

### 1.2 Проверка подключения

Убедитесь, что у вас есть:
- **Имя сервера**: `localhost` или IP-адрес
- **База данных**: `SalaryMonitor`
- **Пользователь**: SQL-аутентификация или Windows Auth
- **Пароль**: (если SQL Auth)

---

## ⚙️ Шаг 2: Настройка Backend

### 2.1 Установка зависимостей

```bash
cd backend
npm install
```

### 2.2 Настройка переменных окружения

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Отредактируйте `.env`:

```env
# Application
NODE_ENV=development
PORT=3000

# MS SQL Database
DB_HOST=localhost
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=YourStrongPassword123
DB_NAME=SalaryMonitor

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# SAP OData API
SAP_ODATA_BASE_URL=http://pwm-app2.komus.net:8002/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV
SAP_USERNAME=your_sap_username
SAP_PASSWORD=your_sap_password

# Data Sync
SYNC_CRON_SCHEDULE=0 2 * * *
SYNC_MONTHS_BACK=6

# Warehouses
WAREHOUSES=01SS,02DQ,02SR,0SK1,0SK2,0SK5,0SK6,0SK8,0SK9,RR04
```

### 2.3 Запуск Backend

**Режим разработки** (с hot-reload):
```bash
npm run start:dev
```

**Режим production**:
```bash
npm run build
npm run start:prod
```

Backend будет доступен по адресу: **http://localhost:3000**

---

## 🎨 Шаг 3: Настройка Frontend

### 3.1 Установка зависимостей

```bash
cd frontend
npm install
```

### 3.2 Запуск Frontend

**Режим разработки**:
```bash
npm run dev
```

**Сборка для production**:
```bash
npm run build
npm run preview
```

Frontend будет доступен по адресу: **http://localhost:5173**

---

## 🔐 Шаг 4: Тестовый вход

После запуска обоих приложений откройте браузер:

```
http://localhost:5173/login
```

**Тестовые пользователи** (из `seed.sql`):

| Employee ID | ФИО                         | Роль      |
|-------------|------------------------------|-----------|
| `00000001`  | Иванов Иван Иванович         | employee  |
| `00000002`  | Петров Петр Петрович         | employee  |
| `00000099`  | Администратор Склад 1        | admin     |

---

## 🔄 Шаг 5: Синхронизация с SAP (опционально)

### 5.1 Ручной запуск синхронизации

Синхронизация запускается автоматически каждый день в **02:00** (настраивается в `.env`).

Для ручного запуска (в будущем можно добавить API endpoint):

```typescript
// В коде backend можно вызвать:
await sapIntegrationService.syncAllWarehouses();
```

### 5.2 Проверка логов синхронизации

Логи сохраняются в:
- `backend/logs/application-YYYY-MM-DD.log`
- `backend/logs/error-YYYY-MM-DD.log`

Также проверьте таблицу `sync_logs` в БД:

```sql
SELECT * FROM sync_logs ORDER BY sync_start DESC;
```

---

## 🐛 Устранение неполадок

### Ошибка подключения к БД

```
Error: Failed to connect to localhost:1433
```

**Решение**:
1. Проверьте, что SQL Server запущен
2. Убедитесь, что TCP/IP включен в SQL Server Configuration Manager
3. Проверьте порт (по умолчанию 1433)
4. Проверьте учетные данные в `.env`

### Ошибка CORS

```
Access to XMLHttpRequest has been blocked by CORS policy
```

**Решение**:
1. Убедитесь, что backend запущен
2. Проверьте настройки CORS в `backend/src/main.ts`

### Ошибка JWT

```
UnauthorizedException: Invalid token
```

**Решение**:
1. Очистите localStorage в браузере
2. Выполните повторный вход

---

## 📦 Production Deployment

### Backend

1. Соберите проект:
```bash
cd backend
npm run build
```

2. Запустите через PM2:
```bash
npm install -g pm2
pm2 start dist/main.js --name salary-monitor-backend
```

### Frontend

1. Соберите проект:
```bash
cd frontend
npm run build
```

2. Разместите содержимое `dist/` на веб-сервере (Nginx, Apache)

### Nginx конфигурация

```nginx
server {
    listen 80;
    server_name salary-monitor.example.com;

    location / {
        root /var/www/salary-monitor-frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## ✅ Проверка работоспособности

1. Backend health check: `http://localhost:3000/api`
2. Frontend: `http://localhost:5173`
3. Авторизация: войдите с тестовым ШК `00000001`
4. Проверьте дашборд и операции

---

## 📞 Поддержка

По вопросам обращайтесь к системному администратору или разработчику.


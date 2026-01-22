# 📁 Структура проекта SalaryMonitor

## Корень проекта

```
salary-monitor/
│
├── 📘 README.md                  # Общее описание проекта
├── 🚀 QUICKSTART.md              # Быстрый старт (начните отсюда!)
├── 📋 PROJECT_STRUCTURE.md       # Этот файл
├── 🚫 .gitignore                 # Исключения для Git
│
├── 📂 backend/                   # Backend (NestJS)
├── 📂 frontend/                  # Frontend (React)
├── 📂 database/                  # SQL-скрипты
└── 📂 docs/                      # Документация
```

---

## 📂 Backend (NestJS + TypeScript)

```
backend/
│
├── 📦 package.json               # Зависимости и скрипты
├── ⚙️ tsconfig.json              # Конфигурация TypeScript
├── 🔧 nest-cli.json              # Конфигурация NestJS CLI
├── 🔐 .env.example               # Пример переменных окружения
├── 🔐 .env                       # Ваши переменные (создать!)
│
└── 📂 src/
    │
    ├── 📄 main.ts                # Entry point приложения
    ├── 📄 app.module.ts          # Главный модуль
    │
    ├── 📂 auth/                  # 🔐 Авторизация
    │   ├── auth.module.ts
    │   ├── auth.service.ts       # Логика входа по ШК
    │   ├── auth.controller.ts    # POST /auth/barcode
    │   ├── dto/
    │   │   └── login-barcode.dto.ts
    │   └── strategies/
    │       └── jwt.strategy.ts   # Стратегия JWT
    │
    ├── 📂 users/                 # 👤 Пользователи
    │   ├── users.module.ts
    │   ├── users.service.ts      # CRUD пользователей
    │   └── users.controller.ts   # GET /users/me
    │
    ├── 📂 salary/                # 💰 Зарплата
    │   ├── salary.module.ts
    │   ├── salary.service.ts     # Расчет зарплаты
    │   ├── salary.controller.ts  # GET /salary, GET /salary/stats
    │   └── dto/
    │       └── get-salary.dto.ts
    │
    ├── 📂 operations/            # 📋 Операции
    │   ├── operations.module.ts
    │   ├── operations.service.ts # Список операций
    │   ├── operations.controller.ts
    │   └── dto/
    │       └── get-operations.dto.ts
    │
    ├── 📂 admin/                 # 👨‍💼 Админ-панель
    │   ├── admin.module.ts
    │   ├── admin.service.ts      # Управление складом
    │   ├── admin.controller.ts   # GET /admin/*
    │   └── dto/
    │       └── get-warehouse-salary.dto.ts
    │
    ├── 📂 sap-integration/       # 🔄 Интеграция с SAP
    │   ├── sap-integration.module.ts
    │   ├── sap-integration.service.ts   # OData клиент
    │   └── sap-scheduler.service.ts     # Cron-задачи
    │
    ├── 📂 database/              # 🗄️ База данных
    │   ├── database.module.ts
    │   └── database.service.ts   # MS SQL connection pool
    │
    └── 📂 common/                # 🔧 Общие компоненты
        ├── decorators/
        │   ├── roles.decorator.ts        # @Roles('admin')
        │   └── current-user.decorator.ts # @CurrentUser()
        ├── guards/
        │   ├── jwt-auth.guard.ts         # Проверка JWT
        │   └── roles.guard.ts            # Проверка ролей
        └── logger/
            ├── logger.module.ts
            └── logger.service.ts         # Winston logger
```

**Ключевые файлы:**
- `main.ts` — точка входа, настройка Express
- `app.module.ts` — импорт всех модулей
- `auth/auth.service.ts` — логика авторизации по ШК
- `sap-integration/sap-integration.service.ts` — синхронизация с SAP
- `database/database.service.ts` — подключение к MS SQL

---

## 📂 Frontend (React + TypeScript + Material-UI)

```
frontend/
│
├── 📦 package.json               # Зависимости и скрипты
├── ⚙️ tsconfig.json              # Конфигурация TypeScript
├── ⚙️ vite.config.ts             # Конфигурация Vite
├── 📄 index.html                 # HTML-шаблон
│
├── 📂 public/
│   └── vite.svg                  # Иконка
│
└── 📂 src/
    │
    ├── 📄 main.tsx               # Entry point
    ├── 📄 App.tsx                # Роутинг приложения
    ├── 📄 theme.ts               # Тема Material-UI
    │
    ├── 📂 pages/                 # 📄 Страницы
    │   ├── LoginPage.tsx         # 🔐 Авторизация по ШК
    │   ├── DashboardPage.tsx     # 💰 Дашборд зарплаты
    │   ├── OperationsPage.tsx    # 📋 Таблица операций
    │   └── AdminPage.tsx         # 👨‍💼 Админ-панель
    │
    ├── 📂 components/            # 🧩 Компоненты
    │   └── Layout.tsx            # Навигация, AppBar
    │
    ├── 📂 services/              # 🌐 API-клиент
    │   └── api.ts                # Axios + endpoints
    │
    └── 📂 context/               # 🔗 Context API
        └── AuthContext.tsx       # Глобальное состояние юзера
```

**Ключевые файлы:**
- `main.tsx` — точка входа, провайдеры
- `App.tsx` — роутинг (React Router)
- `services/api.ts` — все API-запросы
- `context/AuthContext.tsx` — управление авторизацией
- `pages/DashboardPage.tsx` — главная страница

---

## 📂 Database (MS SQL Server)

```
database/
│
├── 📄 schema.sql                 # ⚙️ Создание таблиц и индексов
├── 📄 seed.sql                   # 🌱 Тестовые данные
└── 📄 views.sql                  # 📊 SQL Views для расчетов
```

**Таблицы:**
- `users` — пользователи (сотрудники, админы)
- `warehouses` — склады
- `operations` — операции из SAP
- `tariffs` — тарифы (расценки)
- `quality_matrix` — коэффициенты качества
- `salary_summary` — сводка по зарплате
- `sync_logs` — логи синхронизации с SAP

**Views:**
- `v_salary_details` — детальный расчет зарплаты
- `v_salary_by_day` — агрегация по дням
- `v_salary_by_month` — агрегация по месяцам
- `v_top_performers` — топ сотрудников
- `v_operations_stats` — статистика по операциям

---

## 📂 Documentation

```
docs/
│
├── 📘 INSTALLATION.md            # Полная инструкция по установке
├── 📗 API.md                     # Описание всех API endpoints
├── 📙 ARCHITECTURE.md            # Архитектура проекта
└── 📕 EXAMPLES.md                # Примеры запросов и кода
```

---

## 🔥 С чего начать?

### 1️⃣ Первый запуск
Читайте: **QUICKSTART.md** (10 минут)

### 2️⃣ Разработка
- Backend: `backend/src/`
- Frontend: `frontend/src/pages/`

### 3️⃣ API
Читайте: **docs/API.md** и **docs/EXAMPLES.md**

### 4️⃣ Настройка
- Backend: `backend/.env`
- Database: `database/schema.sql`

### 5️⃣ Архитектура
Читайте: **docs/ARCHITECTURE.md**

---

## 📊 Размер проекта

| Компонент | Файлов | Строк кода (примерно) |
|-----------|--------|------------------------|
| Backend   | 30+    | ~3000                  |
| Frontend  | 10+    | ~1500                  |
| Database  | 3      | ~800                   |
| Docs      | 4      | ~2000                  |
| **Всего** | **47+**| **~7300**             |

---

## 🛠️ Технологии

### Backend
- **NestJS** 10.x — фреймворк
- **TypeScript** 5.x — язык
- **mssql** 10.x — драйвер MS SQL
- **Passport JWT** — аутентификация
- **node-cron** — планировщик
- **Winston** — логирование
- **Axios** — HTTP-клиент

### Frontend
- **React** 18.x — библиотека UI
- **TypeScript** 5.x — язык
- **Vite** 5.x — сборщик
- **Material-UI** 5.x — UI-компоненты
- **React Router** 6.x — роутинг
- **Axios** — HTTP-клиент

### Database
- **MS SQL Server** 2016+
- **T-SQL** — язык запросов

---

## 📦 Зависимости

### Backend (основные)
```json
{
  "@nestjs/core": "^10.3.0",
  "@nestjs/jwt": "^10.2.0",
  "mssql": "^10.0.2",
  "axios": "^1.6.5",
  "node-cron": "^3.0.3",
  "winston": "^3.11.0"
}
```

### Frontend (основные)
```json
{
  "react": "^18.2.0",
  "@mui/material": "^5.15.3",
  "react-router-dom": "^6.21.1",
  "axios": "^1.6.5"
}
```

---

## 🔄 CI/CD (будущее)

Рекомендуемый pipeline:

```yaml
# .github/workflows/deploy.yml
name: Deploy SalaryMonitor

on:
  push:
    branches: [main]

jobs:
  backend:
    - npm install
    - npm run build
    - npm run test
    - pm2 restart salary-monitor

  frontend:
    - npm install
    - npm run build
    - deploy to nginx
```

---

## 📞 Контакты

По вопросам разработки обращайтесь к:
- Системному администратору
- DevOps-инженеру
- Разработчику

---

**Версия**: 1.0.0  
**Дата создания**: 2026-01-11  
**Автор**: AI Assistant + Команда разработки


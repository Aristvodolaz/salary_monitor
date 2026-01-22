# 🔗 Порты и ссылки SalaryMonitor

## 🌐 Рабочие порты

### Development (Локально)

| Сервис | Порт | URL | Описание |
|--------|------|-----|----------|
| **Backend API** | 3000 | http://localhost:3000 | NestJS API |
| **Frontend Dev** | 5173 | http://localhost:5173 | Vite Dev Server |
| **MS SQL Server** | 59587 | PRM-SRV-MSSQL-01.komus.net:59587 | База данных |

### Production (Сервер)

| Сервис | Порт | URL | Описание |
|--------|------|-----|----------|
| **Nginx** | 80 | http://your-server-ip | Frontend + API Proxy |
| **Nginx HTTPS** | 443 | https://your-server-ip | SSL (если настроен) |
| **Backend API** | 3000 | http://localhost:3000 | NestJS (внутренний) |
| **MS SQL Server** | 59587 | PRM-SRV-MSSQL-01.komus.net:59587 | База данных |

---

## 🔗 API Endpoints

### Авторизация
- `POST /api/auth/barcode` - Вход по штрих-коду

### Зарплата
- `GET /api/salary?period=yesterday` - За вчера
- `GET /api/salary?period=month` - За месяц
- `GET /api/salary?period=custom&startDate=2024-01-01&endDate=2024-01-31` - За период
- `GET /api/salary/stats` - Общая статистика

### Операции
- `GET /api/operations?limit=25&offset=0` - Список операций
- `GET /api/operations/by-type` - Группировка по типам

### Админ-панель (требуется роль admin)
- `GET /api/admin/employees` - Сотрудники склада
- `GET /api/admin/salary?startDate=...&endDate=...` - Зарплаты всех
- `GET /api/admin/export?startDate=...&endDate=...` - Экспорт CSV
- `GET /api/admin/stats` - Статистика склада

### SAP Синхронизация (только admin)
- `POST /api/sap/sync` - Ручной запуск синхронизации

### Пользователи
- `GET /api/users/me` - Текущий пользователь

---

## 🔧 Полезные ссылки

### Development
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000/api
- **API Docs**: См. `docs/API.md`

### Production
- **Приложение**: http://your-server-ip
- **Backend Logs**: `/home/admin-lc/salary_monitor/backend/logs/`
- **PM2 Dashboard**: `pm2 monit`

---

## 📊 Мониторинг

### PM2
```bash
pm2 status                          # Статус
pm2 logs salary-monitor-backend     # Логи
pm2 monit                           # Dashboard
pm2 restart salary-monitor-backend  # Перезапуск
```

### Логи приложения
```bash
tail -f /home/admin-lc/salary_monitor/backend/logs/application-*.log
tail -f /home/admin-lc/salary_monitor/backend/logs/error-*.log
```

### База данных
```sql
-- Количество операций
SELECT COUNT(*) FROM operations;

-- Топ сотрудников
SELECT TOP 10 * FROM v_salary_by_month ORDER BY total_amount DESC;

-- Логи синхронизации
SELECT TOP 10 * FROM sync_logs ORDER BY sync_start DESC;
```

---

## 🔄 Автоматическая перезагрузка

### Backend (PM2 watch mode)
✅ **Включен автоматически** - PM2 перезапустит при изменении файлов

### Frontend (Production)
После изменений:
```bash
cd frontend
npm run build
# Nginx автоматически отдаст новые файлы
```

### Frontend (Development)
```bash
npm run dev  # Hot reload автоматически
```

---

## 🚀 Быстрые команды

### Перезапуск всего
```bash
pm2 restart all
sudo systemctl reload nginx
```

### Проверка здоровья
```bash
curl http://localhost:3000/api/users/me  # Backend (нужен токен)
curl http://localhost                     # Frontend
pm2 status                                # PM2
sudo systemctl status nginx               # Nginx
```

### Обновление
```bash
cd /home/admin-lc/salary_monitor
git pull
npm run build  # Соберет backend + frontend
pm2 restart salary-monitor-backend
```

---

## 📞 Порты для файрволла

Если настраиваете firewall:
```bash
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS (если SSL)
sudo ufw allow 22/tcp    # SSH
```

**Backend порт 3000 НЕ открывать** (доступен только через Nginx proxy)

---

## 🎯 Тестовые пользователи

| Employee ID | ФИО | Роль | Зарплата (примерно) |
|-------------|-----|------|---------------------|
| 00088619 | Сотрудник 00088619 | employee | ~2,896₽ |
| 00079442 | Сотрудник 00079442 | employee | ~2,769₽ |
| 00000099 | Администратор | admin | - |

---

**Все ссылки и порты!** 🔗✨

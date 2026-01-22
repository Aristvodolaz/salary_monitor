# ✅ Production Checklist - Чеклист перед деплоем

## 📋 Подготовка

### Backend
- [ ] Создан файл `backend/.env` с production настройками
- [ ] JWT_SECRET сгенерирован (минимум 32 символа)
- [ ] DB_PASSWORD изменен на production
- [ ] SAP_PASSWORD актуален
- [ ] `npm run build` успешно выполнен
- [ ] Тесты пройдены (если есть)

### Frontend
- [ ] `npm run build` успешно выполнен
- [ ] Проверен размер bundle (должен быть < 5MB)
- [ ] Нет console.log в production коде

### База данных
- [ ] Создана БД `SalaryMonitor`
- [ ] Выполнены все SQL скрипты:
  - [ ] schema.sql
  - [ ] update-tariffs.sql
  - [ ] update-quality-matrix.sql
  - [ ] update-warehouses.sql (с названиями складов)
  - [ ] alter-operations-add-area.sql
  - [ ] alter-operations-add-actdura.sql
  - [ ] fix-views.sql
- [ ] Проверено подключение с сервера
- [ ] Созданы индексы
- [ ] Настроен бэкап

### Сервер
- [ ] Node.js 18+ установлен
- [ ] PM2 установлен глобально
- [ ] Nginx установлен
- [ ] Firewall настроен
- [ ] Создана директория `/var/www/salary-monitor`
- [ ] Создана директория `/var/log/salary-monitor`
- [ ] Права доступа настроены

---

## 🚀 Деплой

### Способ 1: Автоматический

```bash
cd /var/www/salary-monitor
./deploy-all.sh
```

### Способ 2: Ручной

```bash
# Backend
cd backend
npm ci --production
npm run build
pm2 start ecosystem.config.js --env production
pm2 save

# Frontend
cd frontend
npm ci
npm run build

# Nginx
sudo cp ../nginx.conf /etc/nginx/sites-available/salary-monitor
sudo ln -s /etc/nginx/sites-available/salary-monitor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## ✅ Проверка после деплоя

### 1. Backend работает?

```bash
pm2 status
pm2 logs salary-monitor-backend --lines 50
curl http://localhost:3000/api
```

Должно показать: `{"statusCode":404,"message":"Cannot GET /api"}`

### 2. Frontend доступен?

```bash
curl http://localhost
```

Должно показать HTML с SalaryMonitor.

### 3. Авторизация работает?

Откройте: `http://your-server-ip/login`

Введите: `00088619`

Должны увидеть зарплату: **~2896₽**

### 4. Синхронизация работает?

```bash
# Проверьте логи синхронизации
grep "Синхронизация" /var/log/salary-monitor/application-*.log

# Или в PM2
pm2 logs | grep "SAP"
```

### 5. БД заполнена?

```sql
SELECT COUNT(*) FROM operations;
SELECT COUNT(*) FROM users WHERE employee_id LIKE '000%';
SELECT TOP 5 * FROM v_salary_by_month ORDER BY total_amount DESC;
```

---

## 🔐 Безопасность

### Обязательно:
- [ ] Изменены все дефолтные пароли
- [ ] JWT_SECRET уникальный
- [ ] Firewall настроен (только 80, 443, 22)
- [ ] SQL Server доступен только с IP сервера
- [ ] SSL сертификат установлен (Certbot)
- [ ] Логи ротируются

### Рекомендуется:
- [ ] Rate limiting на /api/auth (защита от брутфорса)
- [ ] Helmet.js для дополнительной безопасности
- [ ] Мониторинг (Prometheus + Grafana)
- [ ] Alerts при ошибках синхронизации

---

## 📊 Мониторинг

### PM2 Monitoring

```bash
pm2 monit                    # Реального времени
pm2 logs salary-monitor-backend
pm2 restart salary-monitor-backend
```

### Логи

```bash
# Application logs
tail -f /var/log/salary-monitor/application-*.log

# Error logs
tail -f /var/log/salary-monitor/error-*.log

# Nginx logs
tail -f /var/log/nginx/salary-monitor-access.log
```

### Метрики

```bash
# CPU/RAM
htop
pm2 monit

# Disk
df -h

# Network
netstat -tlnp | grep 3000
```

---

## 🔄 Обновление

```bash
cd /var/www/salary-monitor
git pull
./deploy-all.sh
```

---

## 🆘 Откат (Rollback)

```bash
# Backend
pm2 stop salary-monitor-backend
git checkout HEAD~1  # Откат на предыдущий коммит
cd backend && npm run build
pm2 restart salary-monitor-backend

# Frontend
cd frontend && git checkout HEAD~1
npm run build
```

---

## 📞 Контакты

- **DevOps**: ...
- **Backend**: ...
- **Frontend**: ...
- **DBA**: ...

---

**Готово к production!** 🎉

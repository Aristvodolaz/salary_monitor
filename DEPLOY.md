# 🚀 Инструкция по деплою SalaryMonitor

## Требования к серверу

- **OS**: Ubuntu 22.04 LTS / Windows Server 2019+
- **CPU**: 2+ ядра
- **RAM**: 4+ GB
- **Disk**: 50+ GB
- **Node.js**: 18.x или выше
- **Nginx**: 1.18+
- **PM2**: Глобально установлен

---

## 📋 Шаг 1: Подготовка сервера (Ubuntu)

### 1.1 Установка Node.js

```bash
# Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка
node -v  # v18.x.x
npm -v   # 9.x.x
```

### 1.2 Установка PM2

```bash
sudo npm install -g pm2
pm2 startup systemd
# Выполните команду которую выдаст PM2
```

### 1.3 Установка Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 📦 Шаг 2: Клонирование проекта

```bash
# Создайте директорию
sudo mkdir -p /var/www/salary-monitor
sudo chown -R $USER:$USER /var/www/salary-monitor

# Клонируйте (или скопируйте файлы)
cd /var/www/salary-monitor
# git clone https://your-repo.git .

# Или скопируйте файлы через SCP/FTP
```

---

## ⚙️ Шаг 3: Настройка Backend

```bash
cd /var/www/salary-monitor/backend

# Установка зависимостей
npm ci --production

# Создание .env
cp .env.production.example .env
nano .env

# Измените:
# - DB_PASSWORD
# - SAP_PASSWORD
# - JWT_SECRET (сгенерируйте: openssl rand -base64 32)
```

### 3.1 Сборка

```bash
npm run build
```

### 3.2 Создание директории логов

```bash
sudo mkdir -p /var/log/salary-monitor
sudo chown -R $USER:$USER /var/log/salary-monitor
```

### 3.3 Запуск через PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 list
```

---

## 🎨 Шаг 4: Сборка Frontend

```bash
cd /var/www/salary-monitor/frontend

# Установка зависимостей
npm ci

# Создание .env.production (если нужно)
echo "VITE_API_URL=/api" > .env.production

# Сборка
npm run build

# Результат в: frontend/dist/
```

---

## 🌐 Шаг 5: Настройка Nginx

### 5.1 Копирование конфигурации

```bash
sudo cp /var/www/salary-monitor/nginx.conf /etc/nginx/sites-available/salary-monitor

# Редактируйте server_name
sudo nano /etc/nginx/sites-available/salary-monitor

# Активация
sudo ln -s /etc/nginx/sites-available/salary-monitor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5.2 Проверка

Откройте в браузере: `http://your-server-ip`

---

## 🗄️ Шаг 6: Настройка базы данных

### 6.1 Выполните SQL скрипты на production БД:

```sql
-- В SQL Server Management Studio:
database/schema.sql
database/update-tariffs.sql
database/update-quality-matrix.sql
database/alter-operations-add-area.sql
database/alter-operations-add-actdura.sql
database/fix-views.sql
```

### 6.2 Проверка подключения

```bash
cd /var/www/salary-monitor/backend
node -e "require('./dist/database/database.service').test()"
```

---

## 🔄 Шаг 7: Настройка автозапуска

PM2 уже настроен на автозапуск. Проверка:

```bash
sudo reboot  # Перезагрузка сервера
# После перезагрузки:
pm2 list  # Должно показать запущенное приложение
```

---

## 🔐 Шаг 8: SSL (опционально, но рекомендуется)

### 8.1 Установка Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### 8.2 Получение сертификата

```bash
sudo certbot --nginx -d salary-monitor.komus.local
```

Certbot автоматически настроит HTTPS редирект.

---

## 📊 Шаг 9: Мониторинг

### Логи Backend

```bash
pm2 logs salary-monitor-backend
pm2 monit
tail -f /var/log/salary-monitor/application-*.log
```

### Логи Nginx

```bash
tail -f /var/log/nginx/salary-monitor-access.log
tail -f /var/log/nginx/salary-monitor-error.log
```

### Статус

```bash
pm2 status
systemctl status nginx
```

---

## 🔄 Обновление приложения

### Backend

```bash
cd /var/www/salary-monitor/backend
git pull
npm ci --production
npm run build
pm2 restart salary-monitor-backend
```

### Frontend

```bash
cd /var/www/salary-monitor/frontend
git pull
npm ci
npm run build
# Nginx автоматически подхватит изменения
```

---

## 🛡️ Безопасность

### Firewall (UFW)

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### Ограничение доступа к SQL

Настройте Windows Firewall на SQL Server:
- Разрешить доступ только с IP сервера приложения

---

## 📦 Резервное копирование

### Бэкап БД (ежедневно)

```bash
# Создайте cron задачу
crontab -e
```

Добавьте:
```cron
0 3 * * * /usr/bin/sqlcmd -S PRM-SRV-MSSQL-01.komus.net,59587 -U sa -P 'PASSWORD' -Q "BACKUP DATABASE SalaryMonitor TO DISK='/backups/SalaryMonitor_\$(date +\%Y\%m\%d).bak'" >> /var/log/backup.log 2>&1
```

---

## ✅ Проверочный чеклист

- [ ] Node.js установлен
- [ ] PM2 установлен
- [ ] Nginx установлен
- [ ] Backend собран и запущен (PM2)
- [ ] Frontend собран
- [ ] Nginx настроен
- [ ] БД создана и скрипты выполнены
- [ ] .env настроен (production пароли!)
- [ ] SSL сертификат установлен
- [ ] Firewall настроен
- [ ] Автозапуск работает
- [ ] Логирование настроено
- [ ] Бэкап БД настроен

---

## 🧪 Тестирование после деплоя

```bash
# 1. Проверка backend
curl http://localhost:3000/api

# 2. Проверка frontend
curl http://your-server-ip

# 3. Проверка авторизации
curl -X POST http://localhost:3000/api/auth/barcode \
  -H "Content-Type: application/json" \
  -d '{"employeeId": "00088619"}'

# 4. Проверка синхронизации
pm2 logs | grep "Синхронизация"
```

---

## 📞 Troubleshooting

### Backend не запускается

```bash
pm2 logs salary-monitor-backend --err
cat /var/log/salary-monitor/error-*.log
```

### Frontend 404

```bash
sudo nginx -t
sudo systemctl status nginx
ls -la /var/www/salary-monitor/frontend/dist
```

### Ошибка подключения к БД

```bash
telnet PRM-SRV-MSSQL-01.komus.net 59587
cat backend/.env | grep DB_
```

---

## 🎯 После успешного деплоя

Откройте: **http://your-server-ip** или **https://salary-monitor.komus.local**

Войдите с employee_id и наслаждайтесь! 🎉

---

**Версия**: 1.0.0  
**Дата**: 2026-01-22

# 🚀 Развертывание в Production

## Подготовка к деплою

### Чек-лист перед развертыванием

- [ ] MS SQL Server настроен и доступен
- [ ] Созданы все таблицы и индексы (`database/schema.sql`)
- [ ] Заполнены реальные данные пользователей
- [ ] Настроены учетные данные SAP
- [ ] Сгенерирован надежный JWT_SECRET
- [ ] Настроен SSL-сертификат (Let's Encrypt)
- [ ] Настроен файрволл и открыты нужные порты
- [ ] Создан backup базы данных

---

## Вариант 1: Виртуальная машина (VM)

### Требования к серверу

- **OS**: Ubuntu 22.04 LTS / Windows Server 2019+
- **CPU**: 2 ядра (минимум)
- **RAM**: 4 GB (минимум)
- **Диск**: 50 GB
- **Порты**: 80, 443, 1433 (SQL)

---

## Установка на Ubuntu 22.04

### 1. Установка Node.js

```bash
# Установка Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка версии
node -v   # v18.x.x
npm -v    # 9.x.x
```

### 2. Установка PM2 (Process Manager)

```bash
sudo npm install -g pm2
pm2 startup systemd  # Автозапуск при перезагрузке
```

### 3. Клонирование проекта

```bash
cd /var/www
sudo git clone https://github.com/your-org/salary-monitor.git
cd salary-monitor
```

### 4. Настройка Backend

```bash
cd backend

# Установка зависимостей
npm install --production

# Создание .env
sudo nano .env
```

**Пример production .env:**
```env
NODE_ENV=production
PORT=3000

DB_HOST=your-sql-server.example.com
DB_PORT=1433
DB_USER=salary_monitor_user
DB_PASSWORD=StrongPassword123!
DB_NAME=SalaryMonitor

JWT_SECRET=YOUR_SUPER_SECRET_KEY_HERE_CHANGE_ME
JWT_EXPIRES_IN=24h

SAP_ODATA_BASE_URL=http://pwm-app2.komus.net:8002/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV
SAP_USERNAME=your_sap_user
SAP_PASSWORD=your_sap_password

SYNC_CRON_SCHEDULE=0 2 * * *
SYNC_MONTHS_BACK=6
WAREHOUSES=01SS,02DQ,02SR,0SK1,0SK2,0SK5,0SK6,0SK8,0SK9,RR04

LOG_LEVEL=info
LOG_DIR=/var/log/salary-monitor
```

```bash
# Создание директории логов
sudo mkdir -p /var/log/salary-monitor
sudo chown -R $USER:$USER /var/log/salary-monitor

# Сборка проекта
npm run build

# Запуск через PM2
pm2 start dist/main.js --name salary-monitor-backend
pm2 save
```

### 5. Настройка Frontend

```bash
cd ../frontend

# Установка зависимостей
npm install

# Сборка
npm run build

# Результат в frontend/dist/
```

### 6. Установка и настройка Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

**Создайте конфигурацию:**
```bash
sudo nano /etc/nginx/sites-available/salary-monitor
```

**Содержимое:**
```nginx
server {
    listen 80;
    server_name salary-monitor.example.com;

    # Redirect HTTP to HTTPS (после установки SSL)
    # return 301 https://$server_name$request_uri;

    # Frontend
    root /var/www/salary-monitor/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Активация конфигурации
sudo ln -s /etc/nginx/sites-available/salary-monitor /etc/nginx/sites-enabled/
sudo nginx -t  # Проверка синтаксиса
sudo systemctl restart nginx
```

### 7. Установка SSL (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d salary-monitor.example.com
```

Certbot автоматически обновит конфигурацию Nginx для HTTPS.

### 8. Автообновление SSL-сертификата

```bash
sudo certbot renew --dry-run  # Тест
# Cron уже настроен автоматически
```

---

## Вариант 2: Docker

### Dockerfile для Backend

```dockerfile
# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

### Dockerfile для Frontend

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    container_name: salary-monitor-backend
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - ./backend/.env
    depends_on:
      - db
    networks:
      - app-network

  frontend:
    build: ./frontend
    container_name: salary-monitor-frontend
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
    networks:
      - app-network

  db:
    image: mcr.microsoft.com/mssql/server:2019-latest
    container_name: salary-monitor-db
    restart: unless-stopped
    environment:
      - ACCEPT_EULA=Y
      - SA_PASSWORD=YourStrongPassword123!
    ports:
      - "1433:1433"
    volumes:
      - db-data:/var/opt/mssql
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  db-data:
```

**Запуск:**
```bash
docker-compose up -d
docker-compose logs -f  # Просмотр логов
```

---

## Мониторинг и обслуживание

### Логи Backend

```bash
# PM2
pm2 logs salary-monitor-backend
pm2 monit

# Файлы
tail -f /var/log/salary-monitor/application-*.log
tail -f /var/log/salary-monitor/error-*.log
```

### Логи Nginx

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Мониторинг процессов

```bash
# PM2
pm2 status

# Ресурсы
htop
df -h  # Диск
free -h  # RAM
```

### Backup базы данных

```bash
# Ежедневный backup
sudo crontab -e
```

Добавьте:
```cron
0 3 * * * /usr/bin/sqlcmd -S localhost -U sa -P 'YourPassword' -Q "BACKUP DATABASE SalaryMonitor TO DISK='/backups/SalaryMonitor_$(date +\%Y\%m\%d).bak'" >> /var/log/backup.log 2>&1
```

---

## Обновление приложения

### Backend

```bash
cd /var/www/salary-monitor/backend
git pull
npm install --production
npm run build
pm2 restart salary-monitor-backend
```

### Frontend

```bash
cd /var/www/salary-monitor/frontend
git pull
npm install
npm run build
# Nginx автоматически подхватит изменения
```

---

## Безопасность

### 1. Файрволл (UFW)

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 1433/tcp  # SQL (только из доверенных сетей!)
sudo ufw enable
```

### 2. Ограничение доступа к SQL Server

```sql
-- Создайте отдельного пользователя для приложения
CREATE LOGIN salary_monitor_user WITH PASSWORD = 'StrongPassword123!';
USE SalaryMonitor;
CREATE USER salary_monitor_user FOR LOGIN salary_monitor_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO salary_monitor_user;
```

### 3. Rate Limiting в Nginx

```nginx
# В http блоке
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

# В location /api/auth
location /api/auth {
    limit_req zone=auth_limit burst=3 nodelay;
    proxy_pass http://localhost:3000;
}
```

### 4. Fail2Ban (защита от брутфорса)

```bash
sudo apt-get install -y fail2ban
sudo nano /etc/fail2ban/jail.local
```

---

## Оптимизация производительности

### 1. PM2 Cluster Mode

```bash
pm2 start dist/main.js --name salary-monitor-backend -i max
```

### 2. Nginx кэширование

```nginx
# Кэш статических файлов
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 3. Gzip сжатие

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;
```

---

## Troubleshooting

### Backend не запускается

```bash
# Проверьте логи
pm2 logs salary-monitor-backend --err

# Проверьте порт
sudo lsof -i :3000

# Проверьте .env
cat backend/.env
```

### Ошибка подключения к БД

```bash
# Тест подключения
telnet your-sql-server.example.com 1433

# Проверьте SQL Server
sudo systemctl status mssql-server
```

### 502 Bad Gateway

```bash
# Проверьте, запущен ли backend
pm2 status

# Проверьте конфигурацию Nginx
sudo nginx -t
sudo systemctl status nginx
```

---

## Метрики и мониторинг (опционально)

### Prometheus + Grafana

1. **Установите Prometheus**:
```bash
sudo apt-get install -y prometheus
```

2. **Добавьте метрики в backend**:
```typescript
import { register } from 'prom-client';
// ...
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

3. **Установите Grafana**:
```bash
sudo apt-get install -y grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
```

---

## Контакты поддержки

- **DevOps**: devops@example.com
- **Системный администратор**: sysadmin@example.com
- **Разработчик**: dev@example.com

---

**Версия**: 1.0.0  
**Последнее обновление**: 2026-01-11


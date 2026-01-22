# 🏭 Production Setup - Быстрый старт

## Подготовка файлов для деплоя

### 1. Backend `.env.production`

Создайте `backend/.env` на сервере:

```env
NODE_ENV=production
PORT=3000

DB_HOST=PRM-SRV-MSSQL-01.komus.net
DB_PORT=59587
DB_USER=sa
DB_PASSWORD=icY2eGuyfU
DB_NAME=SalaryMonitor

JWT_SECRET=<сгенерируйте: openssl rand -base64 32>
JWT_EXPIRES_IN=24h

SAP_ODATA_BASE_URL=http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV
SAP_USERNAME=SALAR_TO_PWM
SAP_PASSWORD=9pVQMGLC

SYNC_CRON_SCHEDULE=0 2 * * *
SYNC_MONTHS_BACK=1
WAREHOUSES=01SS,02DQ,02SR,0SK1,0SK2,0SK5,0SK6,0SK8,0SK9,RR04

LOG_LEVEL=info
LOG_DIR=/var/log/salary-monitor
```

### 2. Права на файлы

```bash
chmod +x backend/deploy.sh
chmod +x frontend/deploy.sh
chmod +x deploy-all.sh
```

---

## 🚀 Деплой одной командой

```bash
./deploy-all.sh
```

Или по отдельности:

```bash
# Backend
cd backend && ./deploy.sh

# Frontend
cd frontend && ./deploy.sh
```

---

## 📋 Первый запуск (с нуля)

### 1. На сервере установите:

```bash
# Node.js + PM2
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# Nginx
sudo apt-get install -y nginx
```

### 2. Скопируйте проект:

```bash
sudo mkdir -p /var/www/salary-monitor
sudo chown -R $USER:$USER /var/www/salary-monitor

# Через git
git clone <your-repo> /var/www/salary-monitor

# Или через scp
scp -r ./salary-monitor user@server:/var/www/
```

### 3. Настройте БД:

Выполните SQL скрипты в SSMS на `PRM-SRV-MSSQL-01.komus.net`.

### 4. Запустите:

```bash
cd /var/www/salary-monitor
./deploy-all.sh
```

---

## ✅ Проверка

После деплоя проверьте:

```bash
# Backend
curl http://localhost:3000/api
pm2 status

# Frontend
curl http://localhost

# Nginx
sudo nginx -t
sudo systemctl status nginx
```

Откройте браузер: `http://your-server-ip`

---

## 🔄 Обновление в production

```bash
cd /var/www/salary-monitor
git pull
./deploy-all.sh
```

---

## 📞 Поддержка

- Backend логи: `pm2 logs salary-monitor-backend`
- Nginx логи: `sudo tail -f /var/log/nginx/salary-monitor-*.log`
- App логи: `/var/log/salary-monitor/`

---

**Все готово для деплоя!** 🎉🚀

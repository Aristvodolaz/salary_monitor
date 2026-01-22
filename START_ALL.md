# 🚀 Запуск Backend + Frontend через PM2

## На сервере выполните:

```bash
cd /home/admin-lc/salary_monitor

# 1. Backend (порты 3015/3016 - cluster)
cd backend
pm2 start ecosystem.config.js --env production
cd ..

# 2. Frontend (порт 3017 - dev server)
cd frontend
mkdir -p logs
pm2 start ecosystem.config.js
cd ..

# 3. Сохранить конфигурацию
pm2 save

# 4. Проверка
pm2 list
```

---

## ✅ Проверка портов:

```bash
sudo ss -tlnp | grep -E ':(3015|3016|3017)'
```

Должно показать:
```
:3015  node (salary-monitor-backend)
:3016  node (salary-monitor-backend)
:3017  node (salary-monitor-frontend)
```

---

## 🔗 Доступ:

### Frontend:
```
http://ваш-ip:3017
```

### Backend API:
```
http://ваш-ip:3015/api
```

---

## 📊 Управление:

```bash
# Статус
pm2 status

# Логи backend
pm2 logs salary-monitor-backend

# Логи frontend  
pm2 logs salary-monitor-frontend

# Перезапуск всех
pm2 restart all

# Остановка
pm2 stop all

# Удаление
pm2 delete all
```

---

## 🔄 Автозапуск при перезагрузке сервера:

```bash
pm2 startup
# Выполните команду которую выдаст PM2
pm2 save
```

---

**Теперь и backend и frontend через PM2!** 🎉

# 🔧 Исправление ошибок на сервере

## ❌ Проблема 1: `nest: not found`

**Причина**: NestJS CLI не установлен (при `npm ci --production` dev зависимости пропускаются)

### ✅ Решение:

```bash
cd /home/admin-lc/salary_monitor/backend

# Установка ВСЕХ зависимостей (включая dev)
npm install

# Сборка
npm run build

# Запуск
pm2 restart salary-monitor-backend
```

---

## ❌ Проблема 2: TypeScript ошибки на фронтенде

### ✅ Решение:

```bash
cd /home/admin-lc/salary_monitor

# Обновите код из Git
git pull

# Пересоберите фронтенд
cd frontend
npm install
npm run build

# Проверьте результат
ls -la dist/
```

---

## 🚀 Быстрое исправление (одной командой):

```bash
cd /home/admin-lc/salary_monitor

# Backend
cd backend && npm install && npm run build && pm2 restart salary-monitor-backend && cd ..

# Frontend
cd frontend && npm install && npm run build && cd ..

echo "✅ Готово!"
```

---

## ✅ Проверка

```bash
# Backend работает?
pm2 status
curl http://localhost:3000/api

# Frontend собран?
ls -la frontend/dist/index.html

# Nginx работает?
sudo nginx -t
curl http://localhost
```

---

**После исправления откройте браузер!** 🎯

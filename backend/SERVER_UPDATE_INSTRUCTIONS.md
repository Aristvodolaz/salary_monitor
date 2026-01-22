# Инструкции для применения исправлений на сервере

## 1. Обновите код и пересоберите backend:
cd /home/admin-lc/salary_monitor
git pull
cd backend
npm install  
npm run build

## 2. Пересоздайте SQL views (исправлена ошибка в v_salary_by_month):
cd /home/admin-lc/salary_monitor
node backend/scripts/recreate-views.js

## 3. Перезапустите backend:
pm2 restart salary-monitor-backend

## 4. Проверьте логи:
pm2 logs salary-monitor-backend --lines 50

## 5. Финальная проверка (опционально):
node backend/scripts/final-test.js


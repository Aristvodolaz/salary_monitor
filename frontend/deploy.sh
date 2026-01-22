#!/bin/bash
# =============================================
# Скрипт деплоя frontend на production сервер
# =============================================

echo "🎨 Деплой SalaryMonitor Frontend..."

# 1. Обновление кода
echo "📥 Обновление кода..."
git pull origin main

# 2. Установка зависимостей
echo "📦 Установка зависимостей..."
npm ci

# 3. Сборка production
echo "🔨 Сборка проекта..."
npm run build

# 4. Копирование в nginx директорию
echo "📋 Копирование файлов..."
sudo rm -rf /var/www/salary-monitor/frontend/dist.old
sudo mv /var/www/salary-monitor/frontend/dist /var/www/salary-monitor/frontend/dist.old 2>/dev/null || true
sudo cp -r dist /var/www/salary-monitor/frontend/

# 5. Перезагрузка nginx
echo "🔄 Перезагрузка Nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo "✅ Деплой frontend завершен!"
echo ""
echo "🌐 Откройте: http://your-server-ip"

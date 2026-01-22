#!/bin/bash
# =============================================
# Полный деплой SalaryMonitor (Backend + Frontend)
# =============================================

set -e  # Остановка при ошибке

echo "🚀 Полный деплой SalaryMonitor..."
echo ""

# Backend
echo "═══════════════════════════════════════"
echo "📦 BACKEND"
echo "═══════════════════════════════════════"
cd backend
chmod +x deploy.sh
./deploy.sh
cd ..

echo ""

# Frontend  
echo "═══════════════════════════════════════"
echo "🎨 FRONTEND"
echo "═══════════════════════════════════════"
cd frontend
chmod +x deploy.sh
./deploy.sh
cd ..

echo ""
echo "═══════════════════════════════════════"
echo "✅ Деплой завершен успешно!"
echo "═══════════════════════════════════════"
echo ""
echo "📊 Проверьте статус:"
echo "   pm2 status"
echo "   sudo systemctl status nginx"
echo ""
echo "🌐 Откройте: http://your-server-ip"
echo ""

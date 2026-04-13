const fs = require('fs');

const path = 'd:/work/komus/selary/frontend/src/pages/NormsPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Убираем всё от NormsReferenceTab до NormsEmployeesTab
content = content.replace(/\/\/ ── NormsReferenceTab ──[^\0]*?\/\/ ── NormsEmployeesTab ──/g, '// ── NormsEmployeesTab ──');

// 2. Убираем всё от SyncTab до NormsPage
content = content.replace(/\/\/ ── SyncTab ──[^\0]*?\/\/ ── NormsPage ──/g, '// ── NormsPage ──');

fs.writeFileSync(path, content, 'utf8');
console.log('Unused components removed from NormsPage.tsx');

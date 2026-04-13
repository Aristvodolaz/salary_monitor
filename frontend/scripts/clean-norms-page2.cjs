const fs = require('fs');

const path = 'd:/work/komus/selary/frontend/src/pages/NormsPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// Добавляем PICKING_TYPE_COLORS перед NormsEmployeesTab
const colorsDef = `
const PICKING_TYPE_COLORS: Record<string, string> = {
  'Коробочная комплектация': '#3B82F6',
  'Штучная комплектация':    '#10B981',
  'Упаковка':                '#F59E0B',
  'Штучн.компл.однострочн':  '#8B5CF6',
};
// ── NormsEmployeesTab ──`;

content = content.replace('// ── NormsEmployeesTab ──', colorsDef);

// Убираем неиспользуемые импорты
content = content.replace('Tooltip,', '');
content = content.replace('TableSortLabel,', '');
content = content.replace('Divider,', '');
content = content.replace('Paper,', '');
content = content.replace('Download,', '');
content = content.replace('Sync', '');
content = content.replace('sapAPI', '');
content = content.replace(',  } from \'../services/api\';', ' } from \'../services/api\';');

// Убираем интерфейсы
content = content.replace(/interface WcrPickingNorm[\s\S]*?\}\n/, '');
content = content.replace(/interface PickingStat[\s\S]*?\}\n/, '');
content = content.replace(/interface WcrNorm[\s\S]*?\}\n/, '');
content = content.replace(/type StatsSortKey[\s\S]*?\}\n/g, '');
content = content.replace(/type StatsSortKey[\s\S]*?\| 'norm_pct';\n/g, '');

// Убираем функции
content = content.replace(/const normChipColor[\s\S]*?\};\n/, '');
content = content.replace(/const normChipLabel[\s\S]*?\};\n/, '');
content = content.replace(/function escapeCsvCell[\s\S]*?\n\}/, '');
content = content.replace(/function buildNormsStatsCsv[\s\S]*?\n\}/, '');
content = content.replace(/function downloadCsv[\s\S]*?\n\}/, '');

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed TS errors in NormsPage.tsx');

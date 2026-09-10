const ExcelJS = require('exceljs');

function cellStr(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return String(v.text);
  if (typeof v === 'object' && v.result != null) return String(v.result);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

(async () => {
  const file = 'c:\\Users\\G15\\Downloads\\Выработка комплектация.xlsx';
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  for (const ws of wb.worksheets) {
    console.log('\n======== SHEET', JSON.stringify(ws.name), 'rows=', ws.rowCount, 'cols=', ws.columnCount);
    for (let r = 1; r <= Math.min(4, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const vals = [];
      for (let c = 1; c <= Math.min(20, ws.columnCount || 20); c++) {
        const v = cellStr(row.getCell(c).value).slice(0, 80);
        if (v) vals.push(`${c}:${v}`);
      }
      console.log('R' + r, vals.join(' | '));
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

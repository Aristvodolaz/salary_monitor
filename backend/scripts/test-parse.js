const fs = require('fs');

const rawData = fs.readFileSync('../../data_priemka_new.txt', 'utf8');
const lines = rawData.split('\n').filter(l => l.trim().length > 0);

let sum = 0;
for (let i = 0; i < 5; i++) {
  const parts = lines[i].split('\t').map(s => s.trim());
  const wcr_code = parts[0];
  const aei_count = parseInt(parts[2].replace(/\s/g, ''), 10) || 0;
  let fio_full = parts[4];
  const type_name = parts[5];
  
  // Regex to remove all kinds of whitespace including non-breaking space \u00A0
  let amtStr = parts[11] ? parts[11].replace(/[\s\u00A0]/g, '').replace(',', '.') : '0';
  const amount = parseFloat(amtStr) || 0;
  console.log(`Row ${i}: fio=${fio_full}, amount string='${parts[11]}', parsed=${amount}`);
  sum += amount;
}

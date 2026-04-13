const fs = require('fs');
if (fs.existsSync('d:\\work\\komus\\selary\\backend\\scripts\\resync-march-both.js')) {
  console.log(fs.readFileSync('d:\\work\\komus\\selary\\backend\\scripts\\resync-march-both.js', 'utf8'));
} else {
  console.log('File not found');
}
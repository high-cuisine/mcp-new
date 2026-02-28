const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const questionsDir = path.join(__dirname, '../libs/infractructure/rag/questions');
const inputPath = path.join(questionsDir, '1_merged.xlsx');

if (!fs.existsSync(inputPath)) {
  console.error('File not found:', inputPath);
  process.exit(1);
}

const workbook = XLSX.readFile(inputPath);
const sheetNames = workbook.SheetNames;

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'sheet';
}

sheetNames.forEach((sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n', blankrows: false });
  const baseName = `1_merged_${sanitizeFilename(sheetName)}`;
  const outPath = path.join(questionsDir, `${baseName}.csv`);
  fs.writeFileSync(outPath, '\uFEFF' + csv, 'utf8'); // BOM for Excel UTF-8
  console.log('Written:', outPath);
});

console.log('Done. Sheets:', sheetNames.length);

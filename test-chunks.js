// Тестируем логику разбивки периода на чанки

function getDateChunks(start, end, chunkDays) {
  const chunks = [];
  let cur = new Date(start.getTime());

  while (cur <= end) {
    const chunkEnd = new Date(cur.getTime());
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1);
    chunkEnd.setUTCHours(23, 59, 59, 999);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({ startDate: new Date(cur), endDate: new Date(chunkEnd) });
    cur = new Date(chunkEnd.getTime() + 1);
    cur.setUTCHours(0, 0, 0, 0);
  }

  return chunks;
}

const periodStart = new Date('2026-02-01T00:00:00.000Z');
const periodEnd = new Date('2026-02-28T23:59:59.999Z');

const chunks = getDateChunks(periodStart, periodEnd, 5);

console.log('=== CHUNKS FOR FEBRUARY 2026 ===');
chunks.forEach((chunk, idx) => {
  console.log(
    `Chunk ${idx + 1}: ${chunk.startDate.toISOString().slice(0, 10)} → ${chunk.endDate.toISOString().slice(0, 10)}`,
  );
});

// Проверяем, все ли дни покрыты
console.log('\n=== COVERAGE CHECK ===');
const covered = new Set();
chunks.forEach((chunk) => {
  let cur = new Date(chunk.startDate);
  while (cur <= chunk.endDate) {
    covered.add(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
});

console.log(`Total days covered: ${covered.size}`);
for (let day = 1; day <= 28; day++) {
  const dateStr = `2026-02-${day.toString().padStart(2, '0')}`;
  if (!covered.has(dateStr)) {
    console.log(`❌ ${dateStr} NOT COVERED`);
  }
}

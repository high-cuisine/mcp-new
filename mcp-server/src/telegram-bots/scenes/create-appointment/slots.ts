export function parseAvailableSlots(slotsText: string): Array<{ date: string; time: string; index: number }> {
  const slots: Array<{ date: string; time: string; index: number }> = [];
  if (
    slotsText.includes('не найден') ||
    slotsText.includes('недоступно') ||
    slotsText.includes('нет доступных')
  ) {
    return slots;
  }
  const lines = slotsText.split('\n');
  let currentDate = '';
  let slotIndex = 1;
  for (const line of lines) {
    const dateMatch = line.match(/\((\d{4}-\d{2}-\d{2})\)/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }
    const timeMatch = line.match(/•\s*(\d{2}:\d{2})/);
    if (timeMatch && currentDate) {
      slots.push({ date: currentDate, time: timeMatch[1], index: slotIndex++ });
    }
  }
  return slots;
}

export function buildSlotsList(slots: Array<{ date: string; time: string; index: number }>): string[] {
  if (slots.length === 0) return ['Нет доступных окон для записи.'];
  const lines: string[] = ['📅 Выберите доступное окно (введите номер):', ''];
  const slotsByDate: Record<string, Array<{ time: string; index: number }>> = {};
  slots.forEach((slot) => {
    if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
    slotsByDate[slot.date].push({ time: slot.time, index: slot.index });
  });
  Object.entries(slotsByDate)
    .sort()
    .forEach(([date, times]) => {
      const dateObj = new Date(date);
      const dateStr = dateObj.toLocaleDateString('ru-RU', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
      });
      lines.push(`📅 ${dateStr} (${date}):`);
      times
        .sort((a, b) => a.time.localeCompare(b.time))
        .forEach(({ time, index }) => {
          lines.push(`   ${index}. ${time}`);
        });
      lines.push('');
    });
  return [lines.join('\n')];
}

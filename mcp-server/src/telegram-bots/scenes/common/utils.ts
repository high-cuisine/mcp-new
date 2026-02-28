import { Admission } from '@common/entities/admission.entity';

export function normalizePhone(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  return `+${digits}`;
}

export function formatDateDisplay(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  if (date.toDateString() === tomorrow.toDateString()) return 'Завтра';
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dayName = dayNames[date.getDay()];
  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  return `${dayName}, ${day} ${month}`;
}

export function isPositiveResponse(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return ['да', 'yes', 'ок', 'окей', 'подтверждаю', 'confirm', 'подтвердить'].includes(normalized);
}

export function isNegativeResponse(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return ['нет', 'no', 'cancel', 'отмена', 'заново', 'отменить'].includes(normalized);
}

export function parseAppointmentIndex(input: string, appointments: Admission[]): number | null {
  const num = parseInt(input.trim(), 10);
  if (isNaN(num) || num < 1 || num > appointments.length) return null;
  return num - 1;
}

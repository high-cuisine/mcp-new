import type { AppointmentType } from './types';
import { WORK_TIME_END, WORK_TIME_START, MAX_MONTHS_AHEAD } from './constants';

export function resolveAppointmentType(input: string): AppointmentType | null {
  const normalized = input.toLowerCase().replace(/\s+/g, '');
  if (['1', 'primary', 'первичный', 'первичныйприем'].includes(normalized)) return 'primary';
  if (['2', 'secondary', 'вторичный', 'вторичныйприем'].includes(normalized)) return 'secondary';
  if (['3', 'vaccination', 'прививка', 'прививкаприем'].includes(normalized)) return 'vaccination';
  if (['4', 'ultrasound', 'узи', 'ультразвук', 'ультразвуковое'].includes(normalized)) return 'ultrasound';
  if (['5', 'analyses', 'анализы', 'анализ', 'анализкрови'].includes(normalized)) return 'analyses';
  if (['6', 'xray', 'рентген', 'рентгенография', 'рентгеноскопия'].includes(normalized)) return 'xray';
  if (['7', 'other', 'другое', 'другая', 'произвольная', 'произвольный', 'иное', 'своя', 'иная'].includes(normalized))
    return 'other';
  return null;
}

export function isValidDate(value: string): boolean {
  const match = value.match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getDateValidationError(value: string): string | null {
  if (!isValidDate(value)) {
    return 'Введите дату в формате ГГГГ-ММ-ДД (например, 2025-06-15).';
  }
  const match = value.match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
  if (!match) return 'Неверный формат даты.';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const chosen = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (chosen.getTime() < todayStart.getTime()) {
    return 'Дата не должна быть в прошлом. Введите актуальную или будущую дату в формате ГГГГ-ММ-ДД.';
  }
  const maxDate = new Date(today);
  maxDate.setUTCMonth(maxDate.getUTCMonth() + MAX_MONTHS_AHEAD);
  if (chosen.getTime() > maxDate.getTime()) {
    return `Запись возможна не более чем на ${MAX_MONTHS_AHEAD} месяцев вперёд. Выберите более близкую дату.`;
  }
  return null;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function getTimeValidationError(value: string): string | null {
  if (!isValidTime(value)) {
    return 'Введите время в формате ЧЧ:ММ (например, 14:30). Приём возможен с 08:00 до 20:00.';
  }
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const minutes = hour * 60 + minute;
  const startMinutes = WORK_TIME_START.hour * 60 + WORK_TIME_START.minute;
  const endMinutes = WORK_TIME_END.hour * 60 + WORK_TIME_END.minute;
  if (minutes < startMinutes) {
    return `Время приёма — с ${String(WORK_TIME_START.hour).padStart(2, '0')}:${String(WORK_TIME_START.minute).padStart(2, '0')} до ${String(WORK_TIME_END.hour).padStart(2, '0')}:${String(WORK_TIME_END.minute).padStart(2, '0')}. Введите время не раньше 08:00.`;
  }
  if (minutes >= endMinutes) {
    return 'Время приёма — с 08:00 до 20:00. Введите время до 20:00.';
  }
  return null;
}

export function splitName(fullName: string): { lastName: string; firstName: string; middleName: string } {
  const parts = (fullName || '').trim().split(/\s+/);
  const [lastName = '', firstName = '', middleName = ''] = parts;
  return { lastName, firstName, middleName };
}

import type { AppointmentStep, AppointmentType } from './types';

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  primary: 'Первичный прием',
  secondary: 'Вторичный прием',
  vaccination: 'Прививка',
  ultrasound: 'УЗИ',
  analyses: 'Анализы',
  xray: 'Рентген',
  other: 'Другое (произвольная причина)',
};

export const STEP_LABELS: Record<AppointmentStep, string> = {
  intro: '',
  symptoms: 'Расскажите, пожалуйста, какие симптомы у питомца.',
  pet_name: 'Укажите имя и вид питомца (например: Барсик, кот).',
  pet_breed: 'Введите породу питомца (например: британская, корги).',
  owner_phone: 'Укажите номер телефона владельца в формате +7XXXXXXXXXX.',
  owner_name: 'Введите ФИО владельца (например: Иванов Иван Иванович).',
  appointment_type:
    'Выберите тип приема: 1 — первичный, 2 — вторичный, 3 — прививка, 4 — УЗИ, 5 — анализы, 6 — рентген, 7 — другое (произвольная причина).',
  appointment_type_other: 'Укажите причину приёма (произвольный текст).',
  date: 'Введите желаемую дату приема в формате ГГГГ-ММ-ДД (например, 2025-06-15). Дата не должна быть в прошлом.',
  time: 'Введите время приема в формате ЧЧ:ММ (например, 14:30). Приём возможен с 08:00 до 20:00.',
  clinic: 'Укажите предпочитаемую клинику.',
  doctor: 'Укажите предпочитаемого врача (ФИО) или напишите «авто» для автоматического подбора.',
  slot_selection: 'Выберите доступное окно (введите номер из списка).',
  confirmation: 'Если данные верны, ответьте «да» для подтверждения или «нет», чтобы начать заново.',
  completed: '',
};

export const FORMAT_HINTS: Partial<Record<AppointmentStep, string>> = {
  owner_phone: 'телефон +7XXXXXXXXXX',
  date: 'ГГГГ-ММ-ДД',
  time: 'ЧЧ:ММ',
  appointment_type: '1-7 или primary/secondary/vaccination/ultrasound/analyses/xray/other',
};

export const WORK_TIME_START = { hour: 8, minute: 0 };
export const WORK_TIME_END = { hour: 20, minute: 0 };
export const MAX_MONTHS_AHEAD = 12;

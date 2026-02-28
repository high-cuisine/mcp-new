import { Admission } from '@common/entities/admission.entity';
import type { MoveAppointmentState, OfferedSlot } from './types';
import { formatDateDisplay } from '../common/utils';

export function buildIntroMessage(): string {
  return [
    '🔄 Перенос записи на прием',
    '',
    'Для переноса записи нам нужно найти ваши записи в системе.',
    'Введите номер телефона, на который была оформлена запись, в формате +7XXXXXXXXXX.',
    'Вы всегда можете отправить «/exit», чтобы отменить процесс.',
  ].join('\n');
}

export function buildAppointmentsListResponse(
  appointments: Admission[],
  client: any,
  phone: string,
): string[] {
  const lines: string[] = [];
  lines.push(`✅ Клиент: ${client?.first_name || ''} ${client?.last_name || ''}`);
  lines.push(`📞 Телефон: ${phone}`);
  lines.push('');
  lines.push(`Найдено записей: ${appointments.length}`);
  lines.push('Выберите запись для переноса (введите номер):');
  lines.push('');
  appointments.forEach((appointment, index) => {
    const d = new Date(appointment.admission_date);
    const formattedDate = formatDateDisplay(d);
    const formattedTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    lines.push(`${index + 1}. 📅 ${formattedDate} в ${formattedTime}`);
    lines.push(`   👨‍⚕️ Врач ID: ${appointment.user_id}`);
    lines.push('');
  });
  return lines;
}

export function buildSelectedAppointmentResponse(appointment: Admission): string[] {
  const d = new Date(appointment.admission_date);
  const formattedDate = formatDateDisplay(d);
  const formattedTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return [
    `✅ Выбрана запись: ${formattedDate} в ${formattedTime}`,
    'Введите новую дату для записи в формате ГГГГ-ММ-ДД.',
  ];
}

/** Подтверждение переноса по инициативе клиента: дата, пациент; после «да» запись отменяется */
export function buildConfirmRescheduleMessage(appointment: Admission, petAlias?: string): string[] {
  const d = new Date(appointment.admission_date);
  const formattedDate = formatDateDisplay(d);
  const formattedTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const patientLine = petAlias ? `Пациент: ${petAlias}.` : 'Пациент: по записи.';
  return [
    '📋 Подтвердите, что переносим именно эту запись:',
    `📅 Дата и время: ${formattedDate} в ${formattedTime}.`,
    patientLine,
    '',
    'Текущая запись будет отменена, после чего предложим новые варианты времени.',
    'Ответьте «да» для продолжения или «нет», чтобы остаться в меню.',
  ];
}

/** Предложенные слоты (2–3 варианта) */
export function buildOfferedSlotsMessage(slots: OfferedSlot[]): string[] {
  const lines: string[] = ['Предлагаем варианты:'];
  slots.forEach((slot, i) => {
    const d = new Date(slot.date);
    const displayDate = formatDateDisplay(d);
    lines.push(`${i + 1}. ${displayDate} в ${slot.time}`);
  });
  lines.push('', 'Выберите номер (1, 2 или 3) или напишите «другие» для выбора другой даты.');
  return lines;
}

/** Нет свободных окон — альтернативы: другие дни, другой врач, живая очередь, лист ожидания */
export function buildNoSlotsAlternativesMessage(liveQueueDoctorsNames: string[]): string[] {
  const liveQueueLine =
    liveQueueDoctorsNames.length > 0
      ? `3) Живая очередь (приём без записи: ${liveQueueDoctorsNames.join(', ')}).`
      : '3) Живая очередь (приём без записи).';
  return [
    'К сожалению, на ближайшие даты свободных окон нет.',
    '',
    'Можем предложить:',
    '1) Другие дни (расширить поиск).',
    '2) Другого врача (если допустимо по услуге).',
    liveQueueLine,
    '4) Лист ожидания — при освобождении окна с вами свяжется администратор (сроки не гарантируем).',
    '',
    'Выберите 1, 2, 3 или 4.',
  ];
}

/** Сообщение после согласия на лист ожидания: контакт зафиксирован, передано администратору */
export function buildWaitlistHandoffMessage(): string[] {
  return [
    '✅ Записал вас в лист ожидания.',
    '',
    'При освобождении окна с вами свяжется администратор. Сроки не гарантируем.',
    'Заявка передана администратору.',
  ];
}

/** Подтверждение новой записи + напоминание накануне */
export function buildConfirmationWithReminderResponse(state: MoveAppointmentState): string[] {
  if (!state.data.selectedAppointment || !state.data.newDate || !state.data.newTime) {
    return ['Ошибка: не все данные выбраны'];
  }
  const newDateObj = new Date(state.data.newDate);
  const formattedNewDate = formatDateDisplay(newDateObj);
  return [
    '⚠️ Подтверждение новой записи',
    '',
    `📅 Дата: ${formattedNewDate}`,
    `🕐 Время: ${state.data.newTime}`,
    '',
    'Ответьте «да» для подтверждения или «нет», чтобы отменить.',
    'Накануне приёма придёт напоминание.',
  ];
}

export function buildAvailableDatesResponse(
  dates: Array<{ date: string; displayName: string }>,
): string[] {
  const lines: string[] = ['Доступные даты:'];
  dates.forEach((dateInfo, index) => {
    lines.push(`${index + 1}. ${dateInfo.displayName} (${dateInfo.date})`);
  });
  lines.push('', 'Введите дату в формате ГГГГ-ММ-ДД:');
  return lines;
}

export function buildAvailableTimesResponse(times: string[]): string[] {
  const lines: string[] = ['Доступное время:'];
  times.forEach((time, index) => {
    lines.push(`${index + 1}. 🕐 ${time}`);
  });
  lines.push('', 'Введите время в формате ЧЧ:ММ:');
  return lines;
}

export function buildConfirmationResponse(state: MoveAppointmentState): string[] {
  if (!state.data.selectedAppointment || !state.data.newDate || !state.data.newTime) {
    return ['Ошибка: не все данные выбраны'];
  }
  const oldDate = new Date(state.data.selectedAppointment.admission_date);
  const formattedOldDate = formatDateDisplay(oldDate);
  const formattedOldTime = oldDate.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const newDateObj = new Date(state.data.newDate);
  const formattedNewDate = formatDateDisplay(newDateObj);
  return [
    '⚠️ Подтверждение переноса записи',
    '',
    '📋 Текущая запись:',
    `📅 Дата: ${formattedOldDate}`,
    `🕐 Время: ${formattedOldTime}`,
    '',
    '📋 Новая запись:',
    `📅 Дата: ${formattedNewDate}`,
    `🕐 Время: ${state.data.newTime}`,
    '',
    'Вы уверены, что хотите перенести запись?',
    'Ответьте «да» для подтверждения или «нет», чтобы начать заново.',
  ];
}

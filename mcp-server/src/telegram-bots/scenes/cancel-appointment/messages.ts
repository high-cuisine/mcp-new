import { Admission } from '@common/entities/admission.entity';
import { formatDateDisplay } from '../common/utils';

export function buildIntroMessage(): string {
  return [
    '🗑️ Отмена записи на прием',
    '',
    'Для отмены записи нам нужно найти ваши записи в системе.',
    'Введите номер телефона, на который была оформлена запись, в формате +7XXXXXXXXXX.',
    'Вы всегда можете отправить «/exit», чтобы отменить процесс.',
  ].join('\n');
}

export function buildNoAppointmentsResponse(client: any, phone: string): string[] {
  return [
    `✅ Клиент: ${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim(),
    `📞 Телефон: ${phone}`,
    '',
    '❌ У вас нет активных записей на прием. Возможно, все записи уже завершены или отменены.',
  ];
}

export function buildAppointmentsListResponse(
  client: any,
  phone: string,
  appointments: Admission[],
): string[] {
  const lines: string[] = [];
  lines.push('Выберите запись, которую хотите отменить (введите номер):');
  lines.push(`👤 Клиент: ${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim());
  lines.push(`📞 Телефон: ${phone}`);
  lines.push('');
  appointments.forEach((appointment, index) => {
    const d = new Date(appointment.admission_date);
    const formattedDate = formatDateDisplay(d);
    const formattedTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    lines.push(`${index + 1}. ${formattedDate} в ${formattedTime}`);
    lines.push(`   🆔 ID: ${appointment.id}`);
    lines.push('');
  });
  return lines;
}

export function buildConfirmationResponse(appointment?: Admission): string[] {
  if (!appointment) return ['Ошибка: запись не выбрана.'];
  const d = new Date(appointment.admission_date);
  const formattedDate = formatDateDisplay(d);
  const formattedTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return [
    '⚠️ Подтверждение отмены записи',
    `🆔 ID: ${appointment.id}`,
    `📅 Дата: ${formattedDate}`,
    `🕐 Время: ${formattedTime}`,
    '',
    'Вы уверены, что хотите отменить эту запись?',
    'Ответьте «да» для подтверждения или «нет», чтобы начать заново.',
  ];
}

import { Admission } from '@common/entities/admission.entity';
import { formatDateDisplay } from '../common/utils';

export function buildIntroMessage(): string {
  return [
    '📅 Просмотр записей на прием',
    '',
    'Для просмотра ваших записей нам нужно найти вас в системе.',
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

export function buildAppointmentsResponse(
  client: any,
  phone: string,
  appointments: Admission[],
): string[] {
  const lines: string[] = [];
  lines.push('📅 Ваши записи на прием');
  lines.push(`👤 Клиент: ${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim());
  lines.push(`📞 Телефон: ${phone}`);
  lines.push('');
  lines.push(`Найдено записей: ${appointments.length}`);
  lines.push('');
  appointments.forEach((appointment, index) => {
    const d = new Date(appointment.admission_date);
    const formattedDate = formatDateDisplay(d);
    const formattedTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    lines.push(`${index + 1}. ${formattedDate} в ${formattedTime}`);
    if ((appointment as any).pet?.alias) lines.push(`   🐾 Питомец: ${(appointment as any).pet.alias}`);
    if (appointment.description) lines.push(`   📝 ${appointment.description}`);
    lines.push(`   🆔 ID: ${appointment.id}`);
    lines.push('');
  });
  lines.push('Чтобы выполнить другие действия, введите новую команду.');
  return lines;
}

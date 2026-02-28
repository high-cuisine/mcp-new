import type { AppointmentState, AppointmentStateData, AppointmentType } from './types';
import { APPOINTMENT_TYPE_LABELS } from './constants';

export function buildIntroMessage(): string {
  return [
    '🐾 Создание записи на прием',
    '',
    'Расскажите, пожалуйста, какие симптомы у питомца. Это будет первым шагом.',
    'Вы всегда можете отправить «/exit», чтобы отменить процесс.',
  ].join('\n');
}

export function buildSymptomsStepResponse(symptoms: string): string[] {
  return [
    `✅ Симптомы: ${symptoms}`,
    'Теперь укажите имя и вид питомца (например: «Барсик, кот»).',
  ];
}

export function buildPetNameStepResponse(petName: string): string[] {
  return [
    `✅ Питомец: ${petName}`,
    'Введите породу питомца (например: «британская», «корги»).',
  ];
}

export function buildPetBreedStepResponse(state: AppointmentState): string[] {
  const petName = state.data.petName ?? 'питомец';
  const petBreed = state.data.petBreed ?? '';
  return [
    `✅ Питомец: ${petName}`,
    `✅ Порода: ${petBreed}`,
    'Укажите номер телефона владельца в формате +7XXXXXXXXXX.',
  ];
}

export function buildOwnerPhoneStepResponse(phone: string): string[] {
  return [
    `✅ Телефон владельца: ${phone}`,
    'Введите ФИО владельца (например: «Иванов Иван Иванович»).',
  ];
}

export function buildOwnerNameStepResponse(ownerName: string): string[] {
  return [
    `✅ ФИО: ${ownerName}`,
    'Выберите тип приема: 1 — первичный, 2 — вторичный, 3 — прививка, 4 — УЗИ, 5 — анализы, 6 — рентген, 7 — другое (произвольная причина).',
  ];
}

export function buildAppointmentTypeStepResponse(type: AppointmentType): string[] {
  return [`✅ Тип приема: ${APPOINTMENT_TYPE_LABELS[type]}`];
}

export function buildDateStepResponse(date: string): string[] {
  return [
    `✅ Дата приема: ${date}`,
    'Введите желаемое время приема в формате ЧЧ:ММ.',
  ];
}

export function buildDoctorStepResponse(state: AppointmentState): string[] {
  const doctorInput = state.data.doctor ?? '';
  const doctorLabel = doctorInput.toLowerCase() === 'авто' ? 'Автоматический подбор' : doctorInput;
  const messages: string[] = [];
  if (doctorLabel) {
    messages.push(`✅ Врач: ${doctorLabel}`);
  } else {
    messages.push('Врач будет подобран автоматически.');
  }
  if (state.data.date && state.data.time) {
    messages.push(buildSummary(state.data));
    messages.push('Если данные верны, ответьте «да» для подтверждения или «нет», чтобы начать заново.');
  }
  return messages;
}

export function buildSummary(data: AppointmentStateData): string {
  const lines: string[] = ['📋 Сводка заявки:'];
  if (data.petName) {
    const breedPart = data.petBreed ? ` (${data.petBreed})` : '';
    lines.push(`🐾 Питомец: ${data.petName}${breedPart}`);
  }
  if (data.symptoms) lines.push(`⚕️ Симптомы: ${data.symptoms}`);
  if (data.ownerName) lines.push(`👤 Владелец: ${data.ownerName}`);
  if (data.ownerPhone) lines.push(`📞 Телефон: ${data.ownerPhone}`);
  if (data.appointmentType) {
    const label =
      data.appointmentType === 'other' && data.appointmentTypeOther
        ? `Другое: ${data.appointmentTypeOther}`
        : APPOINTMENT_TYPE_LABELS[data.appointmentType];
    lines.push(`🩺 Тип приема: ${label}`);
  }
  if (data.date && data.time) lines.push(`📅 Дата и время: ${data.date} ${data.time}`);
  else if (data.date) lines.push(`📅 Дата: ${data.date}`);
  if (data.clinic) lines.push(`🏥 Клиника: ${data.clinic}`);
  if (data.doctor) {
    const doctorLabel = data.doctor.toLowerCase() === 'авто' ? 'Автоматический подбор' : data.doctor;
    lines.push(`👨‍⚕️ Врач: ${doctorLabel}`);
  }
  return lines.join('\n');
}

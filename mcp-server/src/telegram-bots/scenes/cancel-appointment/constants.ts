import type { CancelAppointmentStep } from './types';

export const STEP_LABELS: Record<CancelAppointmentStep, string> = {
  intro: '',
  phone: 'Введите номер телефона, на который была оформлена запись, в формате +7XXXXXXXXXX.',
  select_appointment: 'Выберите запись для отмены (введите номер из списка).',
  confirmation: 'Ответьте «да» для подтверждения отмены или «нет», чтобы начать заново.',
  completed: '',
};

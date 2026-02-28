import type { ShowAppointmentStep } from './types';

export const STEP_LABELS: Record<ShowAppointmentStep, string> = {
  intro: '',
  phone: 'Введите номер телефона, на который была оформлена запись, в формате +7XXXXXXXXXX.',
  display: '',
  completed: '',
};

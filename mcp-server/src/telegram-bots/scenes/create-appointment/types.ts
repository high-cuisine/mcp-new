export type AppointmentStep =
  | 'intro'
  | 'symptoms'
  | 'pet_name'
  | 'pet_breed'
  | 'owner_phone'
  | 'owner_name'
  | 'appointment_type'
  | 'appointment_type_other'
  | 'date'
  | 'time'
  | 'clinic'
  | 'doctor'
  | 'slot_selection'
  | 'confirmation'
  | 'completed';

export type AppointmentType =
  | 'primary'
  | 'secondary'
  | 'vaccination'
  | 'ultrasound'
  | 'analyses'
  | 'xray'
  | 'other';

/** Вариант потока записи — заготовка под разные сценарии по типу приёма */
export type VisitFlow = 'default' | 'vaccination' | 'surgery' | 'diagnostics';

/**
 * Данные записи на приём. Единая структура для CRM независимо от сценария (терапия, вакцинация, УЗИ, анализы и т.д.).
 * Разные сценарии задают только тексты бота и порядок вопросов; итоговая заявка всегда собирается в эти поля.
 */
export interface AppointmentStateData {
  symptoms?: string;
  petName?: string;
  petBreed?: string;
  ownerPhone?: string;
  ownerName?: string;
  appointmentType?: AppointmentType;
  appointmentTypeOther?: string;
  /** Выбранный поток (зависит от типа приёма); используется для разной последовательности шагов */
  flow?: VisitFlow;
  date?: string;
  time?: string;
  clinic?: string;
  clinicId?: number;
  doctor?: string;
  doctorId?: number;
  availableSlots?: Array<{ date: string; time: string; index: number }>;
}

export interface AppointmentState {
  step: AppointmentStep;
  data: AppointmentStateData;
}

export interface SceneHandleResult {
  state: AppointmentState;
  responses: string[];
  completed: boolean;
  exitScene?: boolean;
}

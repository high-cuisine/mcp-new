import { Admission } from '@common/entities/admission.entity';

export type MoveAppointmentStep =
  | 'intro'
  | 'phone'
  | 'select_appointment'
  | 'confirm_reschedule'
  | 'orientation_days'
  | 'orientation_time'
  | 'offer_slots'
  | 'select_slot_from_offer'
  | 'select_date'
  | 'select_time'
  | 'no_slots_alternatives'
  | 'no_slots_choice'
  | 'waitlist_handoff'
  | 'confirmation'
  | 'completed';

/** Один предложенный слот (дата + время) */
export interface OfferedSlot {
  date: string;
  time: string;
}

export interface MoveAppointmentStateData {
  phone?: string;
  client?: any;
  appointments?: Admission[];
  selectedAppointmentId?: string;
  selectedAppointment?: Admission;
  /** Текущая запись отменена (окно освобождено) */
  appointmentCancelled?: boolean;
  /** На какие дни ориентируется клиент */
  orientationDays?: string;
  /** Ограничения по времени */
  orientationTimeConstraints?: string;
  /** 2–3 предложенных слота после отмены */
  offeredSlots?: OfferedSlot[];
  newDate?: string;
  newTime?: string;
  clinicId?: number;
}

export interface MoveAppointmentState {
  step: MoveAppointmentStep;
  data: MoveAppointmentStateData;
}

export interface MoveAppointmentSceneHandleResult {
  state: MoveAppointmentState;
  responses: string[];
  completed: boolean;
  exitScene?: boolean;
  /** Уведомить модераторов (например, лист ожидания) */
  notifyModerator?: string;
}

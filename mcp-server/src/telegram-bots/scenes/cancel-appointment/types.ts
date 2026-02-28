import { Admission } from '@common/entities/admission.entity';

export type CancelAppointmentStep = 'intro' | 'phone' | 'select_appointment' | 'confirmation' | 'completed';

export interface CancelAppointmentStateData {
  phone?: string;
  client?: any;
  appointments?: Admission[];
  selectedAppointmentId?: string;
  selectedAppointment?: Admission;
}

export interface CancelAppointmentState {
  step: CancelAppointmentStep;
  data: CancelAppointmentStateData;
}

export interface CancelAppointmentSceneHandleResult {
  state: CancelAppointmentState;
  responses: string[];
  completed: boolean;
  exitScene?: boolean;
}

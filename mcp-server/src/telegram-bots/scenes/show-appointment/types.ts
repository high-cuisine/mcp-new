import { Admission } from '@common/entities/admission.entity';

export type ShowAppointmentStep = 'intro' | 'phone' | 'display' | 'completed';

export interface ShowAppointmentStateData {
  phone?: string;
  client?: any;
  appointments?: Admission[];
}

export interface ShowAppointmentState {
  step: ShowAppointmentStep;
  data: ShowAppointmentStateData;
}

export interface ShowAppointmentSceneHandleResult {
  state: ShowAppointmentState;
  responses: string[];
  completed: boolean;
  exitScene?: boolean;
}

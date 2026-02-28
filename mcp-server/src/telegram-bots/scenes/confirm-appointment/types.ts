export type ConfirmAppointmentStep = 'waiting_confirmation';

export interface ConfirmAppointmentStateData {
  appointmentId: string;
}

export interface ConfirmAppointmentState {
  step: ConfirmAppointmentStep;
  data: ConfirmAppointmentStateData;
}

export interface ConfirmAppointmentSceneHandleResult {
  state: ConfirmAppointmentState;
  responses: string[];
  completed: boolean;
  action?: 'confirm' | 'cancel';
  exitScene?: boolean;
}

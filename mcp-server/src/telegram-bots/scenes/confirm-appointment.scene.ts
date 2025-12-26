import { Logger } from '@nestjs/common';

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
}

export class ConfirmAppointmentScene {
  private readonly logger = new Logger(ConfirmAppointmentScene.name);

  getInitialState(appointmentId: string): ConfirmAppointmentState {
    return {
      step: 'waiting_confirmation',
      data: {
        appointmentId,
      },
    };
  }

  handleMessage(state: ConfirmAppointmentState, rawMessage: string): ConfirmAppointmentSceneHandleResult {
    const trimmedMessage = rawMessage?.trim() ?? '';

    // Если сообщение пустое, это начальный запуск сцены
    if (!trimmedMessage && state.step === 'waiting_confirmation') {
      return {
        state: {
          step: 'waiting_confirmation',
          data: { ...state.data },
        },
        responses: [
          'Ваш прием наступит через 24 часа.',
          'Пожалуйста, подтвердите или отмените прием.',
          'Ответьте "подтвердить" или "да" для подтверждения, "отменить" или "нет" для отмены.',
        ],
        completed: false,
      };
    }

    if (state.step === 'waiting_confirmation') {
      if (this.isConfirmResponse(trimmedMessage)) {
        return {
          state: {
            step: 'waiting_confirmation',
            data: { ...state.data },
          },
          responses: ['Прием подтвержден!'],
          completed: true,
          action: 'confirm',
        };
      }

      if (this.isCancelResponse(trimmedMessage)) {
        return {
          state: {
            step: 'waiting_confirmation',
            data: { ...state.data },
          },
          responses: ['Прием отменен.'],
          completed: true,
          action: 'cancel',
        };
      }

      return {
        state: {
          step: 'waiting_confirmation',
          data: { ...state.data },
        },
        responses: [
          'Пожалуйста, подтвердите или отмените прием.',
          'Ответьте "подтвердить" или "да" для подтверждения, "отменить" или "нет" для отмены.',
        ],
        completed: false,
      };
    }

    return {
      state: {
        step: 'waiting_confirmation',
        data: { ...state.data },
      },
      responses: ['Произошла ошибка. Попробуйте еще раз.'],
      completed: false,
    };
  }

  private isConfirmResponse(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return ['да', 'yes', 'ок', 'окей', 'подтвердить', 'подтверждаю', 'confirm', 'подтверждаю прием'].includes(
      normalized,
    );
  }

  private isCancelResponse(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return ['нет', 'no', 'отменить', 'отменяю', 'cancel', 'отменить прием'].includes(normalized);
  }
}


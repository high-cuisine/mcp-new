import { Logger } from '@nestjs/common';
import { ProccesorService } from 'src/proccesor/services/proccesor.service';

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

const CONFIRM_STEP_LABEL =
  'Пожалуйста, подтвердите или отмените прием. Ответьте «подтвердить» или «да» для подтверждения, «отменить» или «нет» для отмены.';

export class ConfirmAppointmentScene {
  private readonly logger = new Logger(ConfirmAppointmentScene.name);

  constructor(private readonly proccesorService?: ProccesorService) {}

  getInitialState(appointmentId: string): ConfirmAppointmentState {
    return {
      step: 'waiting_confirmation',
      data: {
        appointmentId,
      },
    };
  }

  async handleMessage(state: ConfirmAppointmentState, rawMessage: string): Promise<ConfirmAppointmentSceneHandleResult> {
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
          CONFIRM_STEP_LABEL,
        ],
        completed: false,
      };
    }

    if (state.step === 'waiting_confirmation') {
      if (this.proccesorService && trimmedMessage) {
        try {
          const result = await this.proccesorService.validateSceneStep({
            stepId: 'waiting_confirmation',
            stepLabel: CONFIRM_STEP_LABEL,
            userMessage: trimmedMessage,
          });
          if (result.intent === 'refuse') {
            return {
              state: { ...state },
              responses: [result.reply_message || 'Хорошо. Если понадобится — напишите снова.'],
              completed: false,
              exitScene: true,
            };
          }
          if (result.intent === 'off_topic') {
            return {
              state: { ...state },
              responses: [result.reply_message || CONFIRM_STEP_LABEL],
              completed: false,
            };
          }
          if (result.intent === 'answer' && result.validated_value) {
            const normalized = result.validated_value.trim().toLowerCase();
            if (['да', 'yes', 'подтвердить', 'подтверждаю', 'confirm'].includes(normalized)) {
              return {
                state: { step: 'waiting_confirmation', data: { ...state.data } },
                responses: ['Прием подтвержден!'],
                completed: true,
                action: 'confirm',
              };
            }
            if (['нет', 'no', 'отменить', 'отменяю', 'cancel'].includes(normalized)) {
              return {
                state: { step: 'waiting_confirmation', data: { ...state.data } },
                responses: ['Прием отменен.'],
                completed: true,
                action: 'cancel',
              };
            }
          }
        } catch (e) {
            this.logger.warn(`validateSceneStep failed: ${e instanceof Error ? e.message : String(e)}`);
          }
      }

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
        responses: [CONFIRM_STEP_LABEL],
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


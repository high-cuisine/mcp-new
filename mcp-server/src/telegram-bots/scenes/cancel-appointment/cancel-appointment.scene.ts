import { Logger } from '@nestjs/common';
import { AppointmentService } from 'src/crm/services/appointments.service';
import { ClientService } from 'src/crm/services/client.service';
import { CrmService } from 'src/crm/services/crm.service';
import { ProccesorService } from 'src/proccesor/services/proccesor.service';
import { Admission } from '@common/entities/admission.entity';
import type {
  CancelAppointmentState,
  CancelAppointmentSceneHandleResult,
} from './types';
import { STEP_LABELS } from './constants';
import {
  buildIntroMessage,
  buildNoAppointmentsResponse,
  buildAppointmentsListResponse,
  buildConfirmationResponse,
} from './messages';
import {
  normalizePhone,
  parseAppointmentIndex,
  isPositiveResponse,
  isNegativeResponse,
  formatDateDisplay,
} from '../common/utils';

export class CancelAppointmentScene {
  private readonly logger = new Logger(CancelAppointmentScene.name);

  constructor(
    private readonly appointmentService?: AppointmentService,
    private readonly clientService?: ClientService,
    private readonly crmService?: CrmService,
    private readonly proccesorService?: ProccesorService,
  ) {}

  getInitialState(): CancelAppointmentState {
    return { step: 'intro', data: {} };
  }

  private async validateStep(
    state: CancelAppointmentState,
    message: string,
  ): Promise<{ intent: 'answer' | 'off_topic' | 'refuse'; value: string; reply: string | null } | null> {
    if (!this.proccesorService || !message || !STEP_LABELS[state.step]) return null;
    try {
      const result = await this.proccesorService.validateSceneStep({
        stepId: state.step,
        stepLabel: STEP_LABELS[state.step],
        userMessage: message,
        formatHint: state.step === 'phone' ? 'телефон +7XXXXXXXXXX' : undefined,
      });
      return {
        intent: result.intent,
        value: result.validated_value ?? message,
        reply: result.reply_message ?? null,
      };
    } catch (e) {
      this.logger.warn(`validateSceneStep failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private async findClientAndAppointments(
    phone: string,
  ): Promise<{ client?: any; appointments?: Admission[]; error?: string }> {
    if (!this.clientService || !this.appointmentService) {
      return { error: 'Сервисы недоступны. Попробуйте позже.' };
    }
    try {
      const clientResult = await this.clientService.getClinetByPhone(phone);
      if (
        !clientResult ||
        !(clientResult as any).data?.client ||
        (clientResult as any).data.client.length === 0
      ) {
        return {
          error: `Клиент с номером телефона ${phone} не найден в системе. Проверьте правильность номера телефона.`,
        };
      }
      const client = (clientResult as any).data.client[0];
      const clientId = client?.id || client?.client_id;
      const crmClientId = typeof clientId === 'number' ? clientId : parseInt(clientId);
      if (isNaN(crmClientId)) return { error: 'Ошибка: не удалось определить ID клиента.' };
      const appointments = await this.appointmentService.findAppointmentForUser(crmClientId, 1);
      return { client, appointments: appointments ?? [] };
    } catch (error) {
      this.logger.error(`Ошибка при поиске клиента и записей: ${error}`);
      return { error: 'Произошла техническая ошибка при поиске записей. Попробуйте позже.' };
    }
  }

  private async cancelAppointment(
    state: CancelAppointmentState,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.crmService || !state.data.selectedAppointmentId || !state.data.selectedAppointment) {
      return { success: false, error: 'Не все данные выбраны.' };
    }
    try {
      const result = await this.crmService.chanelAppointment(state.data.selectedAppointmentId);
      if (result && !result.error) {
        const appointment = state.data.selectedAppointment;
        const d = new Date(appointment.admission_date);
        const formattedDate = formatDateDisplay(d);
        const formattedTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return {
          success: true,
          message: `Запись ID ${appointment.id} (${formattedDate} в ${formattedTime}) отменена.`,
        };
      }
      return {
        success: false,
        error: (result as any)?.error || (result as any)?.message || 'Не удалось отменить запись. Попробуйте позже.',
      };
    } catch (error) {
      this.logger.error(`Ошибка при отмене записи: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Произошла техническая ошибка при отмене записи.',
      };
    }
  }

  async handleMessage(
    state: CancelAppointmentState,
    rawMessage: string,
  ): Promise<CancelAppointmentSceneHandleResult> {
    const trimmedMessage = rawMessage?.trim() ?? '';
    if (state.step === 'intro') {
      return {
        state: { step: 'phone', data: { ...state.data } },
        responses: [buildIntroMessage()],
        completed: false,
      };
    }

    const validation = await this.validateStep(state, trimmedMessage);
    if (validation) {
      if (validation.intent === 'refuse') {
        return {
          state: { ...state },
          responses: [validation.reply || 'Хорошо. Если понадобится отменить запись — напишите снова.'],
          completed: false,
          exitScene: true,
        };
      }
      if (validation.intent === 'off_topic') {
        return {
          state: { ...state },
          responses: [
            validation.reply ||
              'Вы перешли к другой теме. Сцена завершена. Когда понадобится — напишите снова.',
          ],
          completed: false,
          exitScene: true,
        };
      }
    }
    const effectiveMessage =
      validation?.intent === 'answer' && validation.value ? validation.value : trimmedMessage;

    const responses: string[] = [];
    let completed = false;
    let nextState: CancelAppointmentState = { step: state.step, data: { ...state.data } };

    try {
      switch (state.step) {
        case 'phone': {
          const normalized = normalizePhone(effectiveMessage);
          if (!normalized) {
            responses.push('Не удалось распознать номер телефона. Введите его в формате +7XXXXXXXXXX.');
            return { state, responses, completed };
          }
          nextState.data.phone = normalized;
          const result = await this.findClientAndAppointments(normalized);
          if (result.error) {
            responses.push(result.error);
            return { state, responses, completed };
          }
          if (!result.appointments || result.appointments.length === 0) {
            responses.push(...buildNoAppointmentsResponse(result.client!, normalized));
            completed = true;
            nextState = this.getInitialState();
            break;
          }
          nextState.data.client = result.client;
          nextState.data.appointments = result.appointments;
          nextState.step = 'select_appointment';
          responses.push(
            ...buildAppointmentsListResponse(result.client!, normalized, result.appointments),
          );
          break;
        }
        case 'select_appointment': {
          const appointments = state.data.appointments || [];
          const index = parseAppointmentIndex(effectiveMessage, appointments);
          if (index === null) {
            responses.push('Пожалуйста, введите номер записи из списка выше.');
            responses.push(
              ...buildAppointmentsListResponse(state.data.client!, state.data.phone || '', appointments),
            );
            return { state, responses, completed };
          }
          const selectedAppointment = appointments[index];
          nextState.data.selectedAppointment = selectedAppointment;
          nextState.data.selectedAppointmentId = selectedAppointment.id.toString();
          nextState.step = 'confirmation';
          responses.push(...buildConfirmationResponse(selectedAppointment));
          break;
        }
        case 'confirmation': {
          if (isPositiveResponse(effectiveMessage)) {
            const cancelResult = await this.cancelAppointment(nextState);
            if (cancelResult.success) {
              responses.push('✅ Запись успешно отменена!');
              if (cancelResult.message) responses.push(cancelResult.message);
              completed = true;
              nextState = this.getInitialState();
            } else {
              responses.push(`❌ Ошибка при отмене записи: ${cancelResult.error || 'Неизвестная ошибка.'}`);
              return { state, responses, completed };
            }
            break;
          }
          if (isNegativeResponse(effectiveMessage)) {
            nextState = this.getInitialState();
            responses.push('Хорошо, начнем заново.');
            responses.push(buildIntroMessage());
            break;
          }
          responses.push('Ответьте «да» для отмены записи или «нет», чтобы начать заново.');
          responses.push(...buildConfirmationResponse(state.data.selectedAppointment));
          return { state, responses, completed };
        }
        default:
          nextState = this.getInitialState();
          responses.push(buildIntroMessage());
          break;
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при обработке шага ${state.step}: ${error instanceof Error ? error.message : String(error)}`,
      );
      responses.length = 0;
      responses.push('Произошла ошибка при обработке данных. Попробуйте позже.');
      return { state, responses, completed: false };
    }

    return { state: nextState, responses, completed };
  }
}

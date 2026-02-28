import { Logger } from '@nestjs/common';
import { AppointmentService } from 'src/crm/services/appointments.service';
import { ClientService } from 'src/crm/services/client.service';
import { ProccesorService } from 'src/proccesor/services/proccesor.service';
import type { ShowAppointmentState, ShowAppointmentSceneHandleResult } from './types';
import { STEP_LABELS } from './constants';
import {
  buildIntroMessage,
  buildNoAppointmentsResponse,
  buildAppointmentsResponse,
} from './messages';
import { normalizePhone } from '../common/utils';

export class ShowAppointmentScene {
  private readonly logger = new Logger(ShowAppointmentScene.name);

  constructor(
    private readonly appointmentService?: AppointmentService,
    private readonly clientService?: ClientService,
    private readonly proccesorService?: ProccesorService,
  ) {}

  getInitialState(): ShowAppointmentState {
    return { step: 'intro', data: {} };
  }

  private async validateStep(
    state: ShowAppointmentState,
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
  ): Promise<{ client?: any; appointments?: any[]; error?: string }> {
    if (!this.clientService || !this.appointmentService) {
      return { error: 'Сервисы недоступны. Попробуйте позже.' };
    }
    try {
      let clientResult: any = await this.clientService.getClinetByPhone(phone);
      if (clientResult?.error && phone.startsWith('+7')) {
        clientResult = await this.clientService.getClinetByPhone(phone.substring(2));
      }
      if (clientResult?.error && phone.startsWith('+7')) {
        clientResult = await this.clientService.getClinetByPhone(phone.replace(/\D/g, ''));
      }
      let clients: any[] = [];
      if (clientResult?.data?.client) {
        clients = Array.isArray(clientResult.data.client)
          ? clientResult.data.client
          : [clientResult.data.client];
      } else if (clientResult?.data?.clients) {
        clients = Array.isArray(clientResult.data.clients)
          ? clientResult.data.clients
          : [clientResult.data.clients];
      }
      if (!clientResult || clients.length === 0) {
        return {
          error: `Клиент с номером телефона ${phone} не найден в системе. Проверьте правильность номера телефона.`,
        };
      }
      const client = clients[0];
      const clientId = client?.id || client?.client_id;
      const crmClientId = typeof clientId === 'number' ? clientId : parseInt(String(clientId), 10);
      if (isNaN(crmClientId)) return { error: 'Ошибка: не удалось определить ID клиента.' };
      let appointments = await this.appointmentService.findAppointmentForUser(crmClientId, 1);
      if (!appointments || appointments.length === 0) {
        const all = await this.appointmentService.getAppointments();
        const allArr = Array.isArray(all) ? all : [];
        if (allArr.length > 0) {
          appointments = allArr.filter((apt: any) => {
            const aptClientId =
              typeof apt.client_id === 'string' ? parseInt(apt.client_id, 10) : apt.client_id;
            return aptClientId === crmClientId;
          });
        }
      }
      return { client, appointments: appointments ?? [] };
    } catch (error) {
      this.logger.error(
        `Ошибка при поиске: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { error: 'Произошла техническая ошибка при поиске записей. Попробуйте позже.' };
    }
  }

  async handleMessage(
    state: ShowAppointmentState,
    rawMessage: string,
  ): Promise<ShowAppointmentSceneHandleResult> {
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
          responses: [
            validation.reply || 'Хорошо. Если понадобится посмотреть записи — напишите снова.',
          ],
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
    let nextState: ShowAppointmentState = { step: state.step, data: { ...state.data } };

    try {
      if (state.step === 'phone') {
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
        nextState.data.client = result.client;
        nextState.data.appointments = result.appointments;
        if (!result.appointments || result.appointments.length === 0) {
          responses.push(...buildNoAppointmentsResponse(result.client!, normalized));
          completed = true;
          nextState = this.getInitialState();
        } else {
          nextState.step = 'display';
          responses.push(
            ...buildAppointmentsResponse(result.client!, normalized, result.appointments),
          );
          completed = true;
          nextState = this.getInitialState();
        }
      } else {
        nextState = this.getInitialState();
        responses.push(buildIntroMessage());
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

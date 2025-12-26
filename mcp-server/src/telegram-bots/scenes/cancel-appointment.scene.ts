import { Logger } from '@nestjs/common';
import { AppointmentService } from 'src/crm/services/appointments.service';
import { ClientService } from 'src/crm/services/client.service';
import { CrmService } from 'src/crm/services/crm.service';
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
}

export class CancelAppointmentScene {
  private readonly logger = new Logger(CancelAppointmentScene.name);

  constructor(
    private readonly appointmentService?: AppointmentService,
    private readonly clientService?: ClientService,
    private readonly crmService?: CrmService,
  ) {}

  getInitialState(): CancelAppointmentState {
    return {
      step: 'intro',
      data: {},
    };
  }

  async handleMessage(
    state: CancelAppointmentState,
    rawMessage: string,
  ): Promise<CancelAppointmentSceneHandleResult> {
    const trimmedMessage = rawMessage?.trim() ?? '';

    if (state.step === 'intro') {
      return {
        state: {
          step: 'phone',
          data: { ...state.data },
        },
        responses: [this.buildIntroMessage()],
        completed: false,
      };
    }

    const responses: string[] = [];
    let completed = false;
    let nextState: CancelAppointmentState = {
      step: state.step,
      data: { ...state.data },
    };

    try {
      switch (state.step) {
        case 'phone': {
          const normalized = this.normalizePhone(trimmedMessage);
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
            responses.push(...this.buildNoAppointmentsResponse(result.client, normalized));
            completed = true;
            nextState = this.getInitialState();
            break;
          }

          nextState.data.client = result.client;
          nextState.data.appointments = result.appointments;
          nextState.step = 'select_appointment';
          responses.push(...this.buildAppointmentsListResponse(result.client, normalized, result.appointments));
          break;
        }
        case 'select_appointment': {
          const appointments = state.data.appointments || [];
          const index = this.parseAppointmentIndex(trimmedMessage, appointments);
          if (index === null) {
            responses.push('Пожалуйста, введите номер записи из списка выше.');
            responses.push(...this.buildAppointmentsListResponse(state.data.client, state.data.phone || '', appointments));
            return { state, responses, completed };
          }
          const selectedAppointment = appointments[index];
          nextState.data.selectedAppointment = selectedAppointment;
          nextState.data.selectedAppointmentId = selectedAppointment.id.toString();
          nextState.step = 'confirmation';
          responses.push(...this.buildConfirmationResponse(selectedAppointment));
          break;
        }
        case 'confirmation': {
          if (this.isPositiveResponse(trimmedMessage)) {
            const cancelResult = await this.cancelAppointment(nextState);
            if (cancelResult.success) {
              responses.push('✅ Запись успешно отменена!');
              responses.push(cancelResult.message || '');
              completed = true;
              nextState = this.getInitialState();
            } else {
              responses.push(`❌ Ошибка при отмене записи: ${cancelResult.error || 'Неизвестная ошибка.'}`);
              return { state, responses, completed };
            }
            break;
          }

          if (this.isNegativeResponse(trimmedMessage)) {
            nextState = this.getInitialState();
            responses.push('Хорошо, начнем заново.');
            responses.push(this.buildIntroMessage());
            break;
          }

          responses.push('Ответьте «да» для отмены записи или «нет», чтобы начать заново.');
          responses.push(...this.buildConfirmationResponse(state.data.selectedAppointment));
          return { state, responses, completed };
        }
        default: {
          nextState = this.getInitialState();
          responses.push(this.buildIntroMessage());
          break;
        }
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
        !(clientResult as any).data ||
        !(clientResult as any).data.client ||
        (clientResult as any).data.client.length === 0
      ) {
        return {
          error: `Клиент с номером телефона ${phone} не найден в системе. Проверьте правильность номера телефона.`,
        };
      }

      const client = (clientResult as any).data.client[0];
      const clientId = client?.id || client?.client_id;
      const crmClientId = typeof clientId === 'number' ? clientId : parseInt(clientId);

      if (isNaN(crmClientId)) {
        return { error: 'Ошибка: не удалось определить ID клиента.' };
      }

      const appointments = await this.appointmentService.findAppointmentForUser(crmClientId, 1);
      return { client, appointments: appointments ?? [] };
    } catch (error) {
      this.logger.error(`Ошибка при поиске клиента и записей: ${error}`);
      return { error: 'Произошла техническая ошибка при поиске записей. Попробуйте позже.' };
    }
  }

  private async cancelAppointment(state: CancelAppointmentState): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.crmService || !state.data.selectedAppointmentId || !state.data.selectedAppointment) {
      return { success: false, error: 'Не все данные выбраны.' };
    }

    try {
      const result = await this.crmService.chanelAppointment(state.data.selectedAppointmentId);
      if (result && !result.error) {
        const appointment = state.data.selectedAppointment;
        const appointmentDate = new Date(appointment.admission_date);
        const formattedDate = this.formatDateDisplay(appointmentDate);
        const formattedTime = appointmentDate.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });

        return {
          success: true,
          message: `Запись ID ${appointment.id} (${formattedDate} в ${formattedTime}) отменена.`,
        };
      }

      return {
        success: false,
        error: result?.error || result?.message || 'Не удалось отменить запись. Попробуйте позже.',
      };
    } catch (error) {
      this.logger.error(`Ошибка при отмене записи: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Произошла техническая ошибка при отмене записи.',
      };
    }
  }

  private buildIntroMessage(): string {
    return [
      '🗑️ Отмена записи на прием',
      '',
      'Для отмены записи нам нужно найти ваши записи в системе.',
      'Введите номер телефона, на который была оформлена запись, в формате +7XXXXXXXXXX.',
      'Вы всегда можете отправить «/exit», чтобы отменить процесс.',
    ].join('\n');
  }

  private buildNoAppointmentsResponse(client: any, phone: string): string[] {
    return [
      `✅ Клиент: ${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim(),
      `📞 Телефон: ${phone}`,
      '',
      '❌ У вас нет активных записей на прием. Возможно, все записи уже завершены или отменены.',
    ];
  }

  private buildAppointmentsListResponse(client: any, phone: string, appointments: Admission[]): string[] {
    const lines: string[] = [];
    lines.push('Выберите запись, которую хотите отменить (введите номер):');
    lines.push(`👤 Клиент: ${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim());
    lines.push(`📞 Телефон: ${phone}`);
    lines.push('');

    appointments.forEach((appointment, index) => {
      const appointmentDate = new Date(appointment.admission_date);
      const formattedDate = this.formatDateDisplay(appointmentDate);
      const formattedTime = appointmentDate.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });

      lines.push(`${index + 1}. ${formattedDate} в ${formattedTime}`);
      lines.push(`   🆔 ID: ${appointment.id}`);
      lines.push('');
    });

    return lines;
  }

  private buildConfirmationResponse(appointment?: Admission): string[] {
    if (!appointment) {
      return ['Ошибка: запись не выбрана.'];
    }

    const appointmentDate = new Date(appointment.admission_date);
    const formattedDate = this.formatDateDisplay(appointmentDate);
    const formattedTime = appointmentDate.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return [
      '⚠️ Подтверждение отмены записи',
      `🆔 ID: ${appointment.id}`,
      `📅 Дата: ${formattedDate}`,
      `🕐 Время: ${formattedTime}`,
      '',
      'Вы уверены, что хотите отменить эту запись?',
      'Ответьте «да» для подтверждения или «нет», чтобы начать заново.',
    ];
  }

  private normalizePhone(input: string): string | null {
    if (!input) {
      return null;
    }

    const digits = input.replace(/\D/g, '');

    if (digits.length < 10 || digits.length > 15) {
      return null;
    }

    if (digits.length === 10) {
      return `+7${digits}`;
    }

    if (digits.length === 11 && digits.startsWith('8')) {
      return `+7${digits.slice(1)}`;
    }

    return `+${digits}`;
  }

  private parseAppointmentIndex(input: string, appointments: Admission[]): number | null {
    const num = parseInt(input.trim(), 10);
    if (isNaN(num) || num < 1 || num > appointments.length) {
      return null;
    }
    return num - 1;
  }

  private isPositiveResponse(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return ['да', 'yes', 'ок', 'окей', 'подтверждаю', 'confirm', 'подтвердить'].includes(normalized);
  }

  private isNegativeResponse(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return ['нет', 'no', 'cancel', 'отмена', 'заново', 'отменить'].includes(normalized);
  }

  private formatDateDisplay(date: Date): string {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Сегодня';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Завтра';
    } else {
      const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

      const dayName = dayNames[date.getDay()];
      const day = date.getDate();
      const month = monthNames[date.getMonth()];

      return `${dayName}, ${day} ${month}`;
    }
  }
}


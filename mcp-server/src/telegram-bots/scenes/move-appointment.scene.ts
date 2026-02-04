import { Logger } from '@nestjs/common';
import { CrmService } from 'src/crm/services/crm.service';
import { AppointmentService } from 'src/crm/services/appointments.service';
import { ClientService } from 'src/crm/services/client.service';
import { ProccesorService } from 'src/proccesor/services/proccesor.service';
import { Admission } from '@common/entities/admission.entity';

export type MoveAppointmentStep =
  | 'intro'
  | 'phone'
  | 'select_appointment'
  | 'select_date'
  | 'select_time'
  | 'confirmation'
  | 'completed';

export interface MoveAppointmentStateData {
  phone?: string;
  client?: any;
  appointments?: Admission[];
  selectedAppointmentId?: string;
  selectedAppointment?: Admission;
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
}

export class MoveAppointmentScene {
  private readonly logger = new Logger(MoveAppointmentScene.name);

  private readonly stepLabels: Record<MoveAppointmentStep, string> = {
    intro: '',
    phone: 'Введите номер телефона, на который была оформлена запись, в формате +7XXXXXXXXXX.',
    select_appointment: 'Выберите запись для переноса (введите номер из списка).',
    select_date: 'Введите новую дату для записи в формате ГГГГ-ММ-ДД.',
    select_time: 'Введите время в формате ЧЧ:ММ.',
    confirmation: 'Ответьте «да» для подтверждения переноса или «нет», чтобы начать заново.',
    completed: '',
  };

  constructor(
    private readonly crmService?: CrmService,
    private readonly appointmentService?: AppointmentService,
    private readonly clientService?: ClientService,
    private readonly proccesorService?: ProccesorService,
  ) {}

  getInitialState(): MoveAppointmentState {
    return {
      step: 'intro',
      data: {},
    };
  }

  private async validateStep(state: MoveAppointmentState, message: string): Promise<{ intent: 'answer' | 'off_topic' | 'refuse'; value: string; reply: string | null } | null> {
    if (!this.proccesorService || !message || !this.stepLabels[state.step]) return null;
    try {
      const result = await this.proccesorService.validateSceneStep({
        stepId: state.step,
        stepLabel: this.stepLabels[state.step],
        userMessage: message,
        formatHint: state.step === 'phone' ? 'телефон +7XXXXXXXXXX' : state.step === 'select_date' ? 'ГГГГ-ММ-ДД' : state.step === 'select_time' ? 'ЧЧ:ММ' : undefined,
      });
      return { intent: result.intent, value: result.validated_value ?? message, reply: result.reply_message };
    } catch (e) {
      this.logger.warn(`validateSceneStep failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  async handleMessage(state: MoveAppointmentState, rawMessage: string): Promise<MoveAppointmentSceneHandleResult> {
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

    const validation = await this.validateStep(state, trimmedMessage);
    if (validation) {
      if (validation.intent === 'refuse') {
        return {
          state: { ...state },
          responses: [validation.reply || 'Хорошо, перенос отменён. Если понадобится — напишите снова.'],
          completed: false,
          exitScene: true,
        };
      }
      if (validation.intent === 'off_topic') {
        return {
          state: { ...state },
          responses: [validation.reply || 'Пожалуйста, ответьте на вопрос выше, чтобы продолжить перенос записи.'],
          completed: false,
        };
      }
    }
    const effectiveMessage = validation?.intent === 'answer' && validation.value ? validation.value : trimmedMessage;

    const responses: string[] = [];
    let completed = false;
    let nextState: MoveAppointmentState = {
      step: state.step,
      data: { ...state.data },
    };

    try {
      switch (state.step) {
        case 'phone': {
          const normalized = this.normalizePhone(effectiveMessage);
          if (!normalized) {
            responses.push('Не удалось распознать номер телефона. Введите его в формате +7XXXXXXXXXX.');
            return { state, responses, completed };
          }
          nextState.data.phone = normalized;
          const result = await this.findClientAndAppointments(nextState.data);
          if (result.error) {
            responses.push(result.error);
            return { state, responses, completed };
          }
          if (result.appointments && result.appointments.length > 0) {
            nextState.data.appointments = result.appointments;
            nextState.data.client = result.client;
            nextState.step = 'select_appointment';
            responses.push(...this.buildAppointmentsListResponse(result.appointments, result.client, normalized));
          } else {
            responses.push(result.message || 'Записи не найдены.');
            return { state, responses, completed };
          }
          break;
        }
        case 'select_appointment': {
          const appointmentIndex = this.parseAppointmentIndex(effectiveMessage, state.data.appointments || []);
          if (appointmentIndex === null) {
            responses.push('Пожалуйста, введите номер записи из списка выше.');
            responses.push(...this.buildAppointmentsListResponse(state.data.appointments || [], state.data.client, state.data.phone || ''));
            return { state, responses, completed };
          }
          const selectedAppointment = state.data.appointments?.[appointmentIndex];
          if (!selectedAppointment) {
            responses.push('Ошибка: запись не найдена. Попробуйте еще раз.');
            return { state, responses, completed };
          }
          nextState.data.selectedAppointment = selectedAppointment;
          nextState.data.selectedAppointmentId = selectedAppointment.id.toString();
          const clinicIdStr = selectedAppointment.clinic_id;
          const clinicId = typeof clinicIdStr === 'string' ? parseInt(clinicIdStr) : clinicIdStr;
          nextState.data.clinicId = isNaN(clinicId) ? undefined : clinicId;
          nextState.step = 'select_date';
          responses.push(...this.buildSelectedAppointmentResponse(selectedAppointment));
          const datesResult = await this.getAvailableDates(clinicId);
          if (datesResult.dates && datesResult.dates.length > 0) {
            responses.push(...this.buildAvailableDatesResponse(datesResult.dates));
          } else {
            responses.push('Не удалось получить доступные даты. Попробуйте позже.');
            return { state, responses, completed };
          }
          break;
        }
        case 'select_date': {
          if (!this.isValidDate(effectiveMessage)) {
            responses.push('Введите дату в формате ГГГГ-ММ-ДД (например, 2024-05-20).');
            return { state, responses, completed };
          }
          const clinicId = state.data.clinicId;
          if (clinicId) {
            const datesResult = await this.getAvailableDates(clinicId);
            const isAvailable = datesResult.dates?.some(d => d.date === effectiveMessage);
            if (!isAvailable) {
              responses.push('Выбранная дата недоступна. Пожалуйста, выберите другую дату.');
              if (datesResult.dates && datesResult.dates.length > 0) {
                responses.push(...this.buildAvailableDatesResponse(datesResult.dates));
              }
              return { state, responses, completed };
            }
          }
          nextState.data.newDate = effectiveMessage;
          nextState.step = 'select_time';
          responses.push(`✅ Новая дата: ${effectiveMessage}`);
          const timeResult = await this.getAvailableTimes(effectiveMessage, clinicId);
          if (timeResult.times && timeResult.times.length > 0) {
            responses.push(...this.buildAvailableTimesResponse(timeResult.times));
          } else {
            responses.push('На выбранную дату нет свободного времени. Выберите другую дату.');
            nextState.step = 'select_date';
            return { state: nextState, responses, completed };
          }
          break;
        }
        case 'select_time': {
          if (!this.isValidTime(effectiveMessage)) {
            responses.push('Введите время в формате ЧЧ:ММ (например, 14:30).');
            return { state, responses, completed };
          }
          const clinicIdTime = state.data.clinicId;
          const date = state.data.newDate;
          if (date && clinicIdTime) {
            const timeResult = await this.getAvailableTimes(date, clinicIdTime);
            const isAvailable = timeResult.times?.some(t => t === effectiveMessage);
            if (!isAvailable) {
              responses.push('Выбранное время недоступно. Пожалуйста, выберите другое время.');
              if (timeResult.times && timeResult.times.length > 0) {
                responses.push(...this.buildAvailableTimesResponse(timeResult.times));
              }
              return { state, responses, completed };
            }
          }
          nextState.data.newTime = effectiveMessage;
          nextState.step = 'confirmation';
          responses.push(...this.buildConfirmationResponse(nextState));
          break;
        }
        case 'confirmation': {
          if (this.isPositiveResponse(effectiveMessage)) {
            const moveResult = await this.moveAppointment(nextState);
            if (moveResult.success) {
              responses.push('✅ Запись успешно перенесена!');
              responses.push(moveResult.message || '');
              nextState.step = 'completed';
              completed = true;
            } else {
              responses.push(`❌ Ошибка при переносе записи: ${moveResult.error || 'Неизвестная ошибка'}`);
              return { state, responses, completed };
            }
            break;
          }

          if (this.isNegativeResponse(effectiveMessage)) {
            nextState = this.getInitialState();
            responses.push('Хорошо, начнем заново.');
            responses.push(this.buildIntroMessage());
            break;
          }

          responses.push('Ответьте, пожалуйста, «да» для подтверждения или «нет», чтобы начать заново.');
          responses.push(...this.buildConfirmationResponse(nextState));
          return { state, responses, completed };
        }
        case 'completed': {
          nextState = this.getInitialState();
          responses.push(this.buildIntroMessage());
          break;
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

  private buildIntroMessage(): string {
    return [
      '🔄 Перенос записи на прием',
      '',
      'Для переноса записи нам нужно найти ваши записи в системе.',
      'Введите номер телефона, на который была оформлена запись, в формате +7XXXXXXXXXX.',
      'Вы всегда можете отправить «/exit», чтобы отменить процесс.',
    ].join('\n');
  }

  private buildAppointmentsListResponse(
    appointments: Admission[],
    client: any,
    phone: string,
  ): string[] {
    const lines: string[] = [];
    lines.push(`✅ Клиент: ${client?.first_name || ''} ${client?.last_name || ''}`);
    lines.push(`📞 Телефон: ${phone}`);
    lines.push('');
    lines.push(`Найдено записей: ${appointments.length}`);
    lines.push('Выберите запись для переноса (введите номер):');
    lines.push('');

    appointments.forEach((appointment, index) => {
      const appointmentDate = new Date(appointment.admission_date);
      const formattedDate = this.formatDateDisplay(appointmentDate);
      const formattedTime = appointmentDate.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      lines.push(`${index + 1}. 📅 ${formattedDate} в ${formattedTime}`);
      lines.push(`   👨‍⚕️ Врач ID: ${appointment.user_id}`);
      lines.push('');
    });

    return lines;
  }

  private buildSelectedAppointmentResponse(appointment: Admission): string[] {
    const appointmentDate = new Date(appointment.admission_date);
    const formattedDate = this.formatDateDisplay(appointmentDate);
    const formattedTime = appointmentDate.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return [
      `✅ Выбрана запись: ${formattedDate} в ${formattedTime}`,
      'Введите новую дату для записи в формате ГГГГ-ММ-ДД.',
    ];
  }

  private buildAvailableDatesResponse(dates: Array<{ date: string; displayName: string }>): string[] {
    const lines: string[] = ['Доступные даты:'];
    dates.forEach((dateInfo, index) => {
      lines.push(`${index + 1}. ${dateInfo.displayName} (${dateInfo.date})`);
    });
    lines.push('');
    lines.push('Введите дату в формате ГГГГ-ММ-ДД:');
    return lines;
  }

  private buildAvailableTimesResponse(times: string[]): string[] {
    const lines: string[] = ['Доступное время:'];
    times.forEach((time, index) => {
      lines.push(`${index + 1}. 🕐 ${time}`);
    });
    lines.push('');
    lines.push('Введите время в формате ЧЧ:ММ:');
    return lines;
  }

  private buildConfirmationResponse(state: MoveAppointmentState): string[] {
    if (!state.data.selectedAppointment || !state.data.newDate || !state.data.newTime) {
      return ['Ошибка: не все данные выбраны'];
    }

    const oldDate = new Date(state.data.selectedAppointment.admission_date);
    const formattedOldDate = this.formatDateDisplay(oldDate);
    const formattedOldTime = oldDate.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const newDateObj = new Date(state.data.newDate);
    const formattedNewDate = this.formatDateDisplay(newDateObj);

    return [
      '⚠️ Подтверждение переноса записи',
      '',
      '📋 Текущая запись:',
      `📅 Дата: ${formattedOldDate}`,
      `🕐 Время: ${formattedOldTime}`,
      '',
      '📋 Новая запись:',
      `📅 Дата: ${formattedNewDate}`,
      `🕐 Время: ${state.data.newTime}`,
      '',
      'Вы уверены, что хотите перенести запись?',
      'Ответьте «да» для подтверждения или «нет», чтобы начать заново.',
    ];
  }

  private async findClientAndAppointments(
    state: MoveAppointmentStateData,
  ): Promise<{
    client?: any;
    appointments?: Admission[];
    error?: string;
    message?: string;
  }> {
    if (!this.clientService || !this.appointmentService) {
      return { error: 'Сервисы не инициализированы' };
    }

    try {
      const clientResult = await this.clientService.getClinetByPhone(state.phone!);
      if (
        !clientResult ||
        !(clientResult as any).data ||
        !(clientResult as any).data.client ||
        (clientResult as any).data.client.length === 0
      ) {
        return {
          error: `Клиент с номером телефона ${state.phone} не найден в системе. Проверьте правильность номера телефона.`,
        };
      }

      const client = (clientResult as any).data.client[0];
      const clientId = client?.id || client?.client_id;
      const crmClientId = typeof clientId === 'number' ? clientId : parseInt(clientId);

      if (isNaN(crmClientId)) {
        return { error: 'Ошибка: не удалось определить ID клиента' };
      }

      // Получаем записи клиента (используем первую клинику из CRM)
      const clinicsResponse = this.crmService ? await this.crmService.getClinics() : null;
      const clinicId = clinicsResponse?.data?.clinics?.[0]?.id || 1;

      const appointments = await this.appointmentService.findAppointmentForUser(crmClientId, clinicId);

      if (!appointments || appointments.length === 0) {
        return {
          client,
          appointments: [],
          message: `Клиент найден: ${client?.first_name} ${client?.last_name}\n\nУ вас нет активных записей на прием.`,
        };
      }

      return { client, appointments };
    } catch (error) {
      this.logger.error(`Ошибка при поиске клиента и записей: ${error}`);
      return {
        error: 'Произошла техническая ошибка при поиске записей. Попробуйте позже.',
      };
    }
  }

  private async getAvailableDates(clinicId?: number): Promise<{
    dates?: Array<{ date: string; displayName: string }>;
    error?: string;
  }> {
    if (!this.crmService || !clinicId) {
      return { error: 'Сервис не инициализирован или не указана клиника' };
    }

    try {
      const availableDates = await this.crmService.getAvailableDates(14, clinicId);
      const dates = availableDates.map((dateInfo) => ({
        date: dateInfo.date,
        displayName: this.formatDateDisplay(new Date(dateInfo.date)),
      }));
      return { dates };
    } catch (error) {
      this.logger.error(`Ошибка при получении доступных дат: ${error}`);
      return { error: 'Не удалось получить доступные даты' };
    }
  }

  private async getAvailableTimes(date: string, clinicId?: number): Promise<{
    times?: string[];
    error?: string;
  }> {
    if (!this.crmService || !clinicId) {
      return { error: 'Сервис не инициализирован или не указана клиника' };
    }

    try {
      const occupiedSlots = await this.crmService.getOccupiedTimeSlots(date, clinicId);
      const allSlots = this.generateTimeSlots();
      const availableTimes = allSlots
        .filter((slot) => !occupiedSlots.includes(slot))
        .map((slot) => slot);
      return { times: availableTimes };
    } catch (error) {
      this.logger.error(`Ошибка при получении доступного времени: ${error}`);
      return { error: 'Не удалось получить доступное время' };
    }
  }

  private generateTimeSlots(): string[] {
    const slots: string[] = [];
    const workStart = 9; // 9:00
    const workEnd = 18; // 18:00

    for (let hour = workStart; hour < workEnd; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }

    return slots;
  }

  private async moveAppointment(state: MoveAppointmentState): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    if (!this.crmService || !state.data.selectedAppointmentId || !state.data.newDate || !state.data.newTime) {
      return { success: false, error: 'Не все данные выбраны' };
    }

    try {
      const start = `${state.data.newDate} ${state.data.newTime}:00`;
      const durationMinutesRaw = state.data.selectedAppointment?.admission_length;
      const durationMinutes = Number.parseInt((durationMinutesRaw || '30').toString(), 10);
      const endDateObj = new Date(start.replace(' ', 'T'));
      endDateObj.setMinutes(endDateObj.getMinutes() + (Number.isFinite(durationMinutes) ? durationMinutes : 30));
      const pad = (n: number) => n.toString().padStart(2, '0');
      const end = `${endDateObj.getFullYear()}-${pad(endDateObj.getMonth() + 1)}-${pad(endDateObj.getDate())} ${pad(endDateObj.getHours())}:${pad(endDateObj.getMinutes())}:00`;

      const clinicId = state.data.clinicId || 1;

      const result = await this.crmService.rescheduleAppointment(
        state.data.selectedAppointmentId,
        clinicId,
        start,
        end,
      );

      if (result && !result.error) {
        const oldDate = new Date(state.data.selectedAppointment!.admission_date);
        const formattedOldDate = this.formatDateDisplay(oldDate);
        const formattedOldTime = oldDate.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const newDateObj = new Date(state.data.newDate!);
        const formattedNewDate = this.formatDateDisplay(newDateObj);

        return {
          success: true,
          message: `Запись перенесена с ${formattedOldDate} в ${formattedOldTime} на ${formattedNewDate} в ${state.data.newTime}`,
        };
      } else {
        return {
          success: false,
          error: result?.error || result?.message || 'Не удалось перенести запись',
        };
      }
    } catch (error: any) {
      this.logger.error(`Ошибка при переносе записи: ${error}`);
      return {
        success: false,
        error: error?.message || 'Произошла техническая ошибка',
      };
    }
  }

  private parseAppointmentIndex(input: string, appointments: Admission[]): number | null {
    const num = parseInt(input.trim(), 10);
    if (isNaN(num) || num < 1 || num > appointments.length) {
      return null;
    }
    return num - 1;
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

  private isValidDate(value: string): boolean {
    const match = value.match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
    if (!match) {
      return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private isValidTime(value: string): boolean {
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return Boolean(match);
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


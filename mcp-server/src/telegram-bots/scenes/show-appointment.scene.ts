import { Logger } from '@nestjs/common';
import { AppointmentService } from 'src/crm/services/appointments.service';
import { ClientService } from 'src/crm/services/client.service';
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
}

export class ShowAppointmentScene {
  private readonly logger = new Logger(ShowAppointmentScene.name);

  constructor(
    private readonly appointmentService?: AppointmentService,
    private readonly clientService?: ClientService,
  ) {}

  getInitialState(): ShowAppointmentState {
    return {
      step: 'intro',
      data: {},
    };
  }

  async handleMessage(state: ShowAppointmentState, rawMessage: string): Promise<ShowAppointmentSceneHandleResult> {
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
    let nextState: ShowAppointmentState = {
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
          
          // Пробуем поиск с номером с + и без +
          let result = await this.findClientAndAppointments(normalized);
          
          // Если не найден с +, пробуем без +
          if (result.error && normalized.startsWith('+7')) {
            const phoneWithoutPlus = normalized.substring(2); // Убираем +7
            this.logger.log(`Пробуем поиск без +: ${phoneWithoutPlus}`);
            result = await this.findClientAndAppointments(phoneWithoutPlus);
          }
          
          // Если не найден, пробуем только цифры (без +7)
          if (result.error && normalized.startsWith('+7')) {
            const phoneDigits = normalized.substring(2); // Убираем +7, оставляем только цифры
            this.logger.log(`Пробуем поиск только цифры: ${phoneDigits}`);
            result = await this.findClientAndAppointments(phoneDigits);
          }

          if (result.error) {
            responses.push(result.error);
            return { state, responses, completed };
          }

          nextState.data.client = result.client;
          nextState.data.appointments = result.appointments;

          if (!result.appointments || result.appointments.length === 0) {
            responses.push(...this.buildNoAppointmentsResponse(result.client, normalized));
            completed = true;
            nextState = this.getInitialState();
            break;
          }

          nextState.step = 'display';
          responses.push(...this.buildAppointmentsResponse(result.client, normalized, result.appointments));
          completed = true;
          nextState = this.getInitialState();
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

  private async findClientAndAppointments(
    phone: string,
  ): Promise<{ client?: any; appointments?: Admission[]; error?: string }> {
    if (!this.clientService || !this.appointmentService) {
      return { error: 'Сервисы недоступны. Попробуйте позже.' };
    }

    try {
      this.logger.log(`Поиск клиента по телефону: ${phone}`);
      const clientResult = await this.clientService.getClinetByPhone(phone);
      this.logger.log(`Результат поиска клиента: ${JSON.stringify(clientResult, null, 2)}`);

      // Проверяем разные варианты структуры ответа
      let clients: any[] = [];
      if ((clientResult as any)?.data?.client) {
        if (Array.isArray((clientResult as any).data.client)) {
          clients = (clientResult as any).data.client;
        } else {
          clients = [(clientResult as any).data.client];
        }
      } else if ((clientResult as any)?.data?.clients) {
        if (Array.isArray((clientResult as any).data.clients)) {
          clients = (clientResult as any).data.clients;
        } else {
          clients = [(clientResult as any).data.clients];
        }
      }

      if (!clientResult || clients.length === 0) {
        this.logger.warn(`Клиент не найден для телефона: ${phone}`);
        return {
          error: `Клиент с номером телефона ${phone} не найден в системе. Проверьте правильность номера телефона.`,
        };
      }

      const client = clients[0];
      const clientId = client?.id || client?.client_id;
      const crmClientId = typeof clientId === 'number' ? clientId : parseInt(String(clientId), 10);

      if (isNaN(crmClientId)) {
        this.logger.error(`Не удалось определить clientId из: ${JSON.stringify(client)}`);
        return { error: 'Ошибка: не удалось определить ID клиента.' };
      }

      this.logger.log(`Найден клиент ID: ${crmClientId}, поиск записей...`);
      
      // Пробуем поиск с разными clinicId (может быть запись создана с другим clinic_id)
      let appointments = await this.appointmentService.findAppointmentForUser(crmClientId, 1);
      this.logger.log(`Найдено записей с clinicId=1: ${appointments?.length || 0}`);
      
      // Если не найдено, пробуем без фильтра по клинике
      if (!appointments || appointments.length === 0) {
        this.logger.log(`Пробуем поиск без фильтра по клинике...`);
        // Используем getAppointments напрямую без clinicId
        const allAppointments = await this.appointmentService.getAppointments();
        if (allAppointments && Array.isArray(allAppointments)) {
          appointments = allAppointments.filter((apt: any) => {
            const aptClientId = typeof apt.client_id === 'string' ? parseInt(apt.client_id, 10) : apt.client_id;
            return aptClientId === crmClientId;
          });
          this.logger.log(`Найдено записей без фильтра по клинике: ${appointments?.length || 0}`);
        }
      }
      
      this.logger.log(`Итого найдено записей: ${appointments?.length || 0}`);
      if (appointments && appointments.length > 0) {
        this.logger.log(`Найденные записи:`, appointments.map((apt: any) => ({
          id: apt.id,
          date: apt.admission_date,
          client_id: apt.client_id,
          clinic_id: apt.clinic_id,
          status: apt.status
        })));
      }
      
      return { client, appointments: appointments ?? [] };
    } catch (error) {
      this.logger.error(`Ошибка при поиске клиента и записей: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`Стек ошибки: ${error instanceof Error ? error.stack : ''}`);
      return { error: 'Произошла техническая ошибка при поиске записей. Попробуйте позже.' };
    }
  }

  private buildIntroMessage(): string {
    return [
      '📅 Просмотр записей на прием',
      '',
      'Для просмотра ваших записей нам нужно найти вас в системе.',
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

  private buildAppointmentsResponse(client: any, phone: string, appointments: Admission[]): string[] {
    const lines: string[] = [];
    lines.push('📅 Ваши записи на прием');
    lines.push(`👤 Клиент: ${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim());
    lines.push(`📞 Телефон: ${phone}`);
    lines.push('');
    lines.push(`Найдено записей: ${appointments.length}`);
    lines.push('');

    appointments.forEach((appointment, index) => {
      const appointmentDate = new Date(appointment.admission_date);
      const formattedDate = this.formatDateDisplay(appointmentDate);
      const formattedTime = appointmentDate.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });

      lines.push(`${index + 1}. ${formattedDate} в ${formattedTime}`);

      if ((appointment as any).pet?.alias) {
        lines.push(`   🐾 Питомец: ${(appointment as any).pet.alias}`);
      }

      if (appointment.description) {
        lines.push(`   📝 ${appointment.description}`);
      }

      lines.push(`   🆔 ID: ${appointment.id}`);
      lines.push('');
    });

    lines.push('Чтобы выполнить другие действия, введите новую команду.');

    return lines;
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


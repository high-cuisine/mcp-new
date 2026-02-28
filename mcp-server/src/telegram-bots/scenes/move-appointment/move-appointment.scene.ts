import { Logger } from '@nestjs/common';
import { CrmService } from 'src/crm/services/crm.service';
import { AppointmentService } from 'src/crm/services/appointments.service';
import { ClientService } from 'src/crm/services/client.service';
import { ProccesorService } from 'src/proccesor/services/proccesor.service';
import { Admission } from '@common/entities/admission.entity';
import type {
  MoveAppointmentState,
  MoveAppointmentStateData,
  MoveAppointmentSceneHandleResult,
} from './types';
import { STEP_LABELS } from './constants';
import {
  buildIntroMessage,
  buildAppointmentsListResponse,
  buildSelectedAppointmentResponse,
  buildAvailableDatesResponse,
  buildAvailableTimesResponse,
  buildConfirmationResponse,
  buildConfirmRescheduleMessage,
  buildOfferedSlotsMessage,
  buildNoSlotsAlternativesMessage,
  buildWaitlistHandoffMessage,
  buildConfirmationWithReminderResponse,
} from './messages';
import {
  normalizePhone,
  parseAppointmentIndex,
  isPositiveResponse,
  isNegativeResponse,
  formatDateDisplay,
} from '../common/utils';
import {
  getDoctorsWithLiveQueue,
  getDoctorsByAppointmentOnly,
} from 'src/proccesor/constants/doctors-info.constant';
import type { OfferedSlot } from './types';

export class MoveAppointmentScene {
  private readonly logger = new Logger(MoveAppointmentScene.name);

  constructor(
    private readonly crmService?: CrmService,
    private readonly appointmentService?: AppointmentService,
    private readonly clientService?: ClientService,
    private readonly proccesorService?: ProccesorService,
  ) {}

  getInitialState(): MoveAppointmentState {
    return { step: 'intro', data: {} };
  }

  private getFormatHint(step: MoveAppointmentState['step']): string | undefined {
    if (step === 'phone') return 'телефон +7XXXXXXXXXX';
    if (step === 'select_date') return 'ГГГГ-ММ-ДД';
    if (step === 'select_time') return 'ЧЧ:ММ';
    if (step === 'no_slots_alternatives') return '1, 2, 3 или 4';
    if (step === 'select_slot_from_offer') return '1, 2, 3 или «другие»';
    return undefined;
  }

  private async validateStep(
    state: MoveAppointmentState,
    message: string,
  ): Promise<{ intent: 'answer' | 'off_topic' | 'refuse'; value: string; reply: string | null } | null> {
    const label = STEP_LABELS[state.step];
    if (!this.proccesorService || !message || (state.step !== 'confirm_reschedule' && state.step !== 'orientation_days' && state.step !== 'orientation_time' && !label)) return null;
    try {
      const result = await this.proccesorService.validateSceneStep({
        stepId: state.step,
        stepLabel: label || 'Ответьте на вопрос.',
        userMessage: message,
        formatHint: this.getFormatHint(state.step),
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

  /** Отменить запись по ID (освободить окно перед предложением новых вариантов) */
  private async cancelAppointmentById(appointmentId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.crmService) return { success: false, error: 'Сервис недоступен' };
    try {
      const result = await this.crmService.chanelAppointment(appointmentId);
      if (result && !(result as any).error) return { success: true };
      return { success: false, error: (result as any)?.error || (result as any)?.message };
    } catch (e) {
      this.logger.error(`Ошибка отмены записи: ${e}`);
      return { success: false, error: e instanceof Error ? e.message : 'Ошибка отмены' };
    }
  }

  /** Собрать 2–3 ближайших свободных слота по клинике */
  private async getNearestSlots(clinicId: number, count = 3): Promise<OfferedSlot[]> {
    const slots: OfferedSlot[] = [];
    const datesResult = await this.getAvailableDates(clinicId);
    if (!datesResult.dates?.length) return slots;
    for (const { date } of datesResult.dates) {
      const timeResult = await this.getAvailableTimes(date, clinicId);
      if (timeResult.times?.length) {
        for (const time of timeResult.times) {
          slots.push({ date, time });
          if (slots.length >= count) return slots;
        }
      }
    }
    return slots;
  }

  /** Создать новую запись после отмены (те же клиент, пациент, тип, врач — новая дата/время) */
  private async createNewAppointmentAfterCancel(
    state: MoveAppointmentState,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.crmService || !state.data.selectedAppointment || !state.data.newDate || !state.data.newTime) {
      return { success: false, error: 'Не все данные' };
    }
    const apt = state.data.selectedAppointment as any;
    const clientId = parseInt(apt.client_id ?? apt.client?.id ?? '0', 10);
    const patientId = parseInt(apt.patient_id ?? apt.pet?.id ?? '0', 10);
    const typeId = parseInt(apt.type_id ?? '1', 10);
    const userId = parseInt(apt.user_id ?? '0', 10);
    const admissionLength = parseInt(apt.admission_length ?? '30', 10);
    const clinicId = state.data.clinicId || 1;
    const admissionDate = `${state.data.newDate} ${state.data.newTime}:00`;
    const description = apt.description || 'Перенос записи по инициативе клиента';
    try {
      await this.crmService.createAppointment(
        typeId,
        admissionDate,
        clinicId,
        clientId,
        patientId,
        description,
        admissionLength,
        userId,
      );
      return { success: true };
    } catch (e) {
      this.logger.error(`Ошибка создания записи: ${e}`);
      return { success: false, error: e instanceof Error ? e.message : 'Ошибка создания записи' };
    }
  }

  private async findClientAndAppointments(state: MoveAppointmentStateData): Promise<{
    client?: any;
    appointments?: Admission[];
    error?: string;
    message?: string;
  }> {
    if (!this.clientService || !this.appointmentService) return { error: 'Сервисы не инициализированы' };
    if (!state.phone) return { error: 'Не указан телефон' };
    try {
      const clientResult = await this.clientService.getClinetByPhone(state.phone);
      if (
        !clientResult ||
        !(clientResult as any).data?.client ||
        (clientResult as any).data.client.length === 0
      ) {
        return {
          error: `Клиент с номером телефона ${state.phone} не найден в системе. Проверьте правильность номера телефона.`,
        };
      }
      const client = (clientResult as any).data.client[0];
      const clientId = client?.id || client?.client_id;
      const crmClientId = typeof clientId === 'number' ? clientId : parseInt(clientId);
      if (isNaN(crmClientId)) return { error: 'Ошибка: не удалось определить ID клиента' };
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
      this.logger.error(`Ошибка при поиске: ${error}`);
      return { error: 'Произошла техническая ошибка при поиске записей. Попробуйте позже.' };
    }
  }

  private async getAvailableDates(clinicId?: number): Promise<{
    dates?: Array<{ date: string; displayName: string }>;
    error?: string;
  }> {
    if (!this.crmService || !clinicId) return { error: 'Сервис не инициализирован или не указана клиника' };
    try {
      const availableDates = await this.crmService.getAvailableDates(14, clinicId);
      const dates = availableDates.map((dateInfo) => ({
        date: dateInfo.date,
        displayName: formatDateDisplay(new Date(dateInfo.date)),
      }));
      return { dates };
    } catch (error) {
      this.logger.error(`Ошибка при получении доступных дат: ${error}`);
      return { error: 'Не удалось получить доступные даты' };
    }
  }

  private async getAvailableTimes(
    date: string,
    clinicId?: number,
  ): Promise<{ times?: string[]; error?: string }> {
    if (!this.crmService || !clinicId) return { error: 'Сервис не инициализирован или не указана клиника' };
    try {
      const occupiedSlots = await this.crmService.getOccupiedTimeSlots(date, clinicId);
      const allSlots = this.generateTimeSlots();
      const times = allSlots.filter((slot) => !occupiedSlots.includes(slot));
      return { times };
    } catch (error) {
      this.logger.error(`Ошибка при получении доступного времени: ${error}`);
      return { error: 'Не удалось получить доступное время' };
    }
  }

  private generateTimeSlots(): string[] {
    const slots: string[] = [];
    for (let hour = 9; hour < 18; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    return slots;
  }

  private isValidDate(value: string): boolean {
    const match = value.match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
    if (!match) return false;
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
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
  }

  private async moveAppointment(
    state: MoveAppointmentState,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    if (
      !this.crmService ||
      !state.data.selectedAppointmentId ||
      !state.data.newDate ||
      !state.data.newTime
    ) {
      return { success: false, error: 'Не все данные выбраны' };
    }
    try {
      const start = `${state.data.newDate} ${state.data.newTime}:00`;
      const durationMinutesRaw = state.data.selectedAppointment?.admission_length;
      const durationMinutes = parseInt((durationMinutesRaw || '30').toString(), 10);
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
      if (result && !(result as any).error) {
        const oldDate = new Date(state.data.selectedAppointment!.admission_date);
        const formattedOldDate = formatDateDisplay(oldDate);
        const formattedOldTime = oldDate.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const formattedNewDate = formatDateDisplay(new Date(state.data.newDate!));
        return {
          success: true,
          message: `Запись перенесена с ${formattedOldDate} в ${formattedOldTime} на ${formattedNewDate} в ${state.data.newTime}`,
        };
      }
      return {
        success: false,
        error: (result as any)?.error || (result as any)?.message || 'Не удалось перенести запись',
      };
    } catch (error: any) {
      this.logger.error(`Ошибка при переносе записи: ${error}`);
      return { success: false, error: error?.message || 'Произошла техническая ошибка' };
    }
  }

  async handleMessage(
    state: MoveAppointmentState,
    rawMessage: string,
  ): Promise<MoveAppointmentSceneHandleResult> {
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
          responses: [validation.reply || 'Хорошо, перенос отменён. Если понадобится — напишите снова.'],
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
    let notifyModerator: string | undefined;
    let nextState: MoveAppointmentState = { step: state.step, data: { ...state.data } };

    try {
      switch (state.step) {
        case 'phone': {
          const normalized = normalizePhone(effectiveMessage);
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
            responses.push(
              ...buildAppointmentsListResponse(result.appointments, result.client!, normalized),
            );
          } else {
            responses.push(result.message || 'Записи не найдены.');
            return { state, responses, completed };
          }
          break;
        }
        case 'select_appointment': {
          const appointmentIndex = parseAppointmentIndex(
            effectiveMessage,
            state.data.appointments || [],
          );
          if (appointmentIndex === null) {
            responses.push('Пожалуйста, введите номер записи из списка выше.');
            responses.push(
              ...buildAppointmentsListResponse(
                state.data.appointments || [],
                state.data.client,
                state.data.phone || '',
              ),
            );
            return { state, responses, completed };
          }
          const selectedAppointment = state.data.appointments?.[appointmentIndex];
          if (!selectedAppointment) {
            responses.push('Ошибка: запись не найдена. Попробуйте еще раз.');
            return { state, responses, completed };
          }
          nextState.data.selectedAppointment = selectedAppointment;
          nextState.data.selectedAppointmentId = selectedAppointment.id.toString();
          const clinicIdStr = (selectedAppointment as any).clinic_id;
          const clinicId = typeof clinicIdStr === 'string' ? parseInt(clinicIdStr) : clinicIdStr;
          nextState.data.clinicId = isNaN(clinicId) ? undefined : clinicId;
          nextState.step = 'confirm_reschedule';
          const petAlias = (selectedAppointment as any).pet?.alias;
          responses.push(...buildConfirmRescheduleMessage(selectedAppointment, petAlias));
          break;
        }
        case 'confirm_reschedule': {
          if (!isPositiveResponse(effectiveMessage)) {
            nextState.step = 'select_appointment';
            responses.push('Хорошо. Выберите запись для переноса (введите номер из списка выше).');
            responses.push(
              ...buildAppointmentsListResponse(
                state.data.appointments || [],
                state.data.client,
                state.data.phone || '',
              ),
            );
            return { state: nextState, responses, completed };
          }
          const cancelResult = await this.cancelAppointmentById(nextState.data.selectedAppointmentId!);
          if (!cancelResult.success) {
            responses.push(`Не удалось отменить запись: ${cancelResult.error || 'Ошибка'}. Попробуйте позже.`);
            return { state, responses, completed };
          }
          nextState.data.appointmentCancelled = true;
          nextState.step = 'orientation_days';
          responses.push('✅ Текущая запись отменена. Окно освобождено.');
          responses.push(STEP_LABELS.orientation_days);
          break;
        }
        case 'orientation_days': {
          nextState.data.orientationDays = effectiveMessage;
          nextState.step = 'orientation_time';
          responses.push(`✅ Учтём: ${effectiveMessage}`);
          responses.push(STEP_LABELS.orientation_time);
          break;
        }
        case 'orientation_time': {
          nextState.data.orientationTimeConstraints = effectiveMessage;
          const clinicId = state.data.clinicId || 1;
          const nearestSlots = await this.getNearestSlots(clinicId, 3);
          if (nearestSlots.length > 0) {
            nextState.data.offeredSlots = nearestSlots;
            nextState.step = 'select_slot_from_offer';
            responses.push(`✅ Учтём ограничения по времени.`);
            responses.push(...buildOfferedSlotsMessage(nearestSlots));
          } else {
            nextState.step = 'no_slots_alternatives';
            const liveDoctors = getDoctorsWithLiveQueue().map((d) => d.fullName);
            responses.push(...buildNoSlotsAlternativesMessage(liveDoctors));
          }
          break;
        }
        case 'select_slot_from_offer': {
          const lower = effectiveMessage.trim().toLowerCase();
          if (['другие', 'другое', 'other'].some((s) => lower.includes(s))) {
            nextState.step = 'select_date';
            const datesResult = await this.getAvailableDates(state.data.clinicId);
            if (datesResult.dates?.length) {
              responses.push(...buildAvailableDatesResponse(datesResult.dates));
            } else {
              responses.push('Не удалось получить доступные даты. Попробуйте позже.');
              return { state, responses, completed };
            }
            break;
          }
          const slotNum = parseInt(effectiveMessage, 10);
          const offered = state.data.offeredSlots || [];
          if (isNaN(slotNum) || slotNum < 1 || slotNum > offered.length) {
            responses.push('Введите номер варианта (1, 2 или 3) или «другие».');
            responses.push(...buildOfferedSlotsMessage(offered));
            return { state, responses, completed };
          }
          const chosen = offered[slotNum - 1];
          nextState.data.newDate = chosen.date;
          nextState.data.newTime = chosen.time;
          nextState.step = 'confirmation';
          responses.push(...buildConfirmationWithReminderResponse(nextState));
          break;
        }
        case 'no_slots_alternatives': {
          const num = parseInt(effectiveMessage.trim(), 10);
          if (num === 1) {
            nextState.step = 'select_date';
            const datesResult = await this.getAvailableDates(state.data.clinicId);
            if (datesResult.dates?.length) {
              responses.push('Расширяем поиск. Выберите дату:');
              responses.push(...buildAvailableDatesResponse(datesResult.dates));
            } else {
              responses.push('К сожалению, доступных дат не найдено. Попробуйте позже или выберите вариант 3 или 4.');
              responses.push(...buildNoSlotsAlternativesMessage(getDoctorsWithLiveQueue().map((d) => d.fullName)));
              return { state, responses, completed };
            }
          } else if (num === 2) {
            const byAppointment = getDoctorsByAppointmentOnly().map((d) => d.fullName);
            responses.push('Приём только по записи ведут: ' + byAppointment.join(', ') + '.');
            responses.push('Оформите новую запись к выбранному врачу через меню «Записаться».');
            completed = true;
            nextState = this.getInitialState();
          } else if (num === 3) {
            const live = getDoctorsWithLiveQueue().map((d) => d.fullName);
            responses.push('Приём по живой очереди (без записи): ' + live.join(', ') + '.');
            responses.push('Можете прийти в клинику в часы работы — вас примет один из этих врачей.');
            completed = true;
            nextState = this.getInitialState();
          } else if (num === 4) {
            nextState.step = 'waitlist_handoff';
            responses.push(...buildWaitlistHandoffMessage());
            const phone = state.data.phone || '';
            const client = state.data.client;
            const clientName = client ? `${(client as any).first_name || ''} ${(client as any).last_name || ''}`.trim() : '';
            notifyModerator =
              `📋 ЛИСТ ОЖИДАНИЯ\n\nКлиент: ${clientName || 'не указан'}\nТелефон: ${phone}\nЗапись была отменена по инициативе клиента. Просит поставить в лист ожидания. Связаться при освобождении окна.`;
            completed = true;
            nextState = this.getInitialState();
          } else {
            responses.push('Выберите 1, 2, 3 или 4.');
            responses.push(...buildNoSlotsAlternativesMessage(getDoctorsWithLiveQueue().map((d) => d.fullName)));
            return { state, responses, completed };
          }
          break;
        }
        case 'waitlist_handoff':
          completed = true;
          nextState = this.getInitialState();
          break;
        case 'select_date': {
          if (!this.isValidDate(effectiveMessage)) {
            responses.push('Введите дату в формате ГГГГ-ММ-ДД (например, 2024-05-20).');
            return { state, responses, completed };
          }
          const clinicId = state.data.clinicId;
          if (clinicId) {
            const datesResult = await this.getAvailableDates(clinicId);
            const isAvailable = datesResult.dates?.some((d) => d.date === effectiveMessage);
            if (!isAvailable) {
              responses.push('Выбранная дата недоступна. Пожалуйста, выберите другую дату.');
              if (datesResult.dates?.length) responses.push(...buildAvailableDatesResponse(datesResult.dates));
              return { state, responses, completed };
            }
          }
          nextState.data.newDate = effectiveMessage;
          nextState.step = 'select_time';
          responses.push(`✅ Новая дата: ${effectiveMessage}`);
          const timeResult = await this.getAvailableTimes(effectiveMessage, clinicId);
          if (timeResult.times && timeResult.times.length > 0) {
            responses.push(...buildAvailableTimesResponse(timeResult.times));
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
          const date = state.data.newDate;
          const clinicIdTime = state.data.clinicId;
          if (date && clinicIdTime) {
            const timeResult = await this.getAvailableTimes(date, clinicIdTime);
            const isAvailable = timeResult.times?.includes(effectiveMessage);
            if (!isAvailable) {
              responses.push('Выбранное время недоступно. Пожалуйста, выберите другое время.');
              if (timeResult.times?.length) responses.push(...buildAvailableTimesResponse(timeResult.times));
              return { state, responses, completed };
            }
          }
          nextState.data.newTime = effectiveMessage;
          nextState.step = 'confirmation';
          responses.push(...buildConfirmationResponse(nextState));
          break;
        }
        case 'confirmation': {
          if (isPositiveResponse(effectiveMessage)) {
            if (nextState.data.appointmentCancelled) {
              const createResult = await this.createNewAppointmentAfterCancel(nextState);
              if (createResult.success) {
                responses.push('✅ Новая запись успешно создана!');
                responses.push('Накануне приёма придёт напоминание.');
                nextState.step = 'completed';
                completed = true;
              } else {
                responses.push(`❌ Ошибка при создании записи: ${createResult.error || 'Неизвестная ошибка'}`);
                return { state, responses, completed };
              }
            } else {
              const moveResult = await this.moveAppointment(nextState);
              if (moveResult.success) {
                responses.push('✅ Запись успешно перенесена!');
                if (moveResult.message) responses.push(moveResult.message);
                responses.push('Накануне приёма придёт напоминание.');
                nextState.step = 'completed';
                completed = true;
              } else {
                responses.push(`❌ Ошибка при переносе записи: ${moveResult.error || 'Неизвестная ошибка'}`);
                return { state, responses, completed };
              }
            }
            break;
          }
          if (isNegativeResponse(effectiveMessage)) {
            nextState = this.getInitialState();
            responses.push('Хорошо, начнем заново.');
            responses.push(buildIntroMessage());
            break;
          }
          responses.push('Ответьте, пожалуйста, «да» для подтверждения или «нет», чтобы начать заново.');
          if (nextState.data.appointmentCancelled) {
            responses.push(...buildConfirmationWithReminderResponse(nextState));
          } else {
            responses.push(...buildConfirmationResponse(nextState));
          }
          return { state, responses, completed };
        }
        case 'completed':
          nextState = this.getInitialState();
          responses.push(buildIntroMessage());
          break;
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

    return { state: nextState, responses, completed, notifyModerator };
  }
}

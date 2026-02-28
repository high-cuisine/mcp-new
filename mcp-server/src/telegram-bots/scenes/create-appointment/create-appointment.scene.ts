import { Logger } from '@nestjs/common';
import { ProccesorService } from 'src/proccesor/services/proccesor.service';
import { CrmService } from 'src/crm/services/crm.service';
import { DoctorService } from 'src/crm/services/doctor.service';
import type { AppointmentState, AppointmentStep, AppointmentType, SceneHandleResult } from './types';
import { STEP_LABELS, FORMAT_HINTS, APPOINTMENT_TYPE_LABELS } from './constants';
import { getFlowForAppointmentType } from './flow';
import {
  resolveAppointmentType,
  getDateValidationError,
  getTimeValidationError,
} from './validation';
import {
  buildIntroMessage as introMsg,
  buildSymptomsStepResponse,
  buildPetNameStepResponse,
  buildPetBreedStepResponse,
  buildOwnerPhoneStepResponse,
  buildOwnerNameStepResponse,
  buildAppointmentTypeStepResponse,
  buildDateStepResponse,
  buildDoctorStepResponse,
  buildSummary,
} from './messages';
import { buildDoctorsList, filterNonAdminDoctors, getPositionText, getWaitlistHint } from './doctors';
import { parseAvailableSlots, buildSlotsList } from './slots';
import { createAppointmentInCrm } from './crm';
import { normalizePhone, isPositiveResponse, isNegativeResponse } from '../common/utils';

export class CreateAppointmentScene {
  private readonly logger = new Logger(CreateAppointmentScene.name);

  constructor(
    private readonly crmService?: CrmService,
    private readonly doctorService?: DoctorService,
    private readonly proccesorService?: ProccesorService,
  ) {}

  getInitialState(): AppointmentState {
    return { step: 'intro', data: {} };
  }

  private getStepLabel(step: AppointmentStep): string {
    return STEP_LABELS[step] || '';
  }

  private getFormatHint(step: AppointmentStep): string | undefined {
    return FORMAT_HINTS[step];
  }

  private async validateStepAndInterpret(
    state: AppointmentState,
    trimmedMessage: string,
  ): Promise<{ intent: 'answer' | 'off_topic' | 'refuse'; value: string; replyMessage: string | null } | null> {
    if (!this.proccesorService || !trimmedMessage) return null;
    const stepLabel = this.getStepLabel(state.step);
    if (!stepLabel) return null;
    try {
      const result = await this.proccesorService.validateSceneStep({
        stepId: state.step,
        stepLabel,
        userMessage: trimmedMessage,
        formatHint: this.getFormatHint(state.step),
      });
      return {
        intent: result.intent,
        value: result.validated_value ?? trimmedMessage,
        replyMessage: result.reply_message ?? null,
      };
    } catch (e) {
      this.logger.warn(`validateSceneStep failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private mapAppointmentTypeToSlot(type?: AppointmentType): string | undefined {
    if (type === 'primary') return 'primary';
    if (type === 'secondary') return 'follow_up';
    if (type === 'ultrasound') return 'ultrasound';
    if (type === 'analyses') return 'analyses';
    if (type === 'xray') return 'xray';
    return undefined;
  }

  async handleMessage(state: AppointmentState, rawMessage: string): Promise<SceneHandleResult> {
    const trimmedMessage = rawMessage?.trim() ?? '';
    if (state.step === 'intro') {
      return {
        state: { step: 'symptoms', data: { ...state.data } },
        responses: [introMsg()],
        completed: false,
      };
    }

    const validation = await this.validateStepAndInterpret(state, trimmedMessage);
    if (validation) {
      if (validation.intent === 'refuse') {
        return {
          state: { ...state },
          responses: [validation.replyMessage || 'Хорошо, запись отменена. Если понадобится — напишите снова.'],
          completed: false,
          exitScene: true,
        };
      }
      if (validation.intent === 'off_topic') {
        return {
          state: { ...state },
          responses: [
            validation.replyMessage ||
              'Вы перешли к другой теме. Сцена завершена. Когда будете готовы записаться — напишите «записаться».',
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
    let nextState: AppointmentState = { step: state.step, data: { ...state.data } };

    try {
      switch (state.step) {
        case 'symptoms':
          nextState.data.symptoms = effectiveMessage;
          nextState.step = 'pet_name';
          responses.push(...buildSymptomsStepResponse(effectiveMessage));
          break;

        case 'pet_name':
          nextState.data.petName = effectiveMessage;
          nextState.step = 'pet_breed';
          responses.push(...buildPetNameStepResponse(effectiveMessage));
          break;

        case 'pet_breed':
          nextState.data.petBreed = effectiveMessage;
          nextState.step = 'owner_phone';
          responses.push(...buildPetBreedStepResponse(nextState));
          break;

        case 'owner_phone': {
          const normalized = normalizePhone(effectiveMessage);
          if (!normalized) {
            responses.push('Не удалось распознать номер телефона. Введите его в формате +7XXXXXXXXXX.');
            return { state, responses, completed };
          }
          nextState.data.ownerPhone = normalized;
          nextState.step = 'owner_name';
          responses.push(...buildOwnerPhoneStepResponse(normalized));
          break;
        }

        case 'owner_name':
          nextState.data.ownerName = effectiveMessage;
          nextState.step = 'appointment_type';
          responses.push(...buildOwnerNameStepResponse(effectiveMessage));
          break;

        case 'appointment_type': {
          const appointmentType = resolveAppointmentType(effectiveMessage);
          if (!appointmentType) {
            responses.push(
              'Пожалуйста, выберите тип приема: 1 — первичный, 2 — вторичный, 3 — прививка, 4 — УЗИ, 5 — анализы, 6 — рентген, 7 — другое (произвольная причина).',
            );
            return { state, responses, completed };
          }
          nextState.data.appointmentType = appointmentType;
          nextState.data.flow = getFlowForAppointmentType(appointmentType);
          if (appointmentType === 'other') {
            nextState.step = 'appointment_type_other';
            responses.push(`✅ Тип приема: ${APPOINTMENT_TYPE_LABELS.other}`);
            responses.push('Укажите причину приёма (произвольный текст).');
          } else {
            nextState.step = 'doctor';
            responses.push(...buildAppointmentTypeStepResponse(appointmentType));
            if (this.doctorService) {
              const doctorsList = await buildDoctorsList(this.doctorService);
              if (doctorsList.length > 0) responses.push(...doctorsList);
              else responses.push('Укажите предпочитаемого врача (ФИО) или напишите «авто» для автоматического подбора.');
            } else {
              responses.push('Укажите предпочитаемого врача (ФИО) или напишите «авто» для автоматического подбора.');
            }
          }
          break;
        }

        case 'appointment_type_other': {
          const reason = effectiveMessage.trim();
          if (!reason) {
            responses.push('Пожалуйста, укажите причину приёма (произвольный текст).');
            return { state, responses, completed };
          }
          nextState.data.appointmentTypeOther = reason;
          if (!nextState.data.flow && nextState.data.appointmentType) {
            nextState.data.flow = getFlowForAppointmentType(nextState.data.appointmentType);
          }
          nextState.step = 'doctor';
          responses.push(`✅ Причина приёма: ${reason}`);
          if (this.doctorService) {
            const doctorsList = await buildDoctorsList(this.doctorService);
            if (doctorsList.length > 0) responses.push(...doctorsList);
            else responses.push('Укажите предпочитаемого врача (ФИО) или напишите «авто».');
          } else {
            responses.push('Укажите предпочитаемого врача (ФИО) или напишите «авто».');
          }
          break;
        }

        case 'date': {
          const dateError = getDateValidationError(effectiveMessage);
          if (dateError) {
            responses.push(dateError);
            return { state, responses, completed };
          }
          nextState.data.date = effectiveMessage;
          nextState.step = 'time';
          responses.push(...buildDateStepResponse(effectiveMessage));
          break;
        }

        case 'time': {
          const timeError = getTimeValidationError(effectiveMessage);
          if (timeError) {
            responses.push(timeError);
            return { state, responses, completed };
          }
          nextState.data.time = effectiveMessage;
          nextState.data.clinicId = 1;
          nextState.data.clinic = 'Клиника #1';
          responses.push(`✅ Время приема: ${effectiveMessage}`);
          responses.push(`✅ Клиника: ${nextState.data.clinic}`);
          nextState.step = 'confirmation';
          responses.push(...buildDoctorStepResponse(nextState));
          break;
        }

        case 'clinic':
          nextState.data.clinic = effectiveMessage;
          nextState.step = 'confirmation';
          responses.push(`✅ Клиника: ${effectiveMessage}`);
          responses.push(...buildDoctorStepResponse(nextState));
          break;

        case 'doctor': {
          const doctorNumber = parseInt(effectiveMessage, 10);
          if (!isNaN(doctorNumber) && this.doctorService) {
            try {
              const allDoctors = await this.doctorService.getDoctorsWithAppointment();
              const filtered = filterNonAdminDoctors(allDoctors);
              const selectedDoctor = filtered[doctorNumber - 1];
              if (selectedDoctor) {
                nextState.data.doctor =
                  selectedDoctor.full_name || selectedDoctor.name || `Врач #${doctorNumber}`;
                nextState.data.doctorId = selectedDoctor.id;
                const doctorFullName =
                  selectedDoctor.full_name ||
                  (selectedDoctor.last_name && selectedDoctor.first_name && selectedDoctor.middle_name
                    ? `${selectedDoctor.last_name} ${selectedDoctor.first_name} ${selectedDoctor.middle_name}`
                    : selectedDoctor.name || `Врач #${doctorNumber}`);
                const doctorLastName =
                  selectedDoctor.last_name ||
                  (selectedDoctor.full_name ? selectedDoctor.full_name.trim().split(/\s+/)[0] : '') ||
                  (selectedDoctor.name ? selectedDoctor.name.trim().split(/\s+/)[0] : '');
                const positionText = getPositionText(selectedDoctor);
                let doctorMessage = `✅ Выбран врач: ${doctorFullName}`;
                if (positionText) doctorMessage += ` (${positionText})`;
                responses.push(doctorMessage);

                if (this.proccesorService && doctorLastName) {
                  try {
                    const slotType = this.mapAppointmentTypeToSlot(nextState.data.appointmentType);
                    const slotsText = await this.proccesorService.useDoctorAvailableSlots(
                      doctorLastName,
                      undefined,
                      slotType,
                    );
                    const slots = parseAvailableSlots(slotsText);
                    nextState.data.availableSlots = slots;
                    if (slots.length > 0) {
                      responses.push(...buildSlotsList(slots));
                      nextState.step = 'slot_selection';
                    } else {
                      responses.push('К сожалению, у выбранного врача нет доступных окон для записи.');
                      responses.push(getWaitlistHint());
                      responses.push('Попробуйте выбрать другого врача.');
                      const list = await buildDoctorsList(this.doctorService);
                      if (list.length > 0) responses.push(...list);
                      return { state, responses, completed };
                    }
                  } catch (err) {
                    this.logger.error(`Ошибка при получении доступных окон: ${err instanceof Error ? err.message : String(err)}`);
                    responses.push('Не удалось получить доступные окна. Попробуйте выбрать другого врача.');
                    const list = await buildDoctorsList(this.doctorService);
                    if (list.length > 0) responses.push(...list);
                    return { state, responses, completed };
                  }
                } else {
                  nextState.step = 'date';
                  responses.push(...buildDoctorStepResponse(nextState));
                  responses.push('Введите желаемую дату приема в формате ГГГГ-ММ-ДД.');
                }
              } else {
                responses.push(`❌ Врач с номером ${doctorNumber} не найден. Выберите номер из списка.`);
                const list = await buildDoctorsList(this.doctorService);
                if (list.length > 0) responses.push(...list);
                return { state, responses, completed };
              }
            } catch (err) {
              this.logger.error(`Ошибка при получении врача: ${err instanceof Error ? err.message : String(err)}`);
              responses.push('Произошла ошибка при получении информации о враче. Попробуйте снова.');
              const list = await buildDoctorsList(this.doctorService);
              if (list.length > 0) responses.push(...list);
              return { state, responses, completed };
            }
          } else {
            nextState.data.doctor = effectiveMessage;
            if (effectiveMessage.toLowerCase() !== 'авто' && this.proccesorService) {
              try {
                const doctorLastName = effectiveMessage.trim().split(/\s+/)[0] || effectiveMessage;
                const slotType = this.mapAppointmentTypeToSlot(nextState.data.appointmentType);
                const slotsText = await this.proccesorService.useDoctorAvailableSlots(
                  doctorLastName,
                  undefined,
                  slotType,
                );
                const slots = parseAvailableSlots(slotsText);
                nextState.data.availableSlots = slots;
                if (slots.length > 0) {
                  responses.push(`✅ Выбран врач: ${effectiveMessage}`);
                  responses.push(...buildSlotsList(slots));
                  nextState.step = 'slot_selection';
                } else {
                  responses.push(`✅ Выбран врач: ${effectiveMessage}`);
                  responses.push('К сожалению, у выбранного врача нет доступных окон для записи.');
                  responses.push(getWaitlistHint());
                  nextState.step = 'date';
                  responses.push('Введите желаемую дату приема в формате ГГГГ-ММ-ДД.');
                }
              } catch {
                nextState.step = 'date';
                responses.push(`✅ Выбран врач: ${effectiveMessage}`);
                responses.push('Введите желаемую дату приема в формате ГГГГ-ММ-ДД.');
              }
            } else {
              nextState.step = 'date';
              responses.push(...buildDoctorStepResponse(nextState));
              responses.push('Введите желаемую дату приема в формате ГГГГ-ММ-ДД.');
            }
          }
          break;
        }

        case 'slot_selection': {
          const slotNumber = parseInt(effectiveMessage, 10);
          if (isNaN(slotNumber) || !nextState.data.availableSlots) {
            responses.push('Пожалуйста, введите номер окна из списка.');
            if (nextState.data.availableSlots?.length) responses.push(...buildSlotsList(nextState.data.availableSlots));
            return { state, responses, completed };
          }
          const selectedSlot = nextState.data.availableSlots[slotNumber - 1];
          if (!selectedSlot) {
            responses.push(`❌ Окно с номером ${slotNumber} не найдено. Выберите номер из списка.`);
            if (nextState.data.availableSlots.length > 0) responses.push(...buildSlotsList(nextState.data.availableSlots));
            return { state, responses, completed };
          }
          nextState.data.date = selectedSlot.date;
          nextState.data.time = selectedSlot.time;
          nextState.data.clinicId = 1;
          nextState.data.clinic = 'Клиника #1';
          responses.push(`✅ Выбрано окно: ${selectedSlot.date} ${selectedSlot.time}`);
          responses.push(`✅ Клиника: ${nextState.data.clinic}`);
          nextState.step = 'confirmation';
          responses.push(...buildDoctorStepResponse(nextState));
          break;
        }

        case 'confirmation': {
          if (isPositiveResponse(effectiveMessage)) {
            if (
              this.crmService &&
              nextState.data.ownerPhone &&
              nextState.data.date &&
              nextState.data.time &&
              nextState.data.doctorId
            ) {
              const crmResult = await createAppointmentInCrm(this.crmService, nextState.data);
              if (crmResult.success) {
                responses.push('✅ Запись успешно создана в системе!');
              } else {
                responses.push(
                  `⚠️ Заявка сформирована, но произошла ошибка при создании записи в системе. Менеджер свяжется с вами для уточнения деталей.`,
                );
              }
            }
            responses.push('Заявка сформирована и будет обработана менеджером. Благодарим за обращение!');
            responses.push(buildSummary(nextState.data));
            nextState.step = 'completed';
            completed = true;
            break;
          }
          if (isNegativeResponse(effectiveMessage)) {
            nextState = { step: 'symptoms', data: {} };
            responses.push('Хорошо, начнем заново.');
            responses.push(introMsg());
            break;
          }
          responses.push('Ответьте, пожалуйста, «да» для подтверждения или «нет», чтобы начать заново.');
          return { state, responses, completed };
        }

        case 'completed':
          nextState = this.getInitialState();
          responses.push(introMsg());
          break;

        default:
          nextState = this.getInitialState();
          responses.push(introMsg());
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

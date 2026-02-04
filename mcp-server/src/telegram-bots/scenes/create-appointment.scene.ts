import { Logger } from '@nestjs/common';
import { ProccesorService } from "src/proccesor/services/proccesor.service";
import { CrmService } from 'src/crm/services/crm.service';
import { DoctorService } from 'src/crm/services/doctor.service';

export type AppointmentStep =
  | 'intro'
  | 'symptoms'
  | 'pet_name'
  | 'pet_breed'
  | 'owner_phone'
  | 'owner_name'
  | 'appointment_type'
  | 'appointment_type_other'
  | 'date'
  | 'time'
  | 'clinic'
  | 'doctor'
  | 'slot_selection'
  | 'confirmation'
  | 'completed';

export type AppointmentType = 'primary' | 'secondary' | 'vaccination' | 'ultrasound' | 'analyses' | 'xray' | 'other';

export interface AppointmentStateData {
  symptoms?: string;
  petName?: string;
  petBreed?: string;
  ownerPhone?: string;
  ownerName?: string;
  appointmentType?: AppointmentType;
  /** Произвольная причина приёма при выборе «другое» */
  appointmentTypeOther?: string;
  date?: string;
  time?: string;
  clinic?: string;
  clinicId?: number;
  doctor?: string;
  doctorId?: number;
  availableSlots?: Array<{ date: string; time: string; index: number }>;
}

export interface AppointmentState {
  step: AppointmentStep;
  data: AppointmentStateData;
}

export interface SceneHandleResult {
  state: AppointmentState;
  responses: string[];
  completed: boolean;
  /** Выход из сцены без завершения (отказ пользователя) */
  exitScene?: boolean;
}

export class CreateAppointmentScene {
  private readonly appointmentTypeLabels: Record<AppointmentType, string> = {
    primary: 'Первичный прием',
    secondary: 'Вторичный прием',
    vaccination: 'Прививка',
    ultrasound: 'УЗИ',
    analyses: 'Анализы',
    xray: 'Рентген',
    other: 'Другое (произвольная причина)',
  };

  /** Рабочие часы для валидации времени приёма: с 08:00 по 20:00 */
  private readonly workTimeStart = { hour: 8, minute: 0 };
  private readonly workTimeEnd = { hour: 20, minute: 0 };
  /** Максимум месяцев вперёд для записи */
  private readonly maxMonthsAhead = 12;

  private readonly logger = new Logger(CreateAppointmentScene.name);

  constructor(
    private readonly crmService?: CrmService,
    private readonly doctorService?: DoctorService,
    private readonly proccesorService?: ProccesorService,
  ) {}

  getInitialState(): AppointmentState {
    return {
      step: 'intro',
      data: {},
    };
  }

  private getStepLabel(step: AppointmentStep): string {
    const labels: Record<AppointmentStep, string> = {
      intro: '',
      symptoms: 'Расскажите, пожалуйста, какие симптомы у питомца.',
      pet_name: 'Укажите имя и вид питомца (например: Барсик, кот).',
      pet_breed: 'Введите породу питомца (например: британская, корги).',
      owner_phone: 'Укажите номер телефона владельца в формате +7XXXXXXXXXX.',
      owner_name: 'Введите ФИО владельца (например: Иванов Иван Иванович).',
      appointment_type: 'Выберите тип приема: 1 — первичный, 2 — вторичный, 3 — прививка, 4 — УЗИ, 5 — анализы, 6 — рентген, 7 — другое (произвольная причина).',
      appointment_type_other: 'Укажите причину приёма (произвольный текст).',
      date: 'Введите желаемую дату приема в формате ГГГГ-ММ-ДД (например, 2025-06-15). Дата не должна быть в прошлом.',
      time: 'Введите время приема в формате ЧЧ:ММ (например, 14:30). Приём возможен с 08:00 до 20:00.',
      clinic: 'Укажите предпочитаемую клинику.',
      doctor: 'Укажите предпочитаемого врача (ФИО) или напишите «авто» для автоматического подбора.',
      slot_selection: 'Выберите доступное окно (введите номер из списка).',
      confirmation: 'Если данные верны, ответьте «да» для подтверждения или «нет», чтобы начать заново.',
      completed: '',
    };
    return labels[step] || '';
  }

  private getFormatHint(step: AppointmentStep): string | undefined {
    const hints: Partial<Record<AppointmentStep, string>> = {
      owner_phone: 'телефон +7XXXXXXXXXX',
      date: 'ГГГГ-ММ-ДД',
      time: 'ЧЧ:ММ',
      appointment_type: '1-7 или primary/secondary/vaccination/ultrasound/analyses/xray/other',
    };
    return hints[step];
  }

  private async validateStepAndInterpret(
    state: AppointmentState,
    trimmedMessage: string,
  ): Promise<{ intent: 'answer' | 'off_topic' | 'refuse'; value: string; replyMessage: string | null } | null> {
    if (!this.proccesorService || !trimmedMessage) {
      return null;
    }
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

  async handleMessage(state: AppointmentState, rawMessage: string): Promise<SceneHandleResult> {
    const trimmedMessage = rawMessage?.trim() ?? '';

    if (state.step === 'intro') {
      return {
        state: {
          step: 'symptoms',
          data: { ...state.data },
        },
        responses: [this.buildIntroMessage()],
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
          responses: [validation.replyMessage || 'Вы перешли к другой теме. Сцена завершена. Когда будете готовы записаться — напишите «записаться».'],
          completed: false,
          exitScene: true,
        };
      }
      // answer — используем value ниже как trimmedMessage для шага
    }
    const effectiveMessage = validation?.intent === 'answer' && validation.value ? validation.value : trimmedMessage;

    const responses: string[] = [];
    let completed = false;
    let nextState: AppointmentState = {
      step: state.step,
      data: { ...state.data },
    };

    try {
      switch (state.step) {
        case 'symptoms': {
          nextState.data.symptoms = effectiveMessage;
          nextState.step = 'pet_name';
          responses.push(...this.buildSymptomsStepResponse(effectiveMessage));
          break;
        }
        case 'pet_name': {
          nextState.data.petName = effectiveMessage;
          nextState.step = 'pet_breed';
          responses.push(...this.buildPetNameStepResponse(effectiveMessage));
          break;
        }
        case 'pet_breed': {
          nextState.data.petBreed = effectiveMessage;
          nextState.step = 'owner_phone';
          responses.push(...this.buildPetBreedStepResponse(nextState));
          break;
        }
        case 'owner_phone': {
          const normalized = this.normalizePhone(effectiveMessage);
          if (!normalized) {
            responses.push('Не удалось распознать номер телефона. Введите его в формате +7XXXXXXXXXX.');
            return { state, responses, completed };
          }
          nextState.data.ownerPhone = normalized;
          nextState.step = 'owner_name';
          responses.push(...this.buildOwnerPhoneStepResponse(normalized));
          break;
        }
        case 'owner_name': {
          nextState.data.ownerName = effectiveMessage;
          nextState.step = 'appointment_type';
          responses.push(...this.buildOwnerNameStepResponse(effectiveMessage));
          break;
        }
        case 'appointment_type': {
          const appointmentType = this.resolveAppointmentType(effectiveMessage);
          if (!appointmentType) {
            responses.push('Пожалуйста, выберите тип приема: 1 — первичный, 2 — вторичный, 3 — прививка, 4 — УЗИ, 5 — анализы, 6 — рентген, 7 — другое (произвольная причина).');
            return { state, responses, completed };
          }
          nextState.data.appointmentType = appointmentType;
          if (appointmentType === 'other') {
            nextState.step = 'appointment_type_other';
            responses.push(`✅ Тип приема: ${this.appointmentTypeLabels.other}`);
            responses.push('Укажите причину приёма (произвольный текст).');
          } else {
            nextState.step = 'doctor';
            responses.push(...this.buildAppointmentTypeStepResponse(appointmentType));
            try {
              if (this.doctorService) {
                const doctorsList = await this.buildDoctorsList();
                if (doctorsList.length > 0) {
                  responses.push(...doctorsList);
                } else {
                  responses.push('Укажите предпочитаемого врача (ФИО) или напишите «авто» для автоматического подбора.');
                }
              } else {
                responses.push('Укажите предпочитаемого врача (ФИО) или напишите «авто» для автоматического подбора.');
              }
            } catch (error) {
              this.logger.error(`Ошибка при получении списка врачей: ${error instanceof Error ? error.message : String(error)}`);
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
          nextState.step = 'doctor';
          responses.push(`✅ Причина приёма: ${reason}`);
          try {
            if (this.doctorService) {
              const doctorsList = await this.buildDoctorsList();
              if (doctorsList.length > 0) {
                responses.push(...doctorsList);
              } else {
                responses.push('Укажите предпочитаемого врача (ФИО) или напишите «авто» для автоматического подбора.');
              }
            } else {
              responses.push('Укажите предпочитаемого врача (ФИО) или напишите «авто» для автоматического подбора.');
            }
          } catch (error) {
            this.logger.error(`Ошибка при получении списка врачей: ${error instanceof Error ? error.message : String(error)}`);
            responses.push('Укажите предпочитаемого врача (ФИО) или напишите «авто» для автоматического подбора.');
          }
          break;
        }
        case 'date': {
          const dateError = this.getDateValidationError(effectiveMessage);
          if (dateError) {
            responses.push(dateError);
            return { state, responses, completed };
          }
          nextState.data.date = effectiveMessage;
          nextState.step = 'time';
          responses.push(...this.buildDateStepResponse(effectiveMessage));
          break;
        }
        case 'time': {
          const timeError = this.getTimeValidationError(effectiveMessage);
          if (timeError) {
            responses.push(timeError);
            return { state, responses, completed };
          }
          nextState.data.time = effectiveMessage;

          // Всегда используем клинику 1
          nextState.data.clinicId = 1;
          nextState.data.clinic = 'Клиника #1';
          responses.push(`✅ Время приема: ${effectiveMessage}`);
          responses.push(`✅ Клиника: ${nextState.data.clinic}`);
          nextState.step = 'confirmation';
          responses.push(...this.buildDoctorStepResponse(nextState));
          break;
        }
        case 'clinic': {
          nextState.data.clinic = effectiveMessage;
          nextState.step = 'confirmation';
          responses.push(`✅ Клиника: ${effectiveMessage}`);
          responses.push(...this.buildDoctorStepResponse(nextState));
          break;
        }
        case 'doctor': {
          // Проверяем, является ли ввод числом (выбор врача по номеру)
          const doctorNumber = parseInt(effectiveMessage, 10);
          
          if (!isNaN(doctorNumber) && this.doctorService) {
            // Пользователь выбрал врача по номеру
            try {
              const allDoctors = await this.doctorService.getDoctorsWithAppointment();
              // Фильтруем администраторов, чтобы номер соответствовал списку
              const filteredDoctors = this.filterNonAdminDoctors(allDoctors);
              const selectedDoctor = filteredDoctors[doctorNumber - 1];
              
              if (selectedDoctor) {
                nextState.data.doctor = selectedDoctor.full_name || selectedDoctor.name || `Врач #${doctorNumber}`;
                nextState.data.doctorId = selectedDoctor.id;
                
                // Получаем записи врача и выводим в логи
                const appointments = await this.doctorService.getDoctorsTimeToAppointment(selectedDoctor.id);
                this.logger.log(`=== Записи врача ${selectedDoctor.full_name || selectedDoctor.name} (ID: ${selectedDoctor.id}) ===`);
                this.logger.log(`Количество записей: ${appointments.length}`);
                this.logger.log(`Записи: ${JSON.stringify(appointments, null, 2)}`);
                
                // Формируем полное ФИО врача
                const doctorFullName = selectedDoctor.full_name || 
                  (selectedDoctor.last_name && selectedDoctor.first_name && selectedDoctor.middle_name
                    ? `${selectedDoctor.last_name} ${selectedDoctor.first_name} ${selectedDoctor.middle_name}`
                    : selectedDoctor.name || `Врач #${doctorNumber}`);
                
                // Извлекаем фамилию врача для поиска в правилах (первое слово)
                const doctorLastName = selectedDoctor.last_name || 
                  (selectedDoctor.full_name ? selectedDoctor.full_name.trim().split(/\s+/)[0] : '') ||
                  (selectedDoctor.name ? selectedDoctor.name.trim().split(/\s+/)[0] : '');
                
                // Извлекаем должность
                const positionText = this.getPositionText(selectedDoctor);
                
                // Формируем сообщение с ФИО и должностью
                let doctorMessage = `✅ Выбран врач: ${doctorFullName}`;
                if (positionText) {
                  doctorMessage += ` (${positionText})`;
                }
                responses.push(doctorMessage);
                
                // Получаем доступные окна через ProccesorService
                if (this.proccesorService && doctorLastName) {
                  try {
                    const appointmentType = nextState.data.appointmentType === 'primary' ? 'primary'
                      : nextState.data.appointmentType === 'secondary' ? 'follow_up'
                      : nextState.data.appointmentType === 'ultrasound' ? 'ultrasound'
                      : nextState.data.appointmentType === 'analyses' ? 'analyses'
                      : nextState.data.appointmentType === 'xray' ? 'xray'
                      : nextState.data.appointmentType === 'other' ? undefined
                      : undefined;
                    
                    const slotsText = await this.proccesorService.useDoctorAvailableSlots(
                      doctorLastName,
                      undefined,
                      appointmentType
                    );
                    
                    // Парсим доступные окна из текста
                    const slots = this.parseAvailableSlots(slotsText);
                    nextState.data.availableSlots = slots;
                    
                    if (slots.length > 0) {
                      responses.push(...this.buildSlotsList(slots));
                      nextState.step = 'slot_selection';
                    } else {
                      responses.push('К сожалению, у выбранного врача нет доступных окон для записи.');
                      responses.push('Попробуйте выбрать другого врача.');
                      const doctorsList = await this.buildDoctorsList();
                      if (doctorsList.length > 0) {
                        responses.push(...doctorsList);
                      }
                      return { state, responses, completed };
                    }
                  } catch (error) {
                    this.logger.error(`Ошибка при получении доступных окон: ${error instanceof Error ? error.message : String(error)}`);
                    responses.push('Не удалось получить доступные окна. Попробуйте выбрать другого врача.');
                    const doctorsList = await this.buildDoctorsList();
                    if (doctorsList.length > 0) {
                      responses.push(...doctorsList);
                    }
                    return { state, responses, completed };
                  }
                } else {
                  // Fallback на старую логику, если ProccesorService недоступен
                  nextState.step = 'date';
                responses.push(...this.buildDoctorStepResponse(nextState));
                  responses.push('Введите желаемую дату приема в формате ГГГГ-ММ-ДД.');
                }
              } else {
                responses.push(`❌ Врач с номером ${doctorNumber} не найден. Выберите номер из списка.`);
                const doctorsList = await this.buildDoctorsList();
                if (doctorsList.length > 0) {
                  responses.push(...doctorsList);
                }
                return { state, responses, completed };
              }
            } catch (error) {
              this.logger.error(`Ошибка при получении записей врача: ${error instanceof Error ? error.message : String(error)}`);
              responses.push('Произошла ошибка при получении информации о враче. Попробуйте снова.');
              const doctorsList = await this.buildDoctorsList();
              if (doctorsList.length > 0) {
                responses.push(...doctorsList);
              }
              return { state, responses, completed };
            }
          } else {
            // Пользователь ввел имя врача или "авто"
            nextState.data.doctor = effectiveMessage;

            // Если введено имя врача, пытаемся получить доступные окна
            if (effectiveMessage.toLowerCase() !== 'авто' && this.proccesorService) {
              try {
                const appointmentType = nextState.data.appointmentType === 'primary' ? 'primary'
                  : nextState.data.appointmentType === 'secondary' ? 'follow_up'
                  : nextState.data.appointmentType === 'ultrasound' ? 'ultrasound'
                  : nextState.data.appointmentType === 'analyses' ? 'analyses'
                  : nextState.data.appointmentType === 'xray' ? 'xray'
                  : nextState.data.appointmentType === 'other' ? undefined
                  : undefined;

                // Извлекаем фамилию (первое слово)
                const doctorLastName = effectiveMessage.trim().split(/\s+/)[0] || effectiveMessage;

                const slotsText = await this.proccesorService.useDoctorAvailableSlots(
                  doctorLastName,
                  undefined,
                  appointmentType
                );

                const slots = this.parseAvailableSlots(slotsText);
                nextState.data.availableSlots = slots;

                if (slots.length > 0) {
                  responses.push(`✅ Выбран врач: ${effectiveMessage}`);
                  responses.push(...this.buildSlotsList(slots));
                  nextState.step = 'slot_selection';
                } else {
                  responses.push(`✅ Выбран врач: ${effectiveMessage}`);
                  responses.push('К сожалению, у выбранного врача нет доступных окон для записи.');
                  nextState.step = 'date';
                  responses.push('Введите желаемую дату приема в формате ГГГГ-ММ-ДД.');
                }
              } catch (error) {
                this.logger.error(`Ошибка при получении доступных окон: ${error instanceof Error ? error.message : String(error)}`);
                nextState.step = 'date';
                responses.push(`✅ Выбран врач: ${effectiveMessage}`);
                responses.push('Введите желаемую дату приема в формате ГГГГ-ММ-ДД.');
              }
            } else {
              // Автоматический подбор или ProccesorService недоступен
              nextState.step = 'date';
              responses.push(...this.buildDoctorStepResponse(nextState));
              responses.push('Введите желаемую дату приема в формате ГГГГ-ММ-ДД.');
            }
          }
          break;
        }
        case 'slot_selection': {
          const slotNumber = parseInt(effectiveMessage, 10);
          
          if (isNaN(slotNumber) || !nextState.data.availableSlots) {
            responses.push('Пожалуйста, введите номер окна из списка.');
            if (nextState.data.availableSlots && nextState.data.availableSlots.length > 0) {
              responses.push(...this.buildSlotsList(nextState.data.availableSlots));
            }
            return { state, responses, completed };
          }
          
          const selectedSlot = nextState.data.availableSlots[slotNumber - 1];
          
          if (!selectedSlot) {
            responses.push(`❌ Окно с номером ${slotNumber} не найдено. Выберите номер из списка.`);
            if (nextState.data.availableSlots.length > 0) {
              responses.push(...this.buildSlotsList(nextState.data.availableSlots));
            }
            return { state, responses, completed };
          }
          
          nextState.data.date = selectedSlot.date;
          nextState.data.time = selectedSlot.time;
          
          // Всегда используем клинику 1
          nextState.data.clinicId = 1;
          nextState.data.clinic = 'Клиника #1';
          responses.push(`✅ Выбрано окно: ${selectedSlot.date} ${selectedSlot.time}`);
          responses.push(`✅ Клиника: ${nextState.data.clinic}`);
          nextState.step = 'confirmation';
          responses.push(...this.buildDoctorStepResponse(nextState));
          break;
        }
        case 'confirmation': {
          if (this.isPositiveResponse(effectiveMessage)) {
            // Создаем запись в CRM
            if (this.crmService && nextState.data.ownerPhone && nextState.data.date && nextState.data.time && nextState.data.doctorId) {
              try {
                const { lastName, firstName, middleName } = this.splitName(nextState.data.ownerName ?? '');
                const normalizedPhone = this.normalizePhone(nextState.data.ownerPhone);
                
                if (!normalizedPhone) {
                  throw new Error('Неверный формат телефона');
                }

                // 1. Найти или создать клиента
                let clientId: number;
                try {
                  const clientSearch = await this.crmService.getClientByPhone(normalizedPhone);
                  if (clientSearch?.data?.clients && clientSearch.data.clients.length > 0) {
                    clientId = parseInt(clientSearch.data.clients[0].id, 10);
                    this.logger.log(`Найден существующий клиент: ${clientId}`);
                  } else {
                    const newClient = await this.crmService.createClient(
                  lastName || 'Не указано',
                  firstName || 'Не указано',
                  middleName || '',
                      normalizedPhone,
                    );
                    // Логируем полный ответ для отладки
                    this.logger.log(`Ответ createClient: ${JSON.stringify(newClient, null, 2)}`);
                    
                    // Пробуем разные варианты структуры ответа
                    // client может быть массивом (как в данном случае) или объектом
                    let clientIdStr: string | number | undefined;
                    if (newClient?.data?.client) {
                      if (Array.isArray(newClient.data.client) && newClient.data.client.length > 0) {
                        clientIdStr = newClient.data.client[0].id;
                      } else if (!Array.isArray(newClient.data.client)) {
                        clientIdStr = newClient.data.client.id;
                      }
                    }
                    // Fallback на другие варианты
                    if (!clientIdStr) {
                      clientIdStr = newClient?.data?.id || newClient?.client?.id || newClient?.id;
                    }
                    
                    if (!clientIdStr) {
                      this.logger.error(`Не удалось извлечь clientId из ответа: ${JSON.stringify(newClient)}`);
                      throw new Error('Не удалось получить ID созданного клиента');
                    }
                    
                    clientId = parseInt(String(clientIdStr), 10);
                    if (isNaN(clientId)) {
                      this.logger.error(`clientId не является числом: ${clientIdStr}`);
                      throw new Error(`Неверный формат clientId: ${clientIdStr}`);
                    }
                    this.logger.log(`Создан новый клиент: ${clientId}`);
                  }
                } catch (error) {
                  this.logger.error(`Ошибка при работе с клиентом: ${error instanceof Error ? error.message : String(error)}`);
                  throw error;
                }

                // 2. Найти или создать питомца
                let patientId: number;
                try {
                  const petName = nextState.data.petName || 'Питомец';
                  // Используем более надежные значения: type_id=2 (кошка), breed_id=2 (беспородная)
                  // Или можно попробовать получить реальные значения из API
                  const petTypeId = 2; // Кошка (обычно type_id=2)
                  const petBreedId = 2; // Беспородная (обычно breed_id=2)
                  
                  this.logger.log(`Создание питомца: owner_id=${clientId}, alias=${petName}, type_id=${petTypeId}, breed_id=${petBreedId}`);
                  
                  const newPet = await this.crmService.createPet(
                    clientId,
                    petName,
                    petTypeId,
                    petBreedId
                  );
                  
                  // Логируем полный ответ для отладки
                  this.logger.log(`Ответ createPet: ${JSON.stringify(newPet, null, 2)}`);
                  
                  // Пробуем разные варианты структуры ответа
                  // pet может быть массивом (как в данном случае) или объектом
                  let patientIdStr: string | number | undefined;
                  if (newPet?.data?.pet) {
                    if (Array.isArray(newPet.data.pet) && newPet.data.pet.length > 0) {
                      patientIdStr = newPet.data.pet[0].id;
                    } else if (!Array.isArray(newPet.data.pet)) {
                      patientIdStr = newPet.data.pet.id;
                    }
                  }
                  // Fallback на другие варианты
                  if (!patientIdStr) {
                    patientIdStr = newPet?.data?.id || newPet?.pet?.id || newPet?.id;
                  }
                  
                  if (!patientIdStr) {
                    this.logger.error(`Не удалось извлечь patientId из ответа: ${JSON.stringify(newPet)}`);
                    throw new Error('Не удалось получить ID созданного питомца');
                  }
                  
                  patientId = parseInt(String(patientIdStr), 10);
                  if (isNaN(patientId)) {
                    this.logger.error(`patientId не является числом: ${patientIdStr}`);
                    throw new Error(`Неверный формат patientId: ${patientIdStr}`);
                  }
                  this.logger.log(`Создан новый питомец: ${patientId}`);
                } catch (error) {
                  this.logger.error(`Ошибка при создании питомца: ${error instanceof Error ? error.message : String(error)}`);
                  // Логируем детали ошибки, если доступны
                  if (error instanceof Error && 'response' in error) {
                    const errorResponse = (error as any).response;
                    this.logger.error(`Детали ошибки создания питомца: ${JSON.stringify(errorResponse, null, 2)}`);
                  }
                  throw error;
                }

                // 3. Формируем данные для записи
                const admissionDate = `${nextState.data.date} ${nextState.data.time}:00`;
                const clinicId = 1; // Всегда используем клинику 1
                const userId = nextState.data.doctorId;
                // Определяем type_id и admission_length
                // Дефолтные значения: type_id=1 (первичный), admission_length=60 минут
                let typeId = 1; // Первичный прием
                let admissionLength = 60; // 60 минут
                
                if (nextState.data.appointmentType === 'secondary') {
                  typeId = 2; // Повторный прием
                  admissionLength = 30; // 30 минут
                } else if (nextState.data.appointmentType === 'vaccination') {
                  typeId = 3; // Прививка
                  admissionLength = 30; // 30 минут
                } else if (nextState.data.appointmentType === 'ultrasound') {
                  typeId = 4; // УЗИ
                  admissionLength = 30; // 30 минут
                } else if (nextState.data.appointmentType === 'analyses') {
                  typeId = 5; // Анализы
                  admissionLength = 15; // 15 минут
                } else if (nextState.data.appointmentType === 'xray') {
                  typeId = 6; // Рентген
                  admissionLength = 30; // 30 минут
                } else if (nextState.data.appointmentType === 'other') {
                  typeId = 1; // Первичный как база для «другое»
                  admissionLength = 60;
                }

                const descriptionText = nextState.data.appointmentType === 'other' && nextState.data.appointmentTypeOther
                  ? `${nextState.data.symptoms || 'Запись через Telegram бота'}. Причина: ${nextState.data.appointmentTypeOther}`
                  : (nextState.data.symptoms || 'Запись через Telegram бота');

                // 4. Создаем запись в CRM
                await this.crmService.createAppointment(
                  typeId,
                  admissionDate,
                  clinicId,
                  clientId,
                  patientId,
                  descriptionText,
                  admissionLength,
                  userId
                );
                
                this.logger.log(`Запись успешно создана в CRM: врач ${userId}, дата ${admissionDate}`);
                responses.push('✅ Запись успешно создана в системе!');
              } catch (error) {
                this.logger.error(`Ошибка при создании записи в CRM: ${error instanceof Error ? error.message : String(error)}`);
                responses.push('⚠️ Заявка сформирована, но произошла ошибка при создании записи в системе. Менеджер свяжется с вами для уточнения деталей.');
              }
            } else {
              // Если не хватает данных для создания записи
              this.logger.warn('Недостаточно данных для создания записи в CRM:', {
                hasCrmService: !!this.crmService,
                hasPhone: !!nextState.data.ownerPhone,
                hasDate: !!nextState.data.date,
                hasTime: !!nextState.data.time,
                hasDoctorId: !!nextState.data.doctorId
              });
            }
            
            responses.push('Заявка сформирована и будет обработана менеджером. Благодарим за обращение!');
            responses.push(this.buildSummary(nextState.data));
            nextState.step = 'completed';
            completed = true;
            break;
          }

          if (this.isNegativeResponse(effectiveMessage)) {
            nextState = this.getRestartState();
            responses.push('Хорошо, начнем заново.');
            responses.push(this.buildIntroMessage());
            break;
          }

          responses.push('Ответьте, пожалуйста, «да» для подтверждения или «нет», чтобы начать заново.');
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

  private getRestartState(): AppointmentState {
    return {
      step: 'symptoms',
      data: {},
    };
  }

  private buildIntroMessage(): string {
    return [
      '🐾 Создание записи на прием',
      '',
      'Расскажите, пожалуйста, какие симптомы у питомца. Это будет первым шагом.',
      'Вы всегда можете отправить «/exit», чтобы отменить процесс.',
    ].join('\n');
  }

  private buildSymptomsStepResponse(symptoms: string): string[] {
    return [
      `✅ Симптомы: ${symptoms}`,
      'Теперь укажите имя и вид питомца (например: «Барсик, кот»).',
    ];
  }

  private buildPetNameStepResponse(petName: string): string[] {
    return [
      `✅ Питомец: ${petName}`,
      'Введите породу питомца (например: «британская», «корги»).',
    ];
  }

  private buildPetBreedStepResponse(state: AppointmentState): string[] {
    const petName = state.data.petName ?? 'питомец';
    const petBreed = state.data.petBreed ?? '';
    return [
      `✅ Питомец: ${petName}`,
      `✅ Порода: ${petBreed}`,
      'Укажите номер телефона владельца в формате +7XXXXXXXXXX.',
    ];
  }

  private buildOwnerPhoneStepResponse(phone: string): string[] {
    return [
      `✅ Телефон владельца: ${phone}`,
      'Введите ФИО владельца (например: «Иванов Иван Иванович»).',
    ];
  }

  private buildOwnerNameStepResponse(ownerName: string): string[] {
    return [
      `✅ ФИО: ${ownerName}`,
      'Выберите тип приема: 1 — первичный, 2 — вторичный, 3 — прививка, 4 — УЗИ, 5 — анализы, 6 — рентген, 7 — другое (произвольная причина).',
    ];
  }

  private buildAppointmentTypeStepResponse(type: AppointmentType): string[] {
    return [
      `✅ Тип приема: ${this.appointmentTypeLabels[type]}`,
    ];
  }

  private buildDateStepResponse(date: string): string[] {
    return [
      `✅ Дата приема: ${date}`,
      'Введите желаемое время приема в формате ЧЧ:ММ.',
    ];
  }

  private buildTimeStepResponse(time: string): string[] {
    return [
      `✅ Время приема: ${time}`,
      'Укажите предпочитаемую клинику (название или адрес).',
    ];
  }


  // Вспомогательная функция для извлечения должности
  private getPositionText(doctor: any): string {
    if (doctor.position) {
      if (typeof doctor.position === 'string') {
        return doctor.position;
      } else if (typeof doctor.position === 'object' && doctor.position !== null) {
        return doctor.position.title || doctor.position.name || '';
      }
    } else if (doctor.position_data) {
      if (typeof doctor.position_data === 'string') {
        return doctor.position_data;
      } else if (typeof doctor.position_data === 'object' && doctor.position_data !== null) {
        return doctor.position_data.title || doctor.position_data.name || '';
      }
    }
    return '';
  }

  // Фильтруем администраторов из списка врачей
  private filterNonAdminDoctors(doctors: any[]): any[] {
    return doctors.filter((doctor) => {
      const positionText = this.getPositionText(doctor).toLowerCase();
      // Исключаем администраторов (проверяем различные варианты написания)
      return !positionText.includes('администратор') && 
             !positionText.includes('administrator') &&
             positionText.trim() !== '';
    });
  }

  private async buildDoctorsList(): Promise<string[]> {
    if (!this.doctorService) {
      return [];
    }

    try {
      const doctors = await this.doctorService.getDoctorsWithAppointment();
      
      if (!Array.isArray(doctors) || doctors.length === 0) {
        return [];
      }

      // Фильтруем администраторов
      const filteredDoctors = this.filterNonAdminDoctors(doctors);

      if (filteredDoctors.length === 0) {
        return [];
      }

      const lines: string[] = [
        '👨‍⚕️ Выберите врача (введите номер):',
        '',
      ];

      filteredDoctors.forEach((doctor, index) => {
        // Формируем полное ФИО врача
        let doctorName = '';
        if (doctor.full_name) {
          doctorName = doctor.full_name;
        } else if (doctor.last_name || doctor.first_name) {
          // Собираем ФИО из отдельных полей
          const parts: string[] = [];
          if (doctor.last_name) parts.push(doctor.last_name);
          if (doctor.first_name) parts.push(doctor.first_name);
          if (doctor.middle_name) parts.push(doctor.middle_name);
          doctorName = parts.join(' ').trim();
        }
        
        // Если ФИО не найдено, используем другие варианты
        if (!doctorName) {
          doctorName = doctor.name || `Врач #${index + 1}`;
        }
        
        // Извлекаем название должности
        const positionText = this.getPositionText(doctor);
        
        let line = `${index + 1}. ${doctorName}`;
        if (positionText) {
          line += ` (${positionText})`;
        }
        // Не показываем количество окон из CRM, так как это записи, а не доступные окна из правил
        lines.push(line);
      });

      lines.push('');
      lines.push('Или введите ФИО врача или «авто» для автоматического подбора.');

      // Объединяем все в одно сообщение
      return [lines.join('\n')];
    } catch (error) {
      this.logger.error(`Ошибка при построении списка врачей: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private buildDoctorStepResponse(state: AppointmentState): string[] {
    const doctorInput = state.data.doctor ?? '';
    const doctorLabel = doctorInput.toLowerCase() === 'авто' ? 'Автоматический подбор' : doctorInput;

    const messages: string[] = [];
    
    if (doctorLabel) {
      messages.push(`✅ Врач: ${doctorLabel}`);
    } else {
      messages.push('Врач будет подобран автоматически.');
    }

    // Показываем сводку только если есть дата и время
    if (state.data.date && state.data.time) {
      messages.push(this.buildSummary(state.data));
      messages.push('Если данные верны, ответьте «да» для подтверждения или «нет», чтобы начать заново.');
    }

    return messages;
  }

  private buildSummary(data: AppointmentStateData): string {
    const lines: string[] = ['📋 Сводка заявки:'];

    if (data.petName) {
      const breedPart = data.petBreed ? ` (${data.petBreed})` : '';
      lines.push(`🐾 Питомец: ${data.petName}${breedPart}`);
    }

    if (data.symptoms) {
      lines.push(`⚕️ Симптомы: ${data.symptoms}`);
    }

    if (data.ownerName) {
      lines.push(`👤 Владелец: ${data.ownerName}`);
    }

    if (data.ownerPhone) {
      lines.push(`📞 Телефон: ${data.ownerPhone}`);
    }

    if (data.appointmentType) {
      const label = data.appointmentType === 'other' && data.appointmentTypeOther
        ? `Другое: ${data.appointmentTypeOther}`
        : this.appointmentTypeLabels[data.appointmentType];
      lines.push(`🩺 Тип приема: ${label}`);
    }

    if (data.date && data.time) {
      lines.push(`📅 Дата и время: ${data.date} ${data.time}`);
    } else if (data.date) {
      lines.push(`📅 Дата: ${data.date}`);
    }

    if (data.clinic) {
      lines.push(`🏥 Клиника: ${data.clinic}`);
    }

    if (data.doctor) {
      const doctorLabel = data.doctor.toLowerCase() === 'авто' ? 'Автоматический подбор' : data.doctor;
      lines.push(`👨‍⚕️ Врач: ${doctorLabel}`);
    }

    return lines.join('\n');
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

  private resolveAppointmentType(input: string): AppointmentType | null {
    const normalized = input.toLowerCase().replace(/\s+/g, '');

    if (['1', 'primary', 'первичный', 'первичныйприем'].includes(normalized)) {
      return 'primary';
    }

    if (['2', 'secondary', 'вторичный', 'вторичныйприем'].includes(normalized)) {
      return 'secondary';
    }

    if (['3', 'vaccination', 'прививка', 'прививкаприем'].includes(normalized)) {
      return 'vaccination';
    }

    if (['4', 'ultrasound', 'узи', 'ультразвук', 'ультразвуковое'].includes(normalized)) {
      return 'ultrasound';
    }

    if (['5', 'analyses', 'анализы', 'анализ', 'анализкрови'].includes(normalized)) {
      return 'analyses';
    }

    if (['6', 'xray', 'рентген', 'рентгенография', 'рентгеноскопия'].includes(normalized)) {
      return 'xray';
    }

    if (['7', 'other', 'другое', 'другая', 'произвольная', 'произвольный', 'иное', 'своя', 'иная'].includes(normalized)) {
      return 'other';
    }

    return null;
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

  /** Валидация даты: формат + не в прошлом + не дальше maxMonthsAhead месяцев */
  private getDateValidationError(value: string): string | null {
    if (!this.isValidDate(value)) {
      return 'Введите дату в формате ГГГГ-ММ-ДД (например, 2025-06-15).';
    }
    const match = value.match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
    if (!match) return 'Неверный формат даты.';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const chosen = new Date(Date.UTC(year, month - 1, day));
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (chosen.getTime() < todayStart.getTime()) {
      return 'Дата не должна быть в прошлом. Введите актуальную или будущую дату в формате ГГГГ-ММ-ДД.';
    }
    const maxDate = new Date(today);
    maxDate.setUTCMonth(maxDate.getUTCMonth() + this.maxMonthsAhead);
    if (chosen.getTime() > maxDate.getTime()) {
      return `Запись возможна не более чем на ${this.maxMonthsAhead} месяцев вперёд. Выберите более близкую дату.`;
    }
    return null;
  }

  private isValidTime(value: string): boolean {
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return Boolean(match);
  }

  /** Валидация времени: формат + в рабочих часах (08:00–20:00) */
  private getTimeValidationError(value: string): string | null {
    if (!this.isValidTime(value)) {
      return 'Введите время в формате ЧЧ:ММ (например, 14:30). Приём возможен с 08:00 до 20:00.';
    }
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const minutes = hour * 60 + minute;
    const startMinutes = this.workTimeStart.hour * 60 + this.workTimeStart.minute;
    const endMinutes = this.workTimeEnd.hour * 60 + this.workTimeEnd.minute;
    if (minutes < startMinutes) {
      return `Время приёма — с ${String(this.workTimeStart.hour).padStart(2, '0')}:${String(this.workTimeStart.minute).padStart(2, '0')} до ${String(this.workTimeEnd.hour).padStart(2, '0')}:${String(this.workTimeEnd.minute).padStart(2, '0')}. Введите время не раньше 08:00.`;
    }
    if (minutes >= endMinutes) {
      return `Время приёма — с 08:00 до 20:00. Введите время до 20:00.`;
    }
    return null;
  }

  private isPositiveResponse(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return ['да', 'yes', 'ок', 'окей', 'подтверждаю', 'confirm'].includes(normalized);
  }

  private isNegativeResponse(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return ['нет', 'no', 'cancel', 'отмена', 'заново'].includes(normalized);
  }
  private splitName(fullName: string): { lastName: string; firstName: string; middleName: string } {
    const parts = (fullName || '').trim().split(/\s+/);
    const [lastName = '', firstName = '', middleName = ''] = parts;
    return { lastName, firstName, middleName };
  }

  private parseAvailableSlots(slotsText: string): Array<{ date: string; time: string; index: number }> {
    const slots: Array<{ date: string; time: string; index: number }> = [];
    
    // Проверяем, есть ли ошибка в тексте
    if (slotsText.includes('не найден') || slotsText.includes('недоступно') || slotsText.includes('нет доступных')) {
      return slots;
    }
    
    // Парсим текст вида:
    // 📅 пн, 8 декабря (2025-12-08):
    //    • 09:00
    //    • 10:00
    const lines = slotsText.split('\n');
    let currentDate = '';
    let slotIndex = 1;
    
    for (const line of lines) {
      // Ищем строку с датой
      const dateMatch = line.match(/\((\d{4}-\d{2}-\d{2})\)/);
      if (dateMatch) {
        currentDate = dateMatch[1];
        continue;
      }
      
      // Ищем строку со временем (формат: "   • 09:00" или "   • HH:MM")
      const timeMatch = line.match(/•\s*(\d{2}:\d{2})/);
      if (timeMatch && currentDate) {
        slots.push({
          date: currentDate,
          time: timeMatch[1],
          index: slotIndex++
        });
      }
    }
    
    return slots;
  }

  private buildSlotsList(slots: Array<{ date: string; time: string; index: number }>): string[] {
    if (slots.length === 0) {
      return ['Нет доступных окон для записи.'];
    }

    const lines: string[] = [
      '📅 Выберите доступное окно (введите номер):',
      '',
    ];

    // Группируем по датам
    const slotsByDate: Record<string, Array<{ time: string; index: number }>> = {};
    slots.forEach(slot => {
      if (!slotsByDate[slot.date]) {
        slotsByDate[slot.date] = [];
      }
      slotsByDate[slot.date].push({ time: slot.time, index: slot.index });
    });

    // Выводим сгруппированные по датам
    Object.entries(slotsByDate).sort().forEach(([date, times]) => {
      const dateObj = new Date(date);
      const dateStr = dateObj.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
      lines.push(`📅 ${dateStr} (${date}):`);
      
      times.sort((a, b) => a.time.localeCompare(b.time)).forEach(({ time, index }) => {
        lines.push(`   ${index}. ${time}`);
      });
      
      lines.push('');
    });

    return [lines.join('\n')];
  }

}

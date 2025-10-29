import { Injectable } from '@nestjs/common';
import { Ctx, Scene, SceneEnter, On, Command, Hears } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { SceneContext } from 'telegraf/typings/scenes';

import { addCancelButton, handleCancelButton } from '../helpers/scene.helper';
import { PaginationHelper, PaginationButton } from '../helpers/pagination.helper';
import { DateTimeHelper, DateSlot, TimeSlot } from '../helpers/date-time.helper';
import { CrmService } from '../../crm/services/crm.service';
import { ClinicService } from '../../crm/services/clinic.service';
import { PetService } from '../../crm/services/pet.service';
import { ClientService } from '../../crm/services/client.service';

interface AppointmentCreateSession {
  step: 'symptoms' | 'pet_name' | 'pet_breed' | 'owner_phone' | 'owner_name' | 'appointment_type' | 'date' | 'time' | 'clinic' | 'doctor';
  symptoms?: string;
  petName?: string;
  petBreed?: string;
  ownerPhone?: string;
  ownerName?: string;
  appointmentType?: 'primary' | 'secondary' | 'vaccination';
  date?: string;
  time?: string;
  clinicId?: string;
  doctorId?: string;
  currentDatePage?: number;
  currentTimePage?: number;
  needToCreatePet?: boolean;
  needToCreateClient?: boolean;
}

@Injectable()
@Scene('create_appointment')
export class CreateAppointmentScene {
  constructor(
    private readonly crmService: CrmService,
    private readonly clinicService: ClinicService,
    private readonly petService: PetService,
    private readonly clientService: ClientService
  ) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: SceneContext) {
    if (!ctx.session) {
      ctx.session = {};
    }
    
    if (!ctx.session['createAppointment']) {
      ctx.session['createAppointment'] = {} as AppointmentCreateSession;
    }
    
    const session = ctx.session['createAppointment'] as AppointmentCreateSession;
    session.step = 'symptoms';
    
    await ctx.replyWithHTML(`
🐾 <b>Создание записи на прием</b>

Давайте создадим запись на прием для вашего питомца!

<b>Шаг 1/9: Описание недуга</b>

Опишите подробно недуг или симптомы питомца. Это поможет подобрать подходящего врача.`, 
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отменить', 'cancel_appointment')]
      ])
    );
  }

  @On('text')
  async onText(@Ctx() ctx: SceneContext) {
    if (!ctx.session) {
      ctx.session = {};
    }
    
    if (!ctx.session['createAppointment']) {
      ctx.session['createAppointment'] = {} as AppointmentCreateSession;
    }
    
    const session = ctx.session['createAppointment'] as AppointmentCreateSession;
    const text = (ctx.message as any).text;
    
    if(text === '/exit') {
      await ctx.reply('Выход из создания записи');
      await ctx.scene.leave();
      return;
    }

    switch (session.step) {
      case 'symptoms':
        session.symptoms = text;
        session.step = 'pet_name';
        await ctx.replyWithHTML(`
✅ <b>Симптомы:</b> ${text}

<b>Шаг 2/9: Какой питомец?</b>

Введите имя и вид питомца (например: "Барсик, кот" или "Рекс, собака")`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('❌ Отменить', 'cancel_appointment')]
          ])
        );
        break;

      case 'pet_name':
        session.petName = text;
        session.step = 'pet_breed';
        await ctx.replyWithHTML(`
✅ <b>Питомец:</b> ${text}

<b>Шаг 3/10: Порода питомца</b>

Введите породу питомца (например: "британская", "корги", "персидская", "метис")`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('❌ Отменить', 'cancel_appointment')]
          ])
        );
        break;

      case 'pet_breed':
        session.petBreed = text;
        session.step = 'owner_phone';
        await ctx.replyWithHTML(`
✅ <b>Питомец:</b> ${session.petName}
✅ <b>Порода:</b> ${text}

<b>Шаг 4/10: Номер телефона владельца</b>

Введите номер телефона в формате +7XXXXXXXXXX`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('❌ Отменить', 'cancel_appointment')]
          ])
        );
        break;

      case 'owner_phone':
        session.ownerPhone = text;
        session.step = 'owner_name';
        await ctx.replyWithHTML(`
✅ <b>Телефон:</b> ${text}

<b>Шаг 5/10: ФИО владельца</b>

Введите ваше полное имя`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('❌ Отменить', 'cancel_appointment')]
          ])
        );
        break;

      case 'owner_name':
        session.ownerName = text;
        session.step = 'appointment_type';
        await ctx.replyWithHTML(`
✅ <b>ФИО:</b> ${text}

<b>Шаг 6/10: Тип приема</b>

Выберите тип приема:`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('🩺 Первичный прием', 'appointment_primary')],
            [Markup.button.callback('🔄 Вторичный прием', 'appointment_secondary')],
            [Markup.button.callback('💉 На прививку', 'appointment_vaccination')],
            [Markup.button.callback('❌ Отменить', 'cancel_appointment')]
          ])
        );
        break;
    }
  }

  @On('callback_query')
  async onCallbackQuery(@Ctx() ctx: SceneContext) {
    const callbackData = (ctx.callbackQuery as any).data;
    
    if (!ctx.session) {
      ctx.session = {};
    }
    
    if (!ctx.session['createAppointment']) {
      ctx.session['createAppointment'] = {} as AppointmentCreateSession;
    }
    
    const session = ctx.session['createAppointment'] as AppointmentCreateSession;
    
    if (callbackData === 'cancel_appointment') {
      await ctx.reply('❌ Создание записи отменено');
      await ctx.scene.leave();
      return;
    }

    if (callbackData.startsWith('appointment_')) {
      const type = callbackData.replace('appointment_', '') as 'primary' | 'secondary' | 'vaccination';
      session.appointmentType = type;
      session.step = 'date';
      
      const typeNames = {
        primary: 'Первичный прием',
        secondary: 'Вторичный прием', 
        vaccination: 'На прививку'
      };

      await this.showDateSelection(ctx, session);
      return;
    }

    // Обработка пагинации дат
    if (PaginationHelper.isPageCallback(callbackData)) {
      const pageNumber = PaginationHelper.parsePageCallback(callbackData);
      if (pageNumber) {
        session.currentDatePage = pageNumber;
        await this.showDateSelection(ctx, session);
        return;
      }
    }

    // Обработка выбора даты
    if (DateTimeHelper.isDateCallback(callbackData)) {
      const selectedDate = DateTimeHelper.parseDateCallback(callbackData);
      if (selectedDate) {
        session.date = selectedDate;
        session.step = 'time';
        await this.showTimeSelection(ctx, session);
        return;
      }
    }

    // Обработка пагинации времени
    if (callbackData.startsWith('time_page_')) {
      const pageNumber = parseInt(callbackData.replace('time_page_', ''), 10);
      session.currentTimePage = pageNumber;
      await this.showTimeSelection(ctx, session);
      return;
    }

    // Обработка выбора времени
    if (DateTimeHelper.isTimeCallback(callbackData)) {
      const selectedTime = DateTimeHelper.parseTimeCallback(callbackData);
      if (selectedTime) {
        session.time = selectedTime;
        session.step = 'clinic';
        await this.showClinicSelection(ctx, session);
        return;
      }
    }

    if (callbackData.startsWith('clinic_')) {
      session.clinicId = callbackData;
      await this.askAboutDoctor(ctx, session);
      return;
    }

    if (callbackData.startsWith('doctor_')) {
      if (callbackData === 'doctor_auto') {
        // Автоматический подбор врача на основе симптомов
        session.doctorId = 'auto_selected';
        await this.selectDoctorBySymptoms(ctx, session);
      } else if (callbackData === 'doctor_manual') {
        // Ручной выбор врача
        session.doctorId = 'manual_selection';
        await this.showManualDoctorSelection(ctx, session);
      }
      return;
    }

    // Обработка выбора конкретного врача
    if (callbackData.startsWith('select_doctor_')) {
      const doctorId = callbackData.replace('select_doctor_', '');
      session.doctorId = doctorId;
      await this.completeAppointment(ctx, session);
      return;
    }

    // Обработка подтверждения записи
    if (callbackData === 'confirm_appointment') {
      await this.completeAppointment(ctx, session);
      return;
    }

    // Обработка повторной попытки создания записи
    if (callbackData === 'retry_appointment') {
      await ctx.reply('🔄 Начинаем создание записи заново...');
      await this.onSceneEnter(ctx);
      return;
    }
  }

  /**
   * Показывает выбор даты с пагинацией
   */
  private async showDateSelection(ctx: SceneContext, session: AppointmentCreateSession) {
    try {
      const availableDates = await this.crmService.getAvailableDates(14, parseInt(session.clinicId!));
      const dateSlots: DateSlot[] = availableDates.map(dateInfo => ({
        date: dateInfo.date,
        displayName: DateTimeHelper.formatDateDisplay(new Date(dateInfo.date)),
        availableSlots: 9 - dateInfo.occupiedSlots.length, // 9 часов работы - занятые слоты
        totalSlots: 9
      }));

      const dateButtons = DateTimeHelper.createDateButtons(dateSlots);
      const currentPage = session.currentDatePage || 1;

      const typeNames = {
        primary: 'Первичный прием',
        secondary: 'Вторичный прием', 
        vaccination: 'На прививку'
      };

      const message = `
✅ <b>Тип приема:</b> ${typeNames[session.appointmentType!]}

<b>Шаг 7/10: Дата приема</b>

Выберите удобную дату:`;

      await PaginationHelper.sendPaginatedMessage(
        ctx,
        message,
        dateButtons,
        currentPage,
        {
          itemsPerPage: 5,
          showPageNumbers: true,
          showNavigation: true,
          cancelButtonText: '❌ Отменить запись',
          cancelCallbackData: 'cancel_appointment'
        }
      );
    } catch (error) {
      console.error('Ошибка при получении доступных дат:', error);
      await ctx.reply('❌ Ошибка при загрузке доступных дат. Попробуйте позже.');
    }
  }

  /**
   * Показывает выбор времени с пагинацией
   */
  private async showTimeSelection(ctx: SceneContext, session: AppointmentCreateSession) {
    try {
      const occupiedSlots = await this.crmService.getOccupiedTimeSlots(session.date!);
      const timeSlots = DateTimeHelper.generateTimeSlots(session.date!, occupiedSlots);
      const timeButtons = DateTimeHelper.createTimeButtons(timeSlots);
      const currentPage = session.currentTimePage || 1;

      const dateDisplay = DateTimeHelper.formatDateDisplay(new Date(session.date!));

      const message = `
✅ <b>Дата:</b> ${dateDisplay}

<b>Шаг 8/10: Время приема</b>

Выберите удобное время:`;

      await PaginationHelper.sendPaginatedMessage(
        ctx,
        message,
        timeButtons,
        currentPage,
        {
          itemsPerPage: 6,
          showPageNumbers: true,
          showNavigation: true,
          cancelButtonText: '❌ Отменить запись',
          cancelCallbackData: 'cancel_appointment'
        }
      );
    } catch (error) {
      console.error('Ошибка при получении доступного времени:', error);
      await ctx.reply('❌ Ошибка при загрузке доступного времени. Попробуйте позже.');
    }
  }

  /**
   * Показывает выбор клиники
   */
  private async showClinicSelection(ctx: SceneContext, session: AppointmentCreateSession) {
    const dateDisplay = DateTimeHelper.formatDateDisplay(new Date(session.date!));
    const timeDisplay = session.time;

    const clinics = await this.clinicService.getClinics();
    const buttons: any[][] = [];  
    for(const clinic of clinics.data.clinics) {
      buttons.push([Markup.button.callback(`🏥 ${clinic.title}`, `clinic_${clinic.id}`)]);
    }
    buttons.push([Markup.button.callback('❌ Отменить', 'cancel_appointment')]);

    await ctx.replyWithHTML(`✅ <b>Дата и время:</b> ${dateDisplay} в ${timeDisplay}
<b>Шаг 9/10: Выбор клиники</b>
Выберите клинику:`, Markup.inlineKeyboard(buttons));
  }

  private async askAboutDoctor(ctx: SceneContext, session: AppointmentCreateSession) {
    await ctx.replyWithHTML(`
✅ <b>Клиника:</b> ${session.clinicId}

<b>Шаг 10/10: Выбор врача</b>

На основе описанных симптомов "${session.symptoms}" мы подберем подходящего врача.`, 
      Markup.inlineKeyboard([
        [Markup.button.callback('🤖 Автоматический подбор врача', 'doctor_auto')],
        [Markup.button.callback('👨‍⚕️ Выбрать врача вручную', 'doctor_manual')],
        [Markup.button.callback('❌ Отменить', 'cancel_appointment')]
      ])
    );
  }

  /**
   * Автоматический подбор врача на основе симптомов
   */
  private async selectDoctorBySymptoms(ctx: SceneContext, session: AppointmentCreateSession) {
    try {
      // Получаем список врачей
      const doctors = await this.crmService.getDoctors();
      
      // Здесь должна быть интеграция с AI для выбора врача на основе симптомов
      // Пока что выбираем первого доступного врача
      const selectedDoctor = doctors.data.userPosition[0];
      
      session.doctorId = selectedDoctor.id.toString();
      
      await ctx.replyWithHTML(`
✅ <b>Врач выбран автоматически:</b> ${selectedDoctor.title}

На основе симптомов "${session.symptoms}" рекомендован врач: ${selectedDoctor.title}
Длительность приема: ${selectedDoctor.admission_length}

Завершаем создание записи...`, 
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Подтвердить запись', 'confirm_appointment')],
          [Markup.button.callback('❌ Отменить', 'cancel_appointment')]
        ])
      );
    } catch (error) {
      console.error('Ошибка при выборе врача:', error);
      await ctx.reply('❌ Ошибка при подборе врача. Попробуйте выбрать врача вручную.');
      await this.showManualDoctorSelection(ctx, session);
    }
  }

  /**
   * Ручной выбор врача
   */
  private async showManualDoctorSelection(ctx: SceneContext, session: AppointmentCreateSession) {
    try {
      const doctors = await this.crmService.getDoctors();
      const buttons: any[][] = [];
      
      for (const doctor of doctors.data.userPosition) {
        buttons.push([Markup.button.callback(
          `👨‍⚕️ ${doctor.title} (${doctor.admission_length})`, 
          `select_doctor_${doctor.id}`
        )]);
      }
      
      buttons.push([Markup.button.callback('❌ Отменить', 'cancel_appointment')]);

      await ctx.replyWithHTML(`
✅ <b>Выбор врача вручную</b>

Выберите подходящего врача:`, 
        Markup.inlineKeyboard(buttons)
      );
    } catch (error) {
      console.error('Ошибка при получении списка врачей:', error);
      await ctx.reply('❌ Ошибка при загрузке списка врачей. Попробуйте позже.');
    }
  }

  private async completeAppointment(ctx: SceneContext, session: AppointmentCreateSession) {
    const dateDisplay = DateTimeHelper.formatDateDisplay(new Date(session.date!));
    
    try {
      // Создаем запись в CRM системе
      const appointmentResult = await this.createAppointmentInCRM(session);
      
      if (appointmentResult.success) {
        const petInfo = session.needToCreatePet 
          ? `🐾 <b>Питомец:</b> ${session.petName} (${session.petBreed}) - <i>создан автоматически</i>`
          : `🐾 <b>Питомец:</b> ${session.petName}`;

        const clientInfo = session.needToCreateClient
          ? `👤 <b>Владелец:</b> ${session.ownerName} - <i>создан автоматически</i>`
          : `👤 <b>Владелец:</b> ${session.ownerName}`;

        await ctx.replyWithHTML(`
🎉 <b>Запись на прием создана!</b>

📋 <b>Детали записи:</b>
${petInfo}
📞 <b>Телефон:</b> ${session.ownerPhone}
${clientInfo}
🩺 <b>Тип приема:</b> ${session.appointmentType}
📅 <b>Дата:</b> ${dateDisplay}
🕐 <b>Время:</b> ${session.time}
🏥 <b>Клиника:</b> ${session.clinicId}
👨‍⚕️ <b>Врач:</b> ${session.doctorId}
📝 <b>Симптомы:</b> ${session.symptoms}

✅ <b>ID записи:</b> ${appointmentResult.data?.id || 'Не указан'}

Запись успешно создана! С вами свяжутся для подтверждения.`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Главное меню', 'main_menu')]
          ])
        );
      } else {
        await ctx.replyWithHTML(`
❌ <b>Ошибка при создании записи</b>

${appointmentResult.message || 'Неизвестная ошибка'}

Попробуйте создать запись заново.`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Попробовать снова', 'retry_appointment')],
            [Markup.button.callback('🏠 Главное меню', 'main_menu')]
          ])
        );
      }
    } catch (error) {
      console.error('Ошибка при создании записи:', error);
      await ctx.replyWithHTML(`
❌ <b>Ошибка при создании записи</b>

Произошла техническая ошибка. Попробуйте позже или обратитесь в поддержку.`, 
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Попробовать снова', 'retry_appointment')],
          [Markup.button.callback('🏠 Главное меню', 'main_menu')]
        ])
      );
    }
    
    await ctx.scene.leave();
  }

  /**
   * Создает запись в CRM системе
   */
  private async createAppointmentInCRM(session: AppointmentCreateSession) {
    try {
      // Маппинг типов приемов на type_id
      const typeMapping = {
        'primary': 1,      // Первичный прием
        'secondary': 2,    // Вторичный прием  
        'vaccination': 3   // Прививка
      };

      const clientPhone = session.ownerPhone?.replace(/\D/g, '');

      const client = await this.crmService.getClientByPhone(String(clientPhone));

      let clientId: number;
      let clientData: any;

      if(!client.data || !client.data.client || client.data.client.length === 0) {
        // Создаем клиента, если его нет в системе
        try {
          // Разбиваем ФИО на части
          const nameParts = session.ownerName!.split(' ');
          const lastName = nameParts[0] || '';
          const firstName = nameParts[1] || '';
          const middleName = nameParts[2] || '';

          const createdClient = await this.clientService.createClient(
            lastName,
            firstName,
            middleName,
            session.ownerPhone!
          );

          console.log('Created client response:', JSON.stringify(createdClient, null, 2));

          // Проверяем различные варианты структуры ответа
          if (createdClient.success && createdClient.data?.client_id) {
            clientId = createdClient.data.client_id;
            clientData = { client_id: clientId, pets: [] };
            session.needToCreateClient = true;
          } else if (createdClient.client_id) {
            // Если client_id находится в корне ответа
            clientId = createdClient.client_id;
            clientData = { client_id: clientId, pets: [] };
            session.needToCreateClient = true;
          } else if (createdClient.data?.client_id) {
            // Если client_id в data без поля success
            clientId = createdClient.data.client_id;
            clientData = { client_id: clientId, pets: [] };
            session.needToCreateClient = true;
          } else if (createdClient.message && createdClient.message.includes('Created')) {
            // Если клиент создан (сообщение "Record(s) Created"), но нет client_id в ответе
            // Получаем клиента по телефону, чтобы узнать его ID
            try {
              const clientPhone = session.ownerPhone!.replace(/\D/g, '');
              const foundClient = await this.crmService.getClientByPhone(clientPhone);
              
              if (foundClient.data && foundClient.data.client && foundClient.data.client.length > 0) {
                clientData = foundClient.data.client[0];
                clientId = clientData.client_id || clientData.id;
                session.needToCreateClient = true;
              } else {
                return {
                  success: false,
                  message: 'Клиент создан, но не удалось получить его ID'
                };
              }
            } catch (error) {
              console.error('Ошибка при получении созданного клиента:', error);
              return {
                success: false,
                message: 'Клиент создан, но произошла ошибка при получении его данных'
              };
            }
          } else {
            return {
              success: false,
              message: `Ошибка при создании клиента: ${createdClient.message || JSON.stringify(createdClient)}`
            };
          }

          // Финальная проверка, что clientId определен
          if (!clientId || isNaN(clientId)) {
            return {
              success: false,
              message: 'Не удалось определить ID созданного клиента'
            };
          }
        } catch (error) {
          console.error('Ошибка при создании клиента:', error);
          return {
            success: false,
            message: `Ошибка при создании клиента в системе: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
          };
        }
      } else {
        clientData = client.data.client[0];
        clientId = clientData.client_id;
      }

      let petId: number;
      
      if(!clientData.pets || clientData.pets.length === 0) {
        // Создаем питомца, если у клиента нет питомцев
        try {
          const createdPet = await this.petService.createPetg(
            clientId,
            session.petName!,
            1, // type_id по умолчанию (можно улучшить логику определения типа)
            session.petBreed!
          );
          
          console.log('Created pet response:', JSON.stringify(createdPet, null, 2));
          
          // Проверяем различные варианты структуры ответа
          if (createdPet.success && createdPet.data?.pet_id) {
            petId = createdPet.data.pet_id;
            session.needToCreatePet = true;
          } else if (createdPet.pet_id) {
            petId = createdPet.pet_id;
            session.needToCreatePet = true;
          } else if (createdPet.data?.pet_id) {
            petId = createdPet.data.pet_id;
            session.needToCreatePet = true;
          } else if (createdPet.message && createdPet.message.includes('Created')) {
            // Если питомец создан, но нет pet_id в ответе - получаем данные клиента с питомцами
            try {
              const clientPhone = session.ownerPhone!.replace(/\D/g, '');
              const foundClient = await this.crmService.getClientByPhone(clientPhone);
              
              if (foundClient.data && foundClient.data.client && foundClient.data.client.length > 0) {
                const updatedClientData = foundClient.data.client[0];
                if (updatedClientData.pets && updatedClientData.pets.length > 0) {
                  const newPet = updatedClientData.pets.find((p: any) => p.alias === session.petName);
                  if (newPet && (newPet.pet_id || newPet.id)) {
                    petId = newPet.pet_id || newPet.id;
                    session.needToCreatePet = true;
                  } else {
                    return {
                      success: false,
                      message: 'Питомец создан, но не удалось получить его ID'
                    };
                  }
                } else {
                  return {
                    success: false,
                    message: 'Питомец создан, но не найден в списке питомцев клиента'
                  };
                }
              } else {
                return {
                  success: false,
                  message: 'Питомец создан, но не удалось получить данные клиента'
                };
              }
            } catch (error) {
              console.error('Ошибка при получении созданного питомца:', error);
              return {
                success: false,
                message: 'Питомец создан, но произошла ошибка при получении его данных'
              };
            }
          } else {
            return {
              success: false,
              message: `Ошибка при создании питомца: ${createdPet.message || JSON.stringify(createdPet)}`
            };
          }
          
          if (!petId || isNaN(petId)) {
            return {
              success: false,
              message: 'Не удалось определить ID созданного питомца'
            };
          }
        } catch (error) {
          console.error('Ошибка при создании питомца:', error);
          return {
            success: false,
            message: `Ошибка при создании питомца в системе: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
          };
        }
      } else {
        const pet = clientData.pets.find(pet => pet.alias === session.petName);
        if(!pet) {
          // Создаем питомца, если он не найден у клиента
          try {
            const createdPet = await this.petService.createPetg(
              clientId,
              session.petName!,
              1, // type_id по умолчанию
              session.petBreed!
            );
            
            console.log('Created pet response:', JSON.stringify(createdPet, null, 2));
            
            // Проверяем различные варианты структуры ответа
            if (createdPet.success && createdPet.data?.pet_id) {
              petId = createdPet.data.pet_id;
              session.needToCreatePet = true;
            } else if (createdPet.pet_id) {
              petId = createdPet.pet_id;
              session.needToCreatePet = true;
            } else if (createdPet.data?.pet_id) {
              petId = createdPet.data.pet_id;
              session.needToCreatePet = true;
            } else if (createdPet.message && createdPet.message.includes('Created')) {
              // Если питомец создан, но нет pet_id в ответе - получаем данные клиента с питомцами
              try {
                const clientPhone = session.ownerPhone!.replace(/\D/g, '');
                const foundClient = await this.crmService.getClientByPhone(clientPhone);
                
                if (foundClient.data && foundClient.data.client && foundClient.data.client.length > 0) {
                  const updatedClientData = foundClient.data.client[0];
                  if (updatedClientData.pets && updatedClientData.pets.length > 0) {
                    const newPet = updatedClientData.pets.find((p: any) => p.alias === session.petName);
                    if (newPet && (newPet.pet_id || newPet.id)) {
                      petId = newPet.pet_id || newPet.id;
                      session.needToCreatePet = true;
                    } else {
                      return {
                        success: false,
                        message: 'Питомец создан, но не удалось получить его ID'
                      };
                    }
                  } else {
                    return {
                      success: false,
                      message: 'Питомец создан, но не найден в списке питомцев клиента'
                    };
                  }
                } else {
                  return {
                    success: false,
                    message: 'Питомец создан, но не удалось получить данные клиента'
                  };
                }
              } catch (error) {
                console.error('Ошибка при получении созданного питомца:', error);
                return {
                  success: false,
                  message: 'Питомец создан, но произошла ошибка при получении его данных'
                };
              }
            } else {
              return {
                success: false,
                message: `Ошибка при создании питомца: ${createdPet.message || JSON.stringify(createdPet)}`
              };
            }
            
            if (!petId || isNaN(petId)) {
              return {
                success: false,
                message: 'Не удалось определить ID созданного питомца'
              };
            }
          } catch (error) {
            console.error('Ошибка при создании питомца:', error);
            return {
              success: false,
              message: `Ошибка при создании питомца в системе: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
            };
          }
        } else {
          petId = pet.pet_id;
        }
      }
      // Формируем дату и время для API
      const appointmentDateTime = `${session.date}T${session.time}:00`;
      
      // Получаем длительность приема (по умолчанию 30 минут)
      const admissionLength = 30;
      
      // Создаем описание записи
      const description = `Питомец: ${session.petName}\nСимптомы: ${session.symptoms}\nВладелец: ${session.ownerName}\nТелефон: ${session.ownerPhone}`;

      const result = await this.crmService.createAppointment(
        typeMapping[session.appointmentType!], // type_id
        appointmentDateTime,                   // admission_date
        parseInt(session.clinicId!.replace('clinic_', '')), // clinic_id
        clientId,                                     // client_id (будет создан автоматически)
        petId,                                     // patient_id (будет создан автоматически)
        description,                           // description
        admissionLength,                      // admission_length
        parseInt(session.doctorId!)           // user_id (ID врача)
      );

      return result;
    } catch (error) {
      console.error('Ошибка при создании записи в CRM:', error);
      return {
        success: false,
        message: 'Ошибка при создании записи в системе'
      };
    }
  }

  @Command('exit')
  async onExit(@Ctx() ctx: SceneContext) {
    await ctx.replyWithHTML('Выход из создания записи');
    await ctx.scene.leave();
  }
} 
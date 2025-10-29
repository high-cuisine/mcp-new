import { Injectable } from '@nestjs/common';
import { Ctx, Scene, SceneEnter, On, Command } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { SceneContext } from 'telegraf/typings/scenes';

import { PaginationHelper, PaginationButton } from '../helpers/pagination.helper';
import { DateTimeHelper, DateSlot, TimeSlot } from '../helpers/date-time.helper';
import { CrmService } from '../../crm/services/crm.service';
import { AppointmentService } from '../../crm/services/appointments.service';
import { ClientService } from '../../crm/services/client.service';
import { Admission } from '@common/entities/admission.entity';

interface MoveAppointmentSession {
  step: 'phone' | 'phone_input' | 'select_appointment' | 'select_date' | 'select_time' | 'confirm_move';
  phone?: string;
  client?: any;
  appointments?: Admission[];
  selectedAppointment?: Admission;
  selectedAppointmentId?: string;
  newDate?: string;
  newTime?: string;
  currentPage?: number;
  currentDatePage?: number;
  currentTimePage?: number;
}

@Injectable()
@Scene('move_appointment')
export class MoveAppointmentScene {
  constructor(
    private readonly crmService: CrmService,
    private readonly appointmentService: AppointmentService,
    private readonly clientService: ClientService
  ) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: SceneContext) {
    if (!ctx.session) {
      ctx.session = {};
    }
    
    if (!ctx.session['moveAppointment']) {
      ctx.session['moveAppointment'] = {} as MoveAppointmentSession;
    }
    
    const session = ctx.session['moveAppointment'] as MoveAppointmentSession;
    session.step = 'phone';
    
    await ctx.replyWithHTML(`
🔄 <b>Перенос записи на прием</b>

Для переноса записи нам нужно найти ваши записи в системе.

<b>Шаг 1/6: Номер телефона</b>

Введите номер телефона, на который была оформлена запись, в формате +7XXXXXXXXXX`, 
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отменить', 'cancel_move_appointment')]
      ])
    );
  }

  @On('text')
  async onText(@Ctx() ctx: SceneContext) {
    if (!ctx.session) {
      ctx.session = {};
    }
    
    if (!ctx.session['moveAppointment']) {
      ctx.session['moveAppointment'] = {} as MoveAppointmentSession;
    }
    
    const session = ctx.session['moveAppointment'] as MoveAppointmentSession;
    const text = (ctx.message as any).text;
    
    if(text === '/exit') {
      await ctx.reply('Выход из переноса записи');
      await ctx.scene.leave();
      return;
    }

    switch (session.step) {
      case 'phone':
      case 'phone_input':
        session.phone = text;
        await this.findClientAndAppointments(ctx, session);
        break;
    }
  }

  @On('callback_query')
  async onCallbackQuery(@Ctx() ctx: SceneContext) {
    const callbackData = (ctx.callbackQuery as any).data;
    
    if (!ctx.session) {
      ctx.session = {};
    }
    
    if (!ctx.session['moveAppointment']) {
      ctx.session['moveAppointment'] = {} as MoveAppointmentSession;
    }
    
    const session = ctx.session['moveAppointment'] as MoveAppointmentSession;
    
    if (callbackData === 'cancel_move_appointment') {
      await ctx.reply('❌ Перенос записи отменен');
      await ctx.scene.leave();
      return;
    }

    // Обработка пагинации записей
    if (callbackData.startsWith('page_')) {
      const pageNumber = parseInt(callbackData.replace('page_', ''), 10);
      if (!isNaN(pageNumber) && pageNumber > 0) {
        session.currentPage = pageNumber;
        await this.showAppointmentsList(ctx, session);
        return;
      }
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

    // Обработка пагинации времени
    if (callbackData.startsWith('time_page_')) {
      const pageNumber = parseInt(callbackData.replace('time_page_', ''), 10);
      if (!isNaN(pageNumber) && pageNumber > 0) {
        session.currentTimePage = pageNumber;
        await this.showTimeSelection(ctx, session);
        return;
      }
    }

    // Обработка выбора записи для переноса
    if (callbackData.startsWith('move_appointment_')) {
      const appointmentId = callbackData.replace('move_appointment_', '');
      const selectedAppointment = session.appointments?.find(
        app => app.id.toString() === appointmentId
      );
      
      if (!selectedAppointment) {
        await ctx.reply('❌ Ошибка: запись не найдена');
        return;
      }

      session.selectedAppointment = selectedAppointment;
      session.selectedAppointmentId = appointmentId;
      session.step = 'select_date';
      await this.showDateSelection(ctx, session);
      return;
    }

    // Обработка выбора даты
    if (callbackData.startsWith('date_')) {
      const date = DateTimeHelper.parseDateCallback(callbackData);
      if (date) {
        session.newDate = date;
        session.step = 'select_time';
        await this.showTimeSelection(ctx, session);
        return;
      }
    }

    // Обработка выбора времени
    if (callbackData.startsWith('time_')) {
      const time = DateTimeHelper.parseTimeCallback(callbackData);
      if (time) {
        session.newTime = time;
        session.step = 'confirm_move';
        await this.showConfirmation(ctx, session);
        return;
      }
    }

    // Обработка подтверждения переноса
    if (callbackData === 'confirm_move_appointment') {
      await this.moveAppointment(ctx, session);
      return;
    }

    // Обработка отмены подтверждения
    if (callbackData === 'back_to_time') {
      session.step = 'select_time';
      await this.showTimeSelection(ctx, session);
      return;
    }

    if (callbackData === 'back_to_date') {
      session.step = 'select_date';
      await this.showDateSelection(ctx, session);
      return;
    }

    if (callbackData === 'back_to_appointments') {
      session.step = 'select_appointment';
      await this.showAppointmentsList(ctx, session);
      return;
    }

    // Обработка повторного переноса
    if (callbackData === 'move_another_appointment') {
      await ctx.reply('🔄 Возвращаемся к списку записей...');
      session.step = 'select_appointment';
      session.selectedAppointmentId = undefined;
      session.selectedAppointment = undefined;
      session.newDate = undefined;
      session.newTime = undefined;
      await this.showAppointmentsList(ctx, session);
      return;
    }

    // Обработка попытки повтора поиска
    if (callbackData === 'retry_search') {
      await ctx.replyWithHTML(`
<b>Шаг 1/6: Ввод номера телефона</b>

Для поиска ваших записей введите номер телефона, на который была оформлена запись.

Формат: +7XXXXXXXXXX или 8XXXXXXXXXX`);
      session.step = 'phone_input';
      return;
    }

    // Обработка повторного ввода телефона
    if (callbackData === 'try_another_phone') {
      await ctx.replyWithHTML(`
<b>Шаг 1/6: Ввод номера телефона</b>

Для поиска ваших записей введите номер телефона, на который была оформлена запись.

Формат: +7XXXXXXXXXX или 8XXXXXXXXXX`);
      session.step = 'phone_input';
      return;
    }
  }

  /**
   * Находит клиента и его записи
   */
  private async findClientAndAppointments(ctx: SceneContext, session: MoveAppointmentSession) {
    try {
      // Получаем клиента по телефону
      const clientResult = await this.clientService.getClinetByPhone(session.phone!);
      if (!clientResult || !(clientResult as any).data || !(clientResult as any).data.client || (clientResult as any).data.client.length === 0) {
        await ctx.replyWithHTML(`
❌ <b>Клиент не найден</b>

Клиент с номером телефона ${session.phone} не найден в системе.

Проверьте правильность номера телефона или обратитесь в поддержку.`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Попробовать другой номер', 'try_another_phone')],
            [Markup.button.callback('❌ Отменить', 'cancel_move_appointment')]
          ])
        );
        return;
      }

      session.client = (clientResult as any).data.client[0];
      const clientId = session.client?.id || session.client?.client_id;
      const crmClientId = typeof clientId === 'number' ? clientId : parseInt(clientId);
      
      if (isNaN(crmClientId)) {
        await ctx.reply('❌ Ошибка: не удалось определить ID клиента');
        return;
      }

      // Получаем записи клиента
      const appointments = await this.appointmentService.findAppointmentForUser(crmClientId, 1);
      
      if (!appointments || appointments.length === 0) {
        await ctx.replyWithHTML(`
✅ <b>Клиент найден:</b> ${session.client?.first_name} ${session.client?.last_name}

❌ <b>Записи не найдены</b>

У вас нет активных записей на прием.

Возможно, все записи уже отменены или завершены.`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Попробовать другой номер', 'try_another_phone')],
            [Markup.button.callback('❌ Отменить', 'cancel_move_appointment')]
          ])
        );
        return;
      }

      session.appointments = appointments;
      session.step = 'select_appointment';
      await this.showAppointmentsList(ctx, session);

    } catch (error) {
      console.error('Ошибка при поиске клиента и записей:', error);
      await ctx.replyWithHTML(`
❌ <b>Ошибка при поиске записей</b>

Произошла техническая ошибка. Попробуйте позже или обратитесь в поддержку.`, 
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Попробовать снова', 'retry_search')],
          [Markup.button.callback('❌ Отменить', 'cancel_move_appointment')]
        ])
      );
    }
  }

  /**
   * Показывает список записей с пагинацией
   */
  private async showAppointmentsList(ctx: SceneContext, session: MoveAppointmentSession) {
    if (!session.appointments || session.appointments.length === 0) {
      await ctx.reply('❌ Записи не найдены');
      return;
    }

    const appointments = session.appointments;
    const currentPage = session.currentPage || 1;
    const itemsPerPage = 3;

    // Создаем кнопки для записей
    const appointmentButtons: PaginationButton[] = [];
    
    for (let i = 0; i < appointments.length; i++) {
      const appointment = appointments[i];
      const appointmentDate = new Date(appointment.admission_date);
      const formattedDate = DateTimeHelper.formatDateDisplay(appointmentDate);
      const formattedTime = appointmentDate.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      const buttonText = `📅 ${formattedDate} в ${formattedTime}\n👨‍⚕️ Врач ID: ${appointment.user_id}`;
      
      appointmentButtons.push({
        text: buttonText,
        callbackData: `move_appointment_${appointment.id}`
      });
    }

    const message = `
✅ <b>Клиент:</b> ${session.client?.first_name} ${session.client?.last_name}
📞 <b>Телефон:</b> ${session.phone}

<b>Шаг 2/6: Выберите запись для переноса</b>

Найдено записей: ${appointments.length}

Выберите запись, которую хотите перенести:`;

    await PaginationHelper.sendPaginatedMessage(
      ctx,
      message,
      appointmentButtons,
      currentPage,
      {
        itemsPerPage,
        showPageNumbers: true,
        showNavigation: true,
        cancelButtonText: '❌ Отменить',
        cancelCallbackData: 'cancel_move_appointment'
      }
    );
  }

  /**
   * Показывает выбор даты с пагинацией
   */
  private async showDateSelection(ctx: SceneContext, session: MoveAppointmentSession) {
    try {
      if (!session.selectedAppointment) {
        await ctx.reply('❌ Ошибка: запись не выбрана');
        return;
      }

      const clinicIdStr = session.selectedAppointment.clinic_id;
      const clinicId = typeof clinicIdStr === 'string' ? parseInt(clinicIdStr) : clinicIdStr;
      
      if (isNaN(clinicId)) {
        await ctx.reply('❌ Ошибка: не удалось определить ID клиники');
        return;
      }
      
      const availableDates = await this.crmService.getAvailableDates(14, clinicId);
      const dateSlots: DateSlot[] = availableDates.map(dateInfo => ({
        date: dateInfo.date,
        displayName: DateTimeHelper.formatDateDisplay(new Date(dateInfo.date)),
        availableSlots: 9 - dateInfo.occupiedSlots.length,
        totalSlots: 9
      }));

      const dateButtons = DateTimeHelper.createDateButtons(dateSlots);
      const currentPage = session.currentDatePage || 1;

      const oldDate = new Date(session.selectedAppointment.admission_date);
      const formattedOldDate = DateTimeHelper.formatDateDisplay(oldDate);
      const formattedOldTime = oldDate.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      const message = `
✅ <b>Выбрана запись:</b> ${formattedOldDate} в ${formattedOldTime}

<b>Шаг 3/6: Выберите новую дату</b>

Выберите новую дату для записи:`;

      await PaginationHelper.sendPaginatedMessage(
        ctx,
        message,
        dateButtons,
        currentPage,
        {
          itemsPerPage: 5,
          showPageNumbers: true,
          showNavigation: true,
          cancelButtonText: '↩️ Назад',
          cancelCallbackData: 'back_to_appointments'
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
  private async showTimeSelection(ctx: SceneContext, session: MoveAppointmentSession) {
    try {
      if (!session.newDate) {
        await ctx.reply('❌ Ошибка: дата не выбрана');
        return;
      }

      if (!session.selectedAppointment) {
        await ctx.reply('❌ Ошибка: запись не выбрана');
        return;
      }

      const clinicIdStr = session.selectedAppointment.clinic_id;
      const clinicId = typeof clinicIdStr === 'string' ? parseInt(clinicIdStr) : clinicIdStr;
      
      if (isNaN(clinicId)) {
        await ctx.reply('❌ Ошибка: не удалось определить ID клиники');
        return;
      }
      
      const occupiedSlots = await this.crmService.getOccupiedTimeSlots(session.newDate, clinicId);
      const timeSlots = DateTimeHelper.generateTimeSlots(session.newDate, occupiedSlots);
      const timeButtons = DateTimeHelper.createTimeButtons(timeSlots);
      const currentPage = session.currentTimePage || 1;

      const dateDisplay = DateTimeHelper.formatDateDisplay(new Date(session.newDate));

      const message = `
✅ <b>Новая дата:</b> ${dateDisplay}

<b>Шаг 4/6: Выберите новое время</b>

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
          cancelButtonText: '↩️ Назад к дате',
          cancelCallbackData: 'back_to_date'
        }
      );
    } catch (error) {
      console.error('Ошибка при получении доступного времени:', error);
      await ctx.reply('❌ Ошибка при загрузке доступного времени. Попробуйте позже.');
    }
  }

  /**
   * Показывает подтверждение переноса
   */
  private async showConfirmation(ctx: SceneContext, session: MoveAppointmentSession) {
    if (!session.selectedAppointment || !session.newDate || !session.newTime) {
      await ctx.reply('❌ Ошибка: не все данные выбраны');
      return;
    }

    const oldDate = new Date(session.selectedAppointment.admission_date);
    const formattedOldDate = DateTimeHelper.formatDateDisplay(oldDate);
    const formattedOldTime = oldDate.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const newDateObj = new Date(session.newDate);
    const formattedNewDate = DateTimeHelper.formatDateDisplay(newDateObj);

    await ctx.replyWithHTML(`
⚠️ <b>Подтверждение переноса записи</b>

<b>Шаг 5/6: Подтвердите перенос</b>

📋 <b>Текущая запись:</b>
🆔 <b>ID:</b> ${session.selectedAppointment.id}
📅 <b>Дата:</b> ${formattedOldDate}
🕐 <b>Время:</b> ${formattedOldTime}

📋 <b>Новая запись:</b>
📅 <b>Дата:</b> ${formattedNewDate}
🕐 <b>Время:</b> ${session.newTime}

Вы уверены, что хотите перенести запись?`, 
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Да, перенести запись', 'confirm_move_appointment')],
        [Markup.button.callback('↩️ Назад к времени', 'back_to_time')],
        [Markup.button.callback('❌ Отменить', 'cancel_move_appointment')]
      ])
    );
  }

  /**
   * Переносит выбранную запись
   */
  private async moveAppointment(ctx: SceneContext, session: MoveAppointmentSession) {
    if (!session.selectedAppointmentId || !session.newDate || !session.newTime) {
      await ctx.reply('❌ Ошибка: не все данные выбраны');
      return;
    }

    try {
      // Формируем новую дату и время начала и окончания приема
      const start = `${session.newDate} ${session.newTime}:00`;
      const durationMinutesRaw = session.selectedAppointment?.admission_length;
      const durationMinutes = Number.parseInt((durationMinutesRaw || '30').toString(), 10);
      const endDateObj = new Date(start.replace(' ', 'T'));
      endDateObj.setMinutes(endDateObj.getMinutes() + (Number.isFinite(durationMinutes) ? durationMinutes : 30));
      const pad = (n: number) => n.toString().padStart(2, '0');
      const end = `${endDateObj.getFullYear()}-${pad(endDateObj.getMonth() + 1)}-${pad(endDateObj.getDate())} ${pad(endDateObj.getHours())}:${pad(endDateObj.getMinutes())}:00`;

      const clinicIdStr = session.selectedAppointment!.clinic_id;
      const clinicId = typeof clinicIdStr === 'string' ? parseInt(clinicIdStr) : clinicIdStr;

      // Обновляем запись через CRM API (перенос приема)
      const result = await this.crmService.rescheduleAppointment(
        session.selectedAppointmentId,
        clinicId,
        start,
        end
      );
      
      if (result && !result.error) {
        const oldDate = new Date(session.selectedAppointment!.admission_date);
        const formattedOldDate = DateTimeHelper.formatDateDisplay(oldDate);
        const formattedOldTime = oldDate.toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        const newDateObj = new Date(session.newDate);
        const formattedNewDate = DateTimeHelper.formatDateDisplay(newDateObj);

        await ctx.replyWithHTML(`
✅ <b>Запись успешно перенесена!</b>

📋 <b>Перенесенная запись:</b>
🆔 <b>ID:</b> ${session.selectedAppointment!.id}

📋 <b>С:</b>
📅 ${formattedOldDate} в ${formattedOldTime}

📋 <b>На:</b>
📅 ${formattedNewDate} в ${session.newTime}

Запись была успешно перенесена. Если у вас есть другие записи, вы можете перенести их аналогично.`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Перенести другую запись', 'move_another_appointment')],
            [Markup.button.callback('🏠 Главное меню', 'main_menu')]
          ])
        );
      } else {
        await ctx.replyWithHTML(`
❌ <b>Ошибка при переносе записи</b>

${result?.error || result?.message || 'Не удалось перенести запись. Попробуйте позже или обратитесь в поддержку.'}`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Попробовать снова', 'back_to_time')],
            [Markup.button.callback('🏠 Главное меню', 'main_menu')]
          ])
        );
      }
    } catch (error: any) {
      console.error('Ошибка при переносе записи:', error);
      const errorMessage = error?.message || 'Произошла техническая ошибка';
      await ctx.replyWithHTML(`
❌ <b>Ошибка при переносе записи</b>

${errorMessage}

Попробуйте позже или обратитесь в поддержку.`, 
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Попробовать снова', 'back_to_time')],
          [Markup.button.callback('🏠 Главное меню', 'main_menu')]
        ])
      );
    }
    
    await ctx.scene.leave();
  }

  @Command('exit')
  async onExit(@Ctx() ctx: SceneContext) {
    await ctx.reply('Выход из переноса записи');
    await ctx.scene.leave();
  }
}


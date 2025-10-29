import { Injectable } from '@nestjs/common';
import { Ctx, Scene, SceneEnter, On, Command, Hears } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { SceneContext } from 'telegraf/typings/scenes';

import { addCancelButton, handleCancelButton } from '../helpers/scene.helper';
import { PaginationHelper, PaginationButton } from '../helpers/pagination.helper';
import { DateTimeHelper, DateSlot, TimeSlot } from '../helpers/date-time.helper';
import { CrmService } from '../../crm/services/crm.service';
import { AppointmentService } from '../../crm/services/appointments.service';
import { ClientService } from '../../crm/services/client.service';
import { Admission } from '@common/entities/admission.entity';
import { Client } from '@common/entities/client.entity';

interface CancelAppointmentSession {
  step: 'phone' | 'phone_input' | 'select_appointment' | 'confirm_cancel';
  phone?: string;
  client?: any;
  appointments?: Admission[];
  selectedAppointmentId?: string;
  currentPage?: number;
}

@Injectable()
@Scene('cancel_appointment')
export class CancelAppointmentScene {
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
    
    if (!ctx.session['cancelAppointment']) {
      ctx.session['cancelAppointment'] = {} as CancelAppointmentSession;
    }
    
    const session = ctx.session['cancelAppointment'] as CancelAppointmentSession;
    session.step = 'phone';
    
    await ctx.replyWithHTML(`
🗑️ <b>Отмена записи на прием</b>

Для отмены записи нам нужно найти ваши записи в системе.

<b>Шаг 1/3: Номер телефона</b>

Введите номер телефона, на который была оформлена запись, в формате +7XXXXXXXXXX`, 
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отменить', 'cancel_cancel_appointment')]
      ])
    );
  }

  @On('text')
  async onText(@Ctx() ctx: SceneContext) {
    if (!ctx.session) {
      ctx.session = {};
    }
    
    if (!ctx.session['cancelAppointment']) {
      ctx.session['cancelAppointment'] = {} as CancelAppointmentSession;
    }
    
    const session = ctx.session['cancelAppointment'] as CancelAppointmentSession;
    const text = (ctx.message as any).text;
    
    if(text === '/exit') {
      await ctx.reply('Выход из отмены записи');
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
    
    if (!ctx.session['cancelAppointment']) {
      ctx.session['cancelAppointment'] = {} as CancelAppointmentSession;
    }
    
    const session = ctx.session['cancelAppointment'] as CancelAppointmentSession;
    
    if (callbackData === 'cancel_cancel_appointment') {
      await ctx.reply('❌ Отмена записи отменена');
      await ctx.scene.leave();
      return;
    }

    // Обработка пагинации записей
    if (PaginationHelper.isPageCallback(callbackData)) {
      const pageNumber = PaginationHelper.parsePageCallback(callbackData);
      if (pageNumber) {
        session.currentPage = pageNumber;
        await this.showAppointmentsList(ctx, session);
        return;
      }
    }

    // Обработка выбора записи для отмены
    if (callbackData.startsWith('cancel_appointment_')) {
      const appointmentId = callbackData.replace('cancel_appointment_', '');
      session.selectedAppointmentId = appointmentId;
      session.step = 'confirm_cancel';
      await this.showConfirmation(ctx, session);
      return;
    }

    // Обработка подтверждения отмены
    if (callbackData === 'confirm_cancel_appointment') {
      await this.cancelAppointment(ctx, session);
      return;
    }

    // Обработка отмены подтверждения
    if (callbackData === 'back_to_appointments') {
      session.step = 'select_appointment';
      await this.showAppointmentsList(ctx, session);
      return;
    }

    // Обработка отмены другой записи
    if (callbackData === 'cancel_another_appointment') {
      await ctx.reply('🔄 Возвращаемся к списку записей...');
      session.step = 'select_appointment';
      session.selectedAppointmentId = undefined;
      await this.showAppointmentsList(ctx, session);
      return;
    }

    // Обработка повторной отмены
    if (callbackData === 'retry_cancel') {
      if (session.selectedAppointmentId) {
        await this.showConfirmation(ctx, session);
        return;
      } else {
        await ctx.reply('❌ Запись не выбрана. Выберите запись из списка.');
        await this.showAppointmentsList(ctx, session);
        return;
      }
    }

    // Обработка попытки повтора поиска
    if (callbackData === 'retry_search') {
      await ctx.replyWithHTML(`
<b>Шаг 1/3: Ввод номера телефона</b>

Для поиска ваших записей введите номер телефона, на который была оформлена запись.

Формат: +7XXXXXXXXXX или 8XXXXXXXXXX`);
      session.step = 'phone_input';
      return;
    }

    // Обработка повторного ввода телефона
    if (callbackData === 'try_another_phone') {
      await ctx.replyWithHTML(`
<b>Шаг 1/3: Ввод номера телефона</b>

Для поиска ваших записей введите номер телефона, на который была оформлена запись.

Формат: +7XXXXXXXXXX или 8XXXXXXXXXX`);
      session.step = 'phone_input';
      return;
    }
  }

  /**
   * Находит клиента и его записи
   */
  private async findClientAndAppointments(ctx: SceneContext, session: CancelAppointmentSession) {
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
            [Markup.button.callback('❌ Отменить', 'cancel_cancel_appointment')]
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
            [Markup.button.callback('❌ Отменить', 'cancel_cancel_appointment')]
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
          [Markup.button.callback('❌ Отменить', 'cancel_cancel_appointment')]
        ])
      );
    }
  }

  /**
   * Показывает список записей с пагинацией
   */
  private async showAppointmentsList(ctx: SceneContext, session: CancelAppointmentSession) {
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
        callbackData: `cancel_appointment_${appointment.id}`
      });
    }

    const message = `
✅ <b>Клиент:</b> ${session.client?.first_name} ${session.client?.last_name}
📞 <b>Телефон:</b> ${session.phone}

<b>Шаг 2/3: Выберите запись для отмены</b>

Найдено записей: ${appointments.length}

Выберите запись, которую хотите отменить:`;

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
        cancelCallbackData: 'cancel_cancel_appointment'
      }
    );
  }

  /**
   * Показывает подтверждение отмены
   */
  private async showConfirmation(ctx: SceneContext, session: CancelAppointmentSession) {
    if (!session.appointments || !session.selectedAppointmentId) {
      await ctx.reply('❌ Ошибка: запись не выбрана');
      return;
    }

    const selectedAppointment = session.appointments.find(
      app => app.id.toString() === session.selectedAppointmentId
    );

    if (!selectedAppointment) {
      await ctx.reply('❌ Ошибка: выбранная запись не найдена');
      return;
    }

    const appointmentDate = new Date(selectedAppointment.admission_date);
    const formattedDate = DateTimeHelper.formatDateDisplay(appointmentDate);
    const formattedTime = appointmentDate.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    await ctx.replyWithHTML(`
⚠️ <b>Подтверждение отмены записи</b>

<b>Шаг 3/3: Подтвердите отмену</b>

📋 <b>Детали записи:</b>
🆔 <b>ID записи:</b> ${selectedAppointment.id}
📅 <b>Дата:</b> ${formattedDate}
🕐 <b>Время:</b> ${formattedTime}
👨‍⚕️ <b>Врач ID:</b> ${selectedAppointment.user_id}
🏥 <b>Клиника ID:</b> ${selectedAppointment.clinic_id}

⚠️ <b>Внимание!</b> Отмена записи необратима. После подтверждения запись будет отменена.

Вы уверены, что хотите отменить эту запись?`, 
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Да, отменить запись', 'confirm_cancel_appointment')],
        [Markup.button.callback('↩️ Назад к списку', 'back_to_appointments')],
        [Markup.button.callback('❌ Отменить', 'cancel_cancel_appointment')]
      ])
    );
  }

  /**
   * Отменяет выбранную запись
   */
  private async cancelAppointment(ctx: SceneContext, session: CancelAppointmentSession) {
    if (!session.selectedAppointmentId) {
      await ctx.reply('❌ Ошибка: запись не выбрана');
      return;
    }

    try {
      // Отменяем запись через CRM API
      const result = await this.crmService.chanelAppointment(session.selectedAppointmentId);
      
      if (result && !result.error && result.data) {
        const selectedAppointment = session.appointments?.find(
          app => app.id.toString() === session.selectedAppointmentId
        );

        if (selectedAppointment) {
          const appointmentDate = new Date(selectedAppointment.admission_date);
          const formattedDate = DateTimeHelper.formatDateDisplay(appointmentDate);
          const formattedTime = appointmentDate.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });

          await ctx.replyWithHTML(`
✅ <b>Запись успешно отменена!</b>

📋 <b>Отмененная запись:</b>
🆔 <b>ID:</b> ${selectedAppointment.id}
📅 <b>Дата:</b> ${formattedDate}
🕐 <b>Время:</b> ${formattedTime}
👨‍⚕️ <b>Врач ID:</b> ${selectedAppointment.user_id}

Запись была отменена. Если у вас есть другие записи, вы можете отменить их аналогично.`, 
            Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Отменить другую запись', 'cancel_another_appointment')],
              [Markup.button.callback('🏠 Главное меню', 'main_menu')]
            ])
          );
        }
      } else {
        await ctx.replyWithHTML(`
❌ <b>Ошибка при отмене записи</b>

${result?.error || result?.message || 'Не удалось отменить запись. Попробуйте позже или обратитесь в поддержку.'}`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Попробовать снова', 'retry_cancel')],
            [Markup.button.callback('🏠 Главное меню', 'main_menu')]
          ])
        );
      }
    } catch (error: any) {
      console.error('Ошибка при отмене записи:', error);
      const errorMessage = error?.message || 'Произошла техническая ошибка';
      await ctx.replyWithHTML(`
❌ <b>Ошибка при отмене записи</b>

${errorMessage}

Попробуйте позже или обратитесь в поддержку.`, 
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Попробовать снова', 'retry_cancel')],
          [Markup.button.callback('🏠 Главное меню', 'main_menu')]
        ])
      );
    }
    
    await ctx.scene.leave();
  }

  @Command('exit')
  async onExit(@Ctx() ctx: SceneContext) {
    await ctx.replyWithHTML('Выход из отмены записи');
    await ctx.scene.leave();
  }
}

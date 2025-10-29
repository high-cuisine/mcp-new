import { Injectable } from '@nestjs/common';
import { Ctx, Scene, SceneEnter, On, Command } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { SceneContext } from 'telegraf/typings/scenes';

import { PaginationHelper, PaginationButton } from '../helpers/pagination.helper';
import { DateTimeHelper } from '../helpers/date-time.helper';
import { CrmService } from '../../crm/services/crm.service';
import { AppointmentService } from '../../crm/services/appointments.service';
import { ClientService } from '../../crm/services/client.service';
import { Admission } from '@common/entities/admission.entity';

interface ShowAppointmentSession {
  step: 'phone' | 'phone_input' | 'show_appointments';
  phone?: string;
  client?: any;
  appointments?: Admission[];
  currentPage?: number;
}

@Injectable()
@Scene('show_appointment')
export class ShowAppointmentScene {
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
    
    if (!ctx.session['showAppointment']) {
      ctx.session['showAppointment'] = {} as ShowAppointmentSession;
    }
    
    const session = ctx.session['showAppointment'] as ShowAppointmentSession;
    
    // Всегда просим ввести номер телефона
    session.step = 'phone';
    await ctx.replyWithHTML(`
📅 <b>Просмотр записей на прием</b>

Для просмотра ваших записей нам нужно найти вас в системе.

<b>Введите номер телефона</b>

Введите номер телефона, на который была оформлена запись, в формате +7XXXXXXXXXX`, 
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отменить', 'cancel_show_appointment')]
      ])
    );
  }

  @On('text')
  async onText(@Ctx() ctx: SceneContext) {
    if (!ctx.session) {
      ctx.session = {};
    }
    
    if (!ctx.session['showAppointment']) {
      ctx.session['showAppointment'] = {} as ShowAppointmentSession;
    }
    
    const session = ctx.session['showAppointment'] as ShowAppointmentSession;
    const text = (ctx.message as any).text;
    
    if(text === '/exit') {
      await ctx.reply('Выход из просмотра записей');
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
    
    if (!ctx.session['showAppointment']) {
      ctx.session['showAppointment'] = {} as ShowAppointmentSession;
    }
    
    const session = ctx.session['showAppointment'] as ShowAppointmentSession;
    
    if (callbackData === 'cancel_show_appointment') {
      await ctx.reply('❌ Просмотр записей отменен');
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

    // Обработка попытки повтора поиска
    if (callbackData === 'retry_search') {
      await ctx.replyWithHTML(`
<b>Ввод номера телефона</b>

Для поиска ваших записей введите номер телефона, на который была оформлена запись.

Формат: +7XXXXXXXXXX или 8XXXXXXXXXX`);
      session.step = 'phone_input';
      return;
    }

    // Обработка повторного ввода телефона
    if (callbackData === 'try_another_phone') {
      await ctx.replyWithHTML(`
<b>Ввод номера телефона</b>

Для поиска ваших записей введите номер телефона, на который была оформлена запись.

Формат: +7XXXXXXXXXX или 8XXXXXXXXXX`);
      session.step = 'phone_input';
      return;
    }
  }


  /**
   * Находит клиента и его записи
   */
  private async findClientAndAppointments(ctx: SceneContext, session: ShowAppointmentSession) {
    try {
      // Получаем клиента по телефону
      const clientResult = await this.clientService.getClinetByPhone(session.phone!);
      console.log(clientResult, 'clientResult');
      if (!clientResult || !(clientResult as any).data || !(clientResult as any).data.client || (clientResult as any).data.client.length === 0) {
        await ctx.replyWithHTML(`
❌ <b>Клиент не найден</b>

Клиент с номером телефона ${session.phone} не найден в системе.

Проверьте правильность номера телефона или обратитесь в поддержку.`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Попробовать другой номер', 'try_another_phone')],
            [Markup.button.callback('❌ Закрыть', 'cancel_show_appointment')]
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
            [Markup.button.callback('❌ Закрыть', 'cancel_show_appointment')]
          ])
        );
        await ctx.scene.leave();
        return;
      }

      session.appointments = appointments;
      session.step = 'show_appointments';
      await this.showAppointmentsList(ctx, session);

    } catch (error) {
      console.error('Ошибка при поиске клиента и записей:', error);
      await ctx.replyWithHTML(`
❌ <b>Ошибка при поиске записей</b>

Произошла техническая ошибка. Попробуйте позже или обратитесь в поддержку.`, 
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Попробовать снова', 'retry_search')],
          [Markup.button.callback('❌ Закрыть', 'cancel_show_appointment')]
        ])
      );
    }
  }

  /**
   * Показывает список записей с пагинацией
   */
  private async showAppointmentsList(ctx: SceneContext, session: ShowAppointmentSession) {
    if (!session.appointments || session.appointments.length === 0) {
      await ctx.reply('❌ Записи не найдены');
      await ctx.scene.leave();
      return;
    }

    const appointments = session.appointments;
    const currentPage = session.currentPage || 1;
    const itemsPerPage = 5;

    // Формируем текст сообщения с записями
    const clientName = session.client?.first_name && session.client?.last_name 
      ? `${session.client.first_name} ${session.client.last_name}`
      : 'Не указано';
    const phone = session.phone || session.client?.cell_phone || 'Не указано';

    // Рассчитываем диапазон записей для текущей страницы
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, appointments.length);
    const pageAppointments = appointments.slice(startIndex, endIndex);

    let message = `<b>📅 Ваши записи на прием</b>\n\n`;
    message += `👤 <b>Клиент:</b> ${clientName}\n`;
    if (phone !== 'Не указано') {
      message += `📞 <b>Телефон:</b> ${phone}\n`;
    }
    message += `\n📊 <b>Найдено записей:</b> ${appointments.length}\n\n`;

    // Добавляем записи текущей страницы
    pageAppointments.forEach((appointment, index) => {
      const appointmentDate = new Date(appointment.admission_date);
      const formattedDate = DateTimeHelper.formatDateDisplay(appointmentDate);
      const formattedTime = appointmentDate.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Moscow'
      });

      message += `${startIndex + index + 1}. <b>${formattedDate}</b> в <b>${formattedTime}</b>\n`;
      
      if ((appointment as any).client?.id) {
        const pet = (appointment as any).pet;
        if (pet && pet.alias) {
          message += `   🐾 Питомец: ${pet.alias}\n`;
        }
      }
      
      if (appointment.description) {
        message += `   📝 ${appointment.description}\n`;
      }
      
      message += `   🆔 ID: ${appointment.id}\n\n`;
    });

    // Добавляем информацию о пагинации
    const totalPages = Math.ceil(appointments.length / itemsPerPage);
    if (totalPages > 1) {
      message += `\n📄 Страница ${currentPage} из ${totalPages}`;
    }

    // Создаем кнопки пагинации
    const buttons: any[] = [];
    
    if (totalPages > 1) {
      const pageButtons: any[] = [];
      
      if (currentPage > 1) {
        pageButtons.push(Markup.button.callback('⬅️ Назад', `page_${currentPage - 1}`));
      }
      
      if (currentPage < totalPages) {
        pageButtons.push(Markup.button.callback('➡️ Вперед', `page_${currentPage + 1}`));
      }
      
      if (pageButtons.length > 0) {
        buttons.push(pageButtons);
      }
    }
    
    buttons.push([Markup.button.callback('❌ Закрыть', 'cancel_show_appointment')]);

    await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
  }

  @Command('exit')
  async onExit(@Ctx() ctx: SceneContext) {
    await ctx.reply('Выход из просмотра записей');
    await ctx.scene.leave();
  }
}

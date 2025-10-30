import { Ctx, On, Update, Action, Start, Command } from "nestjs-telegraf";
import { SceneContext } from "telegraf/typings/scenes";
import { TelegramService } from "./servises/telegram.service";


@Update()
export class BotUpdate {
    private readonly adminId = '1042650482';

    constructor(
        private readonly telegramService: TelegramService,
       
    ) {}

    @Start()
    async onStart(@Ctx() ctx: SceneContext) {
        console.log('Start received:', ctx.message);
        await ctx.reply('Привет! Я бот для создания записи на прием. Для начала работы нажми /create_appointment');
    }

    // @Command('start_whatsapp')
    // async startWhatsApp(@Ctx() ctx: SceneContext) {
    //     // Проверяем, что команда от админа
    //     if (ctx.from?.id?.toString() !== this.adminId) {
    //         await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    //         return;
    //     }

    //     try {
    //         await ctx.reply('🔄 Запускаю WhatsApp клиент...');
            
    //         // Проверяем текущий статус
    //         if (this.whatsappService.isClientConnected()) {
    //             await ctx.reply('✅ WhatsApp клиент уже подключен');
    //             return;
    //         }

    //         // Запускаем клиент
    //         await this.whatsappService.startClient();
    //         await ctx.reply('🚀 WhatsApp клиент запущен! QR-код будет отправлен, когда будет готов.');
            
    //     } catch (error) {
    //         console.error('Error starting WhatsApp:', error);
    //         await ctx.reply('❌ Ошибка при запуске WhatsApp клиента: ' + error.message);
    //     }
    // }

    // @Command('stop_whatsapp')
    // async stopWhatsApp(@Ctx() ctx: SceneContext) {
    //     // Проверяем, что команда от админа
    //     if (ctx.from?.id?.toString() !== this.adminId) {
    //         await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    //         return;
    //     }

    //     try {
    //         await ctx.reply('🔄 Останавливаю WhatsApp клиент...');
    //         await this.whatsappService.stopClient();
    //         await ctx.reply('✅ WhatsApp клиент остановлен');
            
    //     } catch (error) {
    //         console.error('Error stopping WhatsApp:', error);
    //         await ctx.reply('❌ Ошибка при остановке WhatsApp клиента: ' + error.message);
    //     }
    // }

    // @Command('whatsapp_status')
    // async whatsappStatus(@Ctx() ctx: SceneContext) {
    //     // Проверяем, что команда от админа
    //     if (ctx.from?.id?.toString() !== this.adminId) {
    //         await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    //         return;
    //     }

    //     const status = this.whatsappService.getClientInfo();
    //     const statusText = status.isConnected ? '🟢 Подключен' : '🔴 Отключен';
        
    //     await ctx.reply(`📊 Статус WhatsApp клиента: ${statusText}`);
    // }

    // @Command('restart_whatsapp')
    // async restartWhatsApp(@Ctx() ctx: SceneContext) {
    //     // Проверяем, что команда от админа
    //     if (ctx.from?.id?.toString() !== this.adminId) {
    //         await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    //         return;
    //     }

    //     try {
    //         await ctx.reply('🔄 Перезапускаю WhatsApp клиент...');
    //         await this.whatsappService.stopClient();
    //         await new Promise(resolve => setTimeout(resolve, 2000)); // Ждем 2 секунды
    //         await this.whatsappService.startClient();
    //         await ctx.reply('✅ WhatsApp клиент перезапущен!');
            
    //     } catch (error) {
    //         console.error('Error restarting WhatsApp:', error);
    //         await ctx.reply('❌ Ошибка при перезапуске WhatsApp клиента: ' + error.message);
    //     }
    // }
    
    @On('message')
    async onMessage(@Ctx() ctx: SceneContext) {
        console.log('Message received:', ctx.message);
        // Если пользователь находится в сцене, не отправляем сообщение в общий обработчик
        if ((ctx.scene as any)?.current) {
            return;
        }
        await this.telegramService.sendMessage(ctx);
    }

    @On('callback_query')
    async onCallbackQuery(@Ctx() ctx: SceneContext) {
        console.log('Callback query received:', ctx.callbackQuery);
        // Callback queries обрабатываются в сценах
    }

    @Action('create_appointment')
    async createAppointment(@Ctx() ctx: SceneContext) {
        console.log('Starting create appointment scene');
        // Инициализация сессии
        if (!ctx.session) {
            ctx.session = {};
        }
        ctx.session['createAppointment'] = {
            step: 'pet_name'
        };
        
        // Вход в сцену
        return ctx.scene.enter('create_appointment');
    }

  

    
}
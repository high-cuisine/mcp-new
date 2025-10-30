import { Injectable, Logger } from "@nestjs/common";
import { InjectBot, On, TelegrafModule } from "nestjs-telegraf";
import { Telegraf } from "telegraf";
import { Context } from "telegraf";
import { ClientRepository } from "../../client/repositorys/client.repository";
import { RedisService } from "@infra/redis/redis.service";
import { ProccesorService } from "../../proccesor/services/proccesor.service";
import { SceneContext } from 'telegraf/typings/scenes';
import { CrmService } from "../../crm/services/crm.service";

@Injectable()
export class TelegramService {
    private readonly logger = new Logger(TelegramService.name);

    constructor(
        @InjectBot() private readonly bot: Telegraf,
        private readonly userRepository: ClientRepository,
        private readonly redisService: RedisService,
        private readonly proccesorService: ProccesorService,
    private readonly crmService: CrmService
    ) {
        this.getMe();
    }

    async getMe() {
        const me = await this.bot.telegram.getMe();
        console.log(me);
    }

    async sendMessage(ctx: SceneContext) {
        try {
            const user = await this.getUser(ctx);

            if(!user) {
                const newUser = await this.createUser(ctx);
                await ctx.reply(`Добро пожаловать в бота!`);
                return;
            }

            const messages = [
                ...user.messages
                    .filter(m => m.role && m.text) // Фильтруем только валидные сообщения
                    .map(m => ({ role: m.role, content: m.text })), 
                { role: 'user', content: (ctx.message as any)?.text }
            ];
            
            // Отладочная информация
            console.log('Messages being sent to OpenAI:', JSON.stringify(messages, null, 2));

            const res = await this.proccesorService.sendMessage(messages);

            console.log(res);

            if(!res) {
                await ctx.reply('Ошибка при отправке сообщения');
                return;
            }

            
            if(res.type === 'create_appointment') {
                await this.createAppointment(ctx as SceneContext);
            }
            if(res.type === 'channel_appointment') {
                await this.cancelAppointment(ctx as SceneContext);
            }
            if(res.type === 'show_appointment') {
                await this.showAppointment(ctx as SceneContext);      
            }
            if(res.type === 'move_appointment') {
                await this.moveAppointment(ctx as SceneContext);
            }
            if(res.type === 'text') {
                await ctx.reply(res.content || 'Ошибка при отправке сообщения');

                this.userRepository.addMessage(user._id, [
                    { text: (ctx.message as any)?.text, role: 'user' },
                    { text: res.content || res, role: 'assistant' }
                ]);
            }
            return;

            
        } catch (error) {
            console.error('Error in sendMessage:', error);
            await ctx.reply('Произошла ошибка при обработке сообщения');
        }
    }

    private async getUser(ctx: Context) {
        const telegramId = ctx.from?.id?.toString();

        const userCache = await this.redisService.get(`user:${telegramId}`);
        if (userCache) {
            return JSON.parse(userCache);
        }
        const user = await this.userRepository.findByTelegramId(telegramId!);
        if (user) {
            await this.redisService.set(`user:${telegramId}`, JSON.stringify(user), { EX: 60 * 60 * 24 * 30 });
            return user;
        }
        
        return null;
    }
    
    private async createUser(ctx: Context) {
        const userCreateData = {
            telegramId: ctx.from?.id?.toString(),
            telegramName: ctx.from?.username,
            telegramNumber: ctx.from?.id,
            whatsappNumber: ctx.from?.id,
            createdAt: new Date(),
            messages: []
        }

        if(!userCreateData.telegramId || !userCreateData.telegramName || !userCreateData.telegramNumber || !userCreateData.whatsappNumber) {
            return null;
        }
        const newUser = await this.userRepository.createUser(
            userCreateData.telegramId,
            userCreateData.telegramName,
            userCreateData.telegramNumber.toString(),
            userCreateData.whatsappNumber.toString(),
            userCreateData.createdAt
        );
        return newUser;
    }
    
    async createAppointment(ctx: SceneContext) {
        const user = await this.getUser(ctx);
        if(!user) {
            await ctx.reply('Вы не авторизованы');
            return;
        }

        const clinics = await this.crmService.getClinics();
        if(!clinics) {
            await ctx.reply('Не найдено клиник');
            return;
        }
        
        // Инициализируем сессию если она не существует
        if (!ctx.session) {
            ctx.session = {};
        }
        
        // Инициализируем сессию для создания приема
        ctx.session['createAppointment'] = {
            step: 'pet_name'
        };
          
        // Переходим в сцену создания приема
        await ctx.scene.enter('create_appointment');
    }

    async cancelAppointment(ctx: SceneContext) {
        const user = await this.getUser(ctx);
        if(!user) {
            await ctx.reply('Вы не авторизованы');
            return;
        }

        // Инициализация сессии для отмены записи
        if (!ctx.session) {
            ctx.session = {};
        }
        ctx.session['cancelAppointment'] = {
            step: 'phone'
        };
        
        // Вход в сцену отмены записи
        return ctx.scene.enter('cancel_appointment');
    }

    async sendQrWhatsapp(qr: string) {
        try {
            // Админский ID для отправки QR кода
            const adminId = '1042650482';
            
            if (!adminId) {
                this.logger.warn('TELEGRAM_ADMIN_ID not configured');
                return;
            }

            // Отправляем QR код как текст (ASCII art)
            await this.bot.telegram.sendMessage(adminId, 
                '🔐 QR код для подключения WhatsApp\n\n' +
                'Отсканируйте этот QR код в приложении WhatsApp для авторизации:\n\n' +
                '```\n' + qr + '\n```', 
                { parse_mode: 'Markdown' }
            );

            this.logger.log('QR code sent to admin');
        } catch (error) {
            this.logger.error('Failed to send QR code to admin', error);
        }
    }

    async sendMessageToAdmin(adminId: string, message: string) {
        try {
            await this.bot.telegram.sendMessage(adminId, message, { 
                parse_mode: 'Markdown' 
            });
            this.logger.log('Message sent to admin');
        } catch (error) {
            this.logger.error('Failed to send message to admin', error);
        }
    }

    async showAppointment(ctx: SceneContext) {
        if (!ctx.session) {
            ctx.session = {};
        }
        ctx.session['showAppointment'] = {
            step: 'phone'
        };
        return ctx.scene.enter('show_appointment');
    }

    async moveAppointment(ctx: SceneContext) {
        if (!ctx.session) {
            ctx.session = {};
        }
        ctx.session['moveAppointment'] = {
            step: 'phone'
        };
        return ctx.scene.enter('move_appointment');
    }
}
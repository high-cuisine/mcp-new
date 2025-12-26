import { Ctx, On, Update, Action, Start, Command } from "nestjs-telegraf";
import { SceneContext } from "telegraf/typings/scenes";
import { TelegramService } from "./servises/telegram.service";
import { Context } from "telegraf";


@Update()
export class BotUpdate {
    private readonly adminId = '1042650482';

    constructor(
        private readonly telegramService: TelegramService,
       
    ) {}

    @Start()
    async start(@Ctx() ctx: Context) {
        const telegramId = ctx.from?.id?.toString();
        
        if (!telegramId) {
            await ctx.reply('❌ Не удалось определить ваш Telegram ID.');
            return;
        }

        const hasAccess = await this.telegramService.checkUserAccess(telegramId);
        
        if (!hasAccess) {
            await ctx.reply('❌ У вас нет доступа к этому боту.');
            return;
        }

        await ctx.reply(
            '✅ Добро пожаловать!\n\n' +
            'Вы авторизованы как модератор.\n\n' +
            'Доступные команды:\n' +
            '/add_moderator_by_username - добавить модератора по username\n' +
            '/help - справка'
        );
    }

    @Command('add_moderator_by_username')
    async addModeratorByUsername(@Ctx() ctx: Context) {
        const telegramId = ctx.from?.id?.toString();
        
        if (!telegramId) {
            await ctx.reply('❌ Не удалось определить ваш Telegram ID.');
            return;
        }

        // Проверяем доступ
        const hasAccess = await this.telegramService.checkUserAccess(telegramId);
        if (!hasAccess) {
            await ctx.reply('❌ У вас нет доступа к этой команде.');
            return;
        }

        // Получаем текст команды (username после команды)
        const commandText = (ctx.message as any)?.text || '';
        const parts = commandText.split(' ');
        
        if (parts.length < 2) {
            await ctx.reply(
                '📝 Использование команды:\n' +
                '/add_moderator_by_username @username\n\n' +
                'Пример:\n' +
                '/add_moderator_by_username @john_doe'
            );
            return;
        }

        const username = parts[1];
        const result = await this.telegramService.addModeratorByUsername(username);

        if (result.success) {
            await ctx.reply(
                `✅ ${result.message}\n\n` +
                `📋 Данные:\n` +
                `• Telegram ID: ${result.data?.telegramId}\n` +
                `• Username: @${result.data?.username}\n` +
                `• Имя: ${result.data?.firstName || 'не указано'} ${result.data?.lastName || ''}`
            );
        } else {
            await ctx.reply(`❌ ${result.message}`);
        }
    }

    @Command('help')
    async help(@Ctx() ctx: Context) {
        await ctx.reply(
            '📚 Справка по командам:\n\n' +
            '/start - приветственное сообщение и проверка доступа\n' +
            '/add_moderator_by_username @username - добавить модератора по username\n' +
            '📄 Отправьте Word файл (.doc или .docx) - содержимое будет выведено в логи\n' +
            '/help - показать эту справку'
        );
    }

    @On('document')
    async onDocument(@Ctx() ctx: Context) {
        const telegramId = ctx.from?.id?.toString();
        
        if (!telegramId) {
            await ctx.reply('❌ Не удалось определить ваш Telegram ID.');
            return;
        }

        // Проверяем доступ
        const hasAccess = await this.telegramService.checkUserAccess(telegramId);
        if (!hasAccess) {
            await ctx.reply('❌ У вас нет доступа к этой функции.');
            return;
        }

        const doc = (ctx.message as any)?.document;
        if (!doc) {
            await ctx.reply('❌ Не удалось получить информацию о документе.');
            return;
        }

        const fileName = doc.file_name || 'unknown';
        const mimeType = doc.mime_type || '';
        const fileId = doc.file_id;
        const fileSize = doc.file_size || 0;
        
        // Логируем информацию о файле
        console.log('Получен документ:', {
            fileName,
            mimeType,
            fileId,
            fileSize,
            fileUniqueId: doc.file_unique_id
        });
        
        // Проверяем, что это Word файл
        const isWordFile = /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword/i.test(mimeType) ||
                          /\.(docx?|DOCX?)$/i.test(fileName);

        if (!isWordFile) {
            console.log('Файл не распознан как Word:', { fileName, mimeType, isWordFile });
            await ctx.reply(
                `❌ Пожалуйста, отправьте Word файл (.doc или .docx).\n\n` +
                `Получен файл: ${fileName}\n` +
                `MIME тип: ${mimeType || 'не указан'}`
            );
            return;
        }

        try {
            await ctx.reply('⏳ Обрабатываю файл...');

            const result = await this.telegramService.processWordDocument(
                fileId,
                fileName,
                mimeType
            );

            if (result.success) {
                await ctx.reply(
                    '✅ Файл успешно обработан!\n\n' +
                    `📄 Имя файла: ${fileName}\n` +
                    `📊 Длина текста: ${result.text?.length || 0} символов\n\n` +
                    '📝 Содержимое файла выведено в логи сервера.'
                );
            } else {
                const errorMsg = result.error || 'Неизвестная ошибка';
                console.error('Детали ошибки обработки файла:', {
                    fileName,
                    mimeType,
                    error: errorMsg
                });
                await ctx.reply(
                    `❌ Не удалось обработать файл.\n\n` +
                    `📄 Файл: ${fileName}\n` +
                    `🔍 Ошибка: ${errorMsg}\n\n` +
                    `Проверьте логи сервера для деталей.`
                );
            }
        } catch (error) {
            console.error('Ошибка обработки Word-файла:', error);
            await ctx.reply('❌ Произошла ошибка при обработке файла. Проверьте формат и попробуйте снова.');
        }
    }
}
import { Injectable, Logger } from "@nestjs/common";
import { InjectBot, On, TelegrafModule } from "nestjs-telegraf";
import { Telegraf } from "telegraf";
import { Context } from "telegraf";
import { ClientRepository } from "../../client/repositorys/client.repository";
import { RedisService } from "@infra/redis/redis.service";
import { ProccesorService } from "../../proccesor/services/proccesor.service";
import { SceneContext } from 'telegraf/typings/scenes';
import { CrmService } from "../../crm/services/crm.service";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Moderator, ModeratorDocument } from "../../telegram-bots/schemas/moderator.schema";
import * as mammoth from "mammoth";

@Injectable()
export class TelegramService {
    private readonly logger = new Logger(TelegramService.name);

    constructor(
        @InjectBot() private readonly bot: Telegraf,
        private readonly userRepository: ClientRepository,
        private readonly redisService: RedisService,
        private readonly proccesorService: ProccesorService,
        private readonly crmService: CrmService,
        @InjectModel(Moderator.name) private readonly moderatorModel: Model<ModeratorDocument>,
    ) {
     
    }

    async checkUserAccess(telegramId: string): Promise<boolean> {
        try {
            const moderator = await this.moderatorModel.findOne({ telegramId });
            return !!moderator;
        } catch (error) {
            this.logger.error(`Ошибка при проверке доступа для ${telegramId}:`, error);
            return false;
        }
    }

    async addModeratorByUsername(username: string): Promise<{ success: boolean; message: string; data?: any }> {
        try {
            // Убираем @ если есть
            const cleanUsername = username.replace('@', '');
            
            if (!cleanUsername) {
                return {
                    success: false,
                    message: 'Укажите корректный username (например: @username или username)'
                };
            }

            // Ищем пользователя в Telegram по username
            try {
                // Пытаемся получить информацию о пользователе через getChat
                const chat = await this.bot.telegram.getChat(`@${cleanUsername}`);
                
                if (!chat || !('id' in chat)) {
                    return {
                        success: false,
                        message: `Пользователь @${cleanUsername} не найден в Telegram`
                    };
                }

                const telegramId = chat.id.toString();
                const firstName = 'first_name' in chat ? chat.first_name : undefined;
                const lastName = 'last_name' in chat ? chat.last_name : undefined;

                // Проверяем, не существует ли уже такой модератор
                const existing = await this.moderatorModel.findOne({ telegramId });

                if (existing) {
                    // Обновляем данные существующего модератора
                    existing.username = cleanUsername;
                    if (firstName) existing.firstName = firstName;
                    if (lastName) existing.lastName = lastName;
                    await existing.save();

                    return {
                        success: true,
                        message: `Модератор @${cleanUsername} уже существует, данные обновлены`,
                        data: existing
                    };
                }

                // Создаем нового модератора
                const newModerator = await this.moderatorModel.create({
                    telegramId,
                    username: cleanUsername,
                    firstName,
                    lastName,
                });

                return {
                    success: true,
                    message: `Модератор @${cleanUsername} успешно добавлен`,
                    data: newModerator
                };
            } catch (telegramError: any) {
                this.logger.error(`Ошибка при поиске пользователя @${cleanUsername} в Telegram:`, telegramError);
                return {
                    success: false,
                    message: `Не удалось найти пользователя @${cleanUsername} в Telegram. Убедитесь, что username правильный и пользователь существует.`
                };
            }
        } catch (error) {
            this.logger.error(`Ошибка при добавлении модератора по username ${username}:`, error);
            return {
                success: false,
                message: 'Произошла ошибка при добавлении модератора'
            };
        }
    }

    async processWordDocument(fileId: string, fileName: string, mimeType: string): Promise<{ success: boolean; text?: string; error?: string }> {
        try {
            this.logger.log(`Начало обработки файла: ${fileName} (${fileId})`);
            
            // Получаем ссылку на файл
            this.logger.log('Получение ссылки на файл...');
            const fileLink = await this.bot.telegram.getFileLink(fileId);
            this.logger.log(`Ссылка на файл получена: ${fileLink.href}`);
            
            // Скачиваем файл
            this.logger.log('Скачивание файла...');
            const response = await fetch(fileLink.href);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const buffer = Buffer.from(await response.arrayBuffer());
            this.logger.log(`Файл скачан, размер: ${buffer.length} байт`);

            // Извлекаем текст из Word файла
            this.logger.log('Извлечение текста из Word файла...');
            const result = await mammoth.extractRawText({ buffer });
            const text = result.value || '';
            
            if (result.messages && result.messages.length > 0) {
                this.logger.warn('Предупреждения при извлечении текста:');
                result.messages.forEach((msg: any) => {
                    this.logger.warn(`  - ${msg.type}: ${msg.message}`);
                });
            }

            // Выводим в логи
            this.logger.log('='.repeat(80));
            this.logger.log('📄 ПОЛУЧЕН WORD ФАЙЛ');
            this.logger.log('='.repeat(80));
            this.logger.log(`Имя файла: ${fileName}`);
            this.logger.log(`MIME тип: ${mimeType}`);
            this.logger.log(`Размер файла: ${buffer.length} байт`);
            this.logger.log('-'.repeat(80));
            this.logger.log('СОДЕРЖИМОЕ ФАЙЛА:');
            this.logger.log('-'.repeat(80));
            this.logger.log(text);
            this.logger.log('-'.repeat(80));
            this.logger.log(`Длина текста: ${text.length} символов`);
            this.logger.log('='.repeat(80));

            return {
                success: true,
                text: text
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            
            this.logger.error('Ошибка при обработке Word файла:', {
                fileName,
                mimeType,
                fileId,
                error: errorMessage,
                stack: errorStack
            });
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }

   
}
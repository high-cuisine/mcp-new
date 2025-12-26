import fetch from "node-fetch";
import * as mammoth from "mammoth";
import { Ctx, Start, Command, Update, On } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Moderator, ModeratorDocument } from './schemas/moderator.schema';
import { ProccesorService } from 'src/proccesor/services/proccesor.service';
import { RedisService } from '@infra/redis/redis.service';
import { TelegramBotsService } from './telegram-bots.service';

@Update()
export class TelegramBotsUpdate {
  private readonly authStatePrefix = 'tg-auth-state:';

  constructor(
    private readonly proccesorService: ProccesorService,
    @InjectModel(Moderator.name) private readonly moderatorModel: Model<ModeratorDocument>,
    private readonly redisService: RedisService,
    private readonly telegramBotsService: TelegramBotsService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    console.log(`/start command received from user: ${ctx.from?.id}`);
    await ctx.reply(
      '👋 Привет!\n\n' +
      'Это технический бот для управления админкой ветеринарной клиники.\n\n' +
      'Доступные команды:\n' +
      '/add_moderator - добавить модератора\n' +
      '/help - показать справку'
    );
  }

  @Command('add_moderator')
  async addModerator(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id?.toString();
    const username = ctx.from?.username || 'не указан';
    const firstName = ctx.from?.first_name || 'не указано';
    const lastName = ctx.from?.last_name || 'не указано';

    if (!telegramId) {
      await ctx.reply('Не удалось определить Telegram ID. Попробуйте снова.');
      return;
    }

    console.log('='.repeat(50));
    console.log('📝 ЗАПРОС НА ДОБАВЛЕНИЕ МОДЕРАТОРА');
    console.log(`Telegram ID: ${telegramId}`);
    console.log(`Username: @${username}`);
    console.log(`Имя: ${firstName}`);
    console.log(`Фамилия: ${lastName}`);
    console.log('='.repeat(50));

    try {
      const existing = await this.moderatorModel.findOne({ telegramId });

      if (existing) {
        existing.username = username === 'не указан' ? existing.username : username;
        existing.firstName = firstName === 'не указано' ? existing.firstName : firstName;
        existing.lastName = lastName === 'не указано' ? existing.lastName : lastName;
        await existing.save();
      } else {
        await this.moderatorModel.create({
          telegramId,
          username,
          firstName,
          lastName,
        });
      }

      await ctx.reply(
        `✅ Пользователь сохранён как модератор.\n\n` +
        `📋 Данные:\n` +
        `• Telegram ID: ${telegramId}\n` +
        `• Username: @${username}\n` +
        `• Имя: ${firstName} ${lastName}`
      );
    } catch (error) {
      console.error('Ошибка при сохранении модератора:', error);
      await ctx.reply('❌ Не удалось сохранить модератора. Попробуйте позже.');
    }
  }

  @Command('help')
  async help(@Ctx() ctx: Context) {
    await ctx.reply(
      '📚 Справка по командам:\n\n' +
      '/start - приветственное сообщение\n' +
      '/add_moderator - добавить пользователя как модератора (выводит Telegram ID в логи)\n' +
      '/auth_init - начать авторизацию Telegram клиента\n' +
      '/wauth_init - начать авторизацию WhatsApp клиента\n' +
      '/help - показать эту справку'
    );
  }

  @Command('wauth_init')
  async whatsappAuthInit(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) {
      await ctx.reply('Не удалось определить Telegram ID.');
      return;
    }

    try {
      await ctx.reply('⏳ Инициализация авторизации WhatsApp...');
      
      // Отправляем запрос в WhatsApp бот для инициализации
      const whatsappUrl = process.env.WHATSAPP_HOST || 'http://localhost:6800';
      const response = await fetch(`${whatsappUrl}/auth/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to init WhatsApp auth: ${response.statusText}`);
      }

      // Сохраняем telegramId для получения QR кода
      await this.redisService.set(`wa-auth:${telegramId}`, JSON.stringify({ 
        status: 'waiting_qr',
        timestamp: Date.now() 
      }), { EX: 300 });

      await ctx.reply('✅ Авторизация инициализирована. Ожидайте QR-код...');
    } catch (error) {
      console.error('Ошибка при инициализации WhatsApp авторизации:', error);
      await ctx.reply(`❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`);
    }
  }

  @Command('auth_init')
  async authInit(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) {
      await ctx.reply('Не удалось определить Telegram ID.');
      return;
    }

    await ctx.reply(
      '🔐 Начало авторизации Telegram клиента\n\n' +
      'Отправьте данные в формате:\n' +
      'apiId apiHash phoneNumber\n\n' +
      'Пример:\n' +
      '12345678 abcdef1234567890 +79991234567'
    );

    const stateKey = `${this.authStatePrefix}${telegramId}`;
    await this.redisService.set(stateKey, JSON.stringify({ step: 'waiting_credentials' }), { EX: 300 });
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    const text = (ctx.message as any)?.text;
    if (!text) return;

    const stateKey = `${this.authStatePrefix}${telegramId}`;
    const stateStr = await this.redisService.get(stateKey);
    
    if (!stateStr) return; // Не в процессе авторизации

    const state = JSON.parse(stateStr);

    try {
      if (state.step === 'waiting_credentials') {
        const parts = text.trim().split(/\s+/);
        if (parts.length < 3) {
          await ctx.reply('❌ Неверный формат. Отправьте: apiId apiHash phoneNumber');
          return;
        }

        const apiId = parseInt(parts[0]);
        const apiHash = parts[1];
        const phoneNumber = parts[2];

        if (isNaN(apiId)) {
          await ctx.reply('❌ apiId должен быть числом');
          return;
        }

        await ctx.reply('⏳ Инициализация авторизации...');
        
        const result = await this.telegramBotsService.initAuth(apiId, apiHash, phoneNumber);
        
        await this.redisService.set(stateKey, JSON.stringify({
          step: 'waiting_code',
          apiId,
          apiHash,
          phoneNumber,
          phoneCodeHash: result.phoneCodeHash,
        }), { EX: 300 });

        await ctx.reply(
          `✅ ${result.message}\n\n` +
          `📱 Код отправлен на номер ${phoneNumber}\n\n` +
          `Отправьте код подтверждения:`
        );
      } else if (state.step === 'waiting_code') {
        const code = text.trim();
        
        await ctx.reply('⏳ Проверка кода...');
        
        const result = await this.telegramBotsService.verifyCode(
          state.phoneNumber,
          code,
          state.phoneCodeHash
        );

        if (result.needsPassword) {
          await this.redisService.set(stateKey, JSON.stringify({
            step: 'waiting_password',
            apiId: state.apiId,
            apiHash: state.apiHash,
            phoneNumber: state.phoneNumber,
            phoneCodeHash: state.phoneCodeHash,
          }), { EX: 300 });

          await ctx.reply(
            `✅ Код подтверждён!\n\n` +
            `🔒 Требуется пароль двухфакторной аутентификации.\n\n` +
            `Отправьте пароль:`
          );
        } else if (result.success) {
          await this.redisService.delete(stateKey);
          await ctx.reply(
            `✅ Авторизация успешно завершена!\n\n` +
            `Сессия сохранена для номера ${state.phoneNumber}`
          );
        } else {
          await ctx.reply(`❌ ${result.message}`);
        }
      } else if (state.step === 'waiting_password') {
        const password = text.trim();
        
        await ctx.reply('⏳ Проверка пароля...');
        
        const result = await this.telegramBotsService.verifyPassword(
          state.phoneNumber,
          password,
          state.phoneCodeHash
        );

        if (result.success) {
          await this.redisService.delete(stateKey);
          await ctx.reply(
            `✅ Авторизация успешно завершена!\n\n` +
            `Сессия сохранена для номера ${state.phoneNumber}`
          );
        } else {
          await ctx.reply(`❌ ${result.message}`);
        }
      }
    } catch (error) {
      console.error('Ошибка при авторизации:', error);
      await ctx.reply(`❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`);
      await this.redisService.delete(stateKey);
    }
  }

  @On('document')
  async onDocument(@Ctx() ctx: Context) {
    const doc = (ctx.message as any)?.document;
    if (!doc) return;

    const fileName = doc.file_name || 'unknown';
    const mime = doc.mime_type || '';
    const allowed = /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword/i;

    if (!allowed.test(mime) && !fileName.match(/\.(docx?|DOCX?)$/)) {
      await ctx.reply('Пришлите, пожалуйста, Word-файл (.doc или .docx).');
      return;
    }

    try {
      const link = await ctx.telegram.getFileLink(doc.file_id);
      const res = await fetch(link.href);
      const buffer = Buffer.from(await res.arrayBuffer());

      let text = '';
      try {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value || '';
      } catch (err) {
        await ctx.reply('Не удалось извлечь текст из файла. Проверьте формат (.doc или .docx) и попробуйте снова.');
        return;
      }

      // Парсим правила через нейросеть
      const parsed = await this.proccesorService.parseClinicRules(text, { fileName, mimeType: mime });

      // Сохраняем в Redis под ключом "rules"
      await this.redisService.set('rules', JSON.stringify(parsed));

      await ctx.reply('✅ Файл успешно обработан и сохранён.');
    } catch (error) {
      await ctx.reply('Не удалось обработать файл. Проверьте формат (.doc или .docx) и попробуйте снова.');
    }
  }
}

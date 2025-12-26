import { Injectable, Logger } from '@nestjs/common';
import { TelegramBotsService, HandleMessageResponse } from '../telegram-bots/telegram-bots.service';
import { MessageDTO } from '../telegram-bots/dto/messages.dto';
import { RedisService } from '@infra/redis/redis.service';
import { cfg } from '@common/config/config.service';

@Injectable()
export class WhatsappBotsService {
  private readonly logger = new Logger(WhatsappBotsService.name);

  constructor(
    private readonly telegramBotsService: TelegramBotsService,
    private readonly redisService: RedisService,
  ) {}

  async handleMessage(dto: MessageDTO): Promise<HandleMessageResponse> {
    // Используем тот же сервис, что и для Telegram, так как логика идентична
    // telegramId в данном случае будет содержать WhatsApp ID (номер телефона)
    return this.telegramBotsService.handleMessage(dto);
  }

  async receiveQrCode(telegramId: string, qrCode: string): Promise<void> {
    try {
      // Отправляем QR код в Telegram бот как текст (ASCII art)
      const token = cfg.telegram.token;
      
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId,
          text: '📱 Отсканируйте QR-код в WhatsApp:\n\n' +
                '1. Откройте WhatsApp на телефоне\n' +
                '2. Перейдите в Настройки → Связанные устройства\n' +
                '3. Нажмите "Связать устройство"\n' +
                '4. Отсканируйте QR-код ниже:\n\n' +
                '```\n' + qrCode + '\n```',
          parse_mode: 'Markdown',
        }),
      }).catch((err) => {
        this.logger.error(`Failed to send QR code to ${telegramId}`, err);
      });
    } catch (error) {
      this.logger.error('Error receiving QR code:', error);
    }
  }

  async notifyAuthSuccess(telegramId: string): Promise<void> {
    try {
      const token = cfg.telegram.token;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId,
          text: '✅ WhatsApp авторизация успешно завершена!',
        }),
      }).catch((err) => {
        this.logger.error(`Failed to notify ${telegramId}`, err);
      });
      
      // Удаляем состояние авторизации
      await this.redisService.delete(`wa-auth:${telegramId}`);
    } catch (error) {
      this.logger.error('Error notifying auth success:', error);
    }
  }
}
